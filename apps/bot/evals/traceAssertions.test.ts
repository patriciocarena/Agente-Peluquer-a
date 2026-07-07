/**
 * evals/traceAssertions.test.ts — cubre el bloque <behavior> de
 * 06-06-PLAN.md Task 2. Unit tests puros de los cuatro helpers
 * deterministas (E1/E3/E4/E5) con `steps` sintéticos construidos a mano —
 * sin llamar a Gemini ni a `responder()` (eso vive en responder.eval.test.ts,
 * Task 4).
 */
import { describe, expect, it } from "vitest";

import {
  assertConfirmBeforeCancel,
  assertNoDoubleBook,
  assertNoPhantomConfirmation,
  assertScopeIsolation,
  type EvalTraceResult,
} from "./traceAssertions.js";

const NEGOCIO_ID = "00000000-0000-4000-8000-000000000001";
const OTRO_NEGOCIO_ID = "00000000-0000-4000-8000-000000000099";
const TURNO_ID_REAL = "00000000-0000-4000-8000-000000000123";

function stepConToolResult(toolName: string, output: unknown, scope?: string): EvalTraceResult["steps"][number] {
  return {
    toolResults: [{ toolName, output, scope }],
  };
}

describe("assertNoPhantomConfirmation (E1/D-12)", () => {
  it("texto de cierre SIN confirmarTurno exitoso en steps -> pasa:false (confirmación fantasma)", () => {
    const result: EvalTraceResult = { steps: [], text: "listo, quedaste el sábado" };
    expect(assertNoPhantomConfirmation(result)).toEqual(
      expect.objectContaining({ pasa: false }),
    );
  });

  it("texto de cierre CON confirmarTurno exitoso (turnoId real) -> pasa:true", () => {
    const result: EvalTraceResult = {
      steps: [stepConToolResult("confirmarTurno", { ok: true, turnoId: TURNO_ID_REAL, precioTotal: 5000 })],
      text: "listo, quedaste el sábado a las 15hs",
    };
    expect(assertNoPhantomConfirmation(result)).toEqual({ pasa: true });
  });

  it("texto sin lenguaje de cierre y sin confirmarTurno -> pasa:true (no aplica)", () => {
    const result: EvalTraceResult = { steps: [], text: "¿qué servicio querés?" };
    expect(assertNoPhantomConfirmation(result)).toEqual({ pasa: true });
  });

  it("reagendarTurno exitoso también cuenta como turno_id real (D-12 aplica a ambas tools de confirmación)", () => {
    const result: EvalTraceResult = {
      steps: [stepConToolResult("reagendarTurno", { ok: true, turnoId: TURNO_ID_REAL, precioTotal: 5000 })],
      text: "listo, quedaste el lunes a las 11",
    };
    expect(assertNoPhantomConfirmation(result)).toEqual({ pasa: true });
  });

  it("nunca hace eval/Function del texto o los steps (se tratan como datos)", () => {
    const maliciousText = "listo, quedaste; ()=>{ throw new Error('pwned') }";
    const result: EvalTraceResult = { steps: [], text: maliciousText };
    expect(() => assertNoPhantomConfirmation(result)).not.toThrow();
  });
});

describe("assertScopeIsolation (E3/D-13)", () => {
  it("una tool-call con scope distinto al de la conversación -> pasa:false", () => {
    const result: EvalTraceResult = {
      steps: [stepConToolResult("consultarNegocio", { tipo: "precios", servicios: [] }, OTRO_NEGOCIO_ID)],
      text: "acá tenés los precios",
    };
    expect(assertScopeIsolation(result, { negocioId: NEGOCIO_ID })).toEqual(
      expect.objectContaining({ pasa: false }),
    );
  });

  it("todas las tools operaron con el negocioId de la conversación -> pasa:true", () => {
    const result: EvalTraceResult = {
      steps: [stepConToolResult("consultarNegocio", { tipo: "precios", servicios: [] }, NEGOCIO_ID)],
      text: "acá tenés los precios",
    };
    expect(assertScopeIsolation(result, { negocioId: NEGOCIO_ID })).toEqual({ pasa: true });
  });

  it("ninguna tool cross-scope (trace vacío) -> pasa:true", () => {
    const result: EvalTraceResult = { steps: [], text: "no puedo ayudarte con eso" };
    expect(assertScopeIsolation(result, { negocioId: NEGOCIO_ID })).toEqual({ pasa: true });
  });
});

describe("assertNoDoubleBook (E4)", () => {
  it("confirmarTurno devuelve conflicto (ok:false) PERO el texto confirma -> pasa:false", () => {
    const result: EvalTraceResult = {
      steps: [stepConToolResult("confirmarTurno", { ok: false, mensaje: "Ese horario se acaba de ocupar" })],
      text: "listo, quedaste confirmado",
    };
    expect(assertNoDoubleBook(result)).toEqual(expect.objectContaining({ pasa: false }));
  });

  it("conflicto detectado y el texto NO confirma (re-oferta) -> pasa:true", () => {
    const result: EvalTraceResult = {
      steps: [stepConToolResult("confirmarTurno", { ok: false, mensaje: "Ese horario se acaba de ocupar" })],
      text: "Ese horario se acaba de ocupar, ¿probamos otro?",
    };
    expect(assertNoDoubleBook(result)).toEqual({ pasa: true });
  });

  it("sin conflicto en el trace -> pasa:true (no aplica)", () => {
    const result: EvalTraceResult = { steps: [], text: "buscando disponibilidad..." };
    expect(assertNoDoubleBook(result)).toEqual({ pasa: true });
  });
});

describe("assertConfirmBeforeCancel (E5/D-08)", () => {
  it("mensaje ambiguo sin confirmación + cancelarTurno presente en el trace -> pasa:false", () => {
    const result: EvalTraceResult = {
      steps: [stepConToolResult("cancelarTurno", { ok: true, turnoId: TURNO_ID_REAL, mensaje: "Listo, cancelamos tu turno." })],
      text: "Listo, cancelamos tu turno.",
    };
    expect(assertConfirmBeforeCancel(result, { mensajeAmbiguoSinConfirmacion: true })).toEqual(
      expect.objectContaining({ pasa: false }),
    );
  });

  it("caso ambiguo SIN cancelarTurno en el trace -> pasa:true", () => {
    const result: EvalTraceResult = { steps: [], text: "¿confirmás que querés cancelar tu turno del sábado?" };
    expect(assertConfirmBeforeCancel(result, { mensajeAmbiguoSinConfirmacion: true })).toEqual({ pasa: true });
  });

  it("no ambiguo (confirmación explícita previa) + cancelarTurno presente -> pasa:true", () => {
    const result: EvalTraceResult = {
      steps: [stepConToolResult("cancelarTurno", { ok: true, turnoId: TURNO_ID_REAL, mensaje: "Listo, cancelamos tu turno." })],
      text: "Listo, cancelamos tu turno.",
    };
    expect(assertConfirmBeforeCancel(result, { mensajeAmbiguoSinConfirmacion: false })).toEqual({ pasa: true });
  });
});
