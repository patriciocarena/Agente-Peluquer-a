/**
 * lib/schemas/bloqueo.test.ts — afirma el `<behavior>` declarado en el plan
 * 04-02 Task 2: bloqueoSchema acepta un bloqueo válido CON y SIN `motivo`
 * (D-12: motivo es opcional, nunca requerido), y rechaza un motivo demasiado
 * largo o un profesionalId con forma de UUID inválida.
 */
import { describe, expect, it } from "vitest";

import { bloqueoSchema } from "./bloqueo";

const bloqueoValido = {
  profesionalId: "11111111-1111-1111-1111-111111111111",
  inicio: "2026-07-10T13:00:00.000Z",
  fin: "2026-07-10T13:30:00.000Z",
  motivo: "Almuerzo",
};

describe("bloqueoSchema", () => {
  it("acepta un bloqueo válido con motivo", () => {
    const result = bloqueoSchema.safeParse(bloqueoValido);
    expect(result.success).toBe(true);
  });

  it("acepta un bloqueo válido SIN motivo (D-12)", () => {
    const { motivo: _motivo, ...sinMotivo } = bloqueoValido;
    const result = bloqueoSchema.safeParse(sinMotivo);
    expect(result.success).toBe(true);
  });

  it("rechaza un motivo que supera los 280 caracteres", () => {
    const result = bloqueoSchema.safeParse({ ...bloqueoValido, motivo: "a".repeat(281) });
    expect(result.success).toBe(false);
  });

  it("rechaza profesionalId con forma de UUID inválida", () => {
    const result = bloqueoSchema.safeParse({ ...bloqueoValido, profesionalId: "no-es-un-uuid" });
    expect(result.success).toBe(false);
  });
});
