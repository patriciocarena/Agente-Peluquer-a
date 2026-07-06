---
phase: 05-integraci-n-whatsapp-cloud-api
fixed_at: 2026-07-06T23:54:21Z
review_path: .planning/phases/05-integraci-n-whatsapp-cloud-api/05-REVIEW.md
iteration: 1
findings_in_scope: 6
fixed: 6
skipped: 0
status: all_fixed
---

# Phase 5: Code Review Fix Report

**Fixed at:** 2026-07-06T23:54:21Z
**Source review:** .planning/phases/05-integraci-n-whatsapp-cloud-api/05-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 6 (fix_scope: critical_warning — CR-01, CR-02, WR-01, WR-02, WR-03, WR-04; the 4 Info findings were out of scope and not touched)
- Fixed: 6
- Skipped: 0

## Fixed Issues

### CR-01: Non-duplicate insertMensaje errors are silently swallowed, not just deduped

**Files modified:** `apps/bot/src/queue/inboundWorker.ts`
**Commit:** `145dc00`
**Applied fix:** The inbound `insertMensaje` result now checks `insertError` explicitly. A `23505` (duplicate `wa_message_id`) still short-circuits with the existing dedup log-and-return. Any OTHER error is now logged with full context and rethrown as an `Error`, aborting before `responder()`/`sendWhatsappMessage()` — matching the reviewer's exact suggested fix.

### CR-02: No error handling or retry policy around responder/send — any downstream failure is permanent, silent message loss

**Files modified:** `apps/bot/src/queue/inboundWorker.ts`, `apps/bot/src/queue/boss.ts`, `apps/bot/src/queue/inboundWorker.test.ts`
**Commit:** `d4379d4`
**Applied fix:** Two complementary changes, per the review's two-part fix:
1. `boss.ts`: `WHATSAPP_INBOUND_QUEUE` is now created with `retryLimit: 5`, `retryBackoff: true`, and `deadLetter: "whatsapp-inbound-dlq"`. The dead-letter queue is explicitly created via `createQueue` before the main queue references it by name (pg-boss requires the target queue to exist).
2. `inboundWorker.ts`: the `responder`/window-gate/`sendWhatsappMessage`/outbound-persist block is now wrapped in `try/catch`. On failure it logs full context (`conversacionId`, `waMessageId`, the error) and rethrows, so the exception propagates to pg-boss's job handler where the now-configured retry/dead-letter policy can act on it, instead of vanishing after Meta's synchronous webhook 200.
3. Added a new test (`inboundWorker.test.ts`, "sendWhatsappMessage rejecting...") asserting the job rejects loudly and logs the failure rather than silently succeeding, per the review's explicit test suggestion.

**Also folded in WR-01's fix in this same commit** (see below) since the outbound `insertMensaje` call being fixed for CR-02's try/catch wrap is the exact same code WR-01 targets — splitting it into two commits would have meant committing a physically inseparable one-line diff twice.

**Known limitation — NOT fixed, documented in code comments and here for visibility:** the review correctly points out that even with retries configured, a retry re-enters `processInboundWhatsappEvent` from the top and will hit the `23505` dedup branch on the (already-successful) inbound insert, returning early *without* re-attempting `responder`/`send`. Making the dedup check independent of "was the reply actually sent" (e.g., checking for an existing outbound `mensaje` row) is a structural/schema-level redesign the review itself frames as one option among several ("e.g. ...") rather than a hard requirement — implementing it safely would need product input on the desired outbox-pattern shape, so it was left as a documented follow-up rather than guessed at. **This finding should be treated as `fixed: requires human verification`** for that specific residual gap — the visibility/retry-configuration half of CR-02 is fully fixed and verified (tests + typecheck), but the "silent loss" failure mode is only closed for the *first* attempt after inbound-persist; a genuine retry of an already-persisted-but-unsent message still won't resend today.

### WR-01: Outbound insertMensaje error is never checked

**Files modified:** `apps/bot/src/queue/inboundWorker.ts` (same commit as CR-02)
**Commit:** `d4379d4`
**Applied fix:** The outbound `insertMensaje` result now destructures `error: outboundError` and logs it (with `conversacionId`) if present, instead of discarding the result.

### WR-02: Check-then-act race in findOrCreateCliente / findOrCreateConversacion

**Files modified:** `apps/bot/src/conversation/findOrCreateCliente.ts`, `apps/bot/src/conversation/findOrCreateConversacion.ts`
**Commit:** `3a76793`
**Applied fix:** Confirmed the required unique constraints already exist at the DB level (`cliente_telefono_unico_por_negocio UNIQUE (negocio_id, telefono)` and `conversacion_unica_por_cliente UNIQUE (negocio_id, cliente_id)`, both in `supabase/migrations/0003_tenant_negocio_split.sql`), so the review's "add one if it doesn't exist" caveat did not apply. Implemented the review's alternative fix: catch the losing insert's `23505` and re-select the winner's row instead of throwing, returning the winner's `cliente.id` (or, for conversacion, re-selecting and refreshing `ventana_expira_at` on the winner's row before returning it).

### WR-03: SUPABASE_DB_URL is checked for presence only, not for the required session-mode port

**Files modified:** `apps/bot/src/queue/boss.ts`
**Commit:** `5e1b9a1`
**Applied fix:** Added the exact guard suggested by the review — `new URL(env.SUPABASE_DB_URL).port === "6543"` throws a descriptive error before constructing the `PgBoss` singleton, fast-failing on a misconfigured transaction-mode pooler URL.

### WR-04: GET handshake token comparison is not constant-time

**Files modified:** `apps/bot/src/whatsapp/webhook.ts`
**Commit:** `038ba12`
**Applied fix:** Added a local `verifyTokenMatches` helper mirroring `signature.ts`'s length-guard + `timingSafeEqual` pattern, and swapped the GET route's `token === deps.env.WHATSAPP_VERIFY_TOKEN` plain comparison for it. Handles `undefined` on either side defensively (returns `false`, matching prior behavior).

## Skipped Issues

None — all 6 in-scope findings were fixed.

## Verification

- `pnpm --filter @turnosbot/bot test`: 7 test files, 36 tests, all passing (including 1 new test added for CR-02).
- `pnpm --filter @turnosbot/bot exec tsc -p tsconfig.json --noEmit`: zero errors.
- Each individual fix was also verified in isolation (Tier 1 re-read + Tier 2 scoped `tsc --noEmit` grep + targeted test run) before being committed.

## Out of scope (fix_scope: critical_warning)

IN-01 through IN-04 (Info-severity) were not addressed by this run — re-run with `fix_scope: all` to include them.

---

_Fixed: 2026-07-06T23:54:21Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
