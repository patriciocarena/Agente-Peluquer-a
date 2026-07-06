/**
 * verify-whatsapp-webhook.ts (D-01, WA-01..05 end-to-end)
 *
 * D-01 local substitute for a live Meta round-trip: the whole phase is built
 * against the Cloud API spec and verified here with a LOCALLY-SIGNED
 * synthetic webhook payload, simulating Meta — no live Meta Developer
 * account, WABA, or App Secret is required. The signing secret / verify
 * token used below are throwaway constants owned by THIS script, not the
 * real `.env` values, so this script never depends on (or leaks) real Meta
 * credentials. A live tunnel/WABA round-trip test is a deferred follow-up
 * (05-RESEARCH.md D-01) — explicitly NOT part of this script.
 *
 * This script drives the EXACT production code path — `registerWhatsappWebhook`
 * (plan 05-06 Task 1) via a scratch Fastify instance + `app.inject()` (no real
 * HTTP listener), and `processInboundWhatsappEvent` (plan 05-05) called
 * directly on the enqueued event (a fake `boss.send` captures it instead of
 * a real pg-boss queue — this script never starts/stops pg-boss) — against
 * the REAL `bdgufnitakelyialjoqg` database, proving:
 *
 *   1. sign  → a correctly HMAC-SHA256-signed POST is verified and enqueued,
 *      responding 200 (WA-01).
 *   2. persist → the worker resolves the seeded test negocio strictly by
 *      `whatsapp_phone_number_id`, inserts one inbound ('entrante') `mensaje`,
 *      calls the stub `responder()`, and — since `WHATSAPP_LIVE=false` is
 *      forced below — mocks the outbound send and persists one outbound
 *      ('saliente') `mensaje` (WA-02/04/05).
 *   3. dedup → replaying the EXACT same signed payload re-enqueues at the
 *      webhook layer (which does not dedupe itself — that is not its job),
 *      but the worker's second run hits the durable
 *      `UNIQUE(mensaje.wa_message_id)` constraint (23505) and short-circuits
 *      BEFORE `responder`/send: no second inbound or outbound `mensaje` row
 *      is created (WA-03).
 *
 * Gated on a real `.env`/DB (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * SUPABASE_DB_URL) — targets ONLY bdgufnitakelyialjoqg (CLAUDE.md hard rule).
 * Run at wave-merge/phase-gate, NOT part of the automated vitest suite. Run
 * via:
 *   pnpm exec tsx scripts/verify-whatsapp-webhook.ts
 */
import { createHmac } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@turnosbot/db-types";
import Fastify from "fastify";

import { TENANT_A } from "./seed-fixtures.js";

// D-01: force the mock-send gate regardless of whatever WHATSAPP_LIVE is set
// to in the real .env — this script must NEVER attempt a real Graph API
// call, no matter the environment it runs against.
process.env.WHATSAPP_LIVE = "false";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_DB_URL = process.env.SUPABASE_DB_URL;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("FALTAN SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en .env — abortando.");
  process.exit(1);
}
// Guard de aislamiento verbatim (CLAUDE.md, regla dura) — NUNCA tocar ningún
// otro proyecto Supabase (de otro producto o cliente) que no sea TurnosBot.
if (!SUPABASE_URL.includes("bdgufnitakelyialjoqg")) {
  console.error(`SUPABASE_URL no apunta al proyecto TurnosBot. Abortando.`);
  process.exit(1);
}
// apps/bot/src/queue/boss.ts (transitively imported by webhook.ts, below)
// constructs its PgBoss singleton at import time and throws if this is
// missing — fail fast here with the same actionable message instead of a
// confusing import-time crash.
if (!SUPABASE_DB_URL) {
  console.error(
    "FALTA SUPABASE_DB_URL en .env (requerida por apps/bot/src/queue/boss.ts, aunque este script " +
      "nunca inicia pg-boss de verdad) — abortando.",
  );
  process.exit(1);
}

