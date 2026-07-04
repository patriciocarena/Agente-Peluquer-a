---
phase: 01-fundaci-n-multitenant
plan: 01
subsystem: infra
tags: [pnpm, monorepo, typescript, workspace, scaffolding]

# Dependency graph
requires: []
provides:
  - "pnpm workspace root (pnpm-workspace.yaml, package.json, .npmrc)"
  - "Shared strict TS base config (tsconfig.base.json) + root composite tsconfig.json"
  - "packages/availability-engine stub (computeSlots type signature, no implementation)"
  - "packages/db-types stub (single shared type source, foundation for CORE-03)"
  - "packages/shared stub (es-AR/ARS/timezone constants)"
  - "apps/dashboard stub (Next.js 16.2.x + @supabase/ssr + @supabase/supabase-js declared, no app code)"
affects: [01-02, phase-02-dashboard, phase-03-availability-engine, phase-04-db-schema]

# Tech tracking
tech-stack:
  added: ["pnpm@9.15.0 workspaces", "typescript@^5.7.3 (resolved 5.9.3)", "next@^16.2.10 (declared, not installed as app code)", "@supabase/ssr@^0.12.0 (declared)", "@supabase/supabase-js@^2.110.0 (declared)"]
  patterns: ["Monorepo: apps/* + packages/* pnpm workspace globs", "@turnosbot/* package scope for all internal packages", "tsconfig.base.json extended by every package (strict, ES2022, NodeNext)", "Root tsconfig.json uses TS project references (composite) for `tsc -b` orchestration; apps/dashboard excluded from composite graph (noEmit, typechecked independently via `next build`/`tsc --noEmit`)"]

key-files:
  created:
    - pnpm-workspace.yaml
    - package.json
    - tsconfig.base.json
    - tsconfig.json
    - .npmrc
    - apps/dashboard/package.json
    - apps/dashboard/tsconfig.json
    - apps/dashboard/app/placeholder.ts
    - packages/availability-engine/package.json
    - packages/availability-engine/src/index.ts
    - packages/availability-engine/tsconfig.json
    - packages/db-types/package.json
    - packages/db-types/src/index.ts
    - packages/db-types/tsconfig.json
    - packages/shared/package.json
    - packages/shared/src/index.ts
    - packages/shared/tsconfig.json
  modified:
    - .gitignore

key-decisions:
  - "Root tsconfig.json added (not in original files_modified list) to give `pnpm -w exec tsc -b` a composite build target — required for the plan's acceptance criteria; only packages/* are referenced, apps/dashboard is deliberately excluded from the composite graph since Next.js apps typecheck via their own tsc --noEmit / next build, not TS project references."
  - "apps/dashboard/app/placeholder.ts added as a minimal stub input file so `tsc --noEmit` has something to typecheck — the plan explicitly wants zero app code, but a totally empty package.json-only directory produces TS18003 (no inputs found) when typechecked standalone."
  - "*.tsbuildinfo added to .gitignore — tsc -b build cache artifacts, must not be committed."

requirements-completed: [CORE-03]

# Metrics
duration: 12min
completed: 2026-07-04
---

# Phase 1 Plan 01: pnpm Monorepo Scaffolding Summary

