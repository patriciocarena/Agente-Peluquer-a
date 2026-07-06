/**
 * lib/schemas/turno.test.ts — afirma el `<behavior>` declarado en el plan
 * 04-02 Task 2: turnoSchema acepta un turno válido y rechaza serviceIds
 * vacío, ids con forma de UUID inválida, y fechas mal formadas.
 */
import { describe, expect, it } from "vitest";

import { turnoSchema } from "./turno";

const turnoValido = {
  profesionalId: "11111111-1111-1111-1111-111111111111",
  clienteId: "22222222-2222-2222-2222-222222222222",
  serviceIds: ["33333333-3333-3333-3333-333333333333"],
  inicio: "2026-07-10T13:00:00.000Z",
  fin: "2026-07-10T13:30:00.000Z",
};

describe("turnoSchema", () => {
  it("acepta un turno válido", () => {
    const result = turnoSchema.safeParse(turnoValido);
    expect(result.success).toBe(true);
  });

  it("acepta múltiples serviceIds", () => {
    const result = turnoSchema.safeParse({
      ...turnoValido,
      serviceIds: [...turnoValido.serviceIds, "44444444-4444-4444-4444-444444444444"],
    });
    expect(result.success).toBe(true);
  });

  it("rechaza serviceIds vacío con el mensaje esperado", () => {
    const result = turnoSchema.safeParse({ ...turnoValido, serviceIds: [] });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Elegí al menos un servicio.");
    }
  });

  it("rechaza profesionalId con forma de UUID inválida", () => {
    const result = turnoSchema.safeParse({ ...turnoValido, profesionalId: "no-es-un-uuid" });
    expect(result.success).toBe(false);
  });

  it("rechaza fecha `inicio` mal formada", () => {
    const result = turnoSchema.safeParse({ ...turnoValido, inicio: "10/07/2026" });
    expect(result.success).toBe(false);
  });
});
