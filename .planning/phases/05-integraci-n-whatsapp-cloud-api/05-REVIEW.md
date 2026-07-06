---
phase: 05-integraci-n-whatsapp-cloud-api
reviewed: 2026-07-06T00:00:00Z
depth: standard
files_reviewed: 23
files_reviewed_list:
  - apps/bot/package.json
  - apps/bot/src/config/env.test.ts
  - apps/bot/src/config/env.ts
  - apps/bot/src/conversation/findOrCreateCliente.ts
  - apps/bot/src/conversation/findOrCreateConversacion.ts
  - apps/bot/src/conversation/responder.test.ts
  - apps/bot/src/conversation/responder.ts
  - apps/bot/src/db/negocioScoped.ts
  - apps/bot/src/queue/boss.ts
  - apps/bot/src/queue/inboundWorker.test.ts
  - apps/bot/src/queue/inboundWorker.ts
  - apps/bot/src/server.ts
  - apps/bot/src/whatsapp/getWhatsappToken.ts
  - apps/bot/src/whatsapp/graphClient.test.ts
  - apps/bot/src/whatsapp/graphClient.ts
  - apps/bot/src/whatsapp/payload.test.ts
  - apps/bot/src/whatsapp/payload.ts
  - apps/bot/src/whatsapp/signature.test.ts
  - apps/bot/src/whatsapp/signature.ts
  - apps/bot/src/whatsapp/webhook.test.ts
  - apps/bot/src/whatsapp/webhook.ts
  - apps/bot/vitest.config.ts
  - scripts/verify-whatsapp-webhook.ts
  - supabase/migrations/0004_mensaje_wa_message_id_unique.sql
findings:
  critical: 2
  warning: 4
  info: 4
  total: 10
status: issues_found
---

# Phase 5: Code Review Report

**Reviewed:** 2026-07-06T00:00:00Z
**Depth:** standard
**Files Reviewed:** 23
**Status:** issues_found

## Summary

Reviewed the WhatsApp Cloud API integration (webhook signature verification, tenant resolution, pg-boss queue worker, outbound send gate). The HMAC verification (`signature.ts`) is correct: constant-time comparison via `timingSafeEqual`, a length guard before it to avoid the documented `RangeError`, and a proper `sha256=` prefix check. Tenant resolution (`inboundWorker.ts` Pattern 3) is strict — no fallback/default tenant on a phone-number-id miss, zero writes. `negocioScoped`'s write accessors correctly bake `negocio_id` into every insert/update and type it out of the caller-supplied row, so a caller cannot smuggle a different `negocio_id` through this layer.

The most serious problem is in the job orchestration itself (`inboundWorker.ts`): the durable-dedup error check only special-cases Postgres `23505` and silently ignores every other insert error, and there is no error handling or queue-level retry configured around the responder/send steps — combined, these two gaps mean a transient failure anywhere after the inbound persist (a non-duplicate DB error, a Graph API failure, a network blip) results in permanent, silent loss of that customer's reply with no path to recovery, undermining the project's stated core reliability value ("a client can book a real appointment... if that works reliably"). Both are classified BLOCKER below with concrete fixes.

## Critical Issues

### CR-01: Non-duplicate insertMensaje errors are silently swallowed, not just deduped

**File:** `apps/bot/src/queue/inboundWorker.ts:101-113`
**Issue:** The insert of the inbound `mensaje` row only special-cases the `23505` (duplicate `wa_message_id`) error code:

```ts
const { error: insertError } = await deps.negocioScoped(negocio.id).insertMensaje({...});

if ((insertError as PostgrestError | null)?.code === "23505") {
  deps.log({ waMessageId: message.id }, "Duplicate wa_message_id — already processed (WA-03)");
  return;
}

const reply = await deps.responder(conversacion, message.text?.body ?? "");
```

Any OTHER insert error — a transient network blip talking to Postgres, an FK violation, an RLS/permission error, a jsonb size-limit rejection on `contenido` — is silently ignored: `insertError` is never checked, logged, or thrown on for the non-`23505` case, and execution falls straight through into `responder()` and potentially `sendWhatsappMessage()`. The bot ends up generating and sending a reply for a message that was never durably recorded, breaking the exact invariant this function's own doc comment claims to guarantee ("the durable dedup backstop... short-circuits BEFORE responder/send").

This is a real regression against the very pattern this module claims to mirror: `packages/availability-engine/src/booking.ts` special-cases its one known conflict code (`isSlotTakenConcurrently`, exclusion violation) but still returns an explicit `{ ok: false, reason: "insert_error", message }` for every other insert error — it never falls through silently.

**Fix:**
```ts
if (insertError) {
  if ((insertError as PostgrestError).code === "23505") {
    deps.log({ waMessageId: message.id }, "Duplicate wa_message_id — already processed (WA-03)");
    return;
  }
  deps.log({ waMessageId: message.id, insertError }, "Failed to persist inbound mensaje — aborting, no reply sent for an unrecorded message");
  throw new Error(`processInboundWhatsappEvent: no se pudo persistir el mensaje entrante (${insertError.message})`);
}

const reply = await deps.responder(conversacion, message.text?.body ?? "");
```

