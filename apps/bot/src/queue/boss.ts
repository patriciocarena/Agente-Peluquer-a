/**
 * apps/bot/src/queue/boss.ts — pg-boss singleton + lifecycle (WA-03, D-03).
 *
 * The webhook route (plan 05-06) only verifies the signature and enqueues
 * the raw event, responding 200 to Meta immediately; this module's
 * `whatsapp-inbound` worker does the real work (tenant resolution,
 * persistence, stub reply, outbound send — see ./inboundWorker.ts),
 * decoupled from Meta's response-time expectations and its up-to-7-day
 * retry behavior on non-200 responses.
 *
 * CLAUDE.md hard rule: `SUPABASE_DB_URL` MUST be the direct/session-mode
 * connection (port 5432), NEVER the Supavisor transaction-mode pooler (port
 * 6543) — pg-boss relies on session-level Postgres behavior (advisory
 * locks, prepared statements) that transaction pooling silently breaks or
 * degrades. This module fails fast (mirrors ../db/client.ts's
 * guard-then-construct-singleton convention) if the var is missing, rather
 * than letting pg-boss fail confusingly later against the wrong connection
 * mode.
 *
 * `boss` is a module-level singleton, same lifecycle convention as
 * ../db/client.ts's `supabaseAdmin`: constructed once at import time,
 * started/stopped explicitly by server.ts's `start()`/shutdown (plan 05-06),
 * never re-constructed per request or per job.
 */
// pg-boss@12.25.1 ships as a genuine ESM package with a NAMED export only
// (`export class PgBoss`) — there is no default export (verified against
// apps/bot/node_modules/pg-boss/dist/index.d.ts: `export class PgBoss extends
// EventEmitter ...`, no `export default`). 05-RESEARCH.md/05-PATTERNS.md's
// code sample assumed `import PgBoss from "pg-boss"` (a default import);
// corrected here to the named import the installed package actually exports
// (Rule 1 — the assumed default-import shape does not exist and fails to
// typecheck under NodeNext module resolution).
import { PgBoss } from "pg-boss";

import { loadEnv } from "../config/env.js";
import { processInboundWhatsappEvent } from "./inboundWorker.js";

export const WHATSAPP_INBOUND_QUEUE = "whatsapp-inbound";
// CR-02: dead-letter destination for jobs that exhaust WHATSAPP_INBOUND_QUEUE's
// retryLimit — makes otherwise-silent permanent failures (Graph API outage,
// persistent DB error) visible/inspectable instead of just vanishing.
const WHATSAPP_INBOUND_DEAD_LETTER_QUEUE = "whatsapp-inbound-dlq";

const env = loadEnv();

if (!env.SUPABASE_DB_URL) {
  throw new Error(
    "SUPABASE_DB_URL es obligatoria para pg-boss (apps/bot/src/queue/boss.ts) — usar la " +
      "conexión directa/session-mode (puerto 5432), NUNCA el pooler transaction-mode (6543).",
  );
}

// WR-03: the presence check above doesn't verify the URL actually points at
// the direct/session-mode port — a misconfigured .env pointing at the 6543
// transaction-mode pooler would pass it silently and only surface later as
// confusing pg-boss failures (the exact failure mode the comment above this
// guard already warns about). Fail fast here too.
if (new URL(env.SUPABASE_DB_URL).port === "6543") {
  throw new Error(
    "SUPABASE_DB_URL apunta al pooler transaction-mode (puerto 6543) — pg-boss requiere " +
      "conexión directa/session-mode (puerto 5432). Ver CLAUDE.md / apps/bot/src/queue/boss.ts.",
  );
}

export const boss = new PgBoss(env.SUPABASE_DB_URL);
boss.on("error", (err) => console.error("[pg-boss]", err));

/**
 * Starts the pg-boss instance, ensures the `whatsapp-inbound` queue exists,
 * and registers the worker that delegates every job to
 * `processInboundWhatsappEvent` (batchSize 1 — one WhatsApp event per job,
 * no batching). Called once from server.ts's `start()`, alongside
 * `app.listen(...)` (plan 05-06).
 */
export async function startQueue(): Promise<void> {
  await boss.start();
  // CR-02: the dead-letter queue must exist before it can be referenced by
  // name from the main queue's `deadLetter` option below.
  await boss.createQueue(WHATSAPP_INBOUND_DEAD_LETTER_QUEUE);
  await boss.createQueue(WHATSAPP_INBOUND_QUEUE, {
    retryLimit: 5,
    retryBackoff: true,
    deadLetter: WHATSAPP_INBOUND_DEAD_LETTER_QUEUE,
  });
  await boss.work(WHATSAPP_INBOUND_QUEUE, { batchSize: 1 }, async ([job]) => {
    await processInboundWhatsappEvent(job.data as Parameters<typeof processInboundWhatsappEvent>[0]);
  });
}

/** Stops the pg-boss instance. Called from server.ts's graceful shutdown. */
export async function stopQueue(): Promise<void> {
  await boss.stop();
}
