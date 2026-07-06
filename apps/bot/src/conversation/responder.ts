/**
 * apps/bot/src/conversation/responder.ts — the Phase 6 swap point (D-02).
 *
 * Phase 5: deterministic stub. Phase 6 replaces the BODY of this function
 * (Vercel AI SDK + Gemini agent) WITHOUT changing this signature or any
 * call site — the worker (plan 05-05) and every future caller only ever
 * import and call `responder(conversacion, mensajeEntrante)`. This
 * single-point-of-replacement is the entire reason the worker calls
 * `responder(...)` here instead of inlining a reply: swapping in the real
 * LLM agent later is a one-file change.
 */
import type { Tables } from "@turnosbot/db-types";

export async function responder(
  conversacion: Tables<"conversacion">,
  mensajeEntrante: string,
): Promise<string> {
  return "¡Hola! Recibimos tu mensaje 🙌 En breve te ayudamos a reservar tu turno.";
}