const supabaseAdmin = createClient<Database>(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Imported dynamically, AFTER the guards above: apps/bot/src/db/client.ts
// (transitively imported by processInboundWhatsappEvent's default deps)
// throws synchronously at import time if SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY
// are missing.
const { registerWhatsappWebhook } = await import("../apps/bot/src/whatsapp/webhook.js");
const { processInboundWhatsappEvent } = await import("../apps/bot/src/queue/inboundWorker.js");
type WhatsappWebhookEvent = Parameters<typeof processInboundWhatsappEvent>[0];

// --- Throwaway test fixtures (this script's own IDs, never touched by
// apply-seed.ts / other verify-*.ts scripts) --------------------------------
const DEV_APP_SECRET = "verify-whatsapp-webhook-dev-secret";
const DEV_VERIFY_TOKEN = "verify-whatsapp-webhook-dev-token";
const TEST_NEGOCIO_ID = "e5060000-0000-4000-8000-000000000001";
const TEST_PHONE_NUMBER_ID = "999888777001"; // fake Meta phone_number_id, test-only
const TEST_WA_ID = "5491100000099"; // fake wa_id, test-only, digits-only (no "+", Pitfall 7)

function sign(body: Buffer, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

function buildEvent(messageId: string): WhatsappWebhookEvent {
  return {
    entry: [
      {
        changes: [
          {
            value: {
              metadata: { phone_number_id: TEST_PHONE_NUMBER_ID },
              messages: [
                {
                  id: messageId,
                  from: TEST_WA_ID,
                  type: "text",
                  text: { body: "Hola, quiero reservar un turno (verify-whatsapp-webhook)" },
                },
              ],
            },
          },
        ],
      },
    ],
  } as WhatsappWebhookEvent;
}

/** Cleanup respects FKs: mensaje -> conversacion -> cliente -> negocio. Runs
 * at both start and end so interrupted re-runs are idempotent. */
async function cleanup() {
  await supabaseAdmin.from("mensaje").delete().eq("negocio_id", TEST_NEGOCIO_ID);
  await supabaseAdmin.from("conversacion").delete().eq("negocio_id", TEST_NEGOCIO_ID);
  await supabaseAdmin.from("cliente").delete().eq("negocio_id", TEST_NEGOCIO_ID);
  await supabaseAdmin.from("negocio").delete().eq("id", TEST_NEGOCIO_ID);
}

async function main() {
  await cleanup();

  // --- Seed a throwaway negocio with a known whatsapp_phone_number_id — the
  // worker resolves tenant STRICTLY by this column, never by guessing (D-07)
  const { error: negocioErr } = await supabaseAdmin.from("negocio").insert({
    id: TEST_NEGOCIO_ID,
    tenant_id: TENANT_A.tenantId,
    nombre: "WhatsApp Verify Test (05-06)",
    whatsapp_phone_number_id: TEST_PHONE_NUMBER_ID,
  });
  if (negocioErr) {
    console.error("FAIL: no se pudo sembrar el negocio de prueba:", negocioErr.message);
    await cleanup();
    process.exit(1);
  }
  console.log(
    `OK: negocio de prueba sembrado (id=${TEST_NEGOCIO_ID}, phone_number_id=${TEST_PHONE_NUMBER_ID}).`,
  );

  // --- Scratch Fastify instance driving the EXACT production route/parser --
  const app = Fastify();
  app.addContentTypeParser("application/json", { parseAs: "buffer" }, (req, body, done) => {
    (req as { rawBody?: Buffer }).rawBody = body as Buffer;
    try {
      done(null, JSON.parse((body as Buffer).toString("utf8")));
    } catch (err) {
      (err as { statusCode?: number }).statusCode = 400;
      done(err as Error, undefined);
    }
  });

  const enqueuedEvents: WhatsappWebhookEvent[] = [];
  // pg-boss's real `send` is overloaded (a single-Request-object form and a
  // name/data/options form) — this fake only ever needs to satisfy the
  // name/data form the webhook route actually calls, so it's cast to the
  // real type rather than reshaped to match every overload.
  const fakeBossSend = (async (_name: string, data?: object | null) => {
    enqueuedEvents.push(data as WhatsappWebhookEvent);
    return null;
  }) as Parameters<typeof registerWhatsappWebhook>[1]["boss"]["send"];
  registerWhatsappWebhook(app, {
    env: { WHATSAPP_APP_SECRET: DEV_APP_SECRET, WHATSAPP_VERIFY_TOKEN: DEV_VERIFY_TOKEN },
    boss: { send: fakeBossSend },
  });

  async function postSignedEvent(event: WhatsappWebhookEvent) {
    const body = Buffer.from(JSON.stringify(event), "utf8");
    const signature = sign(body, DEV_APP_SECRET);
    return app.inject({
      method: "POST",
      url: "/webhooks/whatsapp",
      headers: { "content-type": "application/json", "x-hub-signature-256": signature },
      payload: body,
    });
  }

  const MESSAGE_ID = `wamid.verify-05-06.${Date.now()}`;
  const event = buildEvent(MESSAGE_ID);

  // --- 1) sign -> POST -> verify -> enqueue -> 200 (WA-01) ------------------
  const res1 = await postSignedEvent(event);
  if (res1.statusCode !== 200) {
    console.error(
      `FAIL: la ruta POST firmada debería responder 200, se obtuvo ${res1.statusCode}: ${res1.body}`,
    );
    await cleanup();
    process.exit(1);
  }
  const countAfterFirstPost = enqueuedEvents.length;
  if (countAfterFirstPost !== 1) {
    console.error(
      `FAIL: se esperaba 1 evento encolado tras el POST firmado, se obtuvieron ${countAfterFirstPost}.`,
    );
    await cleanup();
    process.exit(1);
  }
  console.log("OK: POST firmado verificado y encolado, 200 respondido (WA-01/WA-03).");

  // --- 2) worker processes the enqueued event: persist + mocked send --------
  await processInboundWhatsappEvent(enqueuedEvents[0] as never);

  const { data: mensajesTrasPrimero, error: mensajesErr1 } = await supabaseAdmin
    .from("mensaje")
    .select("id, direccion, wa_message_id")
    .eq("negocio_id", TEST_NEGOCIO_ID);
  if (mensajesErr1) {
    console.error(
      "FAIL: no se pudieron leer los mensajes tras el primer procesamiento:",
      mensajesErr1.message,
    );
    await cleanup();
    process.exit(1);
  }
  const entrantes1 = (mensajesTrasPrimero ?? []).filter((m) => m.direccion === "entrante");
  const salientes1 = (mensajesTrasPrimero ?? []).filter((m) => m.direccion === "saliente");
  if (entrantes1.length !== 1 || entrantes1[0]?.wa_message_id !== MESSAGE_ID) {
    console.error(
      `FAIL: se esperaba exactamente 1 mensaje entrante con wa_message_id=${MESSAGE_ID}, se obtuvo: ${JSON.stringify(mensajesTrasPrimero)}`,
    );
    await cleanup();
    process.exit(1);
  }
  if (salientes1.length !== 1) {
    console.error(
      `FAIL: se esperaba exactamente 1 mensaje saliente (respuesta mockeada, WHATSAPP_LIVE=false), se obtuvo: ${JSON.stringify(mensajesTrasPrimero)}`,
    );
    await cleanup();
    process.exit(1);
  }
  console.log(
    "OK: worker persistió 1 mensaje entrante + 1 saliente (WHATSAPP_LIVE=false, envío mockeado, WA-02/04/05).",
  );

  // --- 3) replay the EXACT same signed payload: durable dedup (WA-03) -------
  const res2 = await postSignedEvent(event);
  if (res2.statusCode !== 200) {
    console.error(
      `FAIL: el replay del mismo payload firmado debería responder 200, se obtuvo ${res2.statusCode}.`,
    );
    await cleanup();
    process.exit(1);
  }
  // The webhook layer itself doesn't dedupe (that's not its job — see
  // webhook.ts's doc comment); re-enqueuing here is expected. The durable
  // dedup guarantee is asserted below, at the DB layer.
  const countAfterReplayPost = enqueuedEvents.length;
  if (countAfterReplayPost !== 2) {
    console.error(
      `FAIL: se esperaban 2 eventos encolados tras el replay (el webhook no dedupea — eso es trabajo del worker/DB), se obtuvieron ${countAfterReplayPost}.`,
    );
    await cleanup();
    process.exit(1);
  }

  await processInboundWhatsappEvent(enqueuedEvents[1] as never);

  const { data: mensajesTrasReplay, error: mensajesErr2 } = await supabaseAdmin
    .from("mensaje")
    .select("id, direccion, wa_message_id")
    .eq("negocio_id", TEST_NEGOCIO_ID);
  if (mensajesErr2) {
    console.error("FAIL: no se pudieron leer los mensajes tras el replay:", mensajesErr2.message);
    await cleanup();
    process.exit(1);
  }
  if ((mensajesTrasReplay ?? []).length !== 2) {
    console.error(
      `FAIL: el replay del mismo wa_message_id NO debería crear un segundo mensaje entrante/saliente (WA-03 dedup, UNIQUE(mensaje.wa_message_id)) — se esperaban 2 filas totales, se obtuvieron ${(mensajesTrasReplay ?? []).length}: ${JSON.stringify(mensajesTrasReplay)}`,
    );
    await cleanup();
    process.exit(1);
  }
  console.log(
    "OK: replay del mismo wa_message_id no duplicó ni el mensaje entrante ni el saliente (WA-03, dedup real contra UNIQUE(mensaje.wa_message_id)).",
  );

  await cleanup();

  console.log("\nverify-whatsapp-webhook: PASSED");
}

main().catch(async (err) => {
  console.error("ERROR inesperado en verify-whatsapp-webhook.ts:", err);
  await cleanup();
  process.exit(1);
});
