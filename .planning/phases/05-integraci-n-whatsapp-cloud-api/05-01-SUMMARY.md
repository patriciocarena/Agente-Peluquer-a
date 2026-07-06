---
phase: 05-integraci-n-whatsapp-cloud-api
plan: 01
subsystem: infra
tags: [vitest, pg-boss, fastify, zod, supabase, migrations, negocioScoped]

# Dependency graph
requires:
  - phase: 03-motor-de-disponibilidad
    provides: negocioScoped(negocioId) read-only query layer (CORE-03)
  - phase: 01-fundaci-n-multitenant
    provides: mensaje/conversacion/cliente schema (0001_schema_core.sql), tenant/negocio split (0003)
provides:
  - Working vitest runner in apps/bot (pnpm --filter @turnosbot/bot test)
  - loadEnv() surfacing WHATSAPP_APP_SECRET/VERIFY_TOKEN/LIVE/GRAPH_API_VERSION/DEV_TOKEN + .env.example block
  - negocioScoped write accessors (insertMensaje, insertConversacion, updateConversacion, insertCliente)
  - Idempotent migration confirming the durable UNIQUE(wa_message_id) dedup backstop (WA-03)
affects: [05-02, 05-03, 05-04, 05-05, 05-06]

# Tech tracking
tech-stack:
  added: ["pg-boss@^12.25.1", "@fastify/rate-limit@^11.1.0", "@fastify/helmet@^13.0.2", "zod@^4.4.3 (apps/bot)", "vitest@4.1.9 (apps/bot devDep)"]
  patterns:
    - "vitest.config.ts environment=node, include src/**/*.test.ts, no path aliasing (mirrors availability-engine)"
    - "negocioScoped write accessors bake negocio_id into insert rows/update filters, typed via Omit<TablesInsert<T>/TablesUpdate<T>, 'negocio_id'>"
    - "WHATSAPP_LIVE strict-equality boolean parse (only the literal string 'true')"
    - "WHATSAPP_GRAPH_API_VERSION as a single overridable env var, never hardcoded at call sites"

key-files:
  created:
    - apps/bot/vitest.config.ts
    - apps/bot/src/config/env.test.ts
    - supabase/migrations/0004_mensaje_wa_message_id_unique.sql
  modified:
    - apps/bot/package.json
    - apps/bot/src/config/env.ts
    - apps/bot/src/db/negocioScoped.ts
    - .env.example

key-decisions:
  - "Excluded pre-existing apps/bot/src/db/negocioScoped.test.ts from the new vitest include glob — it's a manual live-DB smoke script (top-level main()/process.exit, gated on real Supabase env vars), not a vitest suite, and would crash the automated runner"
  - "updateConversacion's patch param typed against TablesUpdate<'conversacion'> (not TablesInsert) since it's a partial update, not an insert row"
  - "Migration 0004 is a documented idempotent no-op (CREATE UNIQUE INDEX IF NOT EXISTS) — the durable dedup constraint already exists as a plain global UNIQUE(wa_message_id) from 0001, confirmed via grep, not a new (negocio_id, wa_message_id) composite"

patterns-established:
  - "First-writer pattern for negocioScoped: write accessors added alongside existing read accessors in the same returned object, preserving the negocio_id-baked-in guarantee for both"

requirements-completed: [WA-03]

