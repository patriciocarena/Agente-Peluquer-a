---
phase: 05-integraci-n-whatsapp-cloud-api
verified: 2026-07-06T21:30:00Z
status: passed
score: 5/5 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 5: Integración WhatsApp Cloud API Verification Report

**Phase Goal:** El sistema recibe y envía mensajes de WhatsApp de forma segura y confiable, enrutando cada mensaje al tenant correcto, sin lógica conversacional todavía
**Verified:** 2026-07-06T21:30:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

Sourced from ROADMAP.md Phase 5 Success Criteria (the roadmap contract — no PLAN frontmatter `must_haves.truths` narrowed this set).

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | El sistema verifica la firma `X-Hub-Signature-256` de cada webhook entrante sobre el body crudo, y rechaza (403) firmas falsificadas | ✓ VERIFIED | `apps/bot/src/whatsapp/signature.ts` — HMAC-SHA256 over the raw `Buffer` (never re-serialized JSON), `timingSafeEqual` with a length-guard before it (no RangeError DoS). 6 unit tests cover correct/tampered/wrong-secret/missing-header/malformed-prefix/length-mismatch cases (`signature.test.ts`). `webhook.ts` POST route rejects with 403 and does NOT enqueue on any signature failure — confirmed live: ran `pnpm exec tsx --env-file=.env scripts/verify-whatsapp-webhook.ts` against the real `bdgufnitakelyialjoqg` DB; a correctly-signed POST was verified and enqueued (200), matching the script's own PASSED assertions. GET `/webhooks/whatsapp` handshake (`hub.verify_token` compare) is now constant-time (`verifyTokenMatches`, WR-04 fix, commit `038ba12`) — mismatch → 403, tested in `webhook.test.ts`. |
| 2 | Un mensaje entrante se enruta al tenant correcto usando el `phone_number_id`, verificado con al menos dos números de prueba distintos | ✓ VERIFIED | `inboundWorker.ts` resolves negocio strictly via `.eq("whatsapp_phone_number_id", phoneNumberId)` — no fallback/default tenant (D-07), confirmed by unit test "unknown phone_number_id: zero writes, no send". Ran an ad-hoc live probe (executed by this verifier, not by the executor) seeding TWO throwaway negocios with two distinct `whatsapp_phone_number_id` values and driving `processInboundWhatsappEvent` for each: each inbound event persisted its `mensaje` row under its OWN `negocio_id` with zero cross-routing (`mensajes bajo NEGOCIO_A` → only `NEGOCIO_A` rows; `mensajes bajo NEGOCIO_B` → only `NEGOCIO_B` rows). Test rows cleaned up afterward (verified zero leftover `negocio`/`mensaje` rows post-run). This closes the ROADMAP's explicit "≥2 distinct test numbers" bar, which neither the unit suite nor `scripts/verify-whatsapp-webhook.ts` (which only exercises one phone number) covered on their own. |
| 3 | El sistema responde 200 a Meta de forma rápida y procesa el mensaje de forma asíncrona, sin duplicar el procesamiento si Meta reintenta la entrega | ✓ VERIFIED | `webhook.ts` POST route ALWAYS returns 200 on the verified path regardless of downstream state (enqueue-then-200, D-03) — no synchronous DB/queue work in the handler beyond `boss.send(...)`. Durable dedup: `mensaje.wa_message_id` has a live `UNIQUE` constraint (`0001_schema_core.sql` line 308, confirmed idempotently re-documented in `0004_mensaje_wa_message_id_unique.sql`); `inboundWorker.ts` special-cases the `23505` violation and short-circuits BEFORE `responder()`/send — confirmed by unit test and by the live `verify-whatsapp-webhook.ts` run: replaying the identical signed payload re-enqueued at the webhook layer (expected — webhook itself doesn't dedupe) but the worker's second run produced **zero** additional `mensaje` rows (`OK: replay del mismo wa_message_id no duplicó ni el mensaje entrante ni el saliente`). pg-boss queue additionally uses `singletonKey = messages[0].id` as a first-layer dedup, and now has `retryLimit: 5` + `retryBackoff` + a `whatsapp-inbound-dlq` dead-letter queue (CR-02 fix, commit `d4379d4`) so a genuinely failed job is retried/surfaced instead of silently vanishing. |
| 4 | El sistema envía mensajes salientes al cliente dentro de la ventana de 24 horas y registra cuando esa ventana se cierra | ✓ VERIFIED | `findOrCreateConversacion.ts` sets/refreshes `ventana_expira_at` to `now()+24h` on every inbound message (D-09/D-10). `inboundWorker.ts` gates the outbound send on `Date.now() < ventana_expira_at`; unit test "closed window (ventana_expira_at in the past): send NOT called, no outbound mensaje inserted" exercises the closed-window branch and confirms both the log-and-skip and the absence of a second `insertMensaje` call. `graphClient.ts`'s `sendWhatsappMessage` is gated by `WHATSAPP_LIVE` (D-01) — confirmed via unit tests and the live probe (mock send logged, no real Graph API egress). |
| 5 | Toda conversación y mensaje queda persistido, con el estado del bot guardado en `context` para poder auditar/depurar | ✓ VERIFIED | `conversacion` rows are created with `context: {}` (documented Phase-6 extension contract, Pitfall 8) and both inbound (`'entrante'`) and outbound (`'saliente'`) `mensaje` rows are persisted through `negocioScoped(negocioId).insertMensaje(...)` (negocio_id baked in, D-11). Confirmed live: the `verify-whatsapp-webhook.ts` run and this verifier's own two-number probe both show real `mensaje`/`conversacion` rows created and queryable in `bdgufnitakelyialjoqg`, correctly negocio-scoped. Outbound persist errors are now checked and logged instead of discarded (WR-01 fix). |

**Score:** 5/5 truths verified (0 present-but-behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/bot/src/whatsapp/signature.ts` | Constant-time HMAC-SHA256 verification, length-guarded | ✓ VERIFIED | Exists, substantive, wired into `webhook.ts` POST route; 6 tests pass |
| `apps/bot/src/whatsapp/payload.ts` | zod schema + extraction helpers for Meta payload | ✓ VERIFIED | Exists, substantive, wired into `webhook.ts` and `inboundWorker.ts` |
| `apps/bot/src/whatsapp/getWhatsappToken.ts` | D-04 single token-read choke point | ✓ VERIFIED | Exists, wired into `graphClient.ts`; `TODO(SEC-01, Phase 7)` marker present (formal, ticketed) |
| `apps/bot/src/whatsapp/graphClient.ts` | Outbound send, `WHATSAPP_LIVE` gate, 200-with-error handling | ✓ VERIFIED | Exists, wired into `inboundWorker.ts`; 4+ tests pass; live probe confirmed mock-send path |
| `apps/bot/src/conversation/findOrCreateCliente.ts` | Exact-match cliente resolution, negocio-scoped | ✓ VERIFIED | Exists; WR-02 race fix (23505 catch + re-select) present |
| `apps/bot/src/conversation/findOrCreateConversacion.ts` | Find-or-create + 24h window refresh | ✓ VERIFIED | Exists; WR-02 race fix present |
| `apps/bot/src/conversation/responder.ts` | Phase 6 swap-point stub | ✓ VERIFIED | Exists, deterministic placeholder, 1 test pass |
| `apps/bot/src/db/negocioScoped.ts` | Write accessors baking `negocio_id` into inserts/updates | ✓ VERIFIED | `insertMensaje`/`insertConversacion`/`updateConversacion`/`insertCliente` present, typed via `Omit<TablesInsert<T>, "negocio_id">` |
| `apps/bot/src/queue/inboundWorker.ts` | Full orchestration: tenant resolve → cliente/conversacion → persist → responder → send gate | ✓ VERIFIED | All 6 unit tests pass (unknown-tenant, non-message, happy-path, dedup, send-rejects, closed-window); CR-01/CR-02/WR-01 fixes present and live-probed |
| `apps/bot/src/queue/boss.ts` | pg-boss singleton, session-mode port guard, retry/DLQ config | ✓ VERIFIED | WR-03 fix present (`new URL(...).port === "6543"` guard); `retryLimit`/`deadLetter` configured |
| `apps/bot/src/whatsapp/webhook.ts` | GET handshake + POST verify-then-enqueue-then-200 | ✓ VERIFIED | WR-04 fix present (constant-time token compare); 6 tests pass; live-probed |
| `apps/bot/src/server.ts` | helmet + rate-limit + raw-body parser + queue lifecycle | ✓ VERIFIED | All registered before routes; SIGTERM/SIGINT graceful shutdown present |
| `supabase/migrations/0004_mensaje_wa_message_id_unique.sql` | Idempotent dedup-constraint documentation | ✓ VERIFIED | `CREATE UNIQUE INDEX IF NOT EXISTS`; confirmed the underlying `UNIQUE(wa_message_id)` from `0001_schema_core.sql` is live |
| `scripts/verify-whatsapp-webhook.ts` | Local signed-payload E2E proof (sign → dedup → persist → mock-send) | ✓ VERIFIED | Executed live by this verifier against `bdgufnitakelyialjoqg` (previously deferred as a human-check in `05-06-SUMMARY.md` due to no `.env` in the executor's isolated worktree) — printed `verify-whatsapp-webhook: PASSED`; test rows confirmed cleaned up afterward |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `webhook.ts` POST route | `signature.ts` | `verifyWhatsappSignature(rawBody, signature, appSecret)` before any parse/enqueue | ✓ WIRED | Confirmed by code read + live probe (invalid signature never enqueues) |
| `webhook.ts` POST route | `boss.send()` | `boss.send(WHATSAPP_INBOUND_QUEUE, event, { singletonKey: message.id })` | ✓ WIRED | Confirmed by `webhook.test.ts` spy assertions + live probe (`enqueuedEvents` captured) |
| `boss.ts` worker | `inboundWorker.ts` | `boss.work(WHATSAPP_INBOUND_QUEUE, ...) → processInboundWhatsappEvent(job.data)` | ✓ WIRED | Confirmed by code read |
| `inboundWorker.ts` | `negocioScoped(negocioId).insertMensaje/insertConversacion/updateConversacion/insertCliente` | All persistence goes through the write accessors (D-11) | ✓ WIRED | Confirmed by code read (no direct `supabaseAdmin.from(...)` for scoped tables) + live probe (rows land correctly negocio-scoped) |
| `inboundWorker.ts` | `graphClient.sendWhatsappMessage` | Gated by the 24h window check | ✓ WIRED | Confirmed by unit tests (open/closed window) + live probe (mock send fired) |
| `server.ts` | `webhook.ts` | `registerWhatsappWebhook(app, { env, boss })`, raw-body parser registered BEFORE this call | ✓ WIRED | Confirmed by code read (ordering correct) |
| `server.ts` `start()` | `boss.ts` `startQueue()` | Awaited before `app.listen(...)` | ✓ WIRED | Confirmed by code read |

### Behavioral Spot-Checks / Probe Execution

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full unit suite | `pnpm --filter @turnosbot/bot test` | 7 test files, 36 tests, all passing | ✓ PASS |
| Typecheck | `pnpm --filter @turnosbot/bot exec tsc -p tsconfig.json --noEmit` | Clean, zero errors | ✓ PASS |
| Local signed-payload E2E probe (`scripts/verify-whatsapp-webhook.ts`) | `pnpm exec tsx --env-file=.env scripts/verify-whatsapp-webhook.ts` (live against `bdgufnitakelyialjoqg`) | `verify-whatsapp-webhook: PASSED` — sign→enqueue→200, persist (1 inbound + 1 outbound `mensaje`), replay produces zero duplicate rows | ✓ PASS |
| Two-distinct-phone-number tenant routing (ad-hoc probe run by this verifier, live) | Seeded 2 negocios with 2 distinct `whatsapp_phone_number_id`s, ran `processInboundWhatsappEvent` for each against real DB | Each event's `mensaje` landed under its own `negocio_id`, zero cross-routing; test rows cleaned up | ✓ PASS |
| Live DB cleanup verification | Queried `negocio`/`mensaje` tables for leftover test rows after both live probes | Zero leftover rows in both cases | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|-----------------|--------------|--------|----------|
| WA-01 | 05-02, 05-06 | Verifica firma X-Hub-Signature-256 sobre body crudo | ✓ SATISFIED | `signature.ts`, `webhook.ts`, live probe |
| WA-02 | 05-04, 05-05 | Resuelve el tenant por `phone_number_id` | ✓ SATISFIED | `inboundWorker.ts` strict resolution, two-number live probe (see Truth #2) |
| WA-03 | 05-01, 05-05, 05-06 | Procesamiento asíncrono + dedup por `messages[].id` | ✓ SATISFIED | `boss.ts` singletonKey + DB `UNIQUE` backstop, live-probed dedup |
| WA-04 | 05-03, 05-05 | Envío saliente dentro de la ventana de 24h | ✓ SATISFIED | `graphClient.ts` + window gate, unit + live probe |
| WA-05 | 05-04, 05-05 | Persistencia de conversación/mensajes + `context` jsonb | ✓ SATISFIED | `findOrCreateConversacion.ts`, `insertMensaje`, live-probed rows |

**Orphaned requirements:** None. `.planning/REQUIREMENTS.md` maps only WA-01..05 to Phase 5, and all five appear in at least one plan's `requirements` frontmatter.

**⚠️ Documentation-sync finding (non-blocking):** `.planning/REQUIREMENTS.md` still shows `WA-02` and `WA-05` as unchecked (`[ ]`) and its progress table lists them "Pending", even though the code, tests, and this verification's live probes confirm both are functionally complete. This is a stale-checkbox issue in the requirements tracking doc, not a functional gap — recommend updating `.planning/REQUIREMENTS.md` lines 63/66 and 163/165 to `[x]`/`Complete` as a follow-up doc-sync edit.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `apps/bot/src/whatsapp/getWhatsappToken.ts` | 7 | `TODO(SEC-01, Phase 7)` | Info | Formally ticketed to a specific phase/requirement (SEC-01) — not a blocker per the debt-marker gate (references formal follow-up work) |
| `apps/bot/src/whatsapp/graphClient.ts` | 90-92 | Non-2xx branch throws without a `deps.log(...)` call first (unlike the 200-with-error branch) | Info | IN-01 from 05-REVIEW.md, explicitly out of scope for the fix pass (`fix_scope: critical_warning`) — observability inconsistency only, no functional defect |
| `apps/bot/src/config/env.ts` | ~38 | `PORT: Number(process.env.PORT ?? 3001)` not validated against `NaN` | Info | IN-02 from 05-REVIEW.md, explicitly out of scope — would only surface as a confusing startup error on a badly-formed `.env`, not a security/correctness issue |
| `apps/bot/src/queue/boss.ts` | 66 | `boss.on("error", (err) => console.error(...))` bypasses the injectable logger convention used elsewhere | Info | IN-04 from 05-REVIEW.md, explicitly out of scope — logging-consistency nit only |

No BLOCKER or WARNING-severity anti-patterns found in the reviewed files. No unreferenced `TBD`/`FIXME`/`XXX` markers.

### Known Limitation (documented trade-off, not a gap)

`05-REVIEW-FIX.md` and inline comments in `inboundWorker.ts` (lines 132-138) explicitly document a residual limitation: a pg-boss retry of an already-partially-processed job re-enters `processInboundWhatsappEvent` from the top and hits the `23505` dedup branch on the (already-successful) inbound insert — returning early WITHOUT re-attempting `responder()`/send. Making the dedup check independent of "was the reply actually sent" (e.g. tracking an existing outbound `mensaje` row) would require a schema-level outbox-pattern redesign that the original review itself framed as one option among several, not a hard requirement. This was an explicit, documented trade-off during the fix pass — not an oversight — and does not block any of the 5 ROADMAP success criteria (which require no *duplicate processing*, not guaranteed eventual delivery on every transient failure path). Flagged here for visibility; a candidate follow-up item for Phase 7 (hardening) or a dedicated backlog item, not a Phase 5 blocker.

### Code Review Findings — Resolution Confirmed Against Current Source

All 6 findings from `05-REVIEW.md` (`fix_scope: critical_warning`) were independently re-verified in the current source, not just accepted from `05-REVIEW-FIX.md`'s self-report:

| Finding | Fix commit | Verified in current source |
|---------|-----------|------------------------------|
| CR-01 (silent swallow of non-23505 insert errors) | `145dc00` | ✓ `inboundWorker.ts:108-120` — non-23505 errors now logged + rethrown |
| CR-02 (no retry/error-surfacing on responder/send failures) | `d4379d4` | ✓ `inboundWorker.ts:139-177` try/catch + rethrow; `boss.ts:79-84` retryLimit/deadLetter configured; new test "sendWhatsappMessage rejecting..." passes |
| WR-01 (outbound insertMensaje error discarded) | `d4379d4` | ✓ `inboundWorker.ts:154-164` — error destructured and logged |
| WR-02 (check-then-act race in findOrCreate helpers) | `3a76793` | ✓ Both `findOrCreateCliente.ts` and `findOrCreateConversacion.ts` catch `23505` and re-select the winner; underlying `UNIQUE(negocio_id, telefono)` / `UNIQUE(negocio_id, cliente_id)` constraints confirmed present in `0003_tenant_negocio_split.sql` |
| WR-03 (boss.ts doesn't reject 6543 pooler port) | `5e1b9a1` | ✓ `boss.ts:58-63` — `new URL(env.SUPABASE_DB_URL).port === "6543"` guard throws |
| WR-04 (non-constant-time GET handshake compare) | `038ba12` | ✓ `webhook.ts:57-66` — `verifyTokenMatches` uses length-guard + `timingSafeEqual` |

Full test suite (36 tests, 7 files) and `tsc --noEmit` both pass with these fixes in place.

### Human Verification Required

None. All 5 ROADMAP success criteria and all 6 code-review fixes were verified either by the existing automated unit suite or by live probes this verifier executed directly against the real `bdgufnitakelyialjoqg` database (the one human-check item the executor had deferred — `scripts/verify-whatsapp-webhook.ts` — was run in this session and passed; an additional two-distinct-phone-number probe was run to close the ROADMAP's explicit "≥2 test numbers" bar that no existing script covered). No UI/visual elements exist in this phase (backend messaging infrastructure only, no `UI hint` in ROADMAP).

### Gaps Summary

No gaps. All 5 phase success criteria are verified with live-DB evidence, not just static code presence. The one documentation-sync issue (stale `WA-02`/`WA-05` checkboxes in REQUIREMENTS.md) and the one documented, accepted trade-off (retry-doesn't-resume-send edge case) are noted above for follow-up but do not block phase completion.

---

_Verified: 2026-07-06T21:30:00Z_
_Verifier: Claude (gsd-verifier)_
