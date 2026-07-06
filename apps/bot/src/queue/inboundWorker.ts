/**
 * apps/bot/src/queue/inboundWorker.ts — processInboundWhatsappEvent: the full
 * orchestration a pg-boss job runs for one inbound WhatsApp webhook event
 * (WA-02/03/04/05, D-07/09/11, 05-PATTERNS.md Pattern 3/4/5).
 *
 * Orchestration order (mirrors packages/availability-engine/src/booking.ts's
 * "validate → re-check → branch on error code → return early on expected
 * failure modes" shape):
 *   1. Extract phone_number_id + the first message via payload.ts's
 *      defensive helpers — a non-message event (no messages[0]) or a missing
 *      phone_number_id is a no-op, zero writes.
 *   2. Resolve the negocio STRICTLY by whatsapp_phone_number_id (Pattern 3,
 *      D-07) — an unmatched id is logged and discarded, never a default/
 *      fallback tenant. This is the single decision that determines which
 *      tenant's data every downstream write belongs to.
 *   3. findOrCreateCliente / findOrCreateConversacion (D-08/D-09/D-10) — both
 *      already go exclusively through negocioScoped(negocioId) (D-11).
 *   4. Insert the inbound mensaje (direccion: "entrante" — the mensaje.direccion
 *      CHECK constraint is Spanish, NOT "in"/"out"). A 23505 unique-violation
 *      on wa_message_id is the durable dedup backstop (WA-03, Pattern 4): it
 *      short-circuits BEFORE responder/send, so a Meta retry within its
 *      7-day retry window never double-persists or double-sends.
 *   5. responder() — the sole Phase 6 swap point (D-02).
 *   6. Outbound send is gated by the 24h customer-service window
 *      (conversacion.ventana_expira_at, Pattern 5/D-09) — a closed window is
 *      logged and skipped, never sent, and no outbound mensaje row is
 *      written for it (REMIND-01 is explicitly out of scope).
 *
 * Every dependency is injectable via an optional `deps` param (mirrors
 * packages/availability-engine/src/booking.ts's `BookAppointmentDeps`
 * optional-deps pattern), so this orchestration is unit-testable with fake
 * collaborators — no live DB, no live queue, no network call.
 */
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@turnosbot/db-types";

import { findOrCreateCliente as realFindOrCreateCliente } from "../conversation/findOrCreateCliente.js";
import { findOrCreateConversacion as realFindOrCreateConversacion } from "../conversation/findOrCreateConversacion.js";
import { responder as realResponder } from "../conversation/responder.js";
import { supabaseAdmin as realSupabaseAdmin } from "../db/client.js";
import { negocioScoped as realNegocioScoped } from "../db/negocioScoped.js";
import { sendWhatsappMessage as realSendWhatsappMessage } from "../whatsapp/graphClient.js";
import { extractFirstMessage, extractPhoneNumberId } from "../whatsapp/payload.js";
import type { WhatsappWebhookEvent } from "../whatsapp/payload.js";

export interface ProcessInboundWhatsappEventDeps {
  /** Cliente Supabase service_role — usado SOLO para la resolución de tenant
   * (Pattern 3, D-07). Todo lo demás pasa exclusivamente por negocioScoped
   * (D-11), nunca por acá. */
  supabaseAdmin: Pick<SupabaseClient<Database>, "from">;
  findOrCreateCliente: typeof realFindOrCreateCliente;
  findOrCreateConversacion: typeof realFindOrCreateConversacion;
  responder: typeof realResponder;
  sendWhatsappMessage: typeof realSendWhatsappMessage;
  negocioScoped: typeof realNegocioScoped;
  log: (obj: unknown, msg: string) => void;
  /** Reloj inyectable para tests determinísticos del gate de 24h (Pattern 5). */
  now?: () => number;
}

const defaultDeps: ProcessInboundWhatsappEventDeps = {
  supabaseAdmin: realSupabaseAdmin,
  findOrCreateCliente: realFindOrCreateCliente,
  findOrCreateConversacion: realFindOrCreateConversacion,
  responder: realResponder,
  sendWhatsappMessage: realSendWhatsappMessage,
  negocioScoped: realNegocioScoped,
  log: (obj, msg) => console.log(msg, obj),
};

export async function processInboundWhatsappEvent(
  event: WhatsappWebhookEvent,
  deps: ProcessInboundWhatsappEventDeps = defaultDeps,
): Promise<void> {
  const phoneNumberId = extractPhoneNumberId(event);
  const message = extractFirstMessage(event);
  if (!phoneNumberId || !message) {
    deps.log({ event }, "Non-message webhook event or missing phone_number_id — nothing to do");
    return;
  }

  // Pattern 3 (D-07) — never guess the tenant: resolve strictly by
  // whatsapp_phone_number_id, discard with zero writes on no match.
  const { data: negocio } = await deps.supabaseAdmin
    .from("negocio")
    .select("id, timezone")
    .eq("whatsapp_phone_number_id", phoneNumberId)
    .maybeSingle();

  if (!negocio) {
    deps.log({ phoneNumberId }, "No negocio matches phone_number_id — discarding event (D-07)");
    return;
  }

  const clienteId = await deps.findOrCreateCliente(negocio.id, message.from);
  const conversacion = await deps.findOrCreateConversacion(negocio.id, clienteId);

  // Pattern 4 (WA-03) — durable dedup backstop. A 23505 unique_violation on
  // wa_message_id means this message was already processed: short-circuit
  // BEFORE responder/send — no second persist, no second send.
  const { error: insertError } = await deps.negocioScoped(negocio.id).insertMensaje({
    conversacion_id: conversacion.id,
    direccion: "entrante",
    wa_message_id: message.id,
    contenido: message,
  });

  if ((insertError as PostgrestError | null)?.code === "23505") {
    deps.log({ waMessageId: message.id }, "Duplicate wa_message_id — already processed (WA-03)");
    return;
  }

  const reply = await deps.responder(conversacion, message.text?.body ?? "");

  // Pattern 5 (D-09) — 24h customer-service window gate. `ventana_expira_at`
  // is nullable at the schema level (though findOrCreateConversacion always
  // sets it) — treat a null window defensively as already-closed, never as
  // an open-ended window.
  const nowMs = deps.now ? deps.now() : Date.now();
  const ventanaExpiraMs = conversacion.ventana_expira_at
    ? new Date(conversacion.ventana_expira_at).getTime()
    : 0;
  if (nowMs < ventanaExpiraMs) {
    await deps.sendWhatsappMessage(negocio.id, message.from, reply);
    await deps.negocioScoped(negocio.id).insertMensaje({
      conversacion_id: conversacion.id,
      direccion: "saliente",
      contenido: { text: { body: reply } },
    });
  } else {
    deps.log(
      { conversacionId: conversacion.id },
      "24h window closed — skipping outbound send (D-09, REMIND-01 out of scope)",
    );
  }
}
