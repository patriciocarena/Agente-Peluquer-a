---
phase: 01-fundaci-n-multitenant
plan: 05
subsystem: database
tags: [supabase, rls, postgres, multitenant, tenantScoped, timezone, gist-exclude, tsx]

# Dependency graph
requires:
  - phase: 01-fundaci-n-multitenant (plan 01-02)
    provides: apps/bot skeleton (Fastify) that this plan adds a DB layer to
  - phase: 01-fundaci-n-multitenant (plan 01-04)
    provides: live 14-table schema + RLS policies + turno GiST EXCLUDE constraint applied to bdgufnitakelyialjoqg, and generated @turnosbot/db-types
provides:
  - Two live seeded test tenants (D-16) with owners, negocio, profesional, servicio, cliente, turno rows
  - Behavioral proof (live DB) of cross-tenant RLS isolation (CORE-01/CORE-02)
  - Behavioral proof (live DB) of timezone round-trip correctness (CORE-04)
  - Behavioral proof (live DB) of GiST double-booking rejection (CORE-05)
  - tenantScoped(tenantId) mandatory query layer for the bot's service_role path (CORE-03)
affects: [phase-02-dashboard-auth, phase-06-agente-conversacional, phase-07-hardening]

# Tech tracking
tech-stack:
  added: ["@supabase/supabase-js@2.110.0 (apps/bot + root devDeps)", "@turnosbot/db-types (workspace:*, wired into apps/bot)", "tsx (root devDep, for scripts/*.ts)"]
  patterns: ["tenantScoped(tenantId) query-builder wrapper (service_role bot path)", "supabase-js-based live verify scripts in lieu of psql/CLI", "Intl.DateTimeFormat for tz-aware conversion, no hardcoded UTC offsets"]

key-files:
  created:
    - supabase/seed.sql
    - scripts/apply-seed.ts
    - scripts/seed-fixtures.ts
    - scripts/verify-isolation.ts
    - scripts/verify-timezone.ts
    - scripts/verify-double-booking.ts
    - apps/bot/src/db/client.ts
    - apps/bot/src/db/tenantScoped.ts
    - apps/bot/src/db/tenantScoped.test.ts
  modified:
    - package.json
    - apps/bot/package.json
    - pnpm-lock.yaml

key-decisions:
  - "seed.sql is authored as the canonical/reviewable SQL seed definition, but is actually applied live via scripts/apply-seed.ts (supabase-js, service_role) because this environment has no psql/Supabase CLI/SUPABASE_DB_URL access; Auth owner users are created via supabaseAdmin.auth.admin.createUser since they cannot be created by plain SQL INSERT."
  - "scripts/seed-fixtures.ts centralizes the seeded tenant/owner identities (IDs, emails) as the single source of truth for the verify scripts, avoiding drift across three separate verify files."
  - "tenantScoped.ts implements exactly the ARCHITECTURE.md Pattern 3 shape: one accessor per Spanish domain table, each with .eq('tenant_id', tenantId) baked in before the caller can add further filters."
  - "verify-timezone.ts uses Intl.DateTimeFormat(timeZone) for the tz-aware round-trip check instead of date-fns-tz/luxon, avoiding a new dependency for a single conversion; acceptable per Pitfall 4 as long as no offset is hardcoded (verified via grep gate)."

patterns-established:
  - "Pattern: mandatory tenantScoped(tenantId) wrapper is the ONLY sanctioned service_role query path in apps/bot — no code should call supabaseAdmin.from(...) directly for tenant-scoped tables."
  - "Pattern: live-DB verification scripts run via `pnpm exec tsx scripts/verify-*.ts` against bdgufnitakelyialjoqg, since this environment lacks psql/Supabase CLI access — future plans needing live DB checks should follow the same supabase-js script pattern."

requirements-completed: [CORE-01, CORE-02, CORE-03, CORE-04, CORE-05]

# Metrics
duration: 62min
completed: 2026-07-04
---

# Phase 1 Plan 5: Live Data-Integrity Verification + tenantScoped Layer Summary

**Two live-seeded test tenants prove RLS isolation, 15:00-AR→18:00Z timezone round-trip, and GiST-based double-booking rejection all hold against the real bdgufnitakelyialjoqg database, plus the mandatory tenantScoped(tenantId) query layer for the bot's service_role path.**

## Performance

- **Duration:** ~62 min
- **Started:** 2026-07-04T12:33:00Z (approx, session start)
- **Completed:** 2026-07-04T13:35:28Z
- **Tasks:** 3/3 completed
- **Files modified/created:** 12

