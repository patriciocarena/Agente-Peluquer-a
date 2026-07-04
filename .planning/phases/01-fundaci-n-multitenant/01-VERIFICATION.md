---
phase: 01-fundaci-n-multitenant
verified: 2026-07-04T14:00:00Z
status: passed
score: 5/5 must-haves verified (roadmap Success Criteria)
overrides_applied: 0
remediation:
  - date: 2026-07-04
    truth: "ROADMAP Success Criteria #5 (arm64 container build)"
    action: "Dockerfile rewritten to be pnpm-workspace-aware (corepack + `pnpm install --frozen-lockfile --filter @turnosbot/bot...`), replacing the standalone `npm install` that could not resolve `workspace:*`. Runtime stage preserves pnpm's node_modules layout so relative symlinks resolve; db-types (types-only) is compiled away and not required at runtime. docker-compose.yml pinned to `platform: linux/arm64` (WR-01)."
    state: "verified"
    evidence: "Installed colima + Docker (native arm64 VM). `docker buildx build --platform linux/arm64 -t turnosbot-bot:arm64-verify --load .` completed with NO EUNSUPPORTEDPROTOCOL error — `pnpm install --frozen-lockfile --filter @turnosbot/bot...` resolved the workspace dep and `tsc` built cleanly. `docker image inspect` → `arch=arm64 os=linux`. Container ran; `GET /health` returned HTTP 200 `{\"status\":\"ok\"}` in ~2s (server bound `0.0.0.0:3001`). `docker compose build` + `up -d` (production path with the `platform: linux/arm64` pin) → compose healthcheck reported `healthy` in ~4s. Criterion #5 closed live 2026-07-04."
gaps:
  - truth: "El proyecto corre (build + arranque) en un contenedor linux/arm64, verificado antes de acumular dependencias (ROADMAP Success Criteria #5)"
    status: resolved
    reason: "Plan 01-05 added '@turnosbot/db-types: workspace:*' and '@supabase/supabase-js' to apps/bot/package.json (for the CORE-03 tenantScoped layer) but never updated the Dockerfile, which still does a bare `COPY apps/bot/package.json` + `npm install` with no workspace context. `npm install` cannot resolve the `workspace:*` protocol outside a pnpm/npm workspace, so the arm64 image build now fails. Re-ran the exact plan-02 verify command live (`docker buildx build --platform linux/arm64 -t turnosbot-bot:arm64-verify --load .`) and it fails at both the build stage (`npm install`) and runtime stage (`npm install --omit=dev`) with `npm error code EUNSUPPORTEDPROTOCOL / Unsupported URL Type \"workspace:\": workspace:*`. The arm64 proof plan-02 recorded as PASSED is no longer true against the current repo state — this is a regression introduced by plan 05, not a plan-02 execution failure."
    artifacts:
      - path: "Dockerfile"
        issue: "Builds apps/bot standalone via plain `npm install` against only `apps/bot/package.json` (no workspace root, no packages/db-types available in build context), but apps/bot/package.json now declares a workspace:* dependency it cannot resolve this way."
      - path: "apps/bot/package.json"
        issue: "Declares \"@turnosbot/db-types\": \"workspace:*\" — valid under pnpm workspace linking (used for local dev/tsx/tests) but unresolvable by a standalone `npm install` inside the Docker build context, which only has apps/bot's own package.json copied in."
    missing:
      - "Make the Dockerfile workspace-aware: copy the full monorepo context (pnpm-workspace.yaml, root package.json, packages/db-types, apps/bot) and run `pnpm install --frozen-lockfile --filter @turnosbot/bot...` (or equivalent) instead of a standalone `npm install` scoped to apps/bot alone. This was anticipated in 01-02-PLAN.md's own interfaces note (\"a future phase makes the Dockerfile workspace-aware for production\") but no plan in this phase actually did it before claiming Success Criteria #5 complete a second time."
      - "Re-run the arm64 build + health-check proof after the Dockerfile fix and confirm it passes with the CURRENT apps/bot/package.json (post-01-05), not just the pre-01-05 minimal version that 01-02 originally proved."
      - "Optionally pin --platform=linux/arm64 explicitly in the Dockerfile FROM lines and docker-compose.yml (WR-01 from 01-REVIEW.md) so a build on a non-ARM host cannot silently mislabel an amd64 image as arm64 — cheap insurance, same root risk area."
