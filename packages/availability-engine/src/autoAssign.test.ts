/**
 * src/autoAssign.test.ts — RED del ciclo TDD de autoAssign (AVAIL-05, D-03,
 * Pitfall 6). Cubre selección del hueco más temprano, tie-break
 * determinístico por professionalId ascendente (independiente del orden de
 * inserción del Map), profesional sin slots, y el caso "todos vacíos".
 */
import { describe, expect, it } from "vitest";

import { PROFESIONAL_A_ID, PROFESIONAL_B_ID } from "./__fixtures__/rows.js";
import { autoAssign } from "./autoAssign.js";
import type { AvailableSlot } from "./types.js";

function slot(start: string, end: string, professionalId: string): AvailableSlot {
  return { start, end, professionalId };
}

describe("autoAssign", () => {
  it("elige el profesional con el hueco más temprano (B a las 09:30 gana sobre A a las 10:00)", () => {
    const slotsByProfessional = new Map<string, AvailableSlot[]>([
      [PROFESIONAL_A_ID, [slot("10:00", "10:30", PROFESIONAL_A_ID)]],
      [PROFESIONAL_B_ID, [slot("09:30", "10:00", PROFESIONAL_B_ID)]],
    ]);

    const result = autoAssign(slotsByProfessional);

    expect(result?.professionalId).toBe(PROFESIONAL_B_ID);
    expect(result?.slot.start).toBe("09:30");
  });

  it("empate exacto (ambos 10:00) → gana el de menor professionalId, determinístico", () => {
    const slotsByProfessional = new Map<string, AvailableSlot[]>([
      [PROFESIONAL_B_ID, [slot("10:00", "10:30", PROFESIONAL_B_ID)]],
      [PROFESIONAL_A_ID, [slot("10:00", "10:30", PROFESIONAL_A_ID)]],
    ]);

    const result = autoAssign(slotsByProfessional);

    expect(result?.professionalId).toBe(PROFESIONAL_A_ID);
  });

  it("empate exacto invirtiendo el orden de inserción del Map NO cambia el ganador (Pitfall 6)", () => {
    const insercionNormal = new Map<string, AvailableSlot[]>([
      [PROFESIONAL_A_ID, [slot("10:00", "10:30", PROFESIONAL_A_ID)]],
      [PROFESIONAL_B_ID, [slot("10:00", "10:30", PROFESIONAL_B_ID)]],
    ]);
    const insercionInvertida = new Map<string, AvailableSlot[]>([
      [PROFESIONAL_B_ID, [slot("10:00", "10:30", PROFESIONAL_B_ID)]],
      [PROFESIONAL_A_ID, [slot("10:00", "10:30", PROFESIONAL_A_ID)]],
    ]);

    const resultNormal = autoAssign(insercionNormal);
    const resultInvertido = autoAssign(insercionInvertida);

    expect(resultNormal?.professionalId).toBe(resultInvertido?.professionalId);
    expect(resultNormal?.professionalId).toBe(PROFESIONAL_A_ID);
  });

  it("un profesional sin slots (lista vacía) se saltea; gana el otro", () => {
    const slotsByProfessional = new Map<string, AvailableSlot[]>([
      [PROFESIONAL_A_ID, []],
      [PROFESIONAL_B_ID, [slot("11:00", "11:30", PROFESIONAL_B_ID)]],
    ]);

    const result = autoAssign(slotsByProfessional);

    expect(result?.professionalId).toBe(PROFESIONAL_B_ID);
  });

  it("todos los profesionales sin slots → devuelve null", () => {
    const slotsByProfessional = new Map<string, AvailableSlot[]>([
      [PROFESIONAL_A_ID, []],
      [PROFESIONAL_B_ID, []],
    ]);

    const result = autoAssign(slotsByProfessional);

    expect(result).toBeNull();
  });
});