**pnpm workspace (apps/*, packages/*) with strict shared tsconfig, three zero-logic @turnosbot/* package stubs (availability-engine, db-types, shared), and a Next.js 16.2.x dashboard stub — the single shared type source (db-types) that CORE-03's tenant-scoped query layer will build on.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-07-04T12:33:00Z
- **Completed:** 2026-07-04T12:45:36Z
- **Tasks:** 1
- **Files modified:** 19 (18 created, 1 modified)

## Accomplishments
- pnpm workspace installs cleanly (5 workspace projects resolved: root + 3 packages + dashboard)
- `pnpm -w exec tsc -b` passes with zero errors across the composite package graph
- All three shared packages (`availability-engine`, `db-types`, `shared`) exist as valid, typecheckable stubs with zero business logic
- `apps/dashboard` exists as a stub declaring its real dependency set (Next 16.2.x, @supabase/ssr, @supabase/supabase-js) without any premature UI code
- Zero cross-project contamination confirmed via grep gate (no restaurant-project identifiers anywhere in apps/packages)

## Task Commits

Each task was committed atomically:

1. **Task 1: pnpm workspace root + shared package/dashboard stubs** - `3c867e0` (feat)

**Plan metadata:** (pending — see below)

## Files Created/Modified
- `pnpm-workspace.yaml` - Workspace globs: `apps/*`, `packages/*`
- `package.json` - Root package: private, packageManager pinned (pnpm@9.15.0), engines.node >=24, build/typecheck scripts
- `tsconfig.base.json` - Shared strict TS config (ES2022, NodeNext, strict:true) extended by every package
- `tsconfig.json` - Root composite project references (packages/* only) so `tsc -b` has a build target
- `.npmrc` - `engine-strict=true`
- `apps/dashboard/package.json` - Declares Next.js 16.2.x + @supabase/ssr + @supabase/supabase-js + workspace deps; no app code
- `apps/dashboard/tsconfig.json` - Next-flavored tsconfig extending base (jsx preserve, Bundler resolution, noEmit)
- `apps/dashboard/app/placeholder.ts` - Minimal stub input so standalone `tsc --noEmit` has something to check
- `packages/availability-engine/src/index.ts` - `computeSlots()` type signature stub, throws until real logic lands
- `packages/db-types/src/index.ts` - Placeholder `Database` type re-export; real generated types land in a later plan
- `packages/shared/src/index.ts` - `DEFAULT_LOCALE`/`DEFAULT_TIMEZONE`/`DEFAULT_CURRENCY` constants (es-AR, America/Argentina/Buenos_Aires, ARS)
- `.gitignore` - Added `*.tsbuildinfo` to exclude tsc build cache artifacts

## Decisions Made
- Added a root `tsconfig.json` with TS project references (not originally listed in `files_modified`) because the acceptance criteria requires `pnpm -w exec tsc -b` to exit 0, and `tsc -b` needs a composite build entry point. Scoped references to `packages/*` only — `apps/dashboard` is intentionally left out of the composite graph since Next.js apps aren't typically wired into `tsc -b` project references (they typecheck via `next build` / their own `tsc --noEmit`).
- Added `apps/dashboard/app/placeholder.ts` so the dashboard package has at least one valid `.ts` input — without it, a standalone `tsc --noEmit` on the dashboard fails with TS18003 ("no inputs found"), which would silently mask real future dashboard type errors once Phase 2 adds app code. This is a one-line `export {}` stub, zero business logic, consistent with the plan's stub-only intent for this package.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added root tsconfig.json for `tsc -b` build target**
- **Found during:** Task 1 (verification step — running `pnpm -w exec tsc -b`)
- **Issue:** The plan's `files_modified` list did not include a root `tsconfig.json`, but without one, `tsc -b` has no composite project to build against and the acceptance criterion `pnpm -w exec tsc -b` (or `--dry`) exits 0` cannot be satisfied.
- **Fix:** Created `tsconfig.json` at repo root with `references` to the three `packages/*` directories (each already marked `composite: true` via `tsconfig.base.json`).
- **Files modified:** `tsconfig.json` (new)
- **Verification:** `pnpm -w exec tsc -b --pretty` exits 0 with no output.
- **Committed in:** `3c867e0` (Task 1 commit)

**2. [Rule 3 - Blocking] Added dashboard placeholder.ts for standalone typecheck**
- **Found during:** Task 1 (verification — spot-checking `apps/dashboard` typechecks independently)
- **Issue:** `apps/dashboard` had a `package.json` and `tsconfig.json` but zero `.ts`/`.tsx` files, causing `tsc --noEmit` to fail with TS18003 ("No inputs were found").
- **Fix:** Added a one-line `apps/dashboard/app/placeholder.ts` (`export {}`) documented as a temporary stub, to be removed once Phase 2 adds real app code.
- **Files modified:** `apps/dashboard/app/placeholder.ts` (new)
- **Verification:** `pnpm --filter @turnosbot/dashboard exec tsc --noEmit --pretty` exits 0.
- **Committed in:** `3c867e0` (Task 1 commit)

**3. [Rule 3 - Blocking] Added `*.tsbuildinfo` to .gitignore**
- **Found during:** Task 1 (post-verification `git status` check, per task_commit_protocol step 7)
- **Issue:** Running `tsc -b` generated `.tsbuildinfo` cache files in each package directory, which showed up as untracked files.
- **Fix:** Removed the generated `.tsbuildinfo` files and added `*.tsbuildinfo` to `.gitignore` so future builds don't leave untracked build artifacts.
- **Files modified:** `.gitignore`
- **Verification:** `git status --short` shows no untracked files after the fix.
- **Committed in:** `3c867e0` (Task 1 commit)

---

**Total deviations:** 3 auto-fixed (all Rule 3 - blocking issues necessary to satisfy the plan's own acceptance criteria)
**Impact on plan:** All three fixes were required for `pnpm install` + `pnpm -w exec tsc -b` to actually pass as specified in `<verify>`. No scope creep — no business logic was added, no files outside the immediate blocking-issue scope were touched.

## Issues Encountered
None beyond the deviations documented above.

## User Setup Required
None - no external service configuration required. This plan is pure scaffolding with no Supabase/WhatsApp/Gemini credentials needed.

## Next Phase Readiness
- The pnpm workspace is fully installable and typechecks clean — ready for Plan 01-02 (apps/bot + arm64 Docker proof) to add its own workspace member without touching any file this plan owns (zero overlap, confirmed by disjoint `files_modified` lists).
- `packages/db-types` is in place as the single shared type source; Phase 1's later plan (schema/migrations) will replace its placeholder `Database` type with real `supabase gen types typescript` output — both `apps/dashboard` and `apps/bot` (once created) should import exclusively from `@turnosbot/db-types`, never redefine row types locally.
- `packages/availability-engine`'s `computeSlots()` stub establishes the exact signature (`ComputeSlotsInput` → `Promise<AvailableSlot[]>`) that the real implementation (later phase) and both consumers (bot tool, dashboard grid) will conform to.
- No blockers for Plan 01-02 or subsequent Phase 1 plans.

---
*Phase: 01-fundaci-n-multitenant*
*Completed: 2026-07-04*

## Self-Check: PASSED

All 19 key files verified present on disk (18 created + .gitignore modified). Commit hash `3c867e0` verified present in git log. `pnpm install` and `pnpm -w exec tsc -b` both re-verified passing at self-check time.
