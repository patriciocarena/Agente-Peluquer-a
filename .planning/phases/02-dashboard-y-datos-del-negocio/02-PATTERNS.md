# Phase 2: Dashboard y datos del negocio - Pattern Map

**Mapped:** 2026-07-04
**Files analyzed:** ~30 (new dashboard app code + 1 migration)
**Analogs found:** 5 (in-repo) / 30 — this phase is greenfield UI code with almost no in-repo analog; RESEARCH.md's Architecture Patterns (already vetted against official docs) are the primary source for net-new Next.js/React code. This file cross-references RESEARCH.md sections instead of duplicating its code blocks verbatim.

## Context: why analog coverage is low

`apps/dashboard` today is a stub (`app/placeholder.ts` only — see `apps/dashboard/package.json` description: "Stub: dependencias declaradas, sin código de app aún"). There is no existing Next.js App Router code, no Server Actions, no shadcn component, no CRUD page anywhere in this repo. The only real in-repo analogs for this phase are:

1. **`apps/bot/src/db/client.ts`** — the service_role-client-isolation pattern (directly reusable for `lib/supabase/admin.ts`).
2. **`apps/bot/src/db/tenantScoped.ts`** — the "bake the tenant filter into every accessor, make unscoped queries impossible" pattern (informs `/admin` route service_role query style, and the general philosophy behind RLS-scoped queries).
3. **`apps/bot/src/config/env.ts`** — the single-env-access-point pattern.
4. **`supabase/migrations/0002_rls_policies.sql`** — the RLS/SECURITY DEFINER helper pattern, naming conventions (`*_aislamiento` policies), and the exact shape `0003` must extend (`auth_negocio_ids()` alongside `auth_tenant_id()`).
5. **`supabase/migrations/0001_schema_core.sql`** — table shapes for the `0003` migration to alter.

For everything else (Next.js middleware, Supabase SSR clients, Server Actions, shadcn CRUD forms, dnd-kit reordering, superadmin compensating-transaction flow), **use RESEARCH.md's Architecture Patterns 1–3 and Code Examples verbatim** — they are sourced from official docs (Supabase SSR guide, Admin API reference) and there is no in-repo precedent to prefer over them. Do not treat this as a gap requiring further searching: greenfield stub + externally-sourced, doc-verified patterns is the expected and correct state for this phase.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `supabase/migrations/0003_tenant_negocio_split.sql` | migration | batch/transform | `supabase/migrations/0001_schema_core.sql` + `0002_rls_policies.sql` | exact (same repo, same migration series) |
| `packages/db-types/src/database.types.ts` (regenerated) | model | transform | itself (regeneration, not a rewrite) | exact |
| `apps/dashboard/lib/supabase/server.ts` | service | request-response | RESEARCH.md Pattern 1 (`lib/supabase/server.ts` example) | no in-repo analog — use RESEARCH.md verbatim |
| `apps/dashboard/lib/supabase/client.ts` | service | request-response | RESEARCH.md Pattern 1 (browser client, official `@supabase/ssr` docs pattern) | no in-repo analog |
| `apps/dashboard/lib/supabase/admin.ts` | service | request-response | `apps/bot/src/db/client.ts` (service_role client isolation) | role-match, strong |
| `apps/dashboard/middleware.ts` | middleware | request-response | RESEARCH.md Pattern 2 (session refresh + role gate) | no in-repo analog |
| `apps/dashboard/lib/auth/require-role.ts` | utility | request-response | `apps/bot/src/db/tenantScoped.ts` (make bypassing the rule structurally impossible) philosophy; concretely RESEARCH.md Pattern 2 | partial |
| `apps/dashboard/app/(auth)/login/page.tsx` | component | request-response | RESEARCH.md Pattern 1 (`signInWithPassword` flow) | no in-repo analog |
| `apps/dashboard/app/actions/auth.ts` | controller (Server Action) | request-response | RESEARCH.md Pattern 1/2 | no in-repo analog |
| `apps/dashboard/app/(owner)/layout.tsx` | component | request-response | 02-UI-SPEC.md shell spec (see canonical_refs) | no in-repo analog |
| `apps/dashboard/app/(owner)/profesionales/page.tsx` + `nuevo/page.tsx` + `[id]/editar/page.tsx` | component + controller | CRUD | RESEARCH.md Code Examples (zod schema) + 02-UI-SPEC.md CRUD pattern | no in-repo analog |
| `apps/dashboard/app/(owner)/servicios/page.tsx` | component + controller | CRUD | RESEARCH.md "Don't Hand-Roll" (`@dnd-kit/sortable`) + 02-UI-SPEC.md | no in-repo analog |
| `apps/dashboard/app/(owner)/negocio/page.tsx` | component + controller | CRUD | 02-UI-SPEC.md inline settings page pattern | no in-repo analog |
| `apps/dashboard/app/actions/profesionales.ts`, `servicios.ts`, `negocio.ts` | controller (Server Action) | CRUD | RESEARCH.md anti-patterns section (re-derive `tenant_id`/`negocio_id` server-side, never trust hidden field) | no in-repo analog |
| `apps/dashboard/app/(admin)/admin/page.tsx` | component | CRUD | 02-UI-SPEC.md; no CRUD analog in repo | no in-repo analog |
| `apps/dashboard/app/actions/admin-tenants.ts` (Tenant + Negocio superadmin CRUD) | controller (Server Action) | CRUD + event-driven (compensating transaction) | RESEARCH.md Pattern 3 (full worked example, official Admin API docs) + `apps/bot/src/db/client.ts` (service_role isolation) | strong — RESEARCH.md Pattern 3 is a complete, ready-to-adapt code block |
| `apps/dashboard/lib/schemas/*.ts` (profesional, servicio, negocio, tenant) | utility (validation) | transform | RESEARCH.md Code Examples ("Zod schema shared between react-hook-form and a Server Action") | no in-repo analog |
| `scripts/bootstrap-superadmin.ts` (or similar) | utility | batch | RESEARCH.md Pitfall 3 + implied analog `scripts/apply-seed.ts` (Phase 1, not read in this pass but referenced by RESEARCH.md as the pattern to mirror) | role-match by description |
| `apps/dashboard/app/layout.tsx` (ThemeProvider) | provider | event-driven | RESEARCH.md "Don't Hand-Roll" (`next-themes`) | no in-repo analog |