coverage:
  - id: D1
    description: "vitest runner wired in apps/bot (pnpm --filter @turnosbot/bot exec vitest run --passWithNoTests exits 0)"
    verification:
      - kind: unit
        ref: "pnpm --filter @turnosbot/bot exec vitest run --passWithNoTests"
        status: pass
    human_judgment: false
  - id: D2
    description: "loadEnv() extended with WHATSAPP_APP_SECRET/VERIFY_TOKEN/LIVE/GRAPH_API_VERSION/DEV_TOKEN, covered by env.test.ts (TDD RED->GREEN)"
    requirement: "WA-03"
    verification:
      - kind: unit
        ref: "apps/bot/src/config/env.test.ts (6 tests, all pass)"
        status: pass
    human_judgment: false
  - id: D3
    description: "negocioScoped write accessors (insertMensaje/insertConversacion/updateConversacion/insertCliente) added and type-check cleanly; negocio() accessor unchanged"
    verification:
      - kind: unit
        ref: "pnpm --filter @turnosbot/bot exec tsc -p tsconfig.json --noEmit"
        status: pass
    human_judgment: false
  - id: D4
    description: "Durable UNIQUE(wa_message_id) dedup backstop confirmed present in applied schema (WA-03) + idempotent documenting migration authored"
    requirement: "WA-03"
    verification:
      - kind: other
        ref: "grep -c 'wa_message_id text UNIQUE' supabase/migrations/0001_schema_core.sql (returns 1)"
        status: pass
    human_judgment: false

duration: 18min
completed: 2026-07-06
status: complete
---

# Phase 5 Plan 01: Wave 0 Foundation Summary

