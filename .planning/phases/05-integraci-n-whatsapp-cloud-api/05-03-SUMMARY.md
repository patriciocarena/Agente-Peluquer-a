---
phase: 05-integraci-n-whatsapp-cloud-api
plan: 03
subsystem: bot
tags: [whatsapp, graph-api, fetch, vitest, tdd, negocio-scoped-read]

# Dependency graph
requires:
  - phase: 05-integraci-n-whatsapp-cloud-api
    plan: 01
    provides: "loadEnv() surfacing WHATSAPP_LIVE/WHATSAPP_GRAPH_API_VERSION/WHATSAPP_DEV_TOKEN, apps/bot vitest runner"
provides:
  - "getWhatsappToken(negocioId) — D-04 choke point, sole read path for the WhatsApp access token"
  - "getPhoneNumberId(negocioId) — reads negocio.whatsapp_phone_number_id by id"
  - "sendWhatsappMessage(negocioId, to, body, deps?) — sole outbound Graph API egress point, WHATSAPP_LIVE-gated"
affects: [05-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Injected-deps style (mirrors packages/availability-engine/src/booking.ts's BookAppointmentDeps) for unit-testing a module whose default deps import a singleton client"
    - "vi.mock() of a sibling module in a test file to avoid an unrelated import-time throw from a transitively-imported singleton (apps/bot/src/db/client.ts)"

key-files:
  created:
    - apps/bot/src/whatsapp/getWhatsappToken.ts
    - apps/bot/src/whatsapp/graphClient.ts
    - apps/bot/src/whatsapp/graphClient.test.ts
  modified: []

key-decisions:
  - "getWhatsappToken/getPhoneNumberId read negocio directly by supabaseAdmin.from('negocio').eq('id', negocioId) rather than via negocioScoped(negocioId).negocio() — that accessor filters by tenant_id, the wrong axis for 'this negocio's own row by its own id', per 05-PATTERNS.md's explicit flag"
  - "sendWhatsappMessage takes an optional deps param (fetch/getWhatsappToken/getPhoneNumberId/log) defaulting to the real implementations, so the test suite exercises all four required behaviors without a network call or real Supabase client"

requirements-completed: [WA-04]

coverage:
  - id: D1
    description: "getWhatsappToken(negocioId) returns WHATSAPP_DEV_TOKEN when set, otherwise negocio.whatsapp_token by id; tsc --noEmit passes"
    requirement: "WA-04"
    verification:
      - kind: unit
        ref: "pnpm --filter @turnosbot/bot exec tsc -p tsconfig.json --noEmit"
        status: pass
    human_judgment: false
  - id: D2
    description: "sendWhatsappMessage never calls fetch with WHATSAPP_LIVE=false and returns a synthetic mock.* id"
    requirement: "WA-04"
    verification:
      - kind: unit
        ref: "apps/bot/src/whatsapp/graphClient.test.ts — 'WHATSAPP_LIVE=false' case"
        status: pass
    human_judgment: false
  - id: D3
    description: "sendWhatsappMessage POSTs to graph.facebook.com/{version}/{phone_number_id}/messages with a Bearer token when WHATSAPP_LIVE=true"
    requirement: "WA-04"
    verification:
      - kind: unit
        ref: "apps/bot/src/whatsapp/graphClient.test.ts — 'WHATSAPP_LIVE=true' case"
        status: pass
    human_judgment: false
  - id: D4
    description: "Non-ok HTTP response throws; HTTP-200-with-embedded-error body also throws instead of silently succeeding (Pitfall 6)"
    verification:
      - kind: unit
        ref: "apps/bot/src/whatsapp/graphClient.test.ts — non-ok + 200-with-error cases"
        status: pass
    human_judgment: false

duration: 8min
completed: 2026-07-06
status: complete
---

# Phase 5 Plan 03: Outbound WhatsApp Send Layer (D-04 + D-01) Summary

**Two choke points now isolate the phase's only third-party HTTP egress and its only plaintext-token read: `getWhatsappToken(negocioId)`/`getPhoneNumberId(negocioId)` and `sendWhatsappMessage(negocioId, to, body)`, gated by `WHATSAPP_LIVE` so the whole phase verifies locally with no Meta account.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-07-06T17:10:00-03:00 (approx, first commit 17:10:26)
- **Completed:** 2026-07-06T17:14:38-03:00
- **Tasks:** 2 completed
- **Files modified:** 3 (all created)

## Accomplishments
- `getWhatsappToken(negocioId)` is the single D-04 choke point: prefers `WHATSAPP_DEV_TOKEN` (dev override), otherwise reads `negocio.whatsapp_token` by the negocio's own primary key — deliberately NOT via `negocioScoped(negocioId).negocio()`, which filters by `tenant_id` (the wrong axis for this read), per 05-PATTERNS.md's explicit flag. Carries a `TODO(SEC-01, Phase 7)` marker for the plaintext-in-DB interim risk.
- `getPhoneNumberId(negocioId)` reads `negocio.whatsapp_phone_number_id` the same way, feeding `graphClient`'s URL construction.
- `sendWhatsappMessage(negocioId, to, body, deps?)` is the sole outbound Graph API egress point: with `WHATSAPP_LIVE=false` (default) it never calls `fetch`, logging the would-be POST and returning a synthetic `{ messages: [{ id: "mock.<ts>" }] }`; with `WHATSAPP_LIVE=true` it resolves the phone number ID and token, POSTs to `graph.facebook.com/{WHATSAPP_GRAPH_API_VERSION}/{phone_number_id}/messages` with a Bearer token, throws on non-ok responses, and — per Pitfall 6 — also throws on an HTTP-200 response whose body carries an embedded `error` object rather than treating it as a silent success.
- Full TDD cycle for Task 2: RED (`graphClient.test.ts` committed against a non-existent module, confirmed failing) → GREEN (`graphClient.ts` implemented, all 4 tests pass).

## Task Commits

Each task was committed atomically:

1. **Task 1: getWhatsappToken choke point (D-04)** - `9ecd30d` (feat)
2. **Task 2: graphClient with WHATSAPP_LIVE gate + 200-with-error handling** - TDD: `cdb9898` (test, RED) → `67ba99e` (feat, GREEN)

**Plan metadata:** (this SUMMARY commit, following)

## Files Created/Modified
- `apps/bot/src/whatsapp/getWhatsappToken.ts` (NEW) - `getWhatsappToken(negocioId)` (D-04 choke point) + `getPhoneNumberId(negocioId)`, both reading `negocio` directly by `id`
- `apps/bot/src/whatsapp/graphClient.ts` (NEW) - `sendWhatsappMessage(negocioId, to, body, deps?)` with `WHATSAPP_LIVE` gate and Pitfall 6 (200-with-error) handling
- `apps/bot/src/whatsapp/graphClient.test.ts` (NEW) - 4 vitest cases: mock-mode no-fetch, live-mode POST shape/headers, non-ok throw, 200-with-error throw

## Decisions Made
- Read `negocio` directly via `supabaseAdmin.from("negocio").select(...).eq("id", negocioId)` in both `getWhatsappToken` and `getPhoneNumberId`, rather than through `negocioScoped(negocioId).negocio()` — that accessor's `.eq("tenant_id", negocioId)` filter is the wrong axis for "this negocio's own row by its own id" (documented in `negocioScoped.ts`'s own header comment and flagged explicitly in 05-PATTERNS.md). This call site always receives the DB-resolved negocio id from tenant resolution (never client input), so the direct-by-id read remains single-tenant-safe.
- `sendWhatsappMessage` accepts an optional `deps` param (`fetch`/`getWhatsappToken`/`getPhoneNumberId`/`log`) defaulting to the real implementations, mirroring `packages/availability-engine/src/booking.ts`'s `BookAppointmentDeps` injected-dependency style — this is what makes the client unit-testable without any network call.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] graphClient.test.ts mocks ./getWhatsappToken.js to avoid an unrelated import-time throw**
- **Found during:** Task 2, first GREEN test run
- **Issue:** `graphClient.ts`'s default `deps` object imports the real `getWhatsappToken`/`getPhoneNumberId` from `./getWhatsappToken.js`, which imports `../db/client.ts`. That module throws synchronously at import time if `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` aren't set in the environment — which they aren't in the local/CI test environment used here. Every test in `graphClient.test.ts` injects its own `deps` and never exercises the real Supabase-backed functions, but the module import chain still ran the throwing code before any test could execute, failing all 4 cases with an unrelated "SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY son obligatorias..." error.
- **Fix:** Added `vi.mock("./getWhatsappToken.js", () => ({ getWhatsappToken: vi.fn(), getPhoneNumberId: vi.fn() }))` before a dynamic `await import("./graphClient.js")` in the test file, so the real (client.ts-importing) module is replaced before `graphClient.ts` ever imports it. No production code changed.
- **Files modified:** `apps/bot/src/whatsapp/graphClient.test.ts`
- **Verification:** `pnpm --filter @turnosbot/bot exec vitest run src/whatsapp/graphClient.test.ts` — all 4 tests pass; `tsc -p tsconfig.json --noEmit` clean.
- **Committed in:** `67ba99e` (Task 2 GREEN commit)

---

**Total deviations:** 1 auto-fixed (1 blocking, test-file-only)
**Impact on plan:** No production-code scope change; the fix is scoped entirely to the test file's module-loading strategy.

## Issues Encountered
None beyond the deviation above.

## User Setup Required
None - no external service configuration required. Live verification against a real Meta Graph API account (`WHATSAPP_LIVE=true` end-to-end) remains deferred, as documented in 05-CONTEXT.md's D-01 decision and 05-01-SUMMARY.md.

## Next Phase Readiness
- `graphClient.ts`'s `sendWhatsappMessage` is ready to be the sole send call site for plan 05-05 (inbound worker orchestration).
- `getWhatsappToken.ts` is ready for Phase 7 (SEC-01) to swap its body for a Vault/AES-GCM decrypt with zero call-site changes, per the `TODO(SEC-01, Phase 7)` marker.
- No blockers identified for downstream Wave 2+ plans in Phase 5.

---
*Phase: 05-integraci-n-whatsapp-cloud-api*
*Completed: 2026-07-06*

## Self-Check: PASSED

All created files verified present on disk; all three task commit hashes (`9ecd30d`, `cdb9898`, `67ba99e`) verified present in git log.
