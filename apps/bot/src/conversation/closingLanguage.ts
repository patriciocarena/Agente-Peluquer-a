/**
 * apps/bot/src/conversation/closingLanguage.ts — FUENTE ÚNICA del léxico de
 * cierre D-12 (BOT-04, guardrail catastrófico #1 — "confirmación fantasma").
 *
 * Este módulo es la ÚNICA declaración del léxico de cierre en todo el
 * codebase. Dos consumidores lo importan, NUNCA lo redeclaran:
 *   1. El gate online (`responder.ts`, plan 06-05) — bloquea el texto de
 *      cierre del modelo salvo que `result.steps` tenga un `confirmarTurno`/
 *      `reagendarTurno` exitoso con `turno_id` real.
 *   2. La eval offline (`traceAssertions.ts`, plan 06-06) — regresión batch
 *      sobre `eval_turno` que verifica el mismo guardrail contra un dataset
 *      histórico.
 *
 * Cualquier cambio de wording del guardrail (agregar/quitar una palabra de
 * cierre) se hace ACÁ y se propaga automáticamente a ambos consumidores —
 * jamás hay que sincronizar dos listas a mano. Un guardrail online que
 * detecta cierre pero cuya regresión offline usa un léxico distinto es
 * exactamente el tipo de drift silencioso que este archivo previene.
 */

/**
 * Léxico AR de cierre/confirmación (Section 6 de 06-AI-SPEC.md): frases que
 * un recepcionista usaría para dar algo por confirmado. Si el modelo las usa
 * SIN que exista un `turno_id` real devuelto por una tool de escritura, es
 * una confirmación fantasma.
 */
export const CLOSING_LANGUAGE_LEXICON = [
  "listo",
  "confirmado",
  "quedaste",
  "te espero",
  "reservado",
  "agendado",
] as const;

/** Regex compilado sobre el léxico de arriba — case-insensitive, sin límites
 * de palabra estrictos porque frases como "te espero" incluyen un espacio. */
export const CLOSING_LANGUAGE_REGEX = new RegExp(
  CLOSING_LANGUAGE_LEXICON.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"),
  "i",
);

/**
 * hasClosingLanguage(text) — helper de detección reutilizable: true si
 * `text` contiene alguna frase del léxico de cierre D-12 (case-insensitive).
 * Único punto de verdad para "¿esto suena a que el bot está dando un turno
 * por confirmado?" — el gate online y la eval offline llaman esta función,
 * nunca reimplementan la detección.
 */
export function hasClosingLanguage(text: string): boolean {
  return CLOSING_LANGUAGE_REGEX.test(text);
}
