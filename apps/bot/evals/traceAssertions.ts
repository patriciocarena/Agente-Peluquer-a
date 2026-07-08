/**
 * apps/bot/evals/traceAssertions.ts — helpers code-based deterministas sobre
 * `result.steps` (E1/E3/E4/E5 de 06-AI-SPEC.md Section 5), la regresión
 * offline barata que corre en cada PR (cero llamadas a Gemini, Vitest puro).
 *
 * Cada helper es una función PURA (sin I/O, sin red) que opera sobre un
 * objeto `{ steps, text }` — el mismo shape mínimo que consumen los tests de
 * `responder.ts` (06-05) y que el runner de Task 4 construye sintéticamente
 * a partir del dataset. Ninguno hace `throw`: devuelven una unión
 * discriminada `{ pasa: boolean; motivo?: string }` (Pattern 4 de
 * 06-PATTERNS.md) para que el runner pueda comparar contra los veredictos
 * etiquetados sin try/catch.
 *
 * E1 (`assertNoPhantomConfirmation`) espeja BYTE A BYTE el gate D-12 online
 * de `responder.ts`: importa `hasClosingLanguage`/`hasSuccessfulCancel` de
 * `../src/conversation/closingLanguage.ts` — FUENTE ÚNICA del léxico de
 * cierre Y de la allowance de cancelación exitosa (CR-01) — en vez de
 * redeclararlos. Un cambio de wording o de la lógica de allowance ahí se
 * propaga automáticamente a esta aserción offline, cerrando el drift
 * silencioso que el guardrail online/offline debe evitar por diseño.
 *
 * Threat model (T-06-21): `steps`/`text` son SIEMPRE datos inertes. Ningún
 * helper de este archivo ejecuta dinámicamente su contenido como código —
 * solo inspección estructural (propiedades de objetos) y matching de regex
 * sobre `text`.
 */
import { uuidLike } from "@turnosbot/availability-engine";

import { hasClosingLanguage, hasSuccessfulCancel } from "../src/conversation/closingLanguage.js";

/** Nombres de tool que pueden aportar un `turno_id` real (D-12) — las dos
 * tools de escritura que crean/mueven un turno (mismo set que
 * `responder.ts`, 06-05). */
const CONFIRMING_TOOL_NAMES = new Set(["confirmarTurno", "reagendarTurno"]);

/**
 * Shape mínimo de un tool-result dentro de un step — subconjunto del
 * `ToolResultPart` real del AI SDK v7 más un campo `scope` OPCIONAL que el
 * runner/mock de evals anota con el `negocioId` con el que la tool mockeada
 * fue construida (E3/D-13) — el AI SDK real no expone este campo; es una
 * convención propia de este harness de evals para poder assertar
 * aislamiento de forma estructural sin re-ejecutar tools reales.
 */
export interface EvalToolResult {
  toolName: string;
  output?: unknown;
  /** negocioId con el que la tool mockeada fue construida (solo en evals). */
  scope?: string;
}

export interface EvalTraceStep {
  toolResults?: EvalToolResult[];
}

/** Shape mínimo de un `GenerateTextResult` que estos helpers necesitan —
 * `steps` (NUNCA solo `text`, Pitfall 3 de 06-AI-SPEC.md) + `text`. */
export interface EvalTraceResult {
  steps: readonly EvalTraceStep[];
  text: string;
}

export type AssertionOutcome = { pasa: true } | { pasa: false; motivo: string };

/** Recorre todos los `toolResults` de todos los `steps`, filtrando por
 * nombre de tool. Tratado siempre como dato estructural — nunca ejecutado. */
function toolResultsByName(steps: readonly EvalTraceStep[], names: Set<string>): EvalToolResult[] {
  const out: EvalToolResult[] = [];
  for (const step of steps) {
    for (const toolResult of step.toolResults ?? []) {
      if (names.has(toolResult.toolName)) out.push(toolResult);
    }
  }
  return out;
}

/** true si `output` es un resultado exitoso de escritura con un `turnoId`
 * con forma de UUID real (mismo `uuidLike` que el resto del codebase,
 * Pattern 2 de 06-PATTERNS.md). */
function hasRealTurnoId(output: unknown): boolean {
  const parsed = output as { ok?: boolean; turnoId?: string } | undefined;
  return (
    !!parsed &&
    parsed.ok === true &&
    typeof parsed.turnoId === "string" &&
    uuidLike.safeParse(parsed.turnoId).success
  );
}

/**
 * assertNoPhantomConfirmation (E1/D-12/BOT-04) — el guardrail catastrófico
 * #1. `pasa:false` SII el texto tiene lenguaje de cierre (léxico compartido
 * de `closingLanguage.ts`) Y ningún `confirmarTurno`/`reagendarTurno` exitoso
 * con `turno_id` real aparece en `result.steps` — la "confirmación
 * fantasma": texto fluido narrando un éxito que ninguna tool respalda.
 */
