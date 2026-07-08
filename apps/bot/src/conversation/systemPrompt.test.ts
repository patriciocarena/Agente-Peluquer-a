/**
 * systemPrompt.test.ts — cubre la sección "# Nombre del cliente" (06-UAT.md Gap
 * "nombre"): las dos ramas de `buildSystemPrompt` según haya o no nombre.
 * Función pura, sin I/O — no necesita mocks.
 */
import { describe, expect, it } from "vitest";

import { buildSystemPrompt } from "./systemPrompt.js";

const FECHA = "2026-07-10";
const DIA = "viernes";
const TZ = "America/Argentina/Buenos_Aires";

describe("buildSystemPrompt — sección nombre del cliente", () => {
  it("con nombre: lo usa y NO pide guardarlo de nuevo", () => {
    const prompt = buildSystemPrompt(FECHA, DIA, TZ, "Juan");
    expect(prompt).toContain("El cliente se llama Juan");
    expect(prompt).not.toContain("Todavía no sabés el nombre");
    // No debe instruir a llamar la tool de guardado si ya tiene el nombre.
    expect(prompt).not.toContain("guardalo llamando la herramienta guardarNombreCliente");
  });

  it("sin nombre (null): pide el nombre e instruye a persistirlo con guardarNombreCliente", () => {
    const prompt = buildSystemPrompt(FECHA, DIA, TZ, null);
    expect(prompt).toContain("Todavía no sabés el nombre");
    expect(prompt).toContain("guardarNombreCliente");
    // No bloquea el turno si el cliente no lo da.
    expect(prompt).toMatch(/no insistas ni bloquees el turno/i);
  });

  it("inyecta la fecha/timezone actuales en ambas ramas (Bug fecha, sin regresión)", () => {
    for (const nombre of ["Juan", null]) {
      const prompt = buildSystemPrompt(FECHA, DIA, TZ, nombre);
      expect(prompt).toContain(`Hoy es ${DIA} ${FECHA}`);
      expect(prompt).toContain(TZ);
    }
  });
});