## Accomplishments
- Wired `@supabase/supabase-js` + `@turnosbot/db-types` into `apps/bot/package.json` and root `package.json` devDependencies so every later import in this plan resolves under pnpm strict linking; `pnpm install --frozen-lockfile` confirmed clean.
- Authored `supabase/seed.sql` (canonical reviewable seed) and applied it live to `bdgufnitakelyialjoqg` via `scripts/apply-seed.ts` (supabase-js, service_role): two tenants ("Barbería Norte", "Barbería Sur"), each with a `negocio`, `profesional`, 2 `servicio` rows, a `cliente`, a `turno`, a Supabase Auth owner user, and a matching `perfil` row (`rol='owner'`).
- Proved all four core data-integrity Success Criteria behaviorally, live, against the real DB:
  - **CORE-01/CORE-02** (`scripts/verify-isolation.ts`): signed in as each seeded owner via anon key + JWT; every tenant-scoped query returned only that owner's tenant rows; a known other-tenant `turno_id` was unreadable (0 rows); cross-tenant UPDATE affected 0 rows; cross-tenant INSERT was rejected by RLS. **Ran live — PASSED** (the required `NEXT_PUBLIC_SUPABASE_ANON_KEY` was present in `.env`).
  - **CORE-04** (`scripts/verify-timezone.ts`): a turno inserted at 15:00 `America/Argentina/Buenos_Aires` stored as exactly `18:00:00.000Z`, and converting that instant back via `Intl.DateTimeFormat` with the IANA zone rendered `15:00` — no hardcoded offset anywhere (grep-gated).
  - **CORE-05** (`scripts/verify-double-booking.ts`): the `turno_no_overlap` GiST EXCLUDE constraint rejected an overlapping active turno (code `23P01`), accepted a boundary-touching turno (D-11, no buffer), accepted an overlap immediately after cancelling the original (D-10, cancelled frees the slot), and exactly 1 of 8 concurrent overlapping inserts succeeded (concurrency smoke).
- Established `tenantScoped(tenantId)` (CORE-03) in `apps/bot/src/db/`: `client.ts` builds the server-only `supabaseAdmin` service_role client (typed via `@turnosbot/db-types`, guarded against browser use); `tenantScoped.ts` exports one accessor per Spanish domain table (turno, servicio, profesional, bloqueo, cliente, conversacion, mensaje, recordatorio, etc.), every one baking in `.eq('tenant_id', tenantId)`. TDD RED→GREEN: the smoke test (`tenantScoped.test.ts`) failed first (module not found), then passed against the live seeded tenants once the layer was implemented — `tenantScoped(tenantA).turnos()` returns only tenant-A rows, never tenant-B.

## Task Commits

Each task was committed atomically:

1. **Task 1: Declare + install runtime deps, seed two test tenants (D-16)** — `bd5586c` (feat)
2. **Task 2: Verify RLS isolation + timezone + DB double-booking rejection** — `21ec665` (test)
3. **Task 3 RED: failing tenantScoped smoke test** — `c6deced` (test)
   **Task 3 GREEN: tenantScoped(tenantId) implementation** — `a5d44c6` (feat)

**Plan metadata:** (this commit, docs: complete plan)

## Files Created/Modified
- `supabase/seed.sql` - Canonical SQL seed definition: 2 tenants, negocios, profesionales, servicios, clientes, turnos (fake/sandbox data only, no real WhatsApp tokens)
- `scripts/apply-seed.ts` - Applies seed.sql live via supabase-js service_role; creates the 2 Supabase Auth owner users + perfil rows
- `scripts/seed-fixtures.ts` - Shared tenant/owner identity constants imported by the verify scripts
- `scripts/verify-isolation.ts` - CORE-01/02: live cross-tenant RLS isolation proof (anon key + JWT path)
- `scripts/verify-timezone.ts` - CORE-04: live 15:00-AR→18:00Z round-trip proof (Intl tz-aware, no hardcoded offset)
- `scripts/verify-double-booking.ts` - CORE-05: live GiST EXCLUDE constraint proof (overlap rejection, boundary touch, cancel-frees-slot, concurrency smoke)
- `apps/bot/src/db/client.ts` - Server-only service_role Supabase client (guarded, typed via @turnosbot/db-types)
- `apps/bot/src/db/tenantScoped.ts` - Mandatory tenant-scoped query layer (CORE-03), one accessor per domain table
- `apps/bot/src/db/tenantScoped.test.ts` - Functional smoke test proving no tenant-B leakage via tenantScoped(tenantA)
- `package.json` - Added @supabase/supabase-js, @turnosbot/db-types (workspace:*), tsx to devDependencies
- `apps/bot/package.json` - Added @supabase/supabase-js, @turnosbot/db-types (workspace:*) to dependencies
- `pnpm-lock.yaml` - Updated lockfile for the above

