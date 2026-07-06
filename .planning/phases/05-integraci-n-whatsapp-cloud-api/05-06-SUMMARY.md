---
phase: 05-integraci-n-whatsapp-cloud-api
plan: 06
subsystem: api
tags: [fastify, webhook, hmac, pg-boss, helmet, rate-limit, vitest]

# Dependency graph
requires:
  - phase: 05-integraci-n-whatsapp-cloud-api
    plan: 02
    provides: "verifyWhatsappSignature (signature.ts) + whatsappWebhookEventSchema/extractFirstMessage (payload.ts)"
  - phase: 05-integraci-n-whatsapp-cloud-api
    plan: 05
    provides: "processInboundWhatsappEvent (inboundWorker.ts) + boss/startQueue/stopQueue/WHATSAPP_INBOUND_QUEUE (boss.ts)"
provides:
  - "registerWhatsappWebhook(app, { env, boss }) — GET handshake + POST verify-then-enqueue-then-200"
  - "server.ts wired end-to-end: helmet + rate-limit + raw-body parser + webhook routes + pg-boss start/stop lifecycle"
  - "scripts/verify-whatsapp-webhook.ts — local signed-payload sign→enqueue→persist→dedup→mock-send proof, no Meta account needed"
affects: []

# Tech tracking
tech-stack:
  added:
    - "fastify (root devDependency, ^5.9.0) — added so scripts/verify-whatsapp-webhook.ts's own scratch app.inject() instance resolves from the workspace root, matching the existing @supabase/supabase-js/@turnosbot/db-types root-devDependency pattern for verify-*.ts scripts"
  patterns:
    - "First app.register(...) calls in apps/bot (fastifyHelmet, fastifyRateLimit), registered immediately after Fastify({ logger: true }) and before any route/parser (D-12)"
    - "registerWhatsappWebhook exported as a plain function (not a fastify-plugin wrapper) so both server.ts and webhook.test.ts/verify-whatsapp-webhook.ts can call it directly against a scratch or real app instance"

key-files:
  created:
    - apps/bot/src/whatsapp/webhook.ts
    - apps/bot/src/whatsapp/webhook.test.ts
    - scripts/verify-whatsapp-webhook.ts
  modified:
    - apps/bot/src/server.ts
    - package.json (root — added fastify devDependency)
    - pnpm-lock.yaml

key-decisions:
  - "Signature check treats a missing rawBody, a missing WHATSAPP_APP_SECRET, and a signature mismatch identically (403, no enqueue) — never distinguishes the reason in the response, only in the log, to avoid leaking configuration state to an attacker probing the endpoint."
  - "A signature-valid but schema-invalid body is discarded with 200 (not 403/500) — fail-closed per payload.ts's documented contract, and avoids triggering Meta's non-200 retry storm for a body shape mismatch that isn't a spoofing attempt."
  - "scripts/verify-whatsapp-webhook.ts signs its synthetic payload with a LOCAL throwaway dev secret/verify-token owned by the script itself, not the real .env WHATSAPP_APP_SECRET/WHATSAPP_VERIFY_TOKEN — decouples the D-01 local proof from needing (or risking exposure of) real Meta-facing secrets."
  - "The verify script calls processInboundWhatsappEvent directly on the boss.send-captured event (rather than starting a real pg-boss queue and letting it drain) — simpler and deterministic, while still proving the real worker code path against the real bdgufnitakelyialjoqg DB."

patterns-established:
  - "Raw-body-before-JSON-parse (addContentTypeParser, parseAs: 'buffer') registered app-wide in server.ts, before any route — the sole place in the codebase capturing exact request bytes for HMAC verification."
  - "Graceful shutdown (SIGTERM/SIGINT -> stopQueue() -> app.close() -> process.exit) as the standard lifecycle shape for the bot service going forward."

requirements-completed: [WA-01, WA-03]

