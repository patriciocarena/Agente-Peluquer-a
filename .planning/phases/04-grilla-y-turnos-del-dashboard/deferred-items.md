# Deferred Items — Phase 04 (grilla-y-turnos-del-dashboard)

Items discovered during execution that are out of scope for the current plan
(pre-existing, unrelated to the files being changed) and are NOT auto-fixed
per the Scope Boundary rule.

## 04-07: `pnpm --filter @turnosbot/dashboard build` fails on `/admin/[tenantId]` without real Supabase credentials

**Discovered during:** Plan 04-07, Task 3 verification (`pnpm build`).

**Symptom:** `next build` (Turbopack) fails at the "Collecting page data" step
with:
```
Error: SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY son obligatorias para el
cliente service_role del dashboard (apps/dashboard/lib/supabase/admin.ts).
```

**Root cause:** `apps/dashboard/lib/supabase/admin.ts` (Phase 02 Plan 08,
superadmin panel — SADMIN-01/02) throws at module-evaluation time if
`SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` are not set. This repo has no real
`.env` file in this execution environment (documented in STATE.md as an
existing blocker: "Plan 02-08 pausado en Task 3 ... requiere `.env`"). This
is unrelated to `/turnos` or any file this plan (04-07) touches.

**Verification performed:**
- `pnpm --filter @turnosbot/dashboard build` WITHOUT env vars: fails exactly
  as above, but only after "✓ Compiled successfully" and "Finished
  TypeScript" both pass — i.e., `/turnos` and every other route compile with
  zero errors; the failure is isolated to `/admin/[tenantId]`'s page-data
  collection step.
- `pnpm --filter @turnosbot/dashboard build` WITH ephemeral dummy env vars
  (`SUPABASE_URL=http://localhost:54321 SUPABASE_SERVICE_ROLE_KEY=dummy...`,
  never committed, only exported in the shell for this one verification run):
  completes successfully end-to-end, listing `/turnos` as a working dynamic
  (ƒ) route alongside all other routes.

**Status:** Deferred — not fixed. Will resolve itself once real
`SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` are present in `.env` for an
actual `pnpm build` run (e.g. in CI or on the VPS), same as the existing
Plan 02-08 blocker already tracked in `STATE.md`.
