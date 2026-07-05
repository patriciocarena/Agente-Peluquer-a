/**
 * lib/schemas/profesional.test.ts — RED del ciclo TDD del plan 02-06 Task 1.
 * Afirma el `<behavior>` declarado: profesionalSchema acepta un profesional
 * válido (nombre + activo boolean, con default true) y rechaza nombre vacío.
 */
import { describe, expect, it } from "vitest";

import { profesionalSchema } from "./profesional";

describe("profesionalSchema", () => {
  it("acepta un profesional válido", () => {
    const result = profesionalSchema.safeParse({
      nombre: "Juan Pérez",
      activo: true,
    });
    expect(result.success).toBe(true);
  });

  it("acepta activo ausente y aplica default true", () => {
    const result = profesionalSchema.safeParse({ nombre: "Juan Pérez" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.activo).toBe(true);
    }
  });

  it("rechaza nombre vacío", () => {
    const result = profesionalSchema.safeParse({ nombre: "", activo: true });
    expect(result.success).toBe(false);
  });
});