---

### CR-02: No error handling or retry policy around responder/send — any downstream failure is permanent, silent message loss

**File:** `apps/bot/src/queue/inboundWorker.ts:113-134`, `apps/bot/src/queue/boss.ts:59-65`
**Issue:** `deps.sendWhatsappMessage(...)` (line 124) can throw for entirely expected, transient reasons — a non-2xx HTTP response, or Meta's documented HTTP-200-with-embedded-`error`-body case (Pitfall 6, both handled by `graphClient.ts` by throwing). Neither this call nor the outbound `insertMensaje` call is wrapped in try/catch, so the exception propagates out of `processInboundWhatsappEvent` and out of the pg-boss job handler:

```ts
await boss.work(WHATSAPP_INBOUND_QUEUE, { batchSize: 1 }, async ([job]) => {
  await processInboundWhatsappEvent(job.data as ...);
});
```

`boss.createQueue(WHATSAPP_INBOUND_QUEUE)` is called with no options — pg-boss's default `retryLimit` is `0`, so a failed job is not retried by the queue. And because the webhook route (`webhook.ts`) already answered Meta with `200` at enqueue time (by design, D-03), Meta will never redeliver either. The net effect: any transient failure in the Graph API call (rate limit, timeout, momentary 5xx) permanently drops that customer's reply with no operator-visible failure path beyond a `console.error` log line from `boss.on("error", ...)`.

This is compounded by CR-01/the dedup design: even if `retryLimit` were raised, a retry re-runs the whole handler from the top, re-attempts the inbound `insertMensaje`, hits the `23505` unique violation from the first (partially successful) attempt, and returns early at line 108-111 — BEFORE ever reaching `responder`/`send` again. So simply adding a retry count would not fix this; the current design has no way to resume only the failed downstream step.

**Fix:** Two complementary changes:
1. Configure the queue with a retry policy and a dead-letter destination so failures are visible and retried automatically:
   ```ts
   await boss.createQueue(WHATSAPP_INBOUND_QUEUE, {
     retryLimit: 5,
     retryBackoff: true,
     deadLetter: `${WHATSAPP_INBOUND_QUEUE}-dlq`,
   });
   ```
2. Make the "already persisted the inbound message" check independent from "already sent the reply" — e.g., check whether an outbound `mensaje` already exists for this `conversacion_id` since the inbound insert, rather than gating solely on the inbound `23505`. That way a retry that reaches the dedup branch can still fall through to attempt `responder`/`send` if no outbound message was recorded yet. At minimum, wrap the `responder`/`send`/outbound-insert block in try/catch, log the failure with enough context to manually replay it, and rethrow so the queue's retry (once configured) actually gets a chance to run.

Also add a test case to `inboundWorker.test.ts` exercising `sendWhatsappMessage` rejecting, asserting the job either retries correctly or fails loudly/visibly rather than silently succeeding.

## Warnings

### WR-01: Outbound insertMensaje error is never checked

**File:** `apps/bot/src/queue/inboundWorker.ts:125-129`
**Issue:** After a successful send, the outbound `mensaje` persist result is awaited but its `error` is discarded:
```ts
await deps.negocioScoped(negocio.id).insertMensaje({
  conversacion_id: conversacion.id,
  direccion: "saliente",
  contenido: { text: { body: reply } },
});
```
If this insert fails (DB blip, etc.) after the WhatsApp message was already successfully sent to the customer, there is no record of the outbound message and no log entry — a silent audit-trail gap. On a subsequent retry (once CR-02 is fixed) this would also cause the bot to send a second reply to the customer, since nothing here indicates the reply was already sent.

**Fix:** Destructure and check the error, at minimum logging it:
```ts
const { error: outboundError } = await deps.negocioScoped(negocio.id).insertMensaje({...});
if (outboundError) {
  deps.log({ conversacionId: conversacion.id, outboundError }, "Sent WhatsApp reply but failed to persist the outbound mensaje record");
}
```

### WR-02: Check-then-act race in findOrCreateCliente / findOrCreateConversacion

**File:** `apps/bot/src/conversation/findOrCreateCliente.ts:30-53`, `apps/bot/src/conversation/findOrCreateConversacion.ts:30-70`
**Issue:** Both functions do a plain `SELECT ... maybeSingle()` followed by a conditional `INSERT` if nothing was found. This is not atomic: if two webhook events for the same new `wa_id`/cliente arrive close enough together to both reach the `SELECT` before either `INSERT` commits (e.g., a customer double-sends a message, or two pg-boss workers process concurrently), both paths will see `existing === null` and both will attempt to create a row — resulting in two `cliente` rows for one phone number, or two `conversacion` rows for one (negocio, cliente) pair, depending on what unique constraints exist at the DB level (not visible in the reviewed files).
**Fix:** Prefer an atomic upsert (`.upsert(..., { onConflict: "negocio_id,telefono", ignoreDuplicates: false })` for cliente, similarly for conversacion on a `(negocio_id, cliente_id)` unique constraint) over select-then-insert, or catch the `23505` from a racing insert and re-select. If a unique constraint doesn't yet exist on these columns, add one — otherwise the race is possible even with upsert semantics.