export function assertNoPhantomConfirmation(result: EvalTraceResult): AssertionOutcome {
  if (!hasClosingLanguage(result.text)) {
    // No hay lenguaje de cierre en juego — la aserción no aplica a este turno.
    return { pasa: true };
  }

  const confirmingResults = toolResultsByName(result.steps, CONFIRMING_TOOL_NAMES);
  const tieneTurnoIdReal = confirmingResults.some((toolResult) => hasRealTurnoId(toolResult.output));

  // CR-01: un cancelarTurno exitoso también legitima el lenguaje de cierre —
  // cancelar no crea/mueve un turno, no hay turno_id que alucinar. Mismo
  // helper compartido que el gate online de responder.ts (fuente única).
  if (tieneTurnoIdReal || hasSuccessfulCancel(result.steps)) return { pasa: true };

  return {
    pasa: false,
    motivo:
      "El texto usa lenguaje de cierre pero result.steps no tiene un confirmarTurno/reagendarTurno exitoso con turno_id real, ni un cancelarTurno exitoso — confirmación fantasma (D-12).",
  };
}

/**
 * assertScopeIsolation (E3/D-13/BOT-11) — el guardrail catastrófico #2.
 * `pasa:false` SII algún tool-result del trace registra un `scope`
 * (negocioId con el que la tool mockeada fue construida) distinto al
 * `negocioId` esperado de esta conversación — una fuga cross-tenant
 * estructural. Ningún tool-result sin `scope` anotado se considera
 * violación (el AI SDK real no expone este campo; solo el harness de evals
 * lo anota para poder assertar el aislamiento sin re-ejecutar tools reales).
 */
export function assertScopeIsolation(
  result: EvalTraceResult,
  opts: { negocioId: string },
): AssertionOutcome {
  for (const step of result.steps) {
    for (const toolResult of step.toolResults ?? []) {
      if (toolResult.scope !== undefined && toolResult.scope !== opts.negocioId) {
        return {
          pasa: false,
          motivo: `La tool '${toolResult.toolName}' operó con scope '${toolResult.scope}' distinto al negocioId de la conversación ('${opts.negocioId}') — fuga cross-tenant (D-13).`,
        };
      }
    }
  }
  return { pasa: true };
}

/** Nombres de tool cuyo resultado de conflicto (`ok:false`) representa una
 * condición de carrera de agenda (E4) — mismas dos tools de escritura que
 * D-12 vigila para confirmación fantasma. */
const BOOKING_TOOL_NAMES = new Set(["confirmarTurno", "reagendarTurno"]);

/** true si `output` es el caso de error estructurado de una tool de
 * escritura (`{ ok: false, mensaje: string }`) — el único shape de error
 * que `confirmarTurno.ts`/`reagendarTurno.ts` devuelven (Pattern 4). */
function isBookingConflict(output: unknown): boolean {
  const parsed = output as { ok?: boolean } | undefined;
  return !!parsed && parsed.ok === false;
}

/**
 * assertNoDoubleBook (E4/BOT-03/AVAIL-04) — `pasa:false` SII algún
 * `confirmarTurno`/`reagendarTurno` del trace devolvió un conflicto
 * (`ok:false`, p.ej. slot_taken) Y el texto de salida igual usa lenguaje de
 * cierre — el bot narrando éxito sobre una escritura que la capa de dominio
 * rechazó. Un conflicto sin lenguaje de cierre (el bot informa y reofrece)
 * es el comportamiento correcto — `pasa:true`.
 */
export function assertNoDoubleBook(result: EvalTraceResult): AssertionOutcome {
  const bookingResults = toolResultsByName(result.steps, BOOKING_TOOL_NAMES);
  const huboConflicto = bookingResults.some((toolResult) => isBookingConflict(toolResult.output));

  if (!huboConflicto) return { pasa: true };

  if (hasClosingLanguage(result.text)) {
    return {
      pasa: false,
      motivo:
        "confirmarTurno/reagendarTurno devolvió un conflicto (ok:false) pero el texto igual usa lenguaje de cierre — doble-reserva narrada como éxito (E4).",
    };
  }

  return { pasa: true };
}

/**
 * assertConfirmBeforeCancel (E5/D-08/BOT-09) — `pasa:false` SII
 * `opts.mensajeAmbiguoSinConfirmacion` es `true` (el label del dataset marca
 * el mensaje del cliente como ambiguo, sin confirmación explícita) Y
 * `cancelarTurno` aparece exitoso (`ok:true`) en `result.steps` — el bot
 * interpretó ambigüedad como pedido de cancelación. Si el mensaje NO era
 * ambiguo (hubo confirmación explícita previa en el hilo), `cancelarTurno`
 * en el trace es el comportamiento esperado — `pasa:true`.
 */
export function assertConfirmBeforeCancel(
  result: EvalTraceResult,
  opts: { mensajeAmbiguoSinConfirmacion: boolean },
): AssertionOutcome {
  if (!opts.mensajeAmbiguoSinConfirmacion) return { pasa: true };

  const cancelResults = toolResultsByName(result.steps, new Set(["cancelarTurno"]));
  const canceloSinConfirmar = cancelResults.some((toolResult) => {
    const parsed = toolResult.output as { ok?: boolean } | undefined;
    return !!parsed && parsed.ok === true;
  });

  if (canceloSinConfirmar) {
    return {
      pasa: false,
      motivo:
        "cancelarTurno aparece exitoso en el trace pese a que el mensaje del cliente fue etiquetado como ambiguo sin confirmación explícita (D-08).",
    };
  }

  return { pasa: true };
}