## Pattern Assignments

### `supabase/migrations/0003_tenant_negocio_split.sql` (migration, batch/transform)

**Analog:** `supabase/migrations/0002_rls_policies.sql` (full file read above) and `0001_schema_core.sql` (table shapes referenced by RESEARCH.md Schema Readiness Audit).

**Naming convention to copy** (from `0002_rls_policies.sql` lines 40-51, 58-88):
```sql
CREATE OR REPLACE FUNCTION auth_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT tenant_id FROM public.perfil WHERE id = auth.uid();
$$;

REVOKE ALL ON FUNCTION auth_tenant_id() FROM public;
GRANT EXECUTE ON FUNCTION auth_tenant_id() TO authenticated;
```
`0003` must add a second helper `auth_negocio_ids()` with the **identical hardening shape** (STABLE, SECURITY DEFINER, `SET search_path = ''`, REVOKE ALL then GRANT EXECUTE TO authenticated only) — per RESEARCH.md's Schema Readiness Audit row "RLS on operational tables": `SELECT id FROM public.negocio WHERE tenant_id = auth_tenant_id()`.

**Policy naming convention to copy** (repeated 11 times in `0002`, e.g. lines 93-99):
```sql
ALTER TABLE profesional ENABLE ROW LEVEL SECURITY;

CREATE POLICY profesional_aislamiento ON profesional
  FOR ALL
  TO authenticated
  USING (tenant_id = auth_tenant_id())
  WITH CHECK (tenant_id = auth_tenant_id());
```
For `0003`, every operational table's policy must be **dropped and recreated** with the same `<tabla>_aislamiento` naming, same `FOR ALL TO authenticated`, but predicate changed to `negocio_id IN (SELECT auth_negocio_ids())`. Tables to migrate this way (per RESEARCH.md Schema Readiness Audit): `profesional`, `horario_trabajo`, `servicio`, `profesional_servicio`, `cliente`, `turno`, `turno_servicio`, `bloqueo`, `conversacion`, `mensaje`, `recordatorio`. Tables that keep `auth_tenant_id()` unchanged: `perfil`, `tenant`, `negocio`.

**Header comment style to copy** (lines 1-22 of `0002`): every migration file in this repo opens with a `====` banner, a plain-language summary of what it does and why, explicit references to requirement IDs (CORE-01, D-05, D-06, etc.) and to the threat model. `0003`'s header should reference D-09..D-12 and SADMIN-01/02.

