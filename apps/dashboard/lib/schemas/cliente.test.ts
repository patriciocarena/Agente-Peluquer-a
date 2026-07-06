/**
 * lib/schemas/cliente.test.ts — afirma el `<behavior>` declarado en el plan
 * 04-02 Task 2: clienteInlineSchema acepta un teléfono válido (con y sin
 * nombre) y rechaza uno demasiado corto; clienteBusquedaSchema acepta una
 * búsqueda parcial de al menos 3 dígitos y rechaza una vacía o muy corta.
 */
import { describe, expect, it } from "vitest";

import { clienteBusquedaSchema, clienteInlineSchema } from "./cliente";

describe("clienteInlineSchema", () => {
  it("acepta un teléfono válido con nombre", () => {
    const result = clienteInlineSchema.safeParse({ telefono: "1122334455", nombre: "Juan" });
    expect(result.success).toBe(true);
  });

  it("acepta un teléfono válido sin nombre (opcional, D-09)", () => {
    const result = clienteInlineSchema.safeParse({ telefono: "1122334455" });
    expect(result.success).toBe(true);
  });

  it("normaliza (trim) el teléfono antes de validar", () => {
    const result = clienteInlineSchema.safeParse({ telefono: "  1122334455  " });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.telefono).toBe("1122334455");
    }
  });

  it("rechaza un teléfono demasiado corto", () => {
    const result = clienteInlineSchema.safeParse({ telefono: "123" });
    expect(result.success).toBe(false);
  });
});

describe("clienteBusquedaSchema", () => {
  it("acepta una búsqueda parcial de al menos 3 dígitos", () => {
    const result = clienteBusquedaSchema.safeParse({ telefono: "112" });
    expect(result.success).toBe(true);
  });

  it("rechaza una búsqueda vacía", () => {
    const result = clienteBusquedaSchema.safeParse({ telefono: "" });
    expect(result.success).toBe(false);
  });

  it("rechaza una búsqueda de menos de 3 dígitos", () => {
    const result = clienteBusquedaSchema.safeParse({ telefono: "11" });
    expect(result.success).toBe(false);
  });
});