**Vitest runner wired into apps/bot, loadEnv() extended with the five WHATSAPP_* vars, negocioScoped gains its first write accessors (Phase 5's insert path), and the durable mensaje.wa_message_id dedup backstop for WA-03 is confirmed and documented via an idempotent migration.**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-07-06T19:38:00Z
- **Completed:** 2026-07-06T19:55:57Z
- **Tasks:** 3 completed
- **Files modified:** 7 (3 created, 4 modified)

## Accomplishments
- `apps/bot` now has a working vitest runner (`pnpm --filter @turnosbot/bot test`), matching the monorepo's pinned `vitest@4.1.9`
- `loadEnv()` is the single, tested env-access point for every Phase 5 module, exposing `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_LIVE` (strict boolean), `WHATSAPP_GRAPH_API_VERSION` (default `v23.0`), `WHATSAPP_DEV_TOKEN`, and existing `SUPABASE_DB_URL`
- `negocioScoped(negocioId)` gained its first write accessors — `insertMensaje`, `insertConversacion`, `updateConversacion`, `insertCliente` — each structurally incapable of writing without the caller's `negocio_id` (D-11)
- The durable dedup backstop for WA-03 (`UNIQUE(wa_message_id)` on `mensaje`, from `0001_schema_core.sql`) is confirmed present and documented via an idempotent `0004_mensaje_wa_message_id_unique.sql`

## Task Commits

Each task was committed atomically:

1. **Task 1: Install Phase 5 deps + stand up vitest in apps/bot** - `80e95c2` (feat)
2. **Task 2: Extend env accessor with WhatsApp/pg-boss vars + test** - TDD: `9b6b561` (test, RED) → `917eca5` (feat, GREEN)
3. **Task 3: Add write accessors to negocioScoped + confirm dedup constraint** - `3cf79d9` (feat)

**Plan metadata:** (this SUMMARY commit, following)

## Files Created/Modified
- `apps/bot/vitest.config.ts` (NEW) - vitest runner config (environment: node, include src/**/*.test.ts, no path aliasing), excludes the pre-existing live-DB smoke script `negocioScoped.test.ts`
- `apps/bot/src/config/env.test.ts` (NEW) - 6 tests covering WHATSAPP_LIVE strict-boolean parse, WHATSAPP_GRAPH_API_VERSION default/override, and string passthrough for the remaining vars
- `supabase/migrations/0004_mensaje_wa_message_id_unique.sql` (NEW) - idempotent, self-documenting `CREATE UNIQUE INDEX IF NOT EXISTS` confirming the WA-03 dedup backstop already applied via 0001
- `apps/bot/package.json` (MODIFIED) - added `pg-boss`, `@fastify/rate-limit`, `@fastify/helmet`, `zod` deps; pinned `vitest@4.1.9` devDep; added `test` script
- `apps/bot/src/config/env.ts` (MODIFIED) - extended `BotEnv` + `loadEnv()` with the five `WHATSAPP_*` fields
- `apps/bot/src/db/negocioScoped.ts` (MODIFIED) - added `insertMensaje`/`insertConversacion`/`updateConversacion`/`insertCliente` write accessors, typed against `@turnosbot/db-types` Insert/Update shapes with `negocio_id` omitted
- `.env.example` (MODIFIED) - added the five `WHATSAPP_*` placeholder keys (no real values)

## Decisions Made
- Excluded `apps/bot/src/db/negocioScoped.test.ts` from the new vitest `include` glob rather than renaming/moving it: it predates this runner (Fase 03), is a manual live-DB smoke script with a top-level `main()`/`process.exit` gated on real Supabase env vars — not a vitest suite — and would otherwise crash the automated run. This preserves the file's already-documented `pnpm exec tsx` invocation untouched.
- `updateConversacion`'s `patch` parameter is typed against `TablesUpdate<"conversacion">` (partial-update shape) rather than the `Insert` type the plan's prose used as the general pattern for `row` params — more accurate for an `UPDATE`, and `TablesUpdate` was already exported from `@turnosbot/db-types`.
- Migration 0004 is authored as a pure documentation/no-op safety net: the durable dedup constraint already exists as a plain global `UNIQUE(wa_message_id)` (confirmed via grep against `0001_schema_core.sql`), not the `(negocio_id, wa_message_id)` composite RESEARCH.md's Pattern 4 had assumed — per 05-PATTERNS.md's resolved Open Question 2.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Excluded pre-existing negocioScoped.test.ts from the new vitest glob**
- **Found during:** Task 1 (standing up the vitest runner)
- **Issue:** `apps/bot/src/db/negocioScoped.test.ts` (from Phase 03) is a manual live-DB smoke script named with the `.test.ts` suffix but has no `describe`/`it` blocks — it self-executes `main()` at import time and calls `process.exit(1)` on assertion failure, and throws immediately at import (via `./client.ts`) when `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` aren't set. Wiring `vitest.config.ts`'s `include: ["src/**/*.test.ts"]` (as instructed) picked this file up and made `vitest run --passWithNoTests` fail, blocking Task 1's acceptance criteria.
- **Fix:** Added an `exclude: ["src/db/negocioScoped.test.ts", "node_modules/**"]` entry to `vitest.config.ts` with a comment explaining why, leaving the file and its documented `pnpm exec tsx` invocation completely untouched.
- **Files modified:** `apps/bot/vitest.config.ts`
- **Verification:** `pnpm --filter @turnosbot/bot exec vitest run --passWithNoTests` now exits 0 ("No test files found, exiting with code 0").
- **Committed in:** `80e95c2` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary to satisfy the plan's own acceptance criteria for Task 1; no scope creep, no behavior change to the excluded file.

## Issues Encountered
None beyond the deviation above.

## User Setup Required
None - no external service configuration required. (Live verification of the `mensaje.wa_message_id` constraint against `bdgufnitakelyialjoqg`, and of the `WHATSAPP_LIVE` gate against a real Meta account, are explicitly deferred merge-time/live checks per the plan and 05-CONTEXT.md D-01 — not part of this plan's automated scope.)

## Next Phase Readiness
- The vitest runner, extended env accessor, negocioScoped write path, and confirmed dedup backstop unblock every downstream Phase 5 plan (webhook signature verification, pg-boss worker, outbound Cloud API client).
- No blockers identified for Wave 1+ of Phase 5.

---
*Phase: 05-integraci-n-whatsapp-cloud-api*
*Completed: 2026-07-06*

## Self-Check: PASSED

All created files verified present on disk; all four task commit hashes (`80e95c2`, `9b6b561`, `917eca5`, `3cf79d9`) verified present in git log.
