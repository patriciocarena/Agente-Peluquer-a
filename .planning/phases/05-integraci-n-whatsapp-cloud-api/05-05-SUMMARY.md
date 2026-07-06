---
phase: 05-integraci-n-whatsapp-cloud-api
plan: 05
subsystem: api
tags: [pg-boss, queue, whatsapp, dedup, vitest, tdd]

# Dependency graph
requires:
  - phase: 05-integraci-n-whatsapp-cloud-api
    plan: 02
    provides: "whatsappWebhookEventSchema / extractPhoneNumberId / extractFirstMessage (payload.ts)"
  - phase: 05-integraci-n-whatsapp-cloud-api
    plan: 03
    provides: "sendWhatsappMessage(negocioId, to, body, deps?) — graphClient.ts"
  - phase: 05-integraci-n-whatsapp-cloud-api
    plan: 04
    provides: "findOrCreateCliente / findOrCreateConversacion / responder — conversation/*.ts"
provides:
  - "processInboundWhatsappEvent(event, deps?) — full worker orchestration: tenant resolution → cliente/conversacion → durable dedup → responder → 24h-gated send"
  - "boss.ts — PgBoss singleton on SUPABASE_DB_URL (port 5432 guard) + startQueue()/stopQueue() lifecycle, whatsapp-inbound queue name"