---

# Phase 1: Fundación multitenant — Verification Report

**Phase Goal:** La base de datos y el esqueleto de infraestructura garantizan aislamiento por tenant, timezone correcto y protección anti-doble-reserva desde el primer momento.
**Verified:** 2026-07-04T14:00:00Z
**Status:** passed (was gaps_found — single gap remediated and re-verified live)
**Re-verification:** Yes — Criterion #5 re-verified live 2026-07-04 after Dockerfile fix

> **Remediation CLOSED (2026-07-04):** The single gap (Criterion #5, arm64 build) was fixed and **verified live**. The `Dockerfile` was rewritten to build through the pnpm workspace (`corepack` + `pnpm install --frozen-lockfile --filter @turnosbot/bot...`) instead of the standalone `npm install` that could not resolve `workspace:*`; `docker-compose.yml` was pinned to `platform: linux/arm64` (WR-01). colima + Docker were installed (native arm64 VM); the image built with no `EUNSUPPORTEDPROTOCOL` error, `docker image inspect` confirmed `arch=arm64 os=linux`, the container started and `GET /health` returned **HTTP 200** in ~2s, and `docker compose build && up -d` reported the healthcheck **`healthy`** in ~4s. All 5/5 ROADMAP Success Criteria for Phase 1 are now verified. Phase 01 is ready to close.

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria, Phase 1)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Ninguna consulta a la base puede devolver datos de un tenant distinto al solicitado (verificado con ≥2 tenants) | ✓ VERIFIED | Re-ran `pnpm exec tsx scripts/verify-isolation.ts` live against `bdgufnitakelyialjoqg`: owner A and owner B (real seeded tenants "Barbería Norte"/"Barbería Sur") each get 0 rows when querying the other tenant's data; direct read of a known other-tenant `turno_id` returns 0 rows both directions. Script printed `verify-isolation.ts: PASSED`. |
| 2 | Un usuario logueado en el dashboard solo puede ver/operar datos de su propio tenant, aunque intente forzar el acceso a otro | ✓ VERIFIED | Same live run: cross-tenant UPDATE affected 0 rows (RLS-blocked); cross-tenant INSERT with a foreign `tenant_id` was rejected with `new row violates row-level security policy for table "negocio"`, for both owner A and owner B. |
| 3 | Todo horario y turno se guarda con `TIMESTAMPTZ` y se interpreta correctamente en el timezone del tenant (`America/Argentina/*`) | ✓ VERIFIED | Re-ran `pnpm exec tsx scripts/verify-timezone.ts` live: a turno inserted at 15:00 `America/Argentina/Buenos_Aires` stored as `2026-08-01T18:00:00.000Z`; converting that instant back via `Intl.DateTimeFormat` with the IANA zone renders `15:00`. No hardcoded `-3` offset found in the script (grep-gated). `information_schema` / migration inspection confirms all schedule columns are `timestamptz`. |
| 4 | Un intento de crear dos turnos superpuestos para el mismo profesional es rechazado por la base de datos, no por lógica de aplicación | ✓ VERIFIED | Re-ran `pnpm exec tsx scripts/verify-double-booking.ts` live: overlapping active turno rejected by Postgres (`code=23P01`, EXCLUDE violation); boundary-touching turno accepted (D-11); post-cancellation overlapping turno accepted (D-10); exactly 1 of 8 concurrent overlapping inserts succeeded. Live query confirms the `turno` EXCLUDE constraint exists in `pg_constraint` (contype='x'). |
| 5 | El proyecto corre (build + arranque) en un contenedor `linux/arm64`, verificado antes de acumular dependencias | ✓ VERIFIED (re-verified live 2026-07-04) | **[2026-07-04 re-verify]** Dockerfile now builds through the pnpm workspace (`pnpm install --frozen-lockfile --filter @turnosbot/bot...`), fixing the `EUNSUPPORTEDPROTOCOL` root cause; compose pinned to `platform: linux/arm64`. Re-ran live after installing colima/Docker: `docker buildx build --platform linux/arm64 … --load .` succeeded (no protocol error), `docker image inspect` → `arch=arm64 os=linux`, container `GET /health` → **HTTP 200** in ~2s, `docker compose up -d` healthcheck → **`healthy`** in ~4s. — (Original regression, now fixed, described below:) 01-02-SUMMARY.md claims this was proven (arm64 image built, `/health` returned 200, `docker image inspect` confirmed `arm64`) — TRUE at the time of plan 02, against the pre-01-05 minimal `apps/bot/package.json`. Re-ran the identical command live NOW (`docker buildx build --platform linux/arm64 -t turnosbot-bot:arm64-verify --load .`) against the CURRENT repo state and it FAILS: `npm error code EUNSUPPORTEDPROTOCOL / Unsupported URL Type "workspace:": workspace:*` at both the build stage (`RUN npm install`) and runtime stage (`RUN npm install --omit=dev`). Plan 01-05 added `"@turnosbot/db-types": "workspace:*"` to `apps/bot/package.json` for the CORE-03 tenantScoped layer but never updated the Dockerfile to be workspace-aware. The container no longer builds. |

