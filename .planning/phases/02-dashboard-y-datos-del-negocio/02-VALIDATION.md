---
phase: 2
slug: dashboard-y-datos-del-negocio
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-04
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None installed yet anywhere in the monorepo (`apps/bot` has one ad-hoc `tsx`-run smoke test with no framework; `apps/dashboard` has zero test files). Recommend **Vitest** (`4.1.9`), ESM-native, officially documented for Next.js App Router. |
| **Config file** | none yet — Wave 0 must add `apps/dashboard/vitest.config.ts` |
| **Quick run command** | `pnpm --filter @turnosbot/dashboard exec vitest run --silent` (once configured) |
| **Full suite command** | `pnpm -r --if-present run test` (once each package's `package.json` gets a `test` script) |
| **Estimated runtime** | ~30-60 seconds (unit) + integration scripts against live `bdgufnitakelyialjoqg` (slower, credential-gated) |

---

## Sampling Rate

- **After every task commit:** run the relevant unit test file (`vitest run <path>`) for pure-logic changes; skip live-DB integration scripts per-commit (slower, need credentials).
- **After every plan wave:** run the full Vitest suite + all `scripts/verify-*.ts` integration scripts against the live `bdgufnitakelyialjoqg` project.
- **Before `/gsd-verify-work`:** full suite green (including all integration scripts) and migration `0003` applied + verified live.
- **Max feedback latency:** ~60 seconds (unit); integration scripts are run per-wave, not per-commit.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 02-01-BLOCKING | 02-01 | 1 | schema prerequisite | — | Migration `0003_tenant_negocio_split.sql` applied + RLS rewritten to `auth_negocio_ids()` before any CRUD task | integration | `pnpm exec tsx scripts/verify-migration-0003.ts` | ✅ creado por 02-01 (Task 2; corre en el checkpoint humano Task 3) | ⬜ pending |
| 02-AUTH-01/02 | 02-03 | 2 | AUTH-01/AUTH-02 | — | Login persists session across refresh | integration (real live DB, mirrors Phase 1's `tenantScoped.test.ts` style) | `pnpm exec tsx scripts/verify-auth-login.ts` | ✅ creado por 02-03 (Task 3; corre en el merge de wave) | ⬜ pending |
| 02-AUTH-03 | 02-03 | 2 | AUTH-03 | T-02-01 | Owner A cannot see/query Negocio B's data via the dashboard client (isolation now by `negocio_id IN (SELECT auth_negocio_ids())`, not raw `tenant_id`) | integration, reuses/extends seeded fixtures from `scripts/seed-fixtures.ts` (post-`0003` shape) | `pnpm exec tsx scripts/verify-dashboard-isolation.ts` | ✅ creado por 02-03 (Task 3; corre en el merge de wave) | ⬜ pending |
| 02-AUTH-04 | TBD | TBD | AUTH-04 | — | Logout clears session from any page | manual / smoke (low risk, trivial Server Action) | manual QA per `02-UI-SPEC.md` copywriting contract | n/a — manual-only, low risk justifies it | ⬜ pending |
| 02-PRO/SVC/BIZ | TBD | TBD | PRO-01..04, SVC-01..02, BIZ-01..03 | — | zod schema validation rejects invalid input (e.g., negative `precio`, `hora_fin <= hora_inicio`) | unit | `pnpm --filter @turnosbot/dashboard exec vitest run lib/schemas` | ❌ W0 | ⬜ pending |
| 02-SVC-02 | TBD | TBD | SVC-02 | — | Reordering persists `orden` correctly (no gaps/dupes after reorder) | unit (pure function: given old array + drag event, assert new `orden` assignment) | `pnpm --filter @turnosbot/dashboard exec vitest run lib/reorder` | ❌ W0 | ⬜ pending |
| 02-SADMIN | TBD | TBD | SADMIN-01/02/03 | T-02-02 | Superadmin can create a Tenant(`nombre`) + Negocio(s)+owner atomically; owner role can never reach `/admin`; a failed creation rolls back the auth user | integration (service_role, real live DB) | `pnpm exec tsx scripts/verify-admin-tenant-lifecycle.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*Task IDs are placeholders — the planner assigns real `{N}-{plan}-{task}` IDs; this map exists to guarantee every requirement + the blocking migration has a verification path before planning locks it in.*

---

## Wave 0 Requirements

- [ ] **`supabase/migrations/0003_tenant_negocio_split.sql`** — the blocking migration itself (spec: `02-HANDOFF.md` §4). Must run before any other Wave in this phase.
- [ ] `scripts/verify-migration-0003.ts` — confirms post-migration shape live: `tenant` has only `nombre`/`activo`/timestamps, `negocio` has the WhatsApp columns + `activo`, all 11 operational tables have `negocio_id` NOT NULL with `tenant_id` dropped, RLS policies use `auth_negocio_ids()`.
- [ ] `apps/dashboard/vitest.config.ts` + `vitest` added to `apps/dashboard/package.json` devDependencies — no test framework exists yet anywhere for this app.
- [ ] `scripts/verify-dashboard-isolation.ts` — covers AUTH-03 against the post-`0003` shape.
- [ ] `scripts/verify-admin-tenant-lifecycle.ts` — covers SADMIN-01/02/03, including the compensating-rollback path (Pattern 3, Tenant→Negocio(s) onboarding).
- [ ] `lib/schemas/*.test.ts` — one file per zod schema (profesional, servicio, negocio, tenant-admin, negocio-admin).
- [ ] Superadmin bootstrap script (`scripts/apply-superadmin-seed.ts` or similar) — prerequisite for the SADMIN test scripts to have a superadmin session to authenticate as.
- [ ] `packages/db-types` regenerated (`supabase gen types typescript`) against the post-`0003` live schema — every dashboard query in later waves depends on these types being current.
- [ ] `scripts/seed-fixtures.ts` updated to the Tenant(`nombre`) → Negocio(s) shape (decide at planning: keep 2 tenants of 1 negocio each, or 1 tenant with 2 negocios, per `02-HANDOFF.md` §4 step 8).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Logout from any page | AUTH-04 | Trivial Server Action, low risk, not worth an integration script | Log in, navigate to any owner/admin page, click "Cerrar sesión", confirm redirect to `/login` and session cookie cleared |
| Negocio selector UX (collapse to fixed label when 1 negocio) | D-13 / BIZ | Visual/interaction behavior, not a pure-logic unit | Manually test with a 1-negocio tenant and a 2+-negocio tenant per `02-UI-SPEC.md` |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (including the `0003` migration itself) — `verify-migration-0003.ts` created by 02-01, `verify-auth-login.ts` + `verify-dashboard-isolation.ts` created by 02-03
- [x] No watch-mode flags
- [x] Feedback latency < 60s (unit); integration scripts run per-wave
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved (planning) — 2026-07-04. `wave_0_complete` stays false until the Wave 0 tasks execute live against `bdgufnitakelyialjoqg`.
