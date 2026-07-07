/**
 * asignarProfesional.test.ts — RED/GREEN del bloque <behavior> de
 * 06-03-PLAN.md Task 1. Inyecta `computeSlots`/`autoAssign` REALES sobre
 * fixtures deterministas — el wrapper nunca reimplementa la heurística de
 * `autoAssign` (D-04).
 */
import type { AvailabilityData, AvailableSlot } from "@turnosbot/availability-engine";
import { autoAssign, computeSlots } from "@turnosbot/availability-engine";
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

// Mismo fix que buscarHorarios.test.ts: evita que db/client.ts lance en
// import-time por falta de env vars (asignarProfesional.ts importa
// buildBotAvailabilityData.ts transitivamente).
vi.mock("../../db/client.js", () => ({ supabaseAdmin: {} }));

import { asignarProfesionalTool, type AsignarProfesionalResult } from "./asignarProfesional.js";

const FECHA_LUNES = "2026-07-13"; // dia_semana=1, ver buscarHorarios.test.ts

function fixtureFor(overrides: Partial<AvailabilityData> = {}): AvailabilityData {
  return {
    horarios: overrides.horarios ?? [
      makeHorario({
        id: "00000000-0000-4000-8000-000000001201",
        profesional_id: PROFESIONAL_A_ID,
        dia_semana: 1,
        hora_inicio: "09:00:00",
        hora_fin: "10:00:00",
      }),
      makeHorario({
        id: "00000000-0000-4000-8000-000000001202",
        profesional_id: PROFESIONAL_B_ID,
        dia_semana: 1,
        hora_inicio: "11:00:00",
        hora_fin: "12:00:00",
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

/** runExecute — ver nota en buscarHorarios.test.ts: tipa `t.execute` sin
 * repetir `@ts-expect-error` por `it`. */
async function runExecute(
  t: ReturnType<typeof asignarProfesionalTool>,
  input: unknown,
): Promise<AsignarProfesionalResult> {
  const execute = t.execute as unknown as (
    input: unknown,
    options: unknown,
  ) => Promise<AsignarProfesionalResult>;
  return execute(input, { toolCallId: "test", messages: [] });
}

describe("asignarProfesionalTool", () => {
  it("devuelve el mismo resultado que autoAssign real para el mismo mapa slots-por-profesional", async () => {
    const freshData = fixtureFor();
    const t = asignarProfesionalTool(NEGOCIO_ID, {
      computeSlots,
      autoAssign,
      buildBotAvailabilityData: fakeBuildBotAvailabilityData(freshData),
    });

    const input = { servicioIds: [SERVICIO_CORTE_ID], fechaDeseada: FECHA_LUNES };
    const result = await runExecute(t, input);

    // Reconstruye el mismo mapa que el wrapper arma internamente, para
    // comparar contra `autoAssign` invocado directamente.
    const slotsA = await computeSlots(
      { negocioId: NEGOCIO_ID, serviceIds: input.servicioIds, professionalId: PROFESIONAL_A_ID, date: input.fechaDeseada },
      freshData,
    );
    const slotsB = await computeSlots(
      { negocioId: NEGOCIO_ID, serviceIds: input.servicioIds, professionalId: PROFESIONAL_B_ID, date: input.fechaDeseada },
      freshData,
    );
    const map = new Map<string, AvailableSlot[]>([
      [PROFESIONAL_A_ID, slotsA],
      [PROFESIONAL_B_ID, slotsB],
    ]);
    const expected = autoAssign(map);

    expect(result).toEqual(expected);
    expect(result).not.toBeNull();
    // Profesional A tiene el hueco más temprano (09:00 vs 11:00) — gana.
    expect(result?.professionalId).toBe(PROFESIONAL_A_ID);
  });

  it("ante mapa vacío (sin profesionales con horario_trabajo) devuelve null sin lanzar", async () => {
    const freshData = fixtureFor({ horarios: [] });
    const t = asignarProfesionalTool(NEGOCIO_ID, {
      computeSlots,
      autoAssign,
      buildBotAvailabilityData: fakeBuildBotAvailabilityData(freshData),
    });

    const result = await runExecute(t, { servicioIds: [SERVICIO_CORTE_ID], fechaDeseada: FECHA_LUNES });

    expect(result).toBeNull();
  });
});