---

### `apps/dashboard/lib/supabase/admin.ts` (service, request-response)

**Analog:** `apps/bot/src/db/client.ts` (full file read above, lines 1-38)

**Core pattern to copy** — server-only guard + service_role client construction + explicit doc-comment warning about RLS bypass:
```typescript
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@turnosbot/db-types";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY son obligatorias ...");
}

export const supabaseAdmin = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
```
Adapt directly per RESEARCH.md Pattern 1's `lib/supabase/admin.ts` example (adds the `server-only` package import as an additional build-time guard beyond the bot's plain doc-comment warning — the dashboard is browser-reachable code, the bot is not, so the extra guard is warranted here).

**Isolation philosophy to copy** (doc comment, lines 11-16 of `client.ts`): explicitly state in the file header that this client bypasses RLS and that the ONLY sanctioned callers are the `/admin` Server Actions — mirrors how `tenantScoped.ts` frames itself as "the ONLY sanctioned way" to query tenant-scoped tables. Apply the same "make the mistake structurally impossible" framing to the file-boundary convention in RESEARCH.md Pitfall 4 (only `app/actions/admin-tenants.ts` imports this module).

---

### `apps/dashboard/lib/supabase/server.ts`, `client.ts`, `middleware.ts`, all Server Actions, all CRUD pages

**No in-repo analog exists.** Use RESEARCH.md verbatim:
- Pattern 1 (lines ~264-310 of 02-RESEARCH.md) for the dual Supabase client setup.
- Pattern 2 (lines ~312-372) for `middleware.ts` session refresh + role gate — note Pitfall 1's guidance to use `getUser()` not `getClaims()`/`getSession()` for the `/admin` boundary.
- Pattern 3 (lines ~374-427) for `app/actions/admin-tenants.ts`'s compensating-transaction Tenant+Negocio+owner creation flow — this is a complete, ready-to-adapt code block, already reflects the Tenant→Negocio(s) model.
- Code Examples section (line ~476 onward, continues past the truncated read at line 484 — re-read `02-RESEARCH.md` from offset 484 during planning if additional code examples beyond the zod schema are needed, e.g. any Server Action or dnd-kit example that follows).
- Anti-Patterns section (RESEARCH.md lines ~429-433) applies directly to every owner-facing Server Action: never let a client-submitted form field set `tenant_id`/`negocio_id` on insert — derive it server-side from the authenticated user's own `perfil` row / selected-negocio cookie.

---

### `apps/dashboard/lib/auth/require-role.ts` (utility, request-response)

**Analog (philosophy only):** `apps/bot/src/db/tenantScoped.ts` — the general pattern of "bake the safety check into a shared helper so no call site can bypass it" applies here too: `require-role.ts` should be the single place that reads `perfil.rol` and throws/redirects, mirroring how `tenantScoped(tenantId)` is "the ONLY sanctioned way" to query tenant-scoped tables in the bot. Concretely implement per RESEARCH.md Pattern 2's middleware `perfil` query (`select rol, activo from perfil where id = auth.uid()`, RLS-scoped, `.single()`).

---

### `apps/dashboard/lib/schemas/*.ts` (utility/validation, transform)

**Analog:** RESEARCH.md Code Examples, "Zod schema shared between react-hook-form and a Server Action" (`lib/schemas/profesional.ts` example, lines ~476-484 — continues into the truncated tail of RESEARCH.md; re-read at offset 484 during planning for the full example plus any `servicio`/`negocio`/`tenant` schema examples that may follow it).

**Pattern shown so far:**
```typescript
import { z } from "zod";

export const profesionalSchema = z.object({
  nombre: z.string().min(1, "El nombre es obligatorio"),
  activo: z.boolean().default(true),
});
```
One schema per entity, imported by both `react-hook-form`'s `zodResolver` (client) and the Server Action itself (server, source of truth) — per RESEARCH.md's "Don't Hand-Roll" table entry on form validation duplication.

---

## Shared Patterns

### Service-role isolation (server-only client)
**Source:** `apps/bot/src/db/client.ts` (repo-proven) + RESEARCH.md Pattern 1's `admin.ts` example (adds `server-only` import guard)
**Apply to:** `apps/dashboard/lib/supabase/admin.ts`, and by extension every file under `app/actions/admin-tenants.ts` — never import this client from any `(owner)` route file (RESEARCH.md Pitfall 4).

