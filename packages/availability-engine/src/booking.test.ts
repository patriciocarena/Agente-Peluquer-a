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
import { describe, expect, it, vi } from "vitest";

import {
  bookAppointmentInputSchema,
  buildTurnoServicioSnapshots,
  cancelAppointment,
  isSlotTakenConcurrently,
  rescheduleAppointment,
  sumPrecioTotal,
} from "./booking.js";
import {
  CLIENTE_ID,
  makeHorario,
  makeNegocio,
  makeServicio,
  makeTurno,
  NEGOCIO_ID,
  PROFESIONAL_A_ID,
  SERVICIO_BARBA,
  SERVICIO_BARBA_ID,
  SERVICIO_CORTE,
  SERVICIO_CORTE_ID,
} from "./__fixtures__/rows.js";
import type { AvailabilityData } from "./types.js";
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@turnosbot/db-types";

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

describe("rescheduleAppointment (D-14)", () => {
  const TURNO_ID = "00000000-0000-4000-8000-000000004001";

  /** Negocio con granularidad_min=15 (en vez de 30) para poder ejercitar un
   * reagendado a un cuarto de hora exacto (10:15), como pide el behavior del
   * plan — la grilla de 30min del resto de los tests no ofrecería ese start. */
  function makeMockSupabase(result: { data: unknown; error: PostgrestError | null }): {
    client: SupabaseClient<Database>;
    updateSpy: ReturnType<typeof vi.fn>;
  } {
    const single = vi.fn().mockResolvedValue(result);
    const select = vi.fn().mockReturnValue({ single });
    const eq2 = vi.fn().mockReturnValue({ select });
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
    const updateSpy = vi.fn().mockReturnValue({ eq: eq1 });
    const from = vi.fn().mockReturnValue({ update: updateSpy });
    return { client: { from } as unknown as SupabaseClient<Database>, updateSpy };
  }

  /** freshData base: negocio granularidad 15min, horario lunes 09:00-13:00
   * de profesional A, un turno existente 10:00-10:30 (el que se reagenda). */
  function freshDataWithExistingTurno(): AvailabilityData {
    return {
      horarios: [makeHorario({ hora_inicio: "09:00:00", hora_fin: "13:00:00" })],
      bloqueos: [],
      turnos: [
        makeTurno({
          id: TURNO_ID,
          estado: "confirmado",
          inicio: "2026-07-06T13:00:00.000Z", // 10:00 AR
          fin: "2026-07-06T13:30:00.000Z", // 10:30 AR
        }),
      ],
      servicios: [SERVICIO_CORTE],
      negocio: makeNegocio({ granularidad_min: 15 }),
    };
  }

  const SAFE_NOW = new Date("2026-06-20T12:00:00.000Z").getTime(); // 16 dias antes, fuera de ventana no importa (skipBookingWindow:true interno)

  it("self-exclusion (Pitfall 2): reagendar a un slot que solapa el propio turno viejo devuelve ok:true", async () => {
    const freshData = freshDataWithExistingTurno();
    const { client } = makeMockSupabase({ data: { id: TURNO_ID }, error: null });

    const result = await rescheduleAppointment(
      {
        negocioId: NEGOCIO_ID,
        turnoId: TURNO_ID,
        profesionalId: PROFESIONAL_A_ID,
        serviceIds: [SERVICIO_CORTE_ID],
        inicio: "2026-07-06T13:15:00.000Z", // 10:15 AR — solapa el turno viejo (10:00-10:30)
        fin: "2026-07-06T13:45:00.000Z", // 10:45 AR
      },
      { supabase: client, freshData, now: SAFE_NOW },
    );

    expect(result.ok).toBe(true);
  });

  it("validation_error: turnoId que no matchea el patron uuidLike", async () => {
    const freshData = freshDataWithExistingTurno();
    const { client } = makeMockSupabase({ data: null, error: null });

    const result = await rescheduleAppointment(
      {
        negocioId: NEGOCIO_ID,
        turnoId: "no-es-un-uuid",
        profesionalId: PROFESIONAL_A_ID,
        serviceIds: [SERVICIO_CORTE_ID],
        inicio: "2026-07-06T13:15:00.000Z",
        fin: "2026-07-06T13:45:00.000Z",
      },
      { supabase: client, freshData, now: SAFE_NOW },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("validation_error");
      expect((result as { issues: string[] }).issues.length).toBeGreaterThan(0);
    }
  });

  it("23P01 (exclusion_violation) en el UPDATE se traduce a reason:slot_taken", async () => {
    const freshData = freshDataWithExistingTurno();
    const { client, updateSpy } = makeMockSupabase({
      data: null,
      error: { code: "23P01", message: "exclusion violation" } as PostgrestError,
    });

    const result = await rescheduleAppointment(
      {
        negocioId: NEGOCIO_ID,
        turnoId: TURNO_ID,
        profesionalId: PROFESIONAL_A_ID,
        serviceIds: [SERVICIO_CORTE_ID],
        inicio: "2026-07-06T13:15:00.000Z",
        fin: "2026-07-06T13:45:00.000Z",
      },
      { supabase: client, freshData, now: SAFE_NOW },
    );

    expect(result).toEqual({ ok: false, reason: "slot_taken" });
    expect(updateSpy).toHaveBeenCalled();
  });

  it("otro error de UPDATE (no 23P01) se traduce a reason:insert_error", async () => {
    const freshData = freshDataWithExistingTurno();
    const { client } = makeMockSupabase({
      data: null,
      error: { code: "42501", message: "permission denied" } as PostgrestError,
    });

    const result = await rescheduleAppointment(
      {
        negocioId: NEGOCIO_ID,
        turnoId: TURNO_ID,
        profesionalId: PROFESIONAL_A_ID,
        serviceIds: [SERVICIO_CORTE_ID],
        inicio: "2026-07-06T13:15:00.000Z",
        fin: "2026-07-06T13:45:00.000Z",
      },
      { supabase: client, freshData, now: SAFE_NOW },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("insert_error");
      expect((result as { message: string }).message).toBe("permission denied");
    }
  });

  it("slot no disponible en computeSlots(dataExcludingSelf) devuelve slot_taken sin tocar la DB", async () => {
    const freshData = freshDataWithExistingTurno();
    const { client, updateSpy } = makeMockSupabase({ data: { id: TURNO_ID }, error: null });

    const result = await rescheduleAppointment(
      {
        negocioId: NEGOCIO_ID,
        turnoId: TURNO_ID,
        profesionalId: PROFESIONAL_A_ID,
        serviceIds: [SERVICIO_CORTE_ID],
        inicio: "2026-07-06T22:00:00.000Z", // 19:00 AR — fuera del horario 09:00-13:00
        fin: "2026-07-06T22:30:00.000Z",
      },
      { supabase: client, freshData, now: SAFE_NOW },
    );

    expect(result).toEqual({ ok: false, reason: "slot_taken" });
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("no llama a turno_servicio (D-14 solo pisa inicio/fin/profesional_id, nunca reescribe servicios)", async () => {
    const freshData = freshDataWithExistingTurno();
    const single = vi.fn().mockResolvedValue({ data: { id: TURNO_ID }, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const eq2 = vi.fn().mockReturnValue({ select });
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
    const updateSpy = vi.fn().mockReturnValue({ eq: eq1 });
    const fromSpy = vi.fn().mockReturnValue({ update: updateSpy });
    const client = { from: fromSpy } as unknown as SupabaseClient<Database>;

    await rescheduleAppointment(
      {
        negocioId: NEGOCIO_ID,
        turnoId: TURNO_ID,
        profesionalId: PROFESIONAL_A_ID,
        serviceIds: [SERVICIO_CORTE_ID],
        inicio: "2026-07-06T13:15:00.000Z",
        fin: "2026-07-06T13:45:00.000Z",
      },
      { supabase: client, freshData, now: SAFE_NOW },
    );

    const calledTables = fromSpy.mock.calls.map((call) => call[0]);
    expect(calledTables).not.toContain("turno_servicio");
  });
});

describe("cancelAppointment (BOT-09)", () => {
  const TURNO_ID = "00000000-0000-4000-8000-000000005001";

  /** Mock supabase con las dos posibles llamadas a `.from("turno")` que hace
   * cancelAppointment: (1) el UPDATE con `.select("id")` encadenado y (2),
   * SOLO si el UPDATE no afectó filas, un segundo SELECT de existencia
   * (`.select("id").eq().eq().maybeSingle()`) para distinguir not_found de
   * already_cancelled. `deleteSpy` existe para probar que NUNCA se llama
   * (T-06-02: cancelar jamás hace DELETE). */
  function makeMockSupabase(opts: {
    updateResult: { data: unknown; error: PostgrestError | null };
    existsResult?: { data: unknown; error: PostgrestError | null };
  }): {
    client: SupabaseClient<Database>;
    updateSpy: ReturnType<typeof vi.fn>;
    selectSpy: ReturnType<typeof vi.fn>;
    deleteSpy: ReturnType<typeof vi.fn>;
    fromSpy: ReturnType<typeof vi.fn>;
  } {
    // Cadena del UPDATE: .update().eq().eq().neq().select() -> Promise<result>
    const updateSelect = vi.fn().mockResolvedValue(opts.updateResult);
    const updateNeq = vi.fn().mockReturnValue({ select: updateSelect });
    const updateEq2 = vi.fn().mockReturnValue({ neq: updateNeq });
    const updateEq1 = vi.fn().mockReturnValue({ eq: updateEq2 });
    const updateSpy = vi.fn().mockReturnValue({ eq: updateEq1 });

    // Cadena del SELECT de existencia: .select().eq().eq().maybeSingle() -> Promise<result>
    const maybeSingle = vi
      .fn()
      .mockResolvedValue(opts.existsResult ?? { data: null, error: null });
    const selectEq2 = vi.fn().mockReturnValue({ maybeSingle });
    const selectEq1 = vi.fn().mockReturnValue({ eq: selectEq2 });
    const selectSpy = vi.fn().mockReturnValue({ eq: selectEq1 });

    const deleteSpy = vi.fn();
    const fromSpy = vi
      .fn()
      .mockReturnValue({ update: updateSpy, select: selectSpy, delete: deleteSpy });
    return {
      client: { from: fromSpy } as unknown as SupabaseClient<Database>,
      updateSpy,
      selectSpy,
      deleteSpy,
      fromSpy,
    };
  }

  it("turno existente y estado != 'cancelado' -> ok:true, UPDATE filtrado por id Y negocio_id", async () => {
    const { client, updateSpy, deleteSpy } = makeMockSupabase({
      updateResult: { data: [{ id: TURNO_ID }], error: null },
    });

    const result = await cancelAppointment(
      { negocioId: NEGOCIO_ID, turnoId: TURNO_ID },
      { supabase: client },
    );

    expect(result).toEqual({ ok: true, turnoId: TURNO_ID });
    expect(updateSpy).toHaveBeenCalledWith({ estado: "cancelado" });
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it("UPDATE devuelve 0 filas y el turno no existe para ese negocio -> not_found", async () => {
    const { client } = makeMockSupabase({
      updateResult: { data: [], error: null },
      existsResult: { data: null, error: null },
    });

    const result = await cancelAppointment(
      { negocioId: NEGOCIO_ID, turnoId: TURNO_ID },
      { supabase: client },
    );

    expect(result).toEqual({ ok: false, reason: "not_found" });
  });

  it("turno ya estaba cancelado (guard neq no matchea) -> already_cancelled", async () => {
    const { client } = makeMockSupabase({
      updateResult: { data: [], error: null },
      existsResult: { data: { id: TURNO_ID }, error: null },
    });

    const result = await cancelAppointment(
      { negocioId: NEGOCIO_ID, turnoId: TURNO_ID },
      { supabase: client },
    );

    expect(result).toEqual({ ok: false, reason: "already_cancelled" });
  });

  it("PostgrestError inesperado en el UPDATE -> update_error con message", async () => {
    const { client } = makeMockSupabase({
      updateResult: {
        data: null,
        error: { code: "42501", message: "permission denied" } as PostgrestError,
      },
    });

    const result = await cancelAppointment(
      { negocioId: NEGOCIO_ID, turnoId: TURNO_ID },
      { supabase: client },
    );

    expect(result).toEqual({ ok: false, reason: "update_error", message: "permission denied" });
  });

  it("turnoId/negocioId no-UUID-like -> validation_error sin tocar la DB", async () => {
    const { client, fromSpy } = makeMockSupabase({
      updateResult: { data: [{ id: TURNO_ID }], error: null },
    });

    const result = await cancelAppointment(
      { negocioId: NEGOCIO_ID, turnoId: "no-es-un-uuid" },
      { supabase: client },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("validation_error");
      expect((result as { issues: string[] }).issues.length).toBeGreaterThan(0);
    }
    expect(fromSpy).not.toHaveBeenCalled();
  });

  it("NUNCA ejecuta un .delete() sobre turno", async () => {
    const { client, deleteSpy } = makeMockSupabase({
      updateResult: { data: [], error: null },
      existsResult: { data: { id: TURNO_ID }, error: null },
    });

    await cancelAppointment({ negocioId: NEGOCIO_ID, turnoId: TURNO_ID }, { supabase: client });

    expect(deleteSpy).not.toHaveBeenCalled();
  });
});
