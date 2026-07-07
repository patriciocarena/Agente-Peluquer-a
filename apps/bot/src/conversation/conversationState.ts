/**
 * apps/bot/src/conversation/conversationState.ts — (de)serialización
 * defensiva de `conversacion.context` (jsonb) — BOT-01/BOT-02, T-06-06.
 *
 * `conversacion.context` se crea como `{}` literal
 * (findOrCreateConversacion.ts, Pitfall 8) y su contrato es "valid JSON
 * object" abierto — sin schema propio en el DB. `parseConversationContext`
 * NUNCA debe asumir shape ni lanzar sobre un valor malformado: un context
 * manipulado/corrupto cae a los defaults seguros, mismo criterio defensivo
 * que `whatsapp/payload.ts` (extractFirstMessage/extractPhoneNumberId
 * devuelven fallback en vez de lanzar).
 *
 * Archivo puro: sin I/O, sin acceso a Supabase.
 */
import type { ModelMessage } from "ai";

/** Shape en memoria del estado conversacional persistido en `conversacion.context`. */
export interface ConversationContext {
  /** Historial de ModelMessage del AI SDK, persistido tras cada turno. */
  messages: ModelMessage[];
  /** D-11: flag de handoff — cuando true, el worker deja de auto-responder. */
  needsHuman: boolean;
}

/**
 * parseConversationContext(context) — valida defensivamente un valor
 * `unknown` proveniente de la columna jsonb `conversacion.context`. Ante
 * `{}`, `null`, `undefined`, o cualquier forma inesperada, cae a los
 * defaults seguros `{ messages: [], needsHuman: false }` en vez de lanzar.
 */
export function parseConversationContext(context: unknown): ConversationContext {
  if (context === null || typeof context !== "object") {
    return { messages: [], needsHuman: false };
  }

  const candidate = context as Record<string, unknown>;

  const messages = Array.isArray(candidate.messages)
    ? (candidate.messages as ModelMessage[])
    : [];

  const needsHuman = typeof candidate.needsHuman === "boolean" ? candidate.needsHuman : false;

  return { messages, needsHuman };
}

/**
 * serializeConversationContext(state) — devuelve un objeto plano
 * JSON-serializable apto para persistir en la columna jsonb
 * `conversacion.context` (vía `negocioScoped(negocioId).updateConversacion`).
 */
export function serializeConversationContext(state: ConversationContext): Record<string, unknown> {
  return { messages: state.messages, needsHuman: state.needsHuman };
}