### WR-03: SUPABASE_DB_URL is checked for presence only, not for the required session-mode port

**File:** `apps/bot/src/queue/boss.ts:42-49`
**Issue:** The comment above this guard states the hard project rule that `SUPABASE_DB_URL` must be the direct/session-mode connection (port 5432) and never the Supavisor transaction-mode pooler (port 6543), because pg-boss relies on session-level Postgres behavior (advisory locks, prepared statements) that transaction pooling silently breaks. The code only verifies the variable is set — it does not verify the port:
```ts
if (!env.SUPABASE_DB_URL) {
  throw new Error(...);
}
export const boss = new PgBoss(env.SUPABASE_DB_URL);
```
A misconfigured `.env` pointing at the 6543 pooler passes this guard silently and only surfaces as confusing, hard-to-diagnose pg-boss failures later (per the same comment's own reasoning for adding this guard in the first place — "fails fast... rather than letting pg-boss fail confusingly later").
**Fix:**
```ts
const dbUrlPort = new URL(env.SUPABASE_DB_URL).port;
if (dbUrlPort === "6543") {
  throw new Error(
    "SUPABASE_DB_URL apunta al pooler transaction-mode (puerto 6543) — pg-boss requiere " +
      "conexión directa/session-mode (puerto 5432). Ver CLAUDE.md / apps/bot/src/queue/boss.ts.",
  );
}
```

### WR-04: GET handshake token comparison is not constant-time, inconsistent with the rest of the phase's security posture

**File:** `apps/bot/src/whatsapp/webhook.ts:66`
**Issue:** `token === deps.env.WHATSAPP_VERIFY_TOKEN` is a plain string comparison, while the POST route's signature check (rightly) uses `timingSafeEqual` specifically to avoid a timing side-channel. The verify_token has lower stakes than the App Secret (it only gates the one-time subscription handshake), but the codebase otherwise treats "compare a secret against attacker-controllable input" as something that must be constant-time — this one instance is the odd one out.
**Fix:** Reuse the same length-guard + `timingSafeEqual` pattern already established in `signature.ts` for this comparison, or explicitly document why it's exempted if the team decides the risk doesn't warrant it.

## Info

### IN-01: Inconsistent error logging before throw in graphClient.ts

**File:** `apps/bot/src/whatsapp/graphClient.ts:90-103`
**Issue:** The HTTP-200-with-embedded-error branch (Pitfall 6) logs via `deps.log(...)` before throwing (lines 96-99), but the plain non-`ok` HTTP response branch (line 90-92) throws directly with no `deps.log` call first. Since both are equally important failure modes for `sendWhatsappMessage`, this is an inconsistent observability gap.
**Fix:** Add a `deps.log({ negocioId, to, status: res.status }, "WhatsApp send failed (non-2xx)")` call before the throw at line 91, mirroring the embedded-error branch.

### IN-02: PORT env var is not validated, `Number(...)` can silently produce NaN

**File:** `apps/bot/src/config/env.ts:38`
**Issue:** `PORT: Number(process.env.PORT ?? 3001)` — if `PORT` is set to a non-numeric string in the environment, `Number(...)` returns `NaN`, which is passed straight to `app.listen({ port: env.PORT, ... })` in `server.ts`, producing a confusing runtime failure rather than a clear startup error.
**Fix:** Validate with a guard (`Number.isNaN(port) ? throwOrDefault : port`) or use a zod schema (`z.coerce.number().int().positive()`) for `PORT`.

### IN-03: Plaintext WhatsApp access token read directly from the DB (already ticketed, noting for completeness)

**File:** `apps/bot/src/whatsapp/getWhatsappToken.ts:6-8`
**Issue:** `getWhatsappToken` reads `negocio.whatsapp_token` in plaintext from the DB. This is explicitly called out in the file's own doc comment as a known, ticketed risk (`TODO(SEC-01, Phase 7)`) to be replaced with a Vault/AES-GCM decrypt. Flagging here only so it's visible in this review's record; no new action implied beyond the existing ticket.
**Fix:** None needed now — tracked by SEC-01 in Phase 7 per the existing comment.

### IN-04: boss.ts uses raw console.error instead of the injectable logger pattern used elsewhere

**File:** `apps/bot/src/queue/boss.ts:50`
**Issue:** `boss.on("error", (err) => console.error("[pg-boss]", err))` bypasses the `deps.log` / Fastify `pino` logging convention used consistently elsewhere in this phase (`inboundWorker.ts`, `graphClient.ts` both take an injectable `log` function). This makes pg-boss-level errors invisible to whatever structured-log aggregation is set up for the rest of the service.
**Fix:** Wire this into the Fastify app's logger (e.g., pass `app.log.error` in from `server.ts` when constructing/starting the queue) instead of a bare `console.error`.

---

_Reviewed: 2026-07-06T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
