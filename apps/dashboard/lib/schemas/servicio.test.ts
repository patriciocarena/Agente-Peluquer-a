/**
 * lib/schemas/servicio.test.ts — RED del ciclo TDD del plan 02-05 Task 1.
 * Afirma el `<behavior>` declarado: servicioSchema acepta un servicio válido
 * (con y sin descripción opcional) y rechaza nombre vacío, precio negativo,
 * y duracion_min <= 0 o no entera.
 */
import { describe, expect, it } from "vitest";

import { servicioSchema } from "./servicio";

const servicioValido = {
  nombre: "Corte clásico",
  descripcion: "Corte con tijera y máquina, incluye lavado",
  precio: 8500,
  duracion_min: 30,
};

describe("servicioSchema", () => {
  it("acepta un servicio válido completo", () => {
    const result = servicioSchema.safeParse(servicioValido);
    expect(result.success).toBe(true);
  });

  it("acepta un servicio válido sin descripción", () => {
    const { descripcion: _descripcion, ...sinDescripcion } = servicioValido;
    const result = servicioSchema.safeParse(sinDescripcion);
    expect(result.success).toBe(true);
  });

  it("rechaza nombre vacío", () => {
    const result = servicioSchema.safeParse({ ...servicioValido, nombre: "" });
    expect(result.success).toBe(false);
  });

  it("rechaza precio negativo", () => {
    const result = servicioSchema.safeParse({ ...servicioValido, precio: -100 });
    expect(result.success).toBe(false);
  });

  it("rechaza duracion_min igual a 0", () => {
    const result = servicioSchema.safeParse({ ...servicioValido, duracion_min: 0 });
    expect(result.success).toBe(false);
  });

  it("rechaza duracion_min negativa", () => {
    const result = servicioSchema.safeParse({ ...servicioValido, duracion_min: -15 });
    expect(result.success).toBe(false);
  });

  it("rechaza duracion_min no entera", () => {
    const result = servicioSchema.safeParse({ ...servicioValido, duracion_min: 30.5 });
    expect(result.success).toBe(false);
  });
});