## Decisions Made
- Applied the seed live via a TypeScript/supabase-js script rather than psql, since this environment has no direct Postgres/CLI access — `supabase/seed.sql` still exists as the canonical, reviewable SQL definition per the plan's artifact requirement, kept byte-consistent with the script.
- Used `Intl.DateTimeFormat` for the tz-aware timezone conversion check instead of pulling in `date-fns-tz`/`luxon` as a new runtime dependency — sufficient for this single verification and still fully IANA-zone-driven (no hardcoded offset), consistent with Pitfall 4's requirement.
- Centralized seeded tenant/owner fixture data in `scripts/seed-fixtures.ts` so `verify-isolation.ts`, `verify-timezone.ts`, and `verify-double-booking.ts` never risk drifting on tenant IDs.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Removed restaurant-project identifier strings from own defensive comments**
- **Found during:** Task 1 and Task 2 acceptance-criteria grep gates
- **Issue:** Explanatory comments in `supabase/seed.sql` and `scripts/apply-seed.ts` that *warned against* mixing with the restaurant project literally contained the forbidden strings (`hzgunbftloevclkohcdf`, `restaurants`, `menu_items`), causing the plan's contamination grep gate (`grep -Eci "hzgunbftloevclkohcdf|menu_items|restaurants|call_logs"` must equal 0) to fail even though there was no actual data contamination.
- **Fix:** Reworded the comments to state the isolation rule generically ("any other, unrelated Supabase project") without naming the forbidden identifiers.
- **Files modified:** `supabase/seed.sql`, `scripts/apply-seed.ts`
- **Verification:** `grep -Eci "hzgunbftloevclkohcdf|menu_items|restaurants|call_logs" supabase/seed.sql` and the equivalent scan over `scripts/` both return 0.
- **Committed in:** `bd5586c` (seed.sql fix folded into Task 1 commit before it was made), `21ec665` (apply-seed.ts fix folded into Task 2 commit)

**2. [Rule 3 - Blocking] Removed literal "-3" substrings from verify-timezone.ts comments**
- **Found during:** Task 2 acceptance-criteria grep gate (`grep -RE "[^0-9]-3[^0-9]|'-03:00'" scripts/verify-timezone.ts` must return nothing)
- **Issue:** Comments explaining "no hardcoded -3 offset" ironically contained the literal string `-3`, tripping the anti-hardcode gate meant to catch actual offset math, not commentary about avoiding it.
- **Fix:** Reworded comments to say "no hardcoded numeric offset" without the literal `-3` substring; no functional code was ever using a hardcoded offset (the implementation always used the IANA zone via `Intl.DateTimeFormat`).
- **Files modified:** `scripts/verify-timezone.ts`
- **Verification:** grep gate returns empty; `verify-timezone.ts` still passes live (PASSED).
- **Committed in:** `21ec665`

---

**Total deviations:** 2 auto-fixed (both Rule 3 — blocking gate false-positives from defensive comments, no functional code changes)
**Impact on plan:** Zero impact on behavior or security; both fixes were wording-only adjustments to satisfy literal grep acceptance gates. No scope creep.

## Issues Encountered
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` was initially expected to be absent per the environment adaptations (grep at plan start found nothing), but was present in `.env` by the time Task 2 ran — `verify-isolation.ts` was authored per the "if present, run it" branch and executed successfully live, so no checkpoint was needed for the anon-key gap described in the environment adaptations.

## User Setup Required

None - no external service configuration required. `NEXT_PUBLIC_SUPABASE_ANON_KEY` was already present in `.env` when Task 2 ran.

## Next Phase Readiness
- All five Phase 1 Success Criteria are now behaviorally proven against the live `bdgufnitakelyialjoqg` database (isolation, timezone, double-booking backed by this plan; ARM skeleton by 01-02/01-03).
- `tenantScoped(tenantId)` is in place as the required pattern for all future bot-service DB access (Phase 6 agent tools must build on top of this, never bypass it).
- Two live seeded tenants with owners remain in the DB — usable as fixtures for Phase 2 dashboard-auth development, though Phase 2 may choose to seed its own or reuse these (owner emails: `owner-norte@turnosbot-seed.test`, `owner-sur@turnosbot-seed.test`).
- No blockers for Phase 2.

---
*Phase: 01-fundaci-n-multitenant*
*Completed: 2026-07-04*

## Self-Check: PASSED

All 9 created/modified files verified present on disk; all 4 task commit hashes (`bd5586c`, `21ec665`, `c6deced`, `a5d44c6`) verified present in git log.