affects: [05-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Orchestration function accepts an optional injected deps param (mirrors packages/availability-engine/src/booking.ts's BookAppointmentDeps) — first worker-shaped module in the bot to use this pattern"
    - "pg-boss named import ({ PgBoss }), not a default import — the installed 12.25.1 package has no default export"

key-files:
  created:
    - apps/bot/src/queue/inboundWorker.ts
    - apps/bot/src/queue/inboundWorker.test.ts
    - apps/bot/src/queue/boss.ts
  modified: []

key-decisions:
  - "pg-boss@12.25.1 exports PgBoss as a NAMED export only (`export class PgBoss extends EventEmitter`), confirmed against the installed dist/index.d.ts — no `export default`. Used `import { PgBoss } from \"pg-boss\"` instead of 05-RESEARCH.md/05-PATTERNS.md's assumed `import PgBoss from \"pg-boss\"` default import, which does not exist and fails to typecheck under this project's NodeNext module resolution."
  - "A null conversacion.ventana_expira_at (the column is nullable at the schema level, though findOrCreateConversacion always sets it) is treated as an already-closed window (epoch 0), never as an open-ended one — a defensive default consistent with D-09's 'never send outside a confirmed-open window' intent."
  - "inboundWorker.test.ts mocks ../db/client.js, ../db/negocioScoped.js, ../conversation/findOrCreateCliente.js, ../conversation/findOrCreateConversacion.js, ../conversation/responder.js, and ../whatsapp/graphClient.js via vi.mock() + a dynamic import, so the module's default-deps import chain never runs the real (env-var-requiring) implementations — same fix pattern as 05-03-SUMMARY.md's graphClient.test.ts."

patterns-established:
  - "First worker/event-driven module (boss.ts) following the same guard-then-construct-singleton convention as db/client.ts, extended with an explicit port-5432-vs-6543 warning in the thrown error text"

requirements-completed: [WA-02, WA-03, WA-04, WA-05]

coverage:
  - id: D1
    description: "processInboundWhatsappEvent discards zero-write on an unknown phone_number_id (D-07) and on a non-message event"
    requirement: "WA-02"
    verification:
      - kind: unit
        ref: "apps/bot/src/queue/inboundWorker.test.ts — 'unknown phone_number_id: zero writes, no send (D-07)' + 'non-message event (no messages[0]): no-op, zero writes'"
        status: pass
    human_judgment: false
  - id: D2
    description: "Happy path inserts one inbound ('entrante') + one outbound ('saliente') mensaje and calls sendWhatsappMessage exactly once"
    requirement: "WA-05"
    verification:
      - kind: unit
        ref: "apps/bot/src/queue/inboundWorker.test.ts — 'happy path: inserts one inbound + one outbound mensaje'"
        status: pass
    human_judgment: false
  - id: D3
    description: "A 23505 unique-violation on the inbound mensaje insert short-circuits before responder/send (durable dedup backstop)"
    requirement: "WA-03"
    verification:
      - kind: unit
        ref: "apps/bot/src/queue/inboundWorker.test.ts — 'duplicate wa_message_id (23505): responder/send NOT called, no second persist (WA-03)'"
        status: pass
    human_judgment: false
  - id: D4
    description: "Outbound send and outbound mensaje insert are skipped when ventana_expira_at has already passed"
    requirement: "WA-04"
    verification:
      - kind: unit
        ref: "apps/bot/src/queue/inboundWorker.test.ts — 'closed window (ventana_expira_at in the past): send NOT called, no outbound mensaje inserted'"
        status: pass
    human_judgment: false
  - id: D5
    description: "pg-boss runs on the SUPABASE_DB_URL singleton, fails fast with a port-5432-vs-6543 error when the var is missing, and startQueue()/stopQueue() wire the whatsapp-inbound queue to processInboundWhatsappEvent"
    requirement: "WA-03"
    verification:
      - kind: unit
        ref: "pnpm --filter @turnosbot/bot exec tsc -p tsconfig.json --noEmit"
        status: pass
    human_judgment: false

# Metrics
duration: 35min
completed: 2026-07-06
status: complete
---

# Phase 5 Plan 05: pg-boss Worker Orchestration Summary

**`processInboundWhatsappEvent` — the full inbound WhatsApp orchestration (tenant resolution → cliente/conversacion → durable 23505 dedup → responder stub → 24h-window-gated send) — plus `boss.ts`'s PgBoss singleton locked to the port-5432 session-mode connection.**

## Performance

- **Duration:** ~35 min (including a fresh-worktree `pnpm install`)
- **Started:** 2026-07-06T19:45:00Z (approx)
- **Completed:** 2026-07-06T19:58:00Z (approx)
- **Tasks:** 2 completed
- **Files modified:** 3 (all created)

## Accomplishments
- `processInboundWhatsappEvent(event, deps?)` orchestrates the entire inbound pipeline in one function: extracts `phone_number_id`/first message via `payload.ts`'s defensive helpers, resolves the negocio strictly by `whatsapp_phone_number_id` (D-07 — logs and discards on no match, zero writes), calls `findOrCreateCliente`/`findOrCreateConversacion`, inserts the inbound `mensaje` (`direccion: "entrante"`) through `negocioScoped(...).insertMensaje`, treats a `23505` unique-violation as the durable dedup backstop (short-circuits BEFORE `responder`/send, WA-03), calls the `responder()` stub, and gates the outbound send + outbound `mensaje` insert (`direccion: "saliente"`) on `conversacion.ventana_expira_at` still being in the future (D-09).
- Every collaborator is injectable via an optional `deps` param defaulting to the real modules — mirrors `packages/availability-engine/src/booking.ts`'s `BookAppointmentDeps` pattern — making the orchestration fully unit-testable with zero DB/queue/network dependency.
- `boss.ts` constructs a module-level `PgBoss` singleton on `env.SUPABASE_DB_URL`, throwing a descriptive Spanish error (naming the file, explicitly forbidding port 6543) if the var is missing; `startQueue()` starts pg-boss, creates the `whatsapp-inbound` queue, and registers a `batchSize: 1` worker delegating every job to `processInboundWhatsappEvent`; `stopQueue()` calls `boss.stop()`.
- 5/5 new tests pass (`inboundWorker.test.ts`); full `apps/bot` suite is 29/29 green; `tsc --noEmit` is clean.

## Task Commits

Each task was committed atomically:

1. **Task 1: processInboundWhatsappEvent orchestration (WA-02/03/04/05)** - `a25ebf1` (feat)
2. **Task 2: pg-boss instance + lifecycle on session-mode port 5432 (WA-03)** - `46d00b7` (feat)

**Plan metadata:** (this SUMMARY commit, following)

## Files Created/Modified
- `apps/bot/src/queue/inboundWorker.ts` (NEW) - `processInboundWhatsappEvent(event, deps?)`, the full worker orchestration
- `apps/bot/src/queue/inboundWorker.test.ts` (NEW) - 5 tests: unknown phone_number_id, non-message event, happy path, 23505 dedup, closed window
- `apps/bot/src/queue/boss.ts` (NEW) - `boss` singleton, `startQueue()`, `stopQueue()`, `WHATSAPP_INBOUND_QUEUE` constant

## Decisions Made
- Read `negocio` for tenant resolution directly via an injected `supabaseAdmin.from("negocio")...eq("whatsapp_phone_number_id", ...).maybeSingle()` call (not through `negocioScoped`, which requires an already-resolved `negocioId` — this IS the resolution step), consistent with 05-PATTERNS.md's Pattern 3 and the plan's own action spec.
- Treated a `null` `conversacion.ventana_expira_at` (nullable at the schema level) as an already-closed window rather than an open one, since `Date` construction from `null` doesn't typecheck and the safe interpretation of "no window recorded" is "don't send."
- `boss.ts` uses the named `{ PgBoss }` import — see Deviations below.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] pg-boss has no default export — used the named import instead**
- **Found during:** Task 2, writing `boss.ts`
- **Issue:** The plan (and 05-RESEARCH.md/05-PATTERNS.md's code samples) specified `import PgBoss from "pg-boss"` (a default import). Direct inspection of the installed `apps/bot/node_modules/pg-boss/dist/index.d.ts` (pg-boss@12.25.1) shows only `export class PgBoss extends EventEmitter<...>` — a named export — with no `export default` anywhere in `index.js`/`index.d.ts`. A default import of a genuine ESM package with no default export does not typecheck under this project's `module: "NodeNext"` resolution (esModuleInterop only synthesizes defaults for CJS interop, not for real ESM modules lacking one).
- **Fix:** Used `import { PgBoss } from "pg-boss";` instead. No other code changes — the rest of the file (constructor call, `start()`/`createQueue()`/`work()`/`stop()`) is unaffected since the class itself has the exact shape the plan described.
- **Files modified:** `apps/bot/src/queue/boss.ts` (authored fresh with the correct import; no separate fix-commit needed since this was caught before the initial commit)
- **Verification:** `pnpm --filter @turnosbot/bot exec tsc -p tsconfig.json --noEmit` — clean.
- **Committed in:** `46d00b7` (Task 2 commit)

**2. [Rule 3 - Blocking] inboundWorker.test.ts mocks 6 sibling modules to avoid an unrelated import-time throw**
- **Found during:** Task 1, first test run
- **Issue:** `inboundWorker.ts`'s default `deps` object imports the real `supabaseAdmin`, `negocioScoped`, `findOrCreateCliente`, `findOrCreateConversacion`, `responder`, and `sendWhatsappMessage` for its default-deps fallback. Several of these transitively import `../db/client.ts`, which throws synchronously at import time when `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` aren't set in the test environment — failing every test in the suite with an unrelated error before any assertion could run, even though every test injects its own fake `deps` and never touches the real implementations.
- **Fix:** Added `vi.mock(...)` calls for `../db/client.js`, `../db/negocioScoped.js`, `../conversation/findOrCreateCliente.js`, `../conversation/findOrCreateConversacion.js`, `../conversation/responder.js`, and `../whatsapp/graphClient.js` before a dynamic `await import("./inboundWorker.js")`, mirroring the exact fix already applied in `apps/bot/src/whatsapp/graphClient.test.ts` (05-03-SUMMARY.md's deviation #1). No production code changed.
- **Files modified:** `apps/bot/src/queue/inboundWorker.test.ts`
- **Verification:** `pnpm --filter @turnosbot/bot exec vitest run src/queue/inboundWorker.test.ts` — all 5 tests pass; full `apps/bot` suite (29 tests) green; `tsc --noEmit` clean.
- **Committed in:** `a25ebf1` (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 bug/import-shape correction, 1 blocking test-infrastructure fix)
**Impact on plan:** No production-behavior scope change. The pg-boss import fix was necessary for the code to compile at all; the test-mocking fix is scoped entirely to the test file's module-loading strategy, matching an already-established in-phase precedent.

## Issues Encountered
- This worktree had no `node_modules` installed at session start (fresh checkout). Ran `pnpm install --frozen-lockfile` at the repo root before any verification command could run — a one-time environment bootstrap, not a plan deviation (lockfile already had `pg-boss@12.25.1` etc. pinned from a prior plan's `package.json` edit).

## User Setup Required
None - no external service configuration required. `boss.ts` requires `SUPABASE_DB_URL` to be set at real runtime (server.ts's `start()`, plan 05-06) but that is a deployment/`.env` concern already documented in `.env.example`, not something this plan's tests need.

## Next Phase Readiness
- `processInboundWhatsappEvent` and `boss.ts`'s `startQueue()`/`stopQueue()` are ready for plan 05-06 (the Fastify webhook route + `server.ts` wiring) to call: the webhook POST handler enqueues via `boss.send(WHATSAPP_INBOUND_QUEUE, event, { singletonKey: messageId })`, and `server.ts`'s `start()` calls `await startQueue()` alongside `app.listen(...)`.
- `WHATSAPP_INBOUND_QUEUE` is exported from `boss.ts` as the canonical queue-name constant, so plan 05-06 doesn't need to re-hardcode the `"whatsapp-inbound"` string literal.
- No blockers identified for plan 05-06 (the last plan in Phase 5's wave sequence per `05-05-PLAN.md`'s `depends_on`).

---
*Phase: 05-integraci-n-whatsapp-cloud-api*
*Completed: 2026-07-06*

## Self-Check: PASSED

All three created files (`inboundWorker.ts`, `inboundWorker.test.ts`, `boss.ts`) verified present on disk; both task commit hashes (`a25ebf1`, `46d00b7`) verified present in git log.
