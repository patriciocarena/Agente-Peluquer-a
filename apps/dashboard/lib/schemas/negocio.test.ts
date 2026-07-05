/**
 * lib/schemas/negocio.test.ts — RED del ciclo TDD del plan 02-04 Task 2.
 * Afirma el `<behavior>` declarado: negocioSchema acepta un perfil válido
 * (completo y con opcionales ausentes) y rechaza nombre vacío, timezone
 * vacío y granularidad_min fuera de {15, 30}.
 */
import { describe, expect, it } from "vitest";

import { negocioSchema } from "./negocio";

const perfilValido = {
  nombre: "Barbería El Corte",
  direccion: "Av. Corrientes 1234",
  telefono: "+54 11 4444-5555",
  timezone: "America/Argentina/Buenos_Aires",
  granularidad_min: 30,
  horario_general: "Lunes a Sábado de 9 a 20",
};

describe("negocioSchema", () => {
  it("acepta un perfil válido completo", () => {
    const result = negocioSchema.safeParse(perfilValido);
    expect(result.success).toBe(true);
  });

  it("acepta un perfil válido con direccion/telefono/horario_general ausentes", () => {
    const result = negocioSchema.safeParse({
      nombre: "Barbería El Corte",
      timezone: "America/Argentina/Buenos_Aires",
      granularidad_min: 15,
    });
    expect(result.success).toBe(true);
  });

  it("rechaza nombre vacío", () => {
    const result = negocioSchema.safeParse({ ...perfilValido, nombre: "" });
    expect(result.success).toBe(false);
  });

  it("rechaza timezone vacío", () => {
    const result = negocioSchema.safeParse({ ...perfilValido, timezone: "" });
    expect(result.success).toBe(false);
  });

  it("rechaza granularidad_min fuera de {15, 30}", () => {
    const result = negocioSchema.safeParse({ ...perfilValido, granularidad_min: 45 });
    expect(result.success).toBe(false);
  });
});
