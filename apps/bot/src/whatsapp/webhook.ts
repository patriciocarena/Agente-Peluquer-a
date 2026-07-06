/**
 * apps/bot/src/whatsapp/webhook.ts — registerWhatsappWebhook: the public HTTP
 * edge of WA-01/WA-03. Two routes, two jobs, nothing else:
 *
 *   GET  /webhooks/whatsapp  — Meta's one-time subscription handshake
 *        (hub.mode/hub.verify_token/hub.challenge, D-05). Mismatched token
 *        → 403; never leaks whether the mismatch was mode vs token.
 *
 *   POST /webhooks/whatsapp  — verify-then-enqueue-then-200 (D-03, D-06):
 *        1. Read the exact raw bytes Meta sent from `(request as { rawBody?:
 *           Buffer }).rawBody` — stashed by server.ts's addContentTypeParser
 *           BEFORE JSON parsing (Pattern 1). Verify `X-Hub-Signature-256`
 *           with `verifyWhatsappSignature` (HMAC-SHA256, timing-safe). A
 *           missing rawBody, missing app secret, or a signature mismatch is
 *           the SAME outcome — 403, no enqueue, no further parsing. This is
 *           the sole spoofing gate (T-05-01) for the whole pipeline.
 *        2. Only once verified: zod-validate the parsed body
 *           (`whatsappWebhookEventSchema`, payload.ts) and extract the first
 *           message, if any. A malformed-but-signature-valid body (should not
 *           happen from real Meta traffic, but never trust the shape blindly)
 *           is logged and discarded — 200, no enqueue — fail closed without
 *           surfacing a 4xx/5xx to Meta that would trigger its retry storm.
 *        3. `messages[0].id` present → `boss.send(WHATSAPP_INBOUND_QUEUE,
 *           event, { singletonKey: messageId })` (WA-03 first dedup layer —
 *           the durable `mensaje.wa_message_id` UNIQUE constraint, plan
 *           05-05, is the backstop). Absent (status update / read receipt) →
 *           log-and-ignore, still 200.
 *        4. ALWAYS `reply.status(200).send()` on the verified path,
 *           regardless of whether anything was enqueued — never do DB/queue
 *           WORK synchronously in this handler beyond the single `boss.send`
 *           enqueue call; the whole point of pg-boss (D-03) is decoupling
 *           this response from Meta's response-time expectations and its
 *           up-to-7-day retry-on-non-200 behavior (T-05-03).
 *
 * Exported as a plain function (not a Fastify plugin via fastify-plugin) so
 * server.ts calls it directly against the app instance and webhook.test.ts
 * can build a scratch Fastify instance and exercise it via `app.inject()`
 * without a real listener — same flat registration style server.ts already
 * uses for `/health`.
 */
import type { FastifyInstance } from "fastify";
import type { PgBoss } from "pg-boss";

import type { BotEnv } from "../config/env.js";
import { WHATSAPP_INBOUND_QUEUE } from "../queue/boss.js";
import { extractFirstMessage, whatsappWebhookEventSchema } from "./payload.js";
import { verifyWhatsappSignature } from "./signature.js";

export interface RegisterWhatsappWebhookDeps {
  env: Pick<BotEnv, "WHATSAPP_VERIFY_TOKEN" | "WHATSAPP_APP_SECRET">;
  /** Only `send` is needed here — the worker side (plan 05-05) owns `work`/`start`/`stop`. */
  boss: Pick<PgBoss, "send">;
}

export function registerWhatsappWebhook(
  app: FastifyInstance,
  deps: RegisterWhatsappWebhookDeps,
): void {
  // GET handshake (WA-01, D-05).
  app.get("/webhooks/whatsapp", async (request, reply) => {
    const query = request.query as Record<string, string | undefined>;
    const mode = query["hub.mode"];
    const token = query["hub.verify_token"];
    const challenge = query["hub.challenge"];

    if (mode === "subscribe" && token !== undefined && token === deps.env.WHATSAPP_VERIFY_TOKEN) {
      return reply.status(200).send(challenge);
    }
    return reply.status(403).send();
  });

  // Verify-then-enqueue-then-200 (WA-01, WA-03, D-03/D-06).
  app.post("/webhooks/whatsapp", async (request, reply) => {
    const rawBody = (request as { rawBody?: Buffer }).rawBody;
    const signature = request.headers["x-hub-signature-256"] as string | undefined;

    if (
      !rawBody ||
      !deps.env.WHATSAPP_APP_SECRET ||
      !verifyWhatsappSignature(rawBody, signature, deps.env.WHATSAPP_APP_SECRET)
    ) {
      app.log.warn(
        { hasSignature: Boolean(signature) },
        "Invalid or missing X-Hub-Signature-256 — rejecting, no enqueue (WA-01, T-05-01)",
      );
      return reply.status(403).send();
    }

    const parsed = whatsappWebhookEventSchema.safeParse(request.body);
    if (!parsed.success) {
      app.log.warn(
        { issues: parsed.error.issues },
        "Signature-verified body did not match the expected WhatsApp webhook shape — discarding (fail closed)",
      );
      return reply.status(200).send();
    }

    const message = extractFirstMessage(parsed.data);
    if (message) {
      await deps.boss.send(WHATSAPP_INBOUND_QUEUE, parsed.data, { singletonKey: message.id });
    } else {
      app.log.debug({ event: parsed.data }, "Non-message webhook event — ignored (e.g. status update)");
    }

    // ALWAYS 200 on the verified path — downstream processing state never
    // affects this response (enqueue-then-200, D-03).
    return reply.status(200).send();
  });
}
