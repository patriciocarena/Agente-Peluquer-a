---
phase: 01-fundaci-n-multitenant
reviewed: 2026-07-04T00:00:00Z
depth: standard
files_reviewed: 15
files_reviewed_list:
  - apps/bot/src/config/env.ts
  - apps/bot/src/db/client.ts
  - apps/bot/src/db/tenantScoped.ts
  - apps/bot/src/db/tenantScoped.test.ts
  - apps/bot/src/server.ts
  - scripts/apply-seed.ts
  - scripts/seed-fixtures.ts
  - scripts/verify-double-booking.ts
  - scripts/verify-isolation.ts
  - scripts/verify-timezone.ts
  - supabase/migrations/0001_schema_core.sql
  - supabase/migrations/0002_rls_policies.sql
  - supabase/seed.sql
  - Dockerfile
  - docker-compose.yml
findings:
  critical: 0
  warning: 3
  info: 6
  total: 9
status: issues_found
---

# Phase 1: Code Review Report

**Reviewed:** 2026-07-04T00:00:00Z
**Depth:** standard
**Files Reviewed:** 15
**Status:** issues_found

## Summary

Phase 1 (multitenant foundation) is well-executed. The core isolation guarantees are structurally sound:

- **RLS (dashboard path):** Every tenant-scoped table enables RLS with an identical `tenant_id = auth_tenant_id()` predicate for both `USING` and `WITH CHECK`. The tenant is resolved from the caller's own `perfil` row via a `SECURITY DEFINER` function hardened with `SET search_path = ''` and `EXECUTE` granted only to `authenticated` — the correct mitigation for both self-referential policy recursion and search-path hijacking. No token-claim or relaxed-role branch exists anywhere. Correct.
- **service_role path (bot):** `tenantScoped(tenantId)` bakes `.eq('tenant_id', tenantId)` into every accessor, making an unscoped query through the layer structurally impossible. `client.ts` fails closed if the service_role key is missing and is documented server-only. Correct.
- **Anti-double-booking:** The `EXCLUDE USING gist` constraint on `turno` with `WHERE (estado != 'cancelado')` and `tstzrange(inicio, fin, '[)')` correctly handles boundary-touching (D-11), cancellation freeing slots (D-10), and concurrency at the DB level. Correct.
- **Timezone:** No hardcoded `-3` offset in code; `verify-timezone.ts` converts via `Intl.DateTimeFormat` with `timeZone`, and schedule columns are `timestamptz`. Correct.

The findings below are all Warning/Info. The most consequential is the arm64 build target: the Dockerfile and compose file tag the image `arm64` but never pin `--platform linux/arm64`, so a build on a non-ARM host silently produces a mislabeled amd64 image that will not run on the Oracle ARM VPS.

## Warnings

### WR-01: Dockerfile / compose tag image "arm64" but never pin the ARM platform

**File:** `Dockerfile:10`, `Dockerfile:23`, `docker-compose.yml:6`
**Issue:** The image is tagged `turnosbot-bot:arm64` and the file header states "arm64 target: Oracle Cloud VPS", but neither `FROM node:24` line pins `--platform=linux/arm64`, and `docker-compose.yml` has no `platform:` key. Per the project's own stack notes ("confirm `--platform linux/arm64` is used ... pin explicitly in Compose/CI if you ever build off-VPS"), building on an amd64 host (any typical CI runner or an Intel Mac) yields an amd64 image mislabeled `arm64` that fails at runtime on the ARM VPS with an exec-format error. Relying on the default host-arch behavior is exactly the silent-mislabel trap the stack guidance warns against.
**Fix:** Pin the platform explicitly so the tag cannot lie:
```dockerfile
FROM --platform=linux/arm64 node:24 AS build
# ...
FROM --platform=linux/arm64 node:24 AS runtime
```
and in `docker-compose.yml`:
```yaml
services:
  bot:
    platform: linux/arm64
    build:
      context: .
      dockerfile: Dockerfile
```
(If images are always built on the ARM VPS itself, document that assumption in the header; but pinning is cheap insurance and matches the stated stack convention.)