**Score:** 5/5 truths verified (roadmap Success Criteria) — Criterion #5 re-verified live after the Dockerfile remediation (2026-07-04)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `pnpm-workspace.yaml`, root `package.json`, `tsconfig.base.json`, `.npmrc` | Monorepo workspace scaffolding | ✓ VERIFIED | All present; `pnpm -w exec tsc -b` exits 0 across the whole workspace (re-run live). |
| `packages/db-types/src/index.ts` + `database.types.ts` | Single shared type source, generated from live schema | ✓ VERIFIED | `database.types.ts` present (792 lines per SUMMARY), exports `Database`, contains `turno`. `index.ts` re-exports `Database`/`Json`/`Tables` helpers. Typechecks clean. |
| `packages/availability-engine/src/index.ts`, `packages/shared/src/index.ts` | Zero-logic stubs | ✓ VERIFIED | Present, stub-only, typecheck clean. |
| `apps/dashboard` stub | Next.js 16.2.x + @supabase/ssr declared, no app code | ✓ VERIFIED | package.json + tsconfig present as documented. |
| `apps/bot/src/server.ts` | Minimal Fastify `/health` server | ✓ VERIFIED | Present, 507 bytes, exposes `GET /health`. |
| `Dockerfile` | Node 24 arm64 build with `ENV TZ=UTC`, non-root user | ⚠️ STALE / BROKEN FOR CURRENT DEPS | Contains `node:24`, `ENV TZ=UTC`, `USER node` — all present as claimed — but the build itself fails against the current `apps/bot/package.json` (see Truth #5). The artifact's *content* matches the plan's textual acceptance criteria (grep-passable) but does not achieve its behavioral purpose anymore. |
| `docker-compose.yml` | Bot service with `healthcheck` | ✓ VERIFIED (content) / not re-tested end-to-end | Healthcheck block present and correctly shaped; not run because the underlying image no longer builds. |
| `supabase/migrations/0001_schema_core.sql` | 14-table schema, `EXCLUDE USING gist`, `tenant_id` everywhere | ✓ VERIFIED | `grep -c "^CREATE TABLE"` = 14 (re-confirmed); `EXCLUDE USING gist ... estado != 'cancelado'` present; live DB confirms 14 base tables + 1 GiST exclusion constraint on `turno`. |
| `supabase/migrations/0002_rls_policies.sql` | RLS + `auth_tenant_id()` + uniform per-table policy | ✓ VERIFIED | Live DB: `SELECT count(*) FROM pg_policies WHERE schemaname='public'` = 14 (one per tenant table); `auth_tenant_id()` function present; 0 tables with `rowsecurity=false`; 0 occurrences of `auth.jwt`/`superadmin` in policy SQL. |
| `apps/bot/src/db/tenantScoped.ts` + `.test.ts` | Mandatory tenant-scoped query layer (CORE-03) | ✓ VERIFIED | Re-ran `pnpm exec tsx apps/bot/src/db/tenantScoped.test.ts` live: `tenantScoped(A).turnos()` returns only tenant-A rows, `tenantScoped(B).turnos()` returns only tenant-B rows. `client.ts` guards service_role key to server-only per code review. |
| `supabase/seed.sql` | ≥2 seeded test tenants | ✓ VERIFIED | Live DB has 2 distinct tenants with owners, confirmed via the isolation/timezone/double-booking scripts operating against real seeded rows (Barbería Norte / Barbería Sur). |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `supabase/migrations/0002_rls_policies.sql` | `perfil` table (`auth.uid()`) | `SECURITY DEFINER` helper reads `perfil.tenant_id` | ✓ WIRED | `auth_tenant_id()` confirmed live in `pg_proc`; policies reference it uniformly. |
| `turno` table | double-booking prevention | `EXCLUDE USING gist over tstzrange(inicio, fin) WHERE estado != 'cancelado'` | ✓ WIRED | Confirmed both in migration SQL and live `pg_constraint`; behaviorally proven via live script. |
| `docker-compose.yml` | `apps/bot/src/server.ts` | container CMD starts Fastify, healthcheck curls `/health` | ✗ NOT WIRED (currently) | The compose/Dockerfile shape is correct, but the underlying image build fails before the container can ever start — see Truth #5. |
| `Dockerfile` | runtime clock | `ENV TZ=UTC` | ✓ WIRED (content-level) | Present in Dockerfile; not exercised end-to-end since the image doesn't build currently. |
| `apps/bot/src/db/tenantScoped.ts` | `supabaseAdmin` (service_role client) | every accessor bakes `.eq('tenant_id', tenantId)` | ✓ WIRED | `grep -c "tenant_id"` in tenantScoped.ts confirms multiple occurrences; live smoke test confirms behavior. |
| `apps/bot/package.json` + root `package.json` | `@supabase/supabase-js` + `@turnosbot/db-types` (workspace:*) | declared deps make imports resolvable | ✓ WIRED (for pnpm dev/test), ✗ NOT WIRED (for standalone Docker `npm install`) | `pnpm install --frozen-lockfile` and `pnpm exec tsx` both resolve these fine under the workspace. Plain `npm install` inside the Docker build context (no workspace) cannot resolve `workspace:*` — this is the root cause of the Truth #5 failure. |
| `scripts/verify-isolation.ts` | live RLS policies | owner-A JWT query for tenant-B data returns 0 rows | ✓ WIRED | Re-run live, passed. |

### Data-Flow Trace (Level 4)

Not applicable in the traditional sense (no UI rendering dynamic data in this phase) — instead, live-DB round-trip was traced end-to-end for each Success Criterion:

| Concern | Source | Produces Real Data | Status |
|---------|--------|---------------------|--------|
| Isolation query results | Live Postgres via anon key + real JWT sessions for 2 seeded owners | Yes — real rows for 2 real tenants | ✓ FLOWING |
| Timezone round-trip | Live insert + live read against `bdgufnitakelyialjoqg` | Yes — real stored `timestamptz` value | ✓ FLOWING |
| Double-booking rejection | Live Postgres constraint (not app-level check) | Yes — real constraint violation codes (23P01) | ✓ FLOWING |
| tenantScoped smoke | Live seeded tenant rows | Yes — real per-tenant row counts | ✓ FLOWING |
| arm64 container health | Docker build → container → curl | Yes — image builds (arm64), container runs, `/health` → HTTP 200 (re-verified 2026-07-04) | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Cross-tenant isolation (dashboard/RLS path) | `pnpm exec tsx scripts/verify-isolation.ts` (live, re-run) | `verify-isolation.ts: PASSED` | ✓ PASS |
| Timezone round-trip | `pnpm exec tsx scripts/verify-timezone.ts` (live, re-run) | `verify-timezone.ts: PASSED` | ✓ PASS |
| DB-level double-booking rejection | `pnpm exec tsx scripts/verify-double-booking.ts` (live, re-run) | `verify-double-booking.ts: PASSED` | ✓ PASS |
| tenantScoped(tenantId) smoke test | `pnpm exec tsx apps/bot/src/db/tenantScoped.test.ts` (re-run) | `tenantScoped.test.ts: PASSED` | ✓ PASS |
| Workspace typecheck | `pnpm -w exec tsc -b` (re-run) | Exit 0, no errors | ✓ PASS |
| Live schema shape (tables/ext/constraint/fn/RLS) | Management API SQL query against `bdgufnitakelyialjoqg` | `{"base_tables":14,"ext":1,"excl":1,"fn":1,"no_rls":0}` | ✓ PASS |
| Live RLS policy count | Management API SQL query | `policy_count: 14`, one per tenant table | ✓ PASS |
| arm64 container build (Success Criteria #5) | `docker buildx build --platform linux/arm64 -t turnosbot-bot:arm64-verify --load .` then run + curl `/health`; also `docker compose build && up -d` | Build succeeded (no `EUNSUPPORTEDPROTOCOL`), `arch=arm64 os=linux`, `/health` → HTTP 200 in ~2s, compose healthcheck `healthy` in ~4s (re-verified 2026-07-04 after Dockerfile fix) | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|--------------|-------------|--------------|--------|----------|
| CORE-01 | 01-03, 01-05 | Toda tabla de negocio está aislada por `tenant_id`; ninguna consulta puede leer datos de otro tenant | ✓ SATISFIED | Live `tenant_id` on all business tables; RLS confirmed live; `verify-isolation.ts` passed live. |
| CORE-02 | 01-03, 01-05 | El dashboard aplica RLS por usuario de Supabase Auth (aislamiento enforced por la base) | ✓ SATISFIED | `auth_tenant_id()` resolves from `perfil` via `auth.uid()` (not JWT claim); live cross-tenant write/read blocked. |
| CORE-03 | 01-01, 01-05 | El servicio del bot (service_role) enforcea `tenant_id` en una capa de queries obligatoria, verificada con tests cross-tenant | ✓ SATISFIED | `tenantScoped(tenantId)` bakes `.eq('tenant_id', ...)` into every accessor; live smoke test passed. (Note: code review IN-01 flags that only reads are covered by the layer today — writes are not yet expressible through it. Not a phase-1 blocker since Phase 6 owns booking writes, but worth tracking.) |
| CORE-04 | 01-02, 01-03, 01-05 | Los turnos usan `TIMESTAMPTZ` y timezone del tenant de forma consistente | ✓ SATISFIED | All schedule columns `timestamptz`; live 15:00 AR → 18:00Z → 15:00 round-trip verified; container clock pinned `TZ=UTC` (though the container currently doesn't build — see below). |
| CORE-05 | 01-03, 01-05 | La base impide doble-reserva de un profesional en el mismo rango horario mediante constraint a nivel Postgres | ✓ SATISFIED | Live `EXCLUDE USING gist` constraint confirmed in `pg_constraint`; behaviorally verified live (rejection, boundary, cancel-frees-slot, concurrency). |

All 5 declared requirement IDs (CORE-01..05) are accounted for across the 5 plans — no orphaned requirements found in REQUIREMENTS.md's Phase 1 mapping.

**Important distinction:** every CORE-0X requirement's *data-layer* obligation is satisfied. However, the **ROADMAP phase goal** explicitly bundles in "el esqueleto de infraestructura" (the arm64 container skeleton, Success Criteria #5) as part of what Phase 1 must deliver — and that specific piece has regressed since plan 02 due to plan 05's dependency changes. The requirement-level checklist in REQUIREMENTS.md marks CORE-01..05 all `[x]` Complete, which is accurate for the DB-behavior obligations of each CORE requirement, but the roadmap's Success Criteria #5 (which CORE-04's "esqueleto de infraestructura" language and 01-02-PLAN.md both tie to the arm64 proof) is not currently true.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `Dockerfile` / `docker-compose.yml` | Dockerfile:10,23; docker-compose.yml:6 | No `--platform=linux/arm64` pin (WR-01 from 01-REVIEW.md) | ⚠️ Warning | Not the direct cause of the current failure (we passed `--platform` explicitly to buildx), but compounds the same risk area: a build on a non-ARM CI host would silently produce a mislabeled amd64 image. |
| `apps/bot/src/config/env.ts` | ~20 | `PORT: Number(process.env.PORT ?? 3001)` with no validation (WR-02 from 01-REVIEW.md) | ⚠️ Warning | Empty/non-numeric `PORT` env yields `NaN`/`0` silently; not exercised in this phase's tests but a latent footgun for deployment. |
| `supabase/seed.sql`, `scripts/apply-seed.ts` | whole file (WR-03 from 01-REVIEW.md) | No `horario_trabajo` row seeded for either tenant | ⚠️ Warning | Seeded tenants currently have zero computable availability; flagged by code review as a conscious-deferral risk for when the availability engine (later phase) needs real fixtures. Not a Phase 1 blocker per se. |
| `scripts/apply-seed.ts`, `seed-fixtures.ts` | multiple | Hardcoded sandbox owner passwords committed (IN-04) | ℹ️ Info | Low severity — sandbox-only `@turnosbot-seed.test` accounts; flagged for cleanup before production. |
| `supabase/tests/test_0001_schema_core.sh` | 72 | Self-referential grep pattern trips its own contamination check | ℹ️ Info | False positive only (the grep pattern itself contains the search strings) — no actual cross-project contamination found anywhere in `apps/`, `packages/`, `supabase/`, `scripts/`, `.env.example`. |

No critical/blocker anti-patterns beyond the arm64 build regression already captured as a gap above.

### Human Verification Required

None. All Success Criteria are either behaviorally verifiable (and were, live) or clearly falsifiable via a deterministic command (the arm64 build), which was also run live. No visual, UX, or subjective-judgment items exist in this phase's scope.

### Gaps Summary

Phase 1's data-integrity foundation — the actual "aislamiento por tenant, timezone correcto, protección anti-doble-reserva" language in the phase goal — is solid and independently re-verified live against the real `bdgufnitakelyialjoqg` database: RLS isolation, timezone round-trip, and GiST double-booking rejection all passed when re-run just now, not merely trusted from the SUMMARYs.

The one real gap is **Success Criteria #5** (the arm64 container proof), which is also explicitly named in the phase goal ("el esqueleto de infraestructura"). Plan 01-02 proved it correctly at the time it ran. Plan 01-05 then added `@turnosbot/db-types: workspace:*` and `@supabase/supabase-js` to `apps/bot/package.json` (needed for the CORE-03 tenantScoped layer) without updating the Dockerfile to be workspace-aware — the Dockerfile still does an isolated `npm install` against only `apps/bot/package.json`, which cannot resolve the `workspace:*` protocol. Re-running the exact plan-02 verification command right now, against the current repo state, reproducibly fails at `npm install`. This means the phase, AS IT STANDS TODAY, does not satisfy Success Criteria #5 — even though it did at one point mid-phase.

This is a single, well-scoped, mechanical gap (fix the Dockerfile to build via the pnpm workspace instead of a standalone npm install) — not a design flaw. Recommend a small closure plan for Phase 1 (or an explicit deferral to Phase 2's infra work, if the team decides the ARM proof can be finalized once more workspace deps land) before closing this phase.

---

_Verified: 2026-07-04T14:00:00Z_
_Verifier: Claude (gsd-verifier)_
