/**
 * buscarHorarios.test.ts — RED/GREEN del bloque <behavior> de 06-03-PLAN.md
 * Task 1. Inyecta `computeSlots` REAL (no mockeado) sobre fixtures
 * deterministas de packages/availability-engine/src/__fixtures__/rows.ts, y
 * `buildBotAvailabilityData` mockeado (sin DB real, sin Gemini).
 */
import type { AvailabilityData, AvailableSlot, ComputeSlotsInput } from "@turnosbot/availability-engine";
import { computeSlots } from "@turnosbot/availability-engine";
import {
  makeHorario,
  makeNegocio,
  NEGOCIO_ID,
  PROFESIONAL_A_ID,
  PROFESIONAL_B_ID,
  SERVICIO_CORTE,
  SERVICIO_CORTE_ID,
} from "@turnosbot/availability-engine/dist/__fixtures__/rows.js";
import { describe, expect, it, vi } from "vitest";

// buscarHorarios.ts importa buildBotAvailabilityData.ts (para el default
// `deps`), que a su vez importa negocioScoped.ts -> db/client.ts, el cual
// lanza sincrónicamente en import-time si faltan SUPABASE_URL/
// SUPABASE_SERVICE_ROLE_KEY (no seteadas en este entorno de test). Mismo fix
// que apps/bot/src/queue/inboundWorker.test.ts: mockear el módulo ANTES de
// importar buscarHorarios.js para que ese código de import-time nunca corra
// (los tests de abajo siempre inyectan su propio `deps` fake).
vi.mock("../../db/client.js", () => ({ supabaseAdmin: {} }));

import { buscarHorariosInputSchema, buscarHorariosTool } from "./buscarHorarios.js";

// Próximo lunes real (dia_semana=1 en las fixtures) dentro de la ventana de
// reserva (60min lead / 30 días) respecto del reloj real — ver 06-03-SUMMARY.md
// para el cálculo. Fijo en vez de derivado de `new Date()` para que el test
// sea reproducible run-to-run mientras el proyecto siga en curso.
const FECHA_LUNES = "2026-07-13";

function fixtureFor(overrides: Partial<AvailabilityData> = {}): AvailabilityData {
  return {
    horarios: overrides.horarios ?? [
      makeHorario({
        profesional_id: PROFESIONAL_A_ID,
        dia_semana: 1,
        hora_inicio: "09:00:00",
        hora_fin: "13:00:00",
      }),
    ],
    bloqueos: overrides.bloqueos ?? [],
    turnos: overrides.turnos ?? [],
    servicios: overrides.servicios ?? [SERVICIO_CORTE],
    negocio: overrides.negocio ?? makeNegocio(),
  };
}

function fakeBuildBotAvailabilityData(freshData: AvailabilityData) {
  return async (_negocioId: string) => freshData;
}

/**
 * runExecute — invoca `t.execute(input, options)` con el `options` mínimo
 * exigido por `ToolExecutionOptions` del AI SDK (irrelevante para estos
 * tests, que nunca inspeccionan `toolCallId`/`messages`), tipando el
 * resultado como `AvailableSlot[]` (nunca el stream `AsyncIterable` — esta
 * tool no lo usa). Evita repetir un cast/`@ts-expect-error` por cada `it`.
 */
async function runExecute(
  t: ReturnType<typeof buscarHorariosTool>,
  input: unknown,
): Promise<AvailableSlot[]> {
  const execute = t.execute as unknown as (
    input: unknown,
    options: unknown,
  ) => Promise<AvailableSlot[]>;
  return execute(input, { toolCallId: "test", messages: [] });
}

describe("buscarHorariosTool", () => {
  it("execute devuelve los mismos slots que computeSlots real para el mismo input", async () => {
    const freshData = fixtureFor();
    const t = buscarHorariosTool(NEGOCIO_ID, {
      computeSlots,
      buildBotAvailabilityData: fakeBuildBotAvailabilityData(freshData),
    });

    const input = {
      servicioIds: [SERVICIO_CORTE_ID],
      fechaDeseada: FECHA_LUNES,
    };
    const result = await runExecute(t, input);

    const expected = await computeSlots(
      {
        negocioId: NEGOCIO_ID,
        serviceIds: input.servicioIds,
        date: input.fechaDeseada,
      } satisfies ComputeSlotsInput,
      freshData,
    );

    expect(result).toEqual(expected);
    expect(result.length).toBeGreaterThan(0);
  });

  it("con profesionalId filtra a ese profesional; sin profesionalId devuelve slots de todos los elegibles", async () => {
    const freshData = fixtureFor({
      horarios: [
        makeHorario({
          id: "00000000-0000-4000-8000-000000001101",
          profesional_id: PROFESIONAL_A_ID,
          dia_semana: 1,
          hora_inicio: "09:00:00",
          hora_fin: "10:00:00",
        }),
        makeHorario({
          id: "00000000-0000-4000-8000-000000001102",
          profesional_id: PROFESIONAL_B_ID,
          dia_semana: 1,
          hora_inicio: "09:00:00",
          hora_fin: "10:00:00",
        }),
      ],
    });
    const t = buscarHorariosTool(NEGOCIO_ID, {
      computeSlots,
      buildBotAvailabilityData: fakeBuildBotAvailabilityData(freshData),
    });

    const soloA = await runExecute(t, {
      servicioIds: [SERVICIO_CORTE_ID],
      fechaDeseada: FECHA_LUNES,
      profesionalId: PROFESIONAL_A_ID,
    });
    expect(soloA.every((slot) => slot.professionalId === PROFESIONAL_A_ID)).toBe(true);
    expect(soloA.length).toBeGreaterThan(0);

    const sinPreferencia = await runExecute(t, {
      servicioIds: [SERVICIO_CORTE_ID],
      fechaDeseada: FECHA_LUNES,
    });
    // Sin profesionalId, computeSlots auto-asigna (D-03) — devuelve los slots
    // de UN solo profesional (el ganador del tie-break), no la unión de ambos.
    expect(sinPreferencia.length).toBeGreaterThan(0);
    const profesionalesEnResultado = new Set(sinPreferencia.map((slot) => slot.professionalId));
    expect(profesionalesEnResultado.size).toBe(1);
  });

  it("NUNCA recibe negocioId en su inputSchema (assert estructural)", () => {
    const shape = buscarHorariosInputSchema.shape;
    expect(Object.keys(shape)).not.toContain("negocioId");
  });

  it("rechaza un servicioId no-UUID-like antes de llamar a computeSlots", () => {
    const parsed = buscarHorariosInputSchema.safeParse({
      servicioIds: ["no-es-un-uuid"],
      fechaDeseada: FECHA_LUNES,
    });
    expect(parsed.success).toBe(false);
  });
});