### WR-02: PORT env parsing yields NaN on non-numeric input, crashing listen with an opaque error

**File:** `apps/bot/src/config/env.ts:20`
**Issue:** `PORT: Number(process.env.PORT ?? 3001)`. If `PORT` is set but non-numeric (e.g. a typo, or an accidental `"3001 "` with whitespace that is actually fine, but `"$PORT"` unexpanded, or an empty string `""` which coerces to `0`), `Number()` returns `NaN` (or `0` for empty string). Fastify's `listen({ port: NaN })` then fails with a low-level error that does not point back to the misconfigured env var, making the misconfiguration hard to diagnose. Empty string is the most likely footgun: `Number("")` is `0`, which binds a random port silently.
**Fix:** Validate after parsing and fail loudly:
```ts
const rawPort = process.env.PORT ?? "3001";
const PORT = Number(rawPort);
if (!Number.isInteger(PORT) || PORT <= 0 || PORT > 65535) {
  throw new Error(`PORT inválido: "${rawPort}" (debe ser un entero 1-65535).`);
}
return { PORT, /* ... */ };
```

### WR-03: Seed data omits `horario_trabajo`, so the seeded tenants have zero availability

**File:** `supabase/seed.sql` (whole file), `scripts/apply-seed.ts:108-172`
**Issue:** Both seed paths create `tenant`, `negocio`, `profesional`, `servicio`, `cliente`, and `turno`, but neither inserts any `horario_trabajo` row. The availability engine (documented as `horario de trabajo − bloqueos − turnos`) will compute an empty set of slots for every seeded professional once implemented. This is arguably in-scope-later (the engine is a stub this phase), but the seed is explicitly meant to let end-to-end booking be verified against live data (D-16); a fixture with no work hours cannot exercise the core value path when it lands. Flagging so it is a conscious deferral, not a silent gap discovered in Phase 6.
**Fix:** Add at least one `horario_trabajo` row per seeded professional (e.g. Mon–Sat 09:00–18:00) to both `supabase/seed.sql` and the `upsertTenant` function in `apply-seed.ts`, keeping the two byte-consistent as the file already promises. If deliberately deferred, add a comment in `seed.sql` stating that work hours are seeded in a later phase.

## Info

### IN-01: `tenantScoped` accessors return a builder that already has `.select("*")`, forcing a redundant second `.select` at call sites

**File:** `apps/bot/src/db/tenantScoped.ts:26-42`, `apps/bot/src/db/tenantScoped.test.ts:38`
**Issue:** Each accessor returns `supabaseAdmin.from(x).select("*").eq("tenant_id", tenantId)`. Callers that need a filtered/projected read must re-call `.select(...)`, which the smoke test does (`tenantScoped(A).turnos().select("*")`), issuing a builder with two `select` calls. It works, but baking `select("*")` in means the layer commits to a full-column read and mutations (`insert`/`update`/`delete` scoped by tenant) are not expressible through it at all — every write will have to bypass the layer and re-implement the `.eq('tenant_id')` guard, defeating the "structurally impossible to forget" goal for the write path.
**Fix:** Return a thinner scoped handle, e.g. `turnos: () => supabaseAdmin.from("turno")` paired with a helper that appends `.eq("tenant_id", tenantId)`, or expose explicit `select/insert/update/delete` variants per table so writes are also tenant-guarded by construction. Revisit when Phase 6 wires booking writes.

### IN-02: `profesional_servicio` uniqueness and several tables scope constraints without `tenant_id`