### RLS predicate + SECURITY DEFINER helper naming
**Source:** `supabase/migrations/0002_rls_policies.sql` lines 40-51 (`auth_tenant_id()`), 58-88 (`*_aislamiento` policy shape)
**Apply to:** `0003_tenant_negocio_split.sql` — new `auth_negocio_ids()` helper with identical hardening (STABLE, SECURITY DEFINER, empty `search_path`, REVOKE ALL + GRANT to `authenticated` only), and renamed-but-same-shape `*_aislamiento` policies on the 11 operational tables switched to `negocio_id IN (SELECT auth_negocio_ids())`.

### Single env-access point
**Source:** `apps/bot/src/config/env.ts` (full file, 27 lines)
**Apply to:** any dashboard-side env access should similarly centralize `process.env.NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` reads rather than scattering `process.env.X` calls across Server Actions/components — though Next.js's built-in env handling means this may just be a thin `lib/env.ts` rather than a full `loadEnv()` function; use judgement at planning time, this is not a hard requirement, just a consistency nudge from the sibling app's convention.

### Never trust client-submitted tenant/negocio identifiers
**Source:** RESEARCH.md Anti-Patterns section + `apps/bot/src/db/tenantScoped.ts`'s "structurally impossible to forget" philosophy
**Apply to:** every Server Action under `app/actions/*.ts` (except `admin-tenants.ts`, which legitimately sets `tenant_id`/`negocio_id` as the superadmin) — always derive `negocio_id` server-side from the authenticated user's `perfil` + selected-negocio context, never from a hidden form field.

### Spanish domain naming
**Source:** established across `0001_schema_core.sql`/`0002_rls_policies.sql`/`tenantScoped.ts` (`profesional`, `servicio`, `negocio`, `horario_trabajo`, `cliente`, `turno`)
**Apply to:** all new dashboard code — route segments, Server Action file names, zod schema variable names, UI copy — should keep the same Spanish domain vocabulary already fixed by the schema (already reflected in RESEARCH.md's proposed file tree).

## No Analog Found

Files with no close match in the codebase — planner should use RESEARCH.md's Architecture Patterns / Code Examples / official-docs-sourced snippets instead of an in-repo analog:

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `apps/dashboard/middleware.ts` | middleware | request-response | No middleware exists anywhere in the repo yet; use RESEARCH.md Pattern 2 verbatim |
| `apps/dashboard/lib/supabase/server.ts`, `client.ts` | service | request-response | No `@supabase/ssr` usage exists in the repo yet (bot uses plain `@supabase/supabase-js` service_role only); use RESEARCH.md Pattern 1 verbatim |
| All `(owner)`/`(admin)` route pages, layouts, Server Actions for CRUD | component + controller | CRUD | `apps/dashboard` has zero page/component code (stub only); use 02-UI-SPEC.md (locked, checker-approved) for layout/interaction and RESEARCH.md Code Examples/Pattern 3 for data-mutation code shape |
| shadcn `components/ui/*` generated files | component | request-response | Generated by `shadcn` CLI at implementation time, not hand-written from an analog — follow RESEARCH.md's Installation command block verbatim |
| `scripts/bootstrap-superadmin.ts` | utility | batch | Not yet read in this pass; RESEARCH.md Pitfall 3 explicitly says to mirror the (unread-in-this-pass) `scripts/apply-seed.ts` from Phase 1 — planner/implementer should read that file directly before writing this script |

## Metadata

**Analog search scope:** `apps/dashboard/`, `apps/bot/src/`, `packages/db-types/`, `packages/shared/`, `supabase/migrations/`
**Files scanned:** `apps/dashboard/package.json`, `apps/dashboard/tsconfig.json`, `apps/dashboard/app/placeholder.ts` (listing only), `apps/bot/src/db/client.ts`, `apps/bot/src/db/tenantScoped.ts`, `apps/bot/src/config/env.ts`, `packages/db-types/src/index.ts`, `supabase/migrations/0001_schema_core.sql` (referenced via RESEARCH.md audit, not re-read in full), `supabase/migrations/0002_rls_policies.sql` (full read)
**Pattern extraction date:** 2026-07-04
