/**
 * src/booking.test.ts — RED del ciclo TDD de bookAppointment (AVAIL-03,
 * Pitfall 3, CORE-05, V5 Input Validation).
 *
 * Cubre SOLO la lógica pura pre-insert con fixtures (03-PATTERNS.md:
 * "no unit-testear el INSERT/EXCLUDE live aquí" — eso lo cubre
 * scripts/verify-double-booking.ts a nivel DB y scripts/verify-availability-engine.ts
 * como smoke live end-to-end de Feature 3):
 *   1. buildTurnoServicioSnapshots + sumPrecioTotal: congelado de nombre/precio/
 *      duración y suma = precio_total (Pitfall 3).
 *   2. Congelado histórico: un cambio posterior de servicio.precio NO altera un
 *      precio_total ya calculado a partir de snapshots viejos.
 *   3. isSlotTakenConcurrently: 23P01 -> true, otro código -> false, null -> false.
 *   4. bookAppointmentInputSchema (zod): serviceIds vacío / UUID inválido rechazados.
 */
import { describe, expect, it } from "vitest";

import {
  bookAppointmentInputSchema,
  buildTurnoServicioSnapshots,
  isSlotTakenConcurrently,
  sumPrecioTotal,
} from "./booking.js";
import {
  CLIENTE_ID,
  makeServicio,
  NEGOCIO_ID,
  PROFESIONAL_A_ID,
  SERVICIO_BARBA,
  SERVICIO_BARBA_ID,
  SERVICIO_CORTE,
  SERVICIO_CORTE_ID,
} from "./__fixtures__/rows.js";
import type { PostgrestError } from "@supabase/supabase-js";

describe("buildTurnoServicioSnapshots + sumPrecioTotal (AVAIL-03, Pitfall 3)", () => {
  it("congela nombre/precio/duracion por servicio y precio_total = suma de precio_snapshot", () => {
    const snapshots = buildTurnoServicioSnapshots(
      [SERVICIO_CORTE_ID, SERVICIO_BARBA_ID],
      [SERVICIO_CORTE, SERVICIO_BARBA],
    );

    expect(snapshots).toEqual([
      {
        servicio_id: SERVICIO_CORTE_ID,
        nombre_snapshot: "Corte",
        precio_snapshot: 6000,
        duracion_snapshot: 30,
      },
      {
        servicio_id: SERVICIO_BARBA_ID,
        nombre_snapshot: "Barba",
        precio_snapshot: 3000,
        duracion_snapshot: 15,
      },
    ]);
    expect(sumPrecioTotal(snapshots)).toBe(9000);
  });

  it("congelado historico: un cambio posterior de servicio.precio NO altera un precio_total ya calculado", () => {
    // Snapshot tomado HOY, con servicio.precio=6000 en ese momento.
    const snapshots = buildTurnoServicioSnapshots([SERVICIO_CORTE_ID], [SERVICIO_CORTE]);
    const precioTotalOriginal = sumPrecioTotal(snapshots);
    expect(precioTotalOriginal).toBe(6000);

    // La semana que viene, el dueño sube el precio del servicio a 8000...
    const servicioConPrecioActualizado = makeServicio({ id: SERVICIO_CORTE_ID, precio: 8000 });
    expect(servicioConPrecioActualizado.precio).toBe(8000); // el "actual" sí cambió

    // ...pero sumPrecioTotal NUNCA re-deriva del servicio "actual": sigue sumando
    // los precio_snapshot ya congelados, sin tocar `servicioConPrecioActualizado`.
    expect(sumPrecioTotal(snapshots)).toBe(precioTotalOriginal);
    expect(sumPrecioTotal(snapshots)).toBe(6000);
  });

  it("lanza si un serviceId no matchea ninguna fila de servicios provista (bug guard)", () => {
    expect(() =>
      buildTurnoServicioSnapshots(["00000000-0000-4000-8000-000000000fff"], [SERVICIO_CORTE]),
    ).toThrow(/no encontrado/);
  });
});

describe("isSlotTakenConcurrently (23P01 exclusion_violation)", () => {
  it("code=23P01 -> true (conflicto de concurrencia detectado)", () => {
    expect(isSlotTakenConcurrently({ code: "23P01" } as PostgrestError)).toBe(true);
  });

  it("otro codigo (ej. 23505 unique_violation) -> false", () => {
    expect(isSlotTakenConcurrently({ code: "23505" } as PostgrestError)).toBe(false);
  });

  it("null -> false", () => {
    expect(isSlotTakenConcurrently(null)).toBe(false);
  });
});

describe("bookAppointmentInputSchema (V5 Input Validation)", () => {
  const validInput = {
    negocioId: NEGOCIO_ID,
    profesionalId: PROFESIONAL_A_ID,
    clienteId: CLIENTE_ID,
    serviceIds: [SERVICIO_CORTE_ID],
    inicio: "2026-07-06T14:00:00.000Z",
    fin: "2026-07-06T14:30:00.000Z",
  };

  it("acepta un input valido", () => {
    expect(bookAppointmentInputSchema.safeParse(validInput).success).toBe(true);
  });

  it("rechaza serviceIds vacio con error claro", () => {
    const result = bookAppointmentInputSchema.safeParse({ ...validInput, serviceIds: [] });
    expect(result.success).toBe(false);
  });

  it("rechaza un UUID invalido en profesionalId", () => {
    const result = bookAppointmentInputSchema.safeParse({ ...validInput, profesionalId: "no-es-un-uuid" });
    expect(result.success).toBe(false);
  });

  it("rechaza un timestamp inicio/fin que no sea ISO datetime", () => {
    const result = bookAppointmentInputSchema.safeParse({ ...validInput, inicio: "2026-07-06 14:00" });
    expect(result.success).toBe(false);
  });
});