coverage:
  - id: D1
    description: "GET /webhooks/whatsapp echoes hub.challenge on a matching hub.verify_token and returns 403 on mismatch (D-05)"
    requirement: "WA-01"
    verification:
      - kind: unit
        ref: "apps/bot/src/whatsapp/webhook.test.ts — 'echoes hub.challenge when verify_token matches' + 'returns 403 when verify_token doesn't match'"
        status: pass
    human_judgment: false
  - id: D2
    description: "POST /webhooks/whatsapp verifies X-Hub-Signature-256 over the raw body; a valid signature + message event enqueues once with singletonKey = messages[0].id and returns 200; an invalid/missing signature returns 403 with no enqueue; a non-message event returns 200 with no enqueue"
    requirement: "WA-03"
    verification:
      - kind: unit
        ref: "apps/bot/src/whatsapp/webhook.test.ts — 4 POST-route tests (valid signature enqueues, invalid signature 403, missing signature 403, non-message event no-enqueue)"
        status: pass
    human_judgment: false
  - id: D3
    description: "server.ts registers helmet + rate-limit before any route, captures the raw body before JSON parsing and before the webhook routes, starts pg-boss before app.listen, and handles SIGTERM/SIGINT gracefully; /health unchanged"
    requirement: "WA-01"
    verification:
      - kind: unit
        ref: "pnpm --filter @turnosbot/bot exec tsc -p tsconfig.json --noEmit && pnpm --filter @turnosbot/bot run build (both clean)"
        status: pass
    human_judgment: false
  - id: D4
    description: "scripts/verify-whatsapp-webhook.ts proves sign->verify->enqueue->200, worker persistence of inbound+outbound mensaje (mocked send), and durable dedup-on-replay (WA-03) against the real bdgufnitakelyialjoqg DB, with no live Meta account"
    verification: []
    human_judgment: true
    rationale: "This is the plan's own <human-check> item — gated on a real .env (SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY/SUPABASE_DB_URL) that is not present in this isolated worktree checkout (gitignored, not copied by git worktree). The script itself typechecks cleanly (verified standalone against apps/bot's exact compilerOptions) and its logic was traced manually against the real inboundWorker.ts/webhook.ts implementations, but it has not been EXECUTED against the live DB in this session — deferred per the plan's own 'Gated on credentials; deferred if .env is unavailable' clause, matching the established precedent for this project (02-08, 03-05)."

# Metrics
duration: 23min
completed: 2026-07-06
status: complete
---

# Phase 5 Plan 06: Webhook Assembly — GET/POST Route, server.ts Wiring, Local E2E Script Summary

**Fastify `registerWhatsappWebhook` (GET hub.challenge handshake + POST verify-then-enqueue-then-200 over the raw body), server.ts extended with helmet/rate-limit/raw-body-parser/pg-boss lifecycle, and a local HMAC-signed verification script proving sign→dedup→persist→mock-send end-to-end without a Meta account.**

## Performance

- **Duration:** ~23 min
- **Started:** 2026-07-06T20:02:00Z (approx, base commit)
- **Completed:** 2026-07-06T20:24:37Z
- **Tasks:** 3 completed
- **Files modified:** 6 (3 created, 3 modified: server.ts, root package.json, pnpm-lock.yaml)