**File:** `supabase/migrations/0001_schema_core.sql:167` (`profesional_servicio_unica UNIQUE (profesional_id, servicio_id)`)
**Issue:** The unique constraint omits `tenant_id`. It is not exploitable (both `profesional_id` and `servicio_id` are globally-unique UUIDs FK'd to tenant-scoped rows, so a cross-tenant collision is impossible), but it is inconsistent with the tenant-first modeling elsewhere and offers no defense-in-depth if a future insert ever set a mismatched `tenant_id` relative to its FK targets. Note there is no DB-level check that `profesional_servicio.tenant_id` matches `profesional.tenant_id`/`servicio.tenant_id`; likewise `turno.tenant_id` vs its `profesional_id`/`cliente_id` tenants. RLS (dashboard) and `tenantScoped` (bot) both enforce this at the app layer, so this is defense-in-depth only.
**Fix:** Optionally add composite FKs or a trigger asserting `tenant_id` consistency across related rows, or include `tenant_id` in the unique constraint. Low priority given the UUID globality; document the reliance on app-layer enforcement.

### IN-03: Redundant index on `tenant.whatsapp_phone_number_id` (column is already UNIQUE)

**File:** `supabase/migrations/0001_schema_core.sql:41`, `supabase/migrations/0001_schema_core.sql:56`
**Issue:** `whatsapp_phone_number_id` is declared `UNIQUE`, which already creates a backing btree index. The explicit `CREATE INDEX idx_tenant_whatsapp_phone_number_id` duplicates it, adding write overhead and storage for no query benefit.
**Fix:** Drop `idx_tenant_whatsapp_phone_number_id`; the unique constraint's index already serves point lookups by phone-number-id (the webhook routing key).

### IN-04: Hardcoded seed owner passwords committed to the repo

**File:** `scripts/apply-seed.ts:82`, `scripts/apply-seed.ts:105`, `scripts/seed-fixtures.ts:16`, `scripts/seed-fixtures.ts:27`
**Issue:** `ownerPassword` literals (`TurnosBotSeed!Norte1`, `TurnosBotSeed!Sur1`) are committed. These are sandbox fixtures for `@turnosbot-seed.test` accounts on a non-production sandbox project, so severity is low — but they are real, working credentials for real Supabase Auth users on the live `bdgufnitakelyialjoqg` project. If that project is ever promoted toward production, or the anon endpoint is reachable, these accounts grant tenant-owner access.
**Fix:** Acceptable for a sandbox fixture as-is. Before any production use: delete these seed auth users, or generate the passwords at runtime and print (not commit) them. Add a comment marking these accounts as sandbox-only and slated for deletion pre-launch.

### IN-05: `apply-seed.ts` duplicates the entire seed dataset that already lives in `seed.sql`

**File:** `scripts/apply-seed.ts:62-106`, `supabase/seed.sql`
**Issue:** The tenant/negocio/servicio/turno values are maintained in two places (`seed.sql` and the `TENANT_A`/`TENANT_B` objects in `apply-seed.ts`), with a comment promising they stay "byte-identical". The three fixed identities are additionally in `seed-fixtures.ts`. Manual byte-consistency across three files is a drift hazard (e.g. WR-03's missing `horario_trabajo`, or a price edit in one file only).
**Fix:** Have `apply-seed.ts` and the verify scripts import the shared constants from `seed-fixtures.ts` (already the single source for IDs) and extend that module to hold the full row values, so the SQL file and the TS applier derive from one definition. Longer term, generate `seed.sql` from the TS fixtures or vice-versa.

### IN-06: `apply-seed.ts` uses `auth.admin.listUsers()` without pagination to find an existing owner

**File:** `scripts/apply-seed.ts:176-178`
**Issue:** `listUsers()` returns only the first page (default 50). The idempotent "find existing owner by email" lookup will miss an existing user once the project accumulates more than one page of auth users, causing a duplicate `createUser` attempt (which then errors on the unique email). Harmless at two seeded users today; a latent bug as the project grows.
**Fix:** Use `getUserByEmail` if available in the installed SDK version, or paginate `listUsers({ page, perPage })` until the email is found or the pages are exhausted.

---

_Reviewed: 2026-07-04T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
