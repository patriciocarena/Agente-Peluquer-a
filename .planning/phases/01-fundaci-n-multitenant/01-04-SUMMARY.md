---
phase: 01-fundaci-n-multitenant
plan: 04
subsystem: db
tags: [supabase, migrations, rls, db-types, management-api, multitenant]

# Dependency graph
requires:
  - "01-01 (packages/db-types stub — this plan fills its generated types)"
  - "01-03 (migration files 0001/0002 — this plan applies them live)"
provides:
  - "Live schema + RLS + GiST anti-double-booking constraint in bdgufnitakelyialjoqg"
  - "packages/db-types/src/database.types.ts generated from the live schema"
  - "packages/db-types re-exports Database + Tables/TablesInsert/TablesUpdate helpers (single shared type source)"
affects: [01-05 (verifies against this live DB), Phase 2+ (all queries use these types + live schema)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Live DDL applied via Supabase Management API SQL endpoint (POST /v1/projects/{ref}/database/query) with a PAT — the forbidden global mcp__supabase__* MCP (restaurant project) was NOT used"
    - "Shared DB types generated from the LIVE schema (Management API /types/typescript endpoint), re-exported from @turnosbot/db-types so apps/bot and apps/dashboard consume one source of truth"

key-files:
  created:
    - packages/db-types/src/database.types.ts
  modified:
    - packages/db-types/src/index.ts
    - .env.example

key-decisions:
  - "Neither the Supabase CLI nor psql is installed and no SUPABASE_DB_URL was provided; applied migrations via the Management API SQL endpoint using the PAT (SUPABASE_ACCESS_TOKEN) — an explicitly allowed alternative per the plan's action block."
  - "Cloudflare blocks Python urllib's default User-Agent (HTTP 403 error 1010); switched to curl for the apply calls, which succeeded (HTTP 201)."
  - "Target ref bdgufnitakelyialjoqg confirmed the ONLY project reachable with this PAT (restaurant ref hzgunbftloevclkohcdf absent from the account), and the project was empty (0 tables) before apply — clean additive greenfield migration, no overwrite risk."
  - "Added SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF var names to .env.example (no values), per Task 1."

patterns-established:
  - "@turnosbot/db-types is the single shared type surface: export type { Database, Json } from generated file, plus Tables<>/TablesInsert<>/TablesUpdate<> convenience helpers."

requirements-completed: [CORE-01, CORE-05]

# Metrics
duration: ~15min
completed: 2026-07-04
---

# Phase 1 Plan 4: Apply Live Schema + Generate Shared Types — Summary

**The full 14-table reference schema, uniform profile-resolved RLS, `auth_tenant_id()`, and the `turno` GiST anti-double-booking constraint are now LIVE in the correct Supabase project `bdgufnitakelyialjoqg`, and `@turnosbot/db-types` re-exports TypeScript types generated from that live schema — so Phase 1 verification (plan 05) and all later phases run against a real database with one shared type source.**

## Performance
- **Duration:** ~15 min
- **Completed:** 2026-07-04
- **Tasks:** 3 of 3 completed
- **Files modified:** 1 created, 2 modified

## Accomplishments
- **Task 1 (human-action checkpoint):** `.env` was pre-populated by the user with `SUPABASE_ACCESS_TOKEN` (PAT), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_PROJECT_REF` — all for `bdgufnitakelyialjoqg`, restaurant ref absent (`grep -c hzgunbftloevclkohcdf .env` = 0). Checkpoint satisfied.
- **Task 2 (live apply):** Applied `0001_schema_core.sql` then `0002_rls_policies.sql` to `bdgufnitakelyialjoqg` via the Management API SQL endpoint (HTTP 201 each). The global `mcp__supabase__*` MCP was NOT used (it points at the restaurant project).
- **Task 3 (types):** Generated `packages/db-types/src/database.types.ts` (792 lines) from the live schema via the Management API `/types/typescript` endpoint; updated `index.ts` to re-export `Database`/`Json` plus `Tables`/`TablesInsert`/`TablesUpdate` helpers; `pnpm -w exec tsc -b` exits 0.

## Live-DB Verification (queried against bdgufnitakelyialjoqg after apply)
| Check | Expected | Actual |
|-------|----------|--------|
| Base tables in `public` | 14 | 14 ✓ |
| `btree_gist` extension | present | 1 ✓ |
| `auth_tenant_id()` function | present | 1 ✓ |
| `turno` EXCLUDE (overlap) constraint | present | 1 ✓ |
| Tables with `rowsecurity=false` | 0 | 0 ✓ |
| Connected project ref | bdgufnitakelyialjoqg | bdgufnitakelyialjoqg ✓ |
| Restaurant ref `hzgunbftloevclkohcdf` | absent | not in account ✓ |

Tables live: `tenant, negocio, perfil, profesional, servicio, profesional_servicio, cliente, turno, turno_servicio, bloqueo, horario_trabajo, conversacion, mensaje, recordatorio`.

## Task Commits
1. **Task 1: Human provides live credentials** — no commit (checkpoint; `.env` is gitignored).
2. **Task 2: Apply migrations to live DB** — no local file diff (live-DB side effect only; verified via live queries).
3. **Task 3: Generate shared TypeScript types** — `7471b92` (feat) — database.types.ts, index.ts re-export, .env.example additions.

## Deviations from Plan
- **[Rule 1] Apply method:** Plan preferred `supabase db push` / CLI, but no CLI/psql/`SUPABASE_DB_URL` was available. Used the Management API SQL endpoint with the PAT — an explicitly permitted alternative in the plan's own action text. No schema/design change.
- **[Rule 1] curl over urllib:** Cloudflare returned HTTP 403 (error 1010) for Python urllib's default User-Agent; switched the apply calls to `curl`, which succeeded. Tooling-only change.

## Security Notes (threat model)
- **T-04-01 (wrong-project apply):** Mitigated — the PAT only reaches `bdgufnitakelyialjoqg`; restaurant ref is not in the account; every API call hard-coded the correct ref; the forbidden MCP was never used.
- **T-04-02 (.env secrets):** `.env` confirmed gitignored (`git check-ignore .env`); only `.env.example` (no values) committed.
- **T-04-03 (schema drift):** Schema applied exclusively from versioned migration files `0001`/`0002`, reproducible from the repo.

## Next Phase Readiness
- Plan 01-05 can now run its isolation / timezone / double-booking verification against the real database.
- Both apps import one shared type source (`@turnosbot/db-types`), preventing row-shape drift (CORE-03 foundation).

## Self-Check: PASSED
`packages/db-types/src/database.types.ts` present (792 lines, exports `Database`, contains `turno`); `index.ts` re-exports `Database`; `.env.example` updated; commit `7471b92` present in git log; live-DB queries confirm all acceptance criteria. Live apply confirmed against `bdgufnitakelyialjoqg` only.