## Accomplishments
- `registerWhatsappWebhook(app, { env, boss })`: `GET /webhooks/whatsapp` answers Meta's subscription handshake (200 + `hub.challenge` on token match, 403 otherwise, D-05); `POST /webhooks/whatsapp` verifies `X-Hub-Signature-256` over the exact raw bytes (missing rawBody/secret/mismatch → 403, no enqueue), zod-validates the body only after verification, extracts `messages[0].id`, enqueues via `boss.send(WHATSAPP_INBOUND_QUEUE, event, { singletonKey: messageId })`, and ALWAYS responds 200 on the verified path regardless of downstream state (WA-01, WA-03, D-03/D-06).
- `apps/bot/src/whatsapp/webhook.test.ts`: 6 tests via a scratch Fastify instance + `app.inject()` (real HMAC signing, no live server) — GET handshake (match/mismatch) and POST (valid-signature-enqueues, invalid-signature-403, missing-signature-403, non-message-event-no-enqueue).
- `server.ts` extended: `@fastify/helmet` + `@fastify/rate-limit` registered first (D-12, the project's first `app.register(...)` calls), `addContentTypeParser("application/json", { parseAs: "buffer" }, ...)` registered before the webhook routes (Pattern 1), `registerWhatsappWebhook(app, { env, boss })` mounted, `start()` now awaits `startQueue()` before `app.listen`, and SIGTERM/SIGINT trigger `stopQueue()` + `app.close()` for graceful shutdown. `/health` unchanged.
- `scripts/verify-whatsapp-webhook.ts`: seeds a throwaway test `negocio` (scoped to `TENANT_A`'s tenant) with a known `whatsapp_phone_number_id`, signs a synthetic inbound text-message payload with a local dev secret, drives the real `registerWhatsappWebhook` route via `app.inject()`, calls `processInboundWhatsappEvent` directly on the captured enqueued event, and asserts: one inbound (`'entrante'`) + one outbound (`'saliente'`) `mensaje` persisted (mocked send, `WHATSAPP_LIVE=false` forced), then replays the identical signed payload and asserts NO second `mensaje` pair was created (durable dedup via `UNIQUE(mensaje.wa_message_id)`, WA-03). Idempotent cleanup at both start and end.
- Full `apps/bot` suite: 35/35 tests green (7 files); `tsc --noEmit` and `pnpm --filter @turnosbot/bot run build` both clean.

## Task Commits

Each task was committed atomically:

1. **Task 1: webhook plugin — GET handshake + POST verify-then-enqueue-then-200** - `876c697` (feat)
2. **Task 2: wire server.ts — raw body, helmet, rate-limit, routes, queue start (D-12)** - `54ef275` (feat)
3. **Task 3: local signed-payload verification script (D-01, WA-01..05 e2e)** - `de544f7` (feat)

**Plan metadata:** (this SUMMARY commit, following)

## Files Created/Modified
- `apps/bot/src/whatsapp/webhook.ts` (NEW) - `registerWhatsappWebhook(app, deps)`: GET handshake + POST verify-then-enqueue-then-200
- `apps/bot/src/whatsapp/webhook.test.ts` (NEW) - 6 tests via `app.inject()` covering GET/POST behaviors
- `apps/bot/src/server.ts` (MODIFIED) - helmet + rate-limit + raw-body parser + webhook routes + pg-boss start/stop lifecycle
- `scripts/verify-whatsapp-webhook.ts` (NEW) - local signed-payload end-to-end verification script (D-01)
- `package.json` (root, MODIFIED) - added `fastify` devDependency so the verify script's scratch Fastify instance resolves from the workspace root
- `pnpm-lock.yaml` (MODIFIED) - lockfile update for the new root devDependency

## Decisions Made
- Kept the POST route's 403 branch collapsed (missing rawBody / missing secret / signature mismatch all → the same 403 response) to avoid leaking which specific precondition failed to an external prober; the distinguishing detail is only in the server-side log.
- A signature-verified-but-schema-invalid body is discarded with 200 (fail-closed, per payload.ts's own documented contract) rather than a 4xx/5xx, since Meta retries non-200 responses for up to 7 days and a shape mismatch isn't itself evidence of a spoofing attempt.
- `scripts/verify-whatsapp-webhook.ts` uses its own local throwaway HMAC secret/verify-token (not real `.env` WHATSAPP_APP_SECRET/WHATSAPP_VERIFY_TOKEN) to stay fully decoupled from real Meta credentials, consistent with D-01's "no live Meta account needed" intent.
- The verify script calls `processInboundWhatsappEvent` directly on the event captured by a fake `boss.send`, rather than starting a real pg-boss queue and waiting for it to drain — simpler, deterministic, and still exercises the real worker/DB code path end-to-end.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added `fastify` as a root-level devDependency**
- **Found during:** Task 3, first standalone typecheck of `scripts/verify-whatsapp-webhook.ts`
- **Issue:** `fastify` is only a dependency of the `apps/bot` workspace package, not of the pnpm workspace root. `scripts/verify-whatsapp-webhook.ts` lives at the repo root (alongside the other `verify-*.ts` scripts) and is run via `pnpm exec tsx scripts/verify-whatsapp-webhook.ts` from the root — Node's module resolution for a bare `"fastify"` specifier from that file's location walks up to the workspace root's `node_modules`, which did not contain `fastify` (pnpm's strict, non-hoisting `node_modules` layout). The import would have failed at runtime with `Cannot find module 'fastify'`, not just at typecheck time.
- **Fix:** Added `"fastify": "^5.9.0"` to the root `package.json`'s `devDependencies` (same version range already pinned in `apps/bot/package.json`), mirroring the exact existing pattern where `@supabase/supabase-js`/`@turnosbot/availability-engine`/`@turnosbot/db-types` are already root devDependencies purely so other `verify-*.ts` scripts can resolve them. Ran `pnpm install --no-frozen-lockfile` to link it. This is NOT a new/unvetted package — `fastify` is already an approved, installed dependency of this exact monorepo (05-RESEARCH.md's Package Legitimacy Audit: "Approved (already a dependency)") — this only extends its resolvability to the workspace root, it does not introduce a new dependency identity.
- **Files modified:** `package.json` (root), `pnpm-lock.yaml`
- **Verification:** Standalone `tsc --noEmit` of the script (matching `apps/bot/tsconfig.json`'s exact compilerOptions) is clean; `pnpm run typecheck` (root, `tsc -b`) unaffected/clean; `pnpm --filter @turnosbot/bot exec vitest run` still 35/35 green; `pnpm --filter @turnosbot/bot run build` still clean.
- **Committed in:** `de544f7` (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking dependency-resolution fix)
**Impact on plan:** No production-behavior scope change — the fix only makes an already-approved dependency resolvable from the one new script that needs it at the workspace root, following an established in-repo pattern for `verify-*.ts` scripts.

## Issues Encountered
- `apps/bot/tsconfig.json`'s `rootDir: "src"`/`include: ["src/**/*.ts"]` does not (and structurally cannot) cover `scripts/verify-whatsapp-webhook.ts`, so the plan's literal `<automated>` verify command (`pnpm --filter @turnosbot/bot exec tsc -p tsconfig.json --noEmit`) does not typecheck the new script — this mirrors the pre-existing gap for every other `scripts/verify-*.ts` file in this repo (none are wired into any TS project reference graph). Not a regression introduced by this plan. As an extra diligence step (beyond the plan's literal command), the script was typechecked standalone with `tsc --noEmit` using `apps/bot`'s exact compilerOptions (target/module/moduleResolution/strict/etc.) run from within `apps/bot` against the script's relative path — clean, after fixing two type errors (see below) and the `fastify` resolution deviation above.
- Two TypeScript-only issues were fixed directly in the script before it typechecked clean (not deviation-tracked since they never touched already-committed production code, just this new file during its own authoring): (1) casting the fake `boss.send` mock to `PgBoss["send"]`'s exact overloaded type instead of a bare arrow function (TS rejects a plain single-signature function against an overloaded target type); (2) capturing `enqueuedEvents.length` into a fresh local `const` before each of the two count assertions, because TypeScript's control-flow narrowing carried the literal type from the first `!== 1` guard (paired with a `never`-typed `process.exit(1)` branch) into the second `!== 2` comparison, producing a false `TS2367` "no overlap" error.
- Fresh worktree checkout had no `node_modules` installed at session start — ran `pnpm install --frozen-lockfile` before any test/typecheck command (one-time environment bootstrap, not a plan deviation), then `pnpm install --no-frozen-lockfile` after adding the `fastify` root devDependency.

## User Setup Required
**External service verification requires a real `.env`.** `scripts/verify-whatsapp-webhook.ts`'s `<human-check>` step (run it against `bdgufnitakelyialjoqg` and confirm `"verify-whatsapp-webhook: PASSED"`) could not be executed in this session: this is an isolated git worktree and `.env` (gitignored) was not present in it, only in the main checkout. Per the plan's own wording ("Gated on credentials; deferred if `.env` is unavailable"), this is deferred — matching the established precedent already recorded in `02-08-SUMMARY.md` and `03-05-SUMMARY.md` for the same reason. To close this out:
1. From the main checkout (where `.env` exists), run: `pnpm exec tsx scripts/verify-whatsapp-webhook.ts`
2. Confirm the final line reads `verify-whatsapp-webhook: PASSED`.
3. If it fails, the script's `console.error("FAIL: ...")` lines pinpoint exactly which assertion (sign/enqueue/persist/dedup) broke.

## Next Phase Readiness
- Phase 5's full webhook pipeline is code-complete: `GET`/`POST /webhooks/whatsapp` wired into `server.ts` with helmet/rate-limit/raw-body-parser/pg-boss lifecycle, all consuming the modules built in waves 1-3 (`signature.ts`/`payload.ts` from 05-02, `inboundWorker.ts`/`boss.ts` from 05-05).
- `apps/bot` is now a fully assembled Fastify service: 35/35 unit tests pass, `tsc --noEmit` and `build` are both clean.
- Only remaining gap before Phase 5 can be declared fully verified: run `scripts/verify-whatsapp-webhook.ts` against the real `bdgufnitakelyialjoqg` DB (see User Setup Required above) — a deferred human/credentialed step, not a code blocker.
- No blockers for Phase 6 (the conversational agent) — `responder()`'s single swap point (from 05-05) is untouched by this plan.

---
*Phase: 05-integraci-n-whatsapp-cloud-api*
*Completed: 2026-07-06*

## Self-Check: PASSED
