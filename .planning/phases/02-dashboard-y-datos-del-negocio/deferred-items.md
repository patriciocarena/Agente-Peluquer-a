# Deferred Items — Phase 02 (dashboard-y-datos-del-negocio)

Items discovered during plan execution that are out of scope for the plan
that discovered them. Not fixed inline (scope boundary rule); logged here
for a future plan/phase to address.

## From Plan 02-03 (auth + isolation layer)

- **`scripts/verify-isolation.ts` (Phase 1) is stale post-migration-0003.**
  It asserts `tenant_id` directly on `negocio`, `profesional`, `servicio`,
  `cliente`, `turno` — but migration 0003 (Plan 02-01) dropped `tenant_id`
  from every operational table (`profesional`, `servicio`, `cliente`,
  `turno`, etc.) in favor of `negocio_id` (see 02-01-SUMMARY.md). Running
  this script live today would fail or throw on the missing column.
  `scripts/verify-dashboard-isolation.ts` (this plan) is the intended
  post-0003 replacement for the dashboard's RLS-isolation check (AUTH-03).
  `scripts/verify-isolation.ts` itself was out of this plan's
  `files_modified` scope — not touched. A future plan/phase should either
  update or retire it to avoid confusion about which script is the source
  of truth for cross-tenant isolation checks.

- **`middleware.ts` deprecation warning (Next.js 16.2.10).** `next build`
  emits: `The "middleware" file convention is deprecated. Please use
  "proxy" instead.` The file still builds and functions correctly (route
  shows as `ƒ Proxy (Middleware)` in the build output) — this is a
  soft/forward-looking deprecation, not a functional break. The plan's
  frontmatter and 02-RESEARCH.md Pattern 2 both explicitly specify
  `middleware.ts` by name, so this plan kept that filename. A future
  cleanup pass (any phase touching this file) should evaluate renaming to
  `proxy.ts` per current Next.js guidance, once Supabase's own `@supabase/ssr`
  docs/examples catch up to the new convention.
