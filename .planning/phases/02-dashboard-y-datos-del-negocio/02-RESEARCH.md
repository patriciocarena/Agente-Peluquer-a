# Phase 2: Dashboard y datos del negocio - Research

**Researched:** 2026-07-04
**Domain:** Next.js 16 App Router dashboard (multitenant CRUD) + Supabase Auth/RLS + a service_role-isolated superadmin panel
**Confidence:** HIGH (auth/RLS wiring, schema readiness, shadcn/CLI mechanics) / MEDIUM (exact Supabase SSR middleware code sample — official docs are mid-transition between two auth-verification methods, see Pitfall 1 and Open Questions)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Estilo visual / sistema de UI**
- **D-01:** UI con **shadcn/ui + Tailwind CSS** — componentes accesibles (Radix) copiados al repo, no una librería pesada. Es el estándar actual para Next.js 16 App Router + React 19 y encaja con un CRUD admin (tablas, forms, modales, toggles). Requiere **agregar Tailwind al `apps/dashboard`** (hoy no está en su `package.json`) e inicializar shadcn.
- **D-02:** Estética **admin limpia y neutra** (grises neutros + un color de acento) con **modo claro + oscuro conmutable** (tokens de tema definidos para ambos modos desde el inicio).

**Panel superadmin: acceso y aislamiento**
- **D-03:** El panel superadmin es una **ruta `/admin` dentro de la misma app Next.js**, gateada por rol vía **middleware** (mismo login; si `perfil.rol = 'superadmin'` accede, si es `owner` nunca ve ni entra a `/admin`). Todo el acceso cross-tenant del admin va **server-side con `service_role` en rutas aisladas** (Route Handlers / Server Actions server-only) — **nunca** RLS relajada, nunca `service_role` en el cliente. Un solo deploy, sin subdominio/app aparte.
- **D-04:** **SADMIN-02 se cumple parcialmente en Fase 2:** el superadmin carga solo la **config no-secreta** de WhatsApp (`phone_number_id`, `waba_id`, número visible). La carga del **token de acceso y su encriptación** (Vault/AES-GCM) se difiere a **Fase 7 (SEC-01)** para no guardar la credencial en plano — guardrail duro de CLAUDE.md. **BIZ-02** (el dueño ve el número de WhatsApp vinculado) se satisface leyendo el número visible.

**Auth y aislamiento (heredado de Fase 1, revisado 2026-07-04 con el modelo Tenant → Negocio(s))**
- **D-05 (revisado):** Login **email/contraseña con Supabase Auth**; sesión persistente por **cookies vía `@supabase/ssr`** (AUTH-01/02); logout disponible desde cualquier página (AUTH-04). El tenant se resuelve desde la fila `perfil` (`id = auth.uid()`, `tenant_id`, `rol`); el aislamiento (AUTH-03) lo enforcea **RLS leyendo `perfil`** (`auth_tenant_id()`), no un claim del JWT — pero las tablas operativas ahora aíslan por `negocio_id` (helper `auth_negocio_ids()`, ver D-12/D-09..D-13 en 02-CONTEXT.md), no directamente por `tenant_id`. **1 usuario (owner) = 1 Tenant (grupo), que gestiona N Negocios** — esto SUPERSEDE el "1 usuario = 1 peluquería" (D-08 de Fase 1).

**Modelo de datos: Tenant → Negocio(s) (revisado 2026-07-04 — ver 02-CONTEXT.md D-09..D-13)**
- Un **Tenant es un contenedor/grupo** (1..N Negocio); el Negocio es la unidad operativa real y tiene su propio WhatsApp, profesionales, servicios, clientes, turnos, horarios. `Tenant` queda con **solo `nombre`** (+ `activo`, timestamps). Esto reemplaza el modelo 1:1 de Fase 1 y **requiere la migración `0003_tenant_negocio_split.sql`** — ver Schema Readiness Audit más abajo (ya NO es cierto que Fase 2 no necesite migraciones).

### Claude's Discretion
Áreas NO discutidas por el usuario — decido yo al planificar / en `ui-phase`, con estos defaults sugeridos:
- **Layout y navegación (shell):** default → sidebar lateral con secciones Profesionales / Servicios / Perfil, y `/admin` para el superadmin; rutas separadas por sección (App Router). Densidad cómoda. **[RESOLVED in 02-UI-SPEC.md — see below, use verbatim.]**
- **Editor de horario semanal del profesional (PRO-02):** área UX-pesada — que `ui-phase`/plan la diseñen con cuidado. Default → filas "día + rango horario" con soporte de **múltiples bloques por día** (ej: 9–13 y 16–20) y un atajo "copiar a todos los días". **[RESOLVED in 02-UI-SPEC.md.]**
- **Asignación de servicios por profesional + precio custom (PRO-03/04):** default → matriz/lista de servicios en la página de edición del profesional, con checkbox de "lo hace" y campo opcional de precio que pisa el base (`profesional_servicio`). **[RESOLVED in 02-UI-SPEC.md.]**
- **Patrón de mutación de datos** (Server Actions vs Route Handlers) dentro del patrón SSR ya fijado. **[This research recommends Server Actions — see Architecture Patterns.]**
- **Patrón de CRUD** (inline vs modal vs página), presentación de soft-delete (toggle activar/desactivar vs tab de archivados), y orden de servicios SVC-02 (drag-and-drop vs campo de orden). **[RESOLVED in 02-UI-SPEC.md — full-page for profesional, Dialog for servicio/tenant, inline settings page for negocio, Tabs Todos/Activos/Inactivos, drag-and-drop via @dnd-kit for SVC-02.]**

### Deferred Ideas (OUT OF SCOPE)
- **Token de WhatsApp + encriptación (SEC-01)** → Fase 7. En Fase 2 solo se carga la config no-secreta; **SADMIN-02 se completa en Fase 7** cuando se sume el token encriptado (Vault/AES-GCM).
- **Motor de disponibilidad (AVAIL, Fase 3)** y **grilla/administración de turnos (APPT, Fase 4)** — fuera de Fase 2; esta fase solo carga los datos base que esas fases consumen.
- **Métricas / analytics / reportes** — Out of Scope del proyecto.
- **Multi-usuario por peluquería** — no modelado en v1 (1 usuario = 1 tenant).

> **Note:** `02-UI-SPEC.md` (approved 2026-07-04 by gsd-ui-checker) resolves ALL "Claude's Discretion" items above with a concrete, checker-verified visual/interaction contract. The planner MUST treat 02-UI-SPEC.md as equally locked as the Decisions above — do not re-open layout/CRUD-pattern/soft-delete/ordering choices during planning.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AUTH-01 | Login email/contraseña | `@supabase/ssr` browser+server client pattern; Supabase Auth `signInWithPassword` — see Architecture Patterns Pattern 1 |
| AUTH-02 | Sesión persiste entre refrescos | Cookie-based session via `@supabase/ssr` middleware refresh — Pattern 1, Pitfall 1 |
| AUTH-03 | Aislamiento por tenant (operativo ahora por negocio) | `perfil`/`tenant`/`negocio` siguen resolviendo por `auth_tenant_id()` RLS (Phase 1, verified live); las tablas operativas (profesional/servicio/turno/etc.) pasan a aislar por `negocio_id IN (SELECT auth_negocio_ids())` tras la migración `0003` — dashboard just needs to use the anon-key + user-JWT client, never service_role, for all owner routes — Pattern 2 |
| AUTH-04 | Logout desde cualquier página | Server Action calling `supabase.auth.signOut()`, exposed from a shared topbar/user-menu component — Pattern 1 |
| PRO-01 | CRUD + soft delete profesionales | Schema Readiness Audit confirms `profesional.activo` exists; CRUD pattern in 02-UI-SPEC.md (full-page create/edit, Tabs + Switch for soft-delete) |
| PRO-02 | Horario semanal recurrente, multi-bloque | Schema Readiness Audit confirms `horario_trabajo` (one row per block, `dia_semana`+`hora_inicio`+`hora_fin`) already supports N blocks/day — no migration needed |
| PRO-03 | Asignar servicios por profesional | Schema Readiness Audit confirms `profesional_servicio` (junction table) already exists |
| PRO-04 | Precio custom por profesional/servicio | Schema Readiness Audit confirms `profesional_servicio.precio_custom` (nullable numeric) already exists |
| SVC-01 | CRUD + soft delete servicios | `servicio` table complete (nombre/descripcion/precio/duracion_min/activo) — no migration needed |
| SVC-02 | Orden de visualización | Schema Readiness Audit confirms `servicio.orden` (integer) already exists; `@dnd-kit/sortable` pattern in Code Examples |
| BIZ-01 | Editar perfil del negocio | `negocio` table complete (nombre/direccion/telefono/horario_general/timezone) — inline settings page pattern in 02-UI-SPEC.md |
| BIZ-02 | Ver WhatsApp vinculado | `negocio.display_phone_number` del **negocio seleccionado** (tras la migración `0003`, el WhatsApp se mueve de `tenant` a `negocio` — ver Schema Readiness Audit) |
| BIZ-03 | Granularidad de grilla | `negocio.granularidad_min` (integer, default 30) already exists — no migration needed |
| SADMIN-01 | CRUD + desactivar **Tenants** (grupo, solo `nombre` tras la migración `0003`) | Schema Readiness Audit (migración `0003` requerida) + Pattern 3 (atomic-ish tenant+owner bootstrap via service_role), adaptado a un alta de Tenant(`nombre`) → Negocio(s) |
| SADMIN-02 | CRUD + desactivar **Negocios** dentro de un Tenant + vincular config WhatsApp (no-secreta) | Tras la migración `0003`, `negocio.whatsapp_phone_number_id` / `negocio.waba_id` / `negocio.display_phone_number` / `negocio.activo` viven en `negocio`, no en `tenant`; `negocio.whatsapp_token` column exists but is OUT OF SCOPE this phase (D-04). SADMIN-01/02 pasan a ser **dos entidades separadas: Tenant vs Negocio** |
| SADMIN-03 | Listar todos los tenants y sus negocios, aislado de RLS | service_role-only Server Actions under `/admin`, gated by middleware role check — Pattern 2 |
</phase_requirements>

## Summary

Phase 2 is architecturally a **standard multitenant CRUD dashboard**, but the data model changed after this research's original pass (2026-07-04): a `Tenant` is now a **contenedor/grupo** that can hold **1..N `Negocio`** (sucursales), and the Negocio — not the Tenant — is the real operational unit (own WhatsApp, profesionales, servicios, clientes, turnos). This means **Phase 2 requires the migration `0003_tenant_negocio_split.sql`** — the Schema Readiness Audit below documents exactly what it moves/renames; it is NOT a "zero migrations" phase anymore (see 02-CONTEXT.md D-09..D-13 and 02-HANDOFF.md §4 for the full spec). The other schema-adjacent gap is operational, not structural: no `perfil` row with `rol = 'superadmin'` exists yet (only the two seeded `owner` rows from Phase 1), so Phase 2 must include a one-off bootstrap step to create the first superadmin before `/admin` has any user who can reach it.

The stack is locked by CONTEXT.md/UI-SPEC (shadcn/ui + Tailwind v4 + Radix, `@supabase/ssr`, next-themes, `@dnd-kit/sortable`) and this research confirms every locked choice is current and mutually compatible with `next@16.2.x` + `react@19`. The one genuinely nuanced area is **which Supabase auth-verification call to use in middleware** (`getUser()` vs `getClaims()`) — official Supabase docs are actively inconsistent on this exact point as of research date (a live GitHub issue on `supabase/supabase` tracks docs pages disagreeing with each other). This research recommends `getUser()` for the `/admin` role gate specifically (it round-trips to the Auth server and can't be fooled by a JWT that's still cryptographically valid but whose session was revoked), and flags the general-page-protection choice as an Open Question the planner should confirm against the live docs at implementation time.

The other two areas needing careful task design are: (1) the **superadmin tenant-creation flow**, which spans two systems that don't share a transaction (GoTrue `auth.users` + Postgres `public.tenant/negocio/perfil`) and needs an explicit compensating-rollback pattern; and (2) the **dual security model** — every owner-facing query MUST go through the anon-key/user-JWT client (RLS does the isolation), while every `/admin` query MUST go through a server-only service_role client, and the two must never be mixed in the same route.

**Primary recommendation:** Build one Next.js App Router dashboard with two route groups — `(owner)` using an anon-key+user-JWT Supabase client (RLS-enforced) and `(admin)` using a server-only service_role client gated by middleware reading the caller's own `perfil.rol` — mutate everything via Server Actions validated with zod, initialize shadcn/ui exactly as specified in 02-UI-SPEC.md, and include a **`[BLOCKING]` migration task for `0003_tenant_negocio_split.sql`** (schema + RLS rewrite to `negocio_id`/`auth_negocio_ids()`) before any owner/superadmin CRUD task that depends on the new shape.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Login / session persistence (AUTH-01/02) | Frontend Server (SSR) | Browser | `@supabase/ssr` issues/refreshes the session cookie server-side (middleware + Server Components); the browser client only handles the initial `signInWithPassword` call and reactive client-side state |
| Tenant/negocio isolation (AUTH-03) | Database / Storage | API-equivalent (Server Components/Actions) | RLS is the actual enforcement point: `tenant`/`negocio`/`perfil` still resolve via `auth_tenant_id()` (live from Phase 1); operative tables (profesional/servicio/turno/etc.) resolve via the new `auth_negocio_ids()` helper (`negocio_id IN (SELECT auth_negocio_ids())`) added by migration `0003`. The Server Component/Action layer is a pass-through that must simply avoid bypassing it (never use service_role for owner routes) |
| Role gate for `/admin` (D-03) | Frontend Server (SSR) | Database | Next.js Middleware is the first checkpoint (redirect before render); the `perfil.rol` value it reads is itself RLS-protected DB data, so DB is the ultimate source of truth |
| Owner CRUD — profesionales/servicios/negocio (PRO/SVC/BIZ) | Frontend Server (SSR) | Database | Server Components (reads) + Server Actions (writes) using the RLS-scoped client; Postgres constraints (soft-delete via `activo`, uniqueness) are the safety net |
| Superadmin CRUD — tenants (SADMIN) | Frontend Server (SSR) | Database | Server Actions using an explicit service_role client, never exposed to the browser; Postgres is still where uniqueness/FK integrity is enforced |
| Weekly schedule editor UI (PRO-02) | Browser / Client | Frontend Server (SSR) | Multi-block add/remove/copy-to-all-days is inherently client-interactive (React state before submit); the Server Action only receives the final array to persist |
| Service ordering drag-and-drop (SVC-02) | Browser / Client | Database | `@dnd-kit` reordering is client-only visual state; the persisted `orden` integer write goes through a Server Action to `servicio.orden` |
| Theme switching (light/dark) | Browser / Client | — | `next-themes` is a pure client-side `class` toggle on `<html>`; no server involvement |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|---------------|
| `next` | 16.2.x | App Router dashboard framework | Already locked (Phase 1 `package.json`), `[VERIFIED: npm registry]` (already installed dependency) |
| `react` / `react-dom` | 19.x | UI runtime | Already locked, `[VERIFIED: npm registry]` |
| `@supabase/ssr` | ^0.12.0 | Cookie-based SSR auth adapter (Server Components/Actions/Middleware) | Already locked, official Supabase-recommended replacement for deprecated `auth-helpers-nextjs`. `[CITED: supabase.com/docs/guides/auth/server-side/nextjs]` |
| `@supabase/supabase-js` | ^2.110.0 | Supabase client (browser + server + service_role admin) | Already locked. `[VERIFIED: npm registry]` |
| `zod` | ^4.4.3 | Form/Server Action input validation | Already locked project-wide (root CLAUDE.md), also required as the `@hookform/resolvers/zod` peer. `[VERIFIED: npm registry]` |
| `tailwindcss` + `@tailwindcss/postcss` | ^4.3.2 | Styling (CSS-first `@theme` config, no `tailwind.config.js` needed) | Locked by D-01/UI-SPEC. Tailwind v4's CSS-first config is what current `shadcn init` scaffolds by default for Next.js. `[ASSUMED]` (package names/versions from training knowledge + npm registry check, not Context7 — Context7 unavailable this session) |
| `shadcn` (CLI, devDependency) | ^4.13.0 | Scaffolds Radix-based components into `apps/dashboard/components/ui/` | Locked by D-01. CLI flags (`-t`, `-b`, `-c`, `--css-variables`, `-y`) confirmed current via official docs fetch. `[CITED: ui.shadcn.com/docs/cli]` for flag syntax; `[ASSUMED]` for exact version pin |
| `lucide-react` | ^1.23.0 (verify exact major at install time — see Assumptions) | Icon set (shadcn default) | Locked by UI-SPEC ("Icon library: `lucide-react`"). `[ASSUMED]` |
| `class-variance-authority`, `tailwind-merge`, `clsx` | ^0.7.1 / ^3.6.0 / ^2.1.1 | shadcn's internal `cn()` utility + variant styling | Standard shadcn scaffolding dependencies, auto-added by `shadcn init`/`add`. `[ASSUMED]` |
| `next-themes` | ^0.4.6 | Light/dark theme toggle (`class` strategy) | Locked by UI-SPEC. De facto standard for Next.js theme switching, pairs with Tailwind's `dark:` variant. `[ASSUMED]` |
| `react-hook-form` | ^7.80.0 | Form state management | Locked by UI-SPEC component inventory (`form` = react-hook-form + zod resolver). `[ASSUMED]` |
| `@hookform/resolvers` | ^5.4.0 | Bridges react-hook-form ↔ zod schemas | Required for the `zodResolver` used by shadcn's `form` block. `[ASSUMED]` |
| `sonner` | ^2.0.7 | Toast notifications (undo toast for "Copiar a todos los días", error toasts) | Locked by UI-SPEC component inventory (`sonner`). `[ASSUMED]` |
| `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` | ^6.3.1 / ^10.0.0 / ^3.2.2 | Drag-and-drop service reordering (SVC-02) | Locked by UI-SPEC ("Drag-and-drop reordering... using `@dnd-kit/sortable`"). `[ASSUMED]` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@turnosbot/db-types` | workspace:* | Row/Insert/Update types generated from the live schema | Import into every Server Action/Server Component query — never hand-write row shapes (already the established Phase 1 pattern) |
| `@turnosbot/shared` | workspace:* | Cross-app constants/es-AR strings | Put `Intl.NumberFormat('es-AR', ...)` currency formatting and day-name arrays here so both dashboard and (later) bot share them |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Server Actions for mutations | Route Handlers (`app/api/.../route.ts`) | Route Handlers make sense only if an external client (not this app's own forms) needs to call the endpoint — not the case here. Server Actions colocate with the form, get automatic CSRF-safe POST semantics from Next.js, and integrate with `useActionState`/`revalidatePath`. Use a Route Handler only if a future phase needs a JSON API surface. |
| `@dnd-kit/sortable` for SVC-02 | Plain numeric "orden" input field | UI-SPEC already locked drag-and-drop; a numeric field remains the *storage* representation (`servicio.orden`) either way — dnd-kit is purely the interaction layer on top |
| `next-themes` | Manual `localStorage` + `useEffect` toggle | `next-themes` avoids the flash-of-wrong-theme problem via an inline blocking script; reinventing this is a well-known footgun (FOUC on theme) |

**Installation:**
```bash
# Run from apps/dashboard/
pnpm dlx shadcn@latest init -t next -b radix --css-variables -c apps/dashboard -y
pnpm add next-themes sonner react-hook-form @hookform/resolvers @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
pnpm dlx shadcn@latest add button input label textarea select checkbox switch table tabs dialog alert-dialog card badge separator dropdown-menu sonner skeleton form avatar sidebar
```

**Version verification:** Every version above was checked with `npm view <package> version` against the live npm registry on 2026-07-04 (see Sources). Per the package-name provenance rule, registry existence alone does not upgrade these from `[ASSUMED]` to `[VERIFIED]` — Context7 was unavailable this session, so treat exact version pins as a starting point and re-run `npm view` immediately before `pnpm add` at execution time.

## Package Legitimacy Audit

> slopcheck could not be installed in this sandbox (`pip`/`pip3` not present — `command not found: pip`). Per the graceful-degradation protocol, **every package below is tagged `[ASSUMED]`** regardless of the manual checks performed. The planner must gate each new (not-already-installed) package behind a `checkpoint:human-verify` task before install.

Manual checks performed in place of slopcheck: npm registry existence (`npm view <pkg> version`), package age (`npm view <pkg> time.created`), weekly download volume (`api.npmjs.org/downloads/point/last-week`), source repo presence, and absence of a `postinstall` script.

| Package | Registry | Age | Downloads/wk | Source Repo | Postinstall script | Disposition |
|---------|----------|-----|--------------|--------------|---------------------|-------------|
| `next-themes` | npm | ~15 yrs (created 2020) | 23.0M | github.com/pacocoursey/next-themes | none | Approved — `[ASSUMED]`, checkpoint recommended but low-risk (huge adoption, no scripts) |
| `sonner` | npm | ~3.4 yrs (created 2023) | 44.7M | github.com/emilkowalski/sonner | none | Approved — `[ASSUMED]` |
| `@dnd-kit/core` | npm | ~5.5 yrs (created 2021) | 18.4M | github.com/clauderic/dnd-kit | none | Approved — `[ASSUMED]` |
| `@dnd-kit/sortable` | npm | (same monorepo as core) | 18.2M | github.com/clauderic/dnd-kit | none | Approved — `[ASSUMED]` |
| `@dnd-kit/utilities` | npm | (same monorepo as core) | 18.3M | github.com/clauderic/dnd-kit | none | Approved — `[ASSUMED]` |
| `react-hook-form` | npm | ~7 yrs (created 2019) | 53.8M | github.com/react-hook-form/react-hook-form | none | Approved — `[ASSUMED]` |
| `@hookform/resolvers` | npm | (same org) | 45.7M | github.com/react-hook-form/resolvers | none | Approved — `[ASSUMED]` |
| `lucide-react` | npm | multi-year, high-churn fork of feathericons | 81.7M | github.com/lucide-icons/lucide | none | Approved — `[ASSUMED]` |
| `shadcn` (CLI) | npm | multi-year | 5.7M | github.com/shadcn-ui/ui | none | Approved — `[ASSUMED]` |
| `class-variance-authority` | npm | multi-year | 53.8M | github.com/joe-bell/cva | none | Approved — `[ASSUMED]` |
| `tailwind-merge` | npm | multi-year | 69.1M | github.com/dcastil/tailwind-merge | none | Approved — `[ASSUMED]` |
| `clsx` | npm | multi-year | 104.0M | github.com/lukeed/clsx | none | Approved — `[ASSUMED]` |
| `tailwindcss` / `@tailwindcss/postcss` | npm | multi-year, official | very high | github.com/tailwindlabs/tailwindcss | none (verified for `tailwindcss` core) | Approved — `[ASSUMED]` (already a project decision, not newly discovered) |

**Packages removed due to slopcheck [SLOP] verdict:** none (slopcheck did not run; nothing was flagged by manual checks — all packages show multi-year history, official-org repos, and no suspicious install scripts).
**Packages flagged as suspicious [SUS]:** none by manual inspection, but since slopcheck itself did not run, treat all of the above as requiring a human `npm view`/registry glance immediately before `pnpm add` — do not skip this because the manual audit above looked clean.

## Schema Readiness Audit

> Addresses Research Question 3 directly. Source: `supabase/migrations/0001_schema_core.sql` (authored schema) cross-checked against `packages/db-types/src/database.types.ts` (types generated from the LIVE `bdgufnitakelyialjoqg` schema in Phase 1 Plan 01-04 — this is the authoritative source since it reflects what was actually applied, not just what was authored). No live-DB query was run in this research session (no `.env`/credentials available in this sandbox — see Environment Availability); the generated types file is treated as HIGH-confidence evidence of live schema state because it was mechanically generated from the live database by `supabase gen types typescript`, not hand-written.
>
> **Update (2026-07-04, post-model-change):** the columns below were all present against the **old 1:1 Tenant=Negocio model**. The model changed to **Tenant (grupo) → Negocio(s)** (see 02-CONTEXT.md D-09..D-13) — several of these columns now need to **move from `tenant` to `negocio`**, and every operational table needs a **new `negocio_id` FK replacing `tenant_id`**. This is no longer a "no migration needed" audit — it documents what migration `0003_tenant_negocio_split.sql` must do to each item (spec owned by 02-HANDOFF.md §4; this table reflects it, does not re-derive it).

| Phase 2 need | Column(s) — status pre-`0003` | Status post-`0003` (required) |
|---------------|-----------|--------|
| BIZ-03 grid granularity | `negocio.granularidad_min` (integer, default 30) — `[VERIFIED: db-types codegen]`, `database.types.ts` line ~248 | **Unchanged** — already lives on `negocio`, no move needed. |
| SADMIN-02 / BIZ-02 WhatsApp non-secret config | `tenant.whatsapp_phone_number_id`, `tenant.waba_id`, `tenant.display_phone_number` — `[VERIFIED: db-types codegen]`, `database.types.ts` line ~505-537 | **Must move `tenant` → `negocio`.** Migration `0003` step 1-2: backfill these + `whatsapp_token` from the parent `tenant` into the corresponding `negocio` row(s) BEFORE dropping them from `tenant`; add `negocio.activo`. Dashboard queries read/write `negocio.display_phone_number` etc. of the **selected negocio**, no join to `tenant` needed for these fields anymore. |
| SVC-02 service ordering | `servicio.orden` (integer, default 0) — `[VERIFIED: db-types codegen]` | **Column unchanged**, but `servicio` gains `negocio_id` (step 3) replacing `tenant_id`. |
| PRO-04 custom price override | `profesional_servicio.precio_custom` (nullable numeric(10,2)) — `[VERIFIED: db-types codegen]` | **Column unchanged**; parent chain (`profesional`) gains `negocio_id` (step 3, backfilled from the parent's `negocio_id`). |
| PRO-02 weekly schedule shape | `horario_trabajo` — one row per `(profesional_id, dia_semana)` block, multi-block already supported — `[VERIFIED: db-types codegen]` | **Row shape unchanged**; `profesional` (parent) gains `negocio_id` (step 3) replacing `tenant_id`. |
| SADMIN-01 tenant CRUD | `tenant.activo` (boolean, soft delete) — `[VERIFIED: db-types codegen]` | **Unchanged on `tenant`** — Tenant keeps `nombre` + `activo` + timestamps only (all WhatsApp/operational columns leave `tenant` per step 1). |
| Superadmin `perfil` rows (cross-tenant, D-06) | `perfil.tenant_id` nullability — already nullable, `[VERIFIED: db-types codegen]`, see Pitfall 2 | **Unchanged** — `perfil` keeps resolving by `tenant_id`; no negocio-level perfil concept introduced. |
| 11 tablas operativas (`profesional`, `horario_trabajo`, `servicio`, `profesional_servicio`, `cliente`, `turno`, `turno_servicio`, `bloqueo`, `conversacion`, `mensaje`, `recordatorio`) | today: `tenant_id uuid` FK | **step 3:** `ADD COLUMN negocio_id uuid REFERENCES negocio(id) ON DELETE CASCADE`, backfill 1:1 from the row's current tenant→negocio, `SET NOT NULL`, drop the `tenant_id` FK+index+column, add `idx_<tabla>_negocio_id`, update compound indexes (`idx_turno_tenant_profesional_inicio` → by `negocio_id`, ídem `bloqueo`). |
| Uniques (`cliente`, `conversacion`) | today: unique on `(tenant_id, telefono)` / `(tenant_id, cliente_id)` | **step 4:** re-scope to `(negocio_id, telefono)` / `(negocio_id, cliente_id)`. |
| EXCLUDE constraints (`turno_no_overlap`, `bloqueo_no_overlap`) | keyed on `profesional_id` | **step 5: NO change** — these constraints already key on `profesional_id`, not `tenant_id`/`negocio_id`. |
| RLS on operational tables | today: `*_aislamiento` policies using `tenant_id = auth_tenant_id()` | **step 6:** drop the old `*_aislamiento` policies; add SECURITY DEFINER/STABLE helper `auth_negocio_ids()` (`search_path=''`, `GRANT EXECUTE ... authenticated`) returning `SELECT id FROM public.negocio WHERE tenant_id = auth_tenant_id()`; new policies `USING/WITH CHECK (negocio_id IN (SELECT auth_negocio_ids()))`. `perfil`/`tenant`/`negocio` RLS is unchanged (still `auth_tenant_id()`). |
| `packages/db-types` | generated from pre-`0003` schema | **step 7:** regenerate (`supabase gen types typescript`) after applying `0003`. |
| Seeds/fixtures | today: 2 tenants of 1 negocio each (Barbería Norte / Sur) | **step 8:** update to the new Tenant(nombre) → Negocio(s con WhatsApp) → filas operativas(`negocio_id`) shape; decide at planning time whether to keep 2 tenants of 1 negocio or consolidate into 1 tenant of 2 negocios to exercise the 1:N model. |

**Bottom line: Phase 2 requires the migration `0003_tenant_negocio_split.sql`.** This SUPERSEDES this research's original "no migration needed this phase" conclusion — that held only for the old 1:1 Tenant=Negocio model, which no longer applies (see 02-CONTEXT.md D-09..D-12 and 02-HANDOFF.md §4 for the authoritative step-by-step spec). The planner MUST include a `[BLOCKING]` migration + schema-push task for `0003` (schema + RLS rewrite) before any owner/superadmin CRUD task, in addition to the application-level bootstrap work already identified (see Pitfall 3, superadmin seeding). **Cross-fase note (NOT touched in Fase 2):** the bot's `tenantScoped(tenantId)` (Fase 1, CORE-03) will need to become `negocioScoped(negocioId)` in the bot's own phase (5/6), since operational tables move to `negocio_id`.

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Browser                                                                  │
│  - login form (email/password) → client Supabase call                    │
│  - owner shell: Profesionales / Servicios / Negocio nav                  │
│  - superadmin shell: Peluquerías nav (only if perfil.rol=superadmin)      │
└───────────────┬────────────────────────────────────────────┬─────────────┘
                │ HTTPS (cookies carry sb-*-auth-token)        │
                ▼                                              ▼
┌───────────────────────────────┐          ┌───────────────────────────────┐
│  Next.js Middleware            │          │  (same middleware, one file)  │
│  1. refresh session (getUser)  │◄─────────┤  2. read caller's perfil.rol  │
│  3a. owner + /admin/*  → 403   │          │     (RLS-scoped query)        │
│  3b. no session → /login       │          │  3c. superadmin + /* → allow  │
└───────────────┬─────────────────┘          └───────────────┬───────────────┘
                │ allowed                                     │ allowed
                ▼                                              ▼
┌───────────────────────────────┐          ┌───────────────────────────────┐
│  (owner) route group           │          │  (admin) route group          │
│  Server Components: read via   │          │  Server Components/Actions:   │
│   anon-key + user-JWT client,  │          │   SERVICE_ROLE client only,   │
│   scoped to selected negocio   │          │   server-only module, never   │
│   → RLS filters by negocio_id  │          │   imported by client code     │
│  Server Actions: same client,  │          │  Cross-tenant Tenant+Negocio  │
│   zod-validated mutations      │          │   CRUD (jerarquía Tenant→N)   │
└───────────────┬─────────────────┘          └───────────────┬───────────────┘
                │ SQL (RLS operativas: negocio_id             │ SQL (RLS bypassed
                │ IN (SELECT auth_negocio_ids()));             │ by design — service_role)
                │ tenant/negocio/perfil: auth_tenant_id())      │
                ▼                                              │
┌─────────────────────────────────────────────────────────────▼─────────────┐
│  Supabase Postgres (bdgufnitakelyialjoqg) — requiere migración 0003        │
│  tenant(nombre) → negocio(N, con WhatsApp) → profesional, horario_trabajo, │
│  servicio, profesional_servicio (negocio_id, post-0003, RLS por negocio)   │
└─────────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure
```
apps/dashboard/
├── app/
│   ├── (auth)/
│   │   └── login/
│   │       └── page.tsx              # login form, client component + Server Action
│   ├── (owner)/
│   │   ├── layout.tsx                # sidebar shell (Profesionales/Servicios/Negocio)
│   │   ├── profesionales/
│   │   │   ├── page.tsx              # list + Tabs (Todos/Activos/Inactivos)
│   │   │   ├── nuevo/page.tsx        # full-page create
│   │   │   └── [id]/editar/page.tsx  # full-page edit (datos + horario + servicios matrix)
│   │   ├── servicios/
│   │   │   └── page.tsx              # list + Dialog create/edit + dnd-kit ordering
│   │   └── negocio/
│   │       └── page.tsx              # single settings page
│   ├── (admin)/
│   │   └── admin/
│   │       ├── layout.tsx            # superadmin shell (Peluquerías nav only)
│   │       └── page.tsx              # tenants list + Dialog create/edit
│   ├── actions/
│   │   ├── auth.ts                   # signIn, signOut Server Actions
│   │   ├── profesionales.ts          # create/update/toggle-activo, horario, servicios matrix
│   │   ├── servicios.ts              # create/update/toggle-activo/reorder
│   │   ├── negocio.ts                # update
│   │   └── admin-tenants.ts          # SERVICE_ROLE-only: create/update/deactivate tenant
│   └── layout.tsx                    # root layout, ThemeProvider (next-themes)
├── lib/
│   ├── supabase/
│   │   ├── client.ts                 # createBrowserClient (anon key)
│   │   ├── server.ts                 # createServerClient (anon key + user cookies, RLS)
│   │   └── admin.ts                  # createClient(service_role) — SERVER-ONLY, imported only by app/actions/admin-tenants.ts
│   ├── schemas/                      # zod schemas per entity (profesional, servicio, negocio, tenant)
│   └── auth/
│       └── require-role.ts           # shared helper: reads perfil, throws/redirects if role mismatch
├── components/
│   └── ui/                           # shadcn-generated components
├── middleware.ts                     # session refresh + role gate
└── components.json                   # shadcn config, scoped to this app
```

### Pattern 1: Dual Supabase client, one per trust boundary
**What:** Two `lib/supabase/*.ts` factory functions — one for the browser (anon key, used only for the login form's initial client-side call and any purely client-interactive widgets), one for the server (anon key + the user's own cookies via `@supabase/ssr`, used by every owner-facing Server Component/Action — RLS does the tenant filtering automatically). A third, `lib/supabase/admin.ts`, wraps `createClient(url, SERVICE_ROLE_KEY)` and is imported ONLY inside `app/actions/admin-tenants.ts` (never in any file reachable from client bundles).
**When to use:** Every request. Never let a Server Action decide dynamically which client to use based on a runtime role check — the route group (`(owner)` vs `(admin)`) should structurally determine which client file is even importable, so a bug can't accidentally grant an owner request a service_role client.
**Example:**
```typescript
// lib/supabase/server.ts — Source: pattern confirmed via supabase.com/docs/guides/auth/server-side/creating-a-client (official docs)
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies() // Next.js 15+/16: cookies() is async
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // setAll called from a Server Component — safe to ignore if
            // middleware also refreshes the session (see middleware.ts).
          }
        },
      },
    }
  )
}
```
```typescript
// lib/supabase/admin.ts — SERVER-ONLY, never import from a Client Component.
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import 'server-only' // fails the build if accidentally imported client-side

export function createAdminClient() {
  return createSupabaseClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
```

### Pattern 2: Middleware session refresh + DB-backed role gate
**What:** `middleware.ts` calls `supabase.auth.getUser()` (network round-trip to the Auth server — see Pitfall 1 for why not `getClaims()`/`getSession()` here) to refresh the session cookie, then — only if a user exists — queries the caller's own `perfil` row (`select rol, activo from perfil where id = auth.uid()`, RLS-scoped, returns exactly one row per the `perfil_propio` policy) to decide: no session → redirect `/login`; `activo = false` → redirect `/login` with an error; requesting `/admin/*` but `rol != 'superadmin'` → redirect to the owner home (never a 404/500 that could leak existence); requesting an owner route but `rol = 'superadmin'` → redirect to `/admin` (superadmin never sees owner UI, matches D-03 exactly).
**When to use:** Every request matched by the middleware matcher (exclude `/login`, static assets, `/api` if any).
**Trade-offs:** Adds one DB round-trip per request beyond the Auth-server call. Acceptable at this project's scale (single small VPS, low request volume); if it becomes a bottleneck, the `perfil` lookup result can be cached in a short-TTL signed cookie — but do not do this preemptively, it adds a stale-role attack surface for a v1 dashboard with realistically light traffic.
**Example:**
```typescript
// middleware.ts — Source: pattern synthesized from supabase.com/docs/guides/auth/server-side/nextjs
// (official docs) + this project's own auth_tenant_id()/perfil model (Phase 1).
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser() // network-verified, not local-JWT-only
  const isAdminRoute = request.nextUrl.pathname.startsWith('/admin')

  if (!user) {
    if (request.nextUrl.pathname !== '/login') {
      return NextResponse.redirect(new URL('/login', request.url))
    }
    return response
  }

  const { data: perfil } = await supabase
    .from('perfil')
    .select('rol, activo')
    .single() // RLS already scopes this to id = auth.uid()

  if (!perfil?.activo) {
    return NextResponse.redirect(new URL('/login?error=inactive', request.url))
  }
  if (isAdminRoute && perfil.rol !== 'superadmin') {
    return NextResponse.redirect(new URL('/', request.url))
  }
  if (!isAdminRoute && perfil.rol === 'superadmin' && request.nextUrl.pathname !== '/login') {
    return NextResponse.redirect(new URL('/admin', request.url))
  }
  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|login).*)'],
}
```

### Pattern 3: Superadmin tenant + negocio creation — compensating transaction across Auth + Postgres (revisado — modelo Tenant → Negocio(s))
**What:** Creating a Tenant (grupo) + its owner + its first Negocio spans `auth.users` (GoTrue, via the Admin API) and `public.tenant`/`negocio`/`perfil` (Postgres) — two systems, no shared transaction. The safe order is now: (1) `service_role.auth.admin.createUser({ email, password, email_confirm: true })` to get a real `auth.users.id`; (2) insert the **Tenant** with just `nombre`; (3) insert one or more **Negocio** rows under that tenant, each carrying its own WhatsApp non-secret config (`whatsapp_phone_number_id`, `waba_id`, `display_phone_number`) + datos generales (nombre, dirección, teléfono, timezone, granularidad); (4) insert the `perfil` row linking the new auth user to the **Tenant** (`tenant_id`, `rol: 'owner'`) — the owner is linked to the Tenant, not to any individual Negocio; (5) if any Postgres insert fails, immediately `service_role.auth.admin.deleteUser(id)` to avoid an orphaned login with no tenant/perfil row (which would otherwise be a user who can authenticate but whose every RLS-scoped query returns nothing, and whom no `/admin` UI can find since it wasn't fully created).
**When to use:** SADMIN-01 (Tenant creation) + SADMIN-02 (Negocio creation within that Tenant) as a combined superadmin onboarding flow. Editing/deactivating an existing Tenant or Negocio is a normal single-Postgres-transaction update (`tenant.activo = false` / `negocio.activo = false`) and does not need this pattern.
**Example:**
```typescript
// app/actions/admin-tenants.ts (excerpt) — pattern per official Admin API docs
// (supabase.com/docs/reference/javascript/auth-admin-createuser: "This function
// should only be called on a server. Never expose your service_role key in the browser.")
'use server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function createTenantWithNegocio(input: CreateTenantInput) {
  const admin = createAdminClient()
  const { data: authUser, error: authError } = await admin.auth.admin.createUser({
    email: input.ownerEmail,
    password: input.ownerPassword,
    email_confirm: true,
  })
  if (authError || !authUser.user) return { error: 'No se pudo crear el usuario dueño.' }

  // Tenant = solo nombre (post-migración 0003)
  const { data: tenant, error: tenantError } = await admin
    .from('tenant')
    .insert({ nombre: input.tenantNombre })
    .select()
    .single()
  if (tenantError || !tenant) {
    await admin.auth.admin.deleteUser(authUser.user.id) // compensate
    return { error: 'No se pudo crear el grupo.' }
  }

  // Negocio = unidad operativa real, con su propio WhatsApp (post-migración 0003)
  const { error: negocioError } = await admin
    .from('negocio')
    .insert({
      tenant_id: tenant.id,
      nombre: input.negocioNombre,
      timezone: input.timezone,
      whatsapp_phone_number_id: input.phoneNumberId,
      waba_id: input.wabaId,
      display_phone_number: input.displayPhoneNumber,
    })
  const { error: perfilError } = await admin
    .from('perfil')
    .insert({ id: authUser.user.id, tenant_id: tenant.id, rol: 'owner' })

  if (negocioError || perfilError) {
    await admin.from('tenant').delete().eq('id', tenant.id) // cascades to negocio/perfil via ON DELETE CASCADE
    await admin.auth.admin.deleteUser(authUser.user.id)
    return { error: 'No se pudo completar el alta del grupo/peluquería.' }
  }
  return { data: tenant }
}
```

### Anti-Patterns to Avoid
- **Using the service_role client anywhere reachable from `(owner)` routes:** defeats RLS entirely and is exactly the "relaxed RLS" path D-03/D-06 explicitly forbid. Keep `lib/supabase/admin.ts` imported from exactly one file.
- **Trusting a client-side role check to hide `/admin` nav:** hiding a sidebar link is a UX nicety, not a security boundary — the middleware role gate is the actual control. Never skip the middleware check "because the UI already hides the link."
- **Re-deriving `tenant_id` from a client-submitted form field on INSERT:** every owner-side insert must let RLS's `WITH CHECK (tenant_id = auth_tenant_id())` be the enforcement, but the Server Action should still explicitly set `tenant_id` server-side from the authenticated user's own `perfil.tenant_id` (never trust a hidden form field for it) — belt-and-suspenders, and avoids a confusing RLS rejection being the only error a broken form ever surfaces.
- **Parsing `perfil.rol`/`tenant_id` out of a JWT custom claim:** D-05/D-07 already decided against this (stale-claim risk) — always re-read `perfil` fresh.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Session cookie management, token refresh | Custom cookie-parsing + refresh-token logic | `@supabase/ssr`'s `createServerClient`/`createBrowserClient` + the middleware refresh pattern | Handles Next.js's async `cookies()` API, `Set-Cookie` header propagation across Server Components (which can't write cookies) and Route Handlers correctly — a well-documented source of subtle bugs if hand-rolled |
| Multi-tenant row filtering | Manual `WHERE tenant_id = ?` on every query in application code | RLS (`auth_tenant_id()`, already live from Phase 1) | One missed `WHERE` clause in hand-rolled filtering is a cross-tenant data leak; RLS makes it structurally impossible for an owner-scoped client to even construct such a query |
| Theme flash-of-wrong-theme prevention | Manual `localStorage` read + conditional class in `useEffect` | `next-themes` | `next-themes` injects a blocking inline script before hydration specifically to avoid the flash; hand-rolled versions almost always flash on first paint |
| Drag-and-drop list reordering + keyboard accessibility | Custom `dragstart`/`dragover` handlers | `@dnd-kit/sortable` (`useSortable`, `arrayMove`) | Native HTML5 DnD has notoriously inconsistent touch/keyboard support; dnd-kit ships keyboard sensors out of the box, which the UI-SPEC's accessibility requirement for the drag handle explicitly needs |
| Form validation duplicated between client and server | Hand-written `if` checks in both the form component and the Server Action | One zod schema per entity, imported by both `react-hook-form`'s `zodResolver` (client-side UX) and the Server Action itself (source of truth) | Prevents the two validation layers from drifting apart; the Server Action re-validating with the *same* schema is also a security requirement (client-side validation is bypassable) |

**Key insight:** Most of what this phase needs was already solved at the infrastructure layer by Phase 1 (RLS, `auth_tenant_id()`, the base schema) or by the locked UI-SPEC stack — but the model change (Tenant → Negocio(s), 02-CONTEXT.md D-09..D-13) means Phase 2's net-new engineering surface is no longer just "wiring": it now includes the **`0003_tenant_negocio_split.sql` migration** (schema move + RLS rewrite to `negocio_id`/`auth_negocio_ids()`) as a `[BLOCKING]` prerequisite, on top of wiring Server Actions/Components to the post-migration tables, the middleware role gate, and the superadmin bootstrap flow.

## Common Pitfalls

### Pitfall 1: Supabase docs disagree with themselves on `getUser()` vs `getClaims()` in middleware
**What goes wrong:** Different pages of the current official Supabase docs recommend different auth-verification calls for middleware/page protection — one page's proxy-middleware example calls `getClaims()` "to protect pages and user data," while the general server-side-auth guidance and community middleware examples call `getUser()` and explicitly warn "never trust `getSession()`." A live GitHub issue (`supabase/supabase#39947`, titled "SSR auth guides use getUser instead of getClaims") confirms this is an active documentation inconsistency, not a one-off outdated page.
**Why it happens:** Supabase introduced `getClaims()` as a faster, locally-verified alternative (decodes+verifies the JWT via WebCrypto/JWKS, no network call) alongside the older `getUser()` (always round-trips to the Auth server, the only way to detect a server-side-revoked session). Docs pages appear to be mid-migration toward recommending `getClaims()` broadly, but not all pages/examples have been updated consistently.
**How to avoid:** For this phase's `/admin` role gate specifically (the highest-privilege boundary in the app), use `getUser()` in middleware — it is the only one of the two that can detect a session Supabase's Auth server considers revoked (e.g., an admin force-logged-out superadmin, or a password change). For ordinary owner-route protection, either call is defensible; `getUser()` is the safer default until the docs inconsistency resolves.
**Warning signs:** A superadmin whose session was revoked (e.g., account deactivated via the `perfil.activo` toggle, or a Supabase-side force sign-out) still passing the `/admin` gate because a locally-valid-but-revoked JWT was accepted.

### Pitfall 2: The Phase 1 migration file's own comment about `perfil.tenant_id` is stale/misleading
**What goes wrong:** The authored `0001_schema_core.sql` file contains a comment claiming "In v1 this column is NOT NULL because only 'owner' rows are created in Phase 1/2" — but the actual `CREATE TABLE perfil` statement in that same file does NOT declare `tenant_id` as `NOT NULL`, and the live-generated `database.types.ts` (from Phase 1 Plan 01-04, applied to the real `bdgufnitakelyialjoqg` database) confirms `tenant_id: string | null` — i.e., it IS nullable, exactly what a cross-tenant `superadmin` `perfil` row needs.
**Why it happens:** The comment appears to be a forward-looking planning note left in the file that was never reconciled with the final DDL as authored (or as applied) — a documentation/code mismatch, not a schema defect.
**How to avoid:** Trust the generated types file (mechanically produced from the live DB) over prose comments in migration files when the two disagree. Do not add a "make `tenant_id` nullable" migration task — it would be a no-op against the live schema, and could even mask a real problem if run (e.g., if the live schema is ever found to actually differ from `database.types.ts`, that's the discrepancy to chase, not this one).
**Warning signs:** A planner or implementer reading only the `.sql` file (not the generated types) concluding a migration is needed here — this research explicitly confirms it is not, based on the live-generated evidence.

### Pitfall 3: No superadmin `perfil` row exists yet — `/admin` has no one who can log in
**What goes wrong:** Phase 1's seed data (`supabase/seed.sql` + `scripts/apply-seed.ts`) created exactly two `owner` rows (`owner-norte@turnosbot-seed.test`, `owner-sur@turnosbot-seed.test`) for RLS-isolation testing — zero `superadmin` rows exist in the live database. Without a bootstrap step, the `/admin` route is unreachable by design (nobody has `rol = 'superadmin'`) and cannot be tested or demoed.
**Why it happens:** Becoming a superadmin has no self-service path (correctly, per D-06 — cross-tenant access must never be self-granted); the first superadmin can only be created by a script running with `service_role`, analogous to how Phase 1 seeded the two owners via `scripts/apply-seed.ts` (Auth users cannot be created by plain SQL `INSERT` into `auth.users`).
**How to avoid:** Include a one-off bootstrap task/script in Phase 2 (mirroring the existing `scripts/apply-seed.ts` pattern) that calls `service_role.auth.admin.createUser(...)` + inserts a `perfil` row with `rol = 'superadmin'`, `tenant_id = NULL`. Gate this behind a `checkpoint:human-action` for the actual credentials (email/password) the same way Phase 1 Plan 01-04 gated live-DB credential provisioning — do not hardcode a real superadmin password in a committed file.
**Warning signs:** SADMIN-01/02/03 acceptance criteria are impossible to verify end-to-end without this — flag it explicitly as a required (non-migration) setup task.

### Pitfall 4: Mixing the RLS-scoped client and the service_role client in the same file/route
**What goes wrong:** A Server Action file that imports both `lib/supabase/server.ts` (RLS-scoped) and `lib/supabase/admin.ts` (service_role) makes it easy to accidentally use the wrong one for a given query — especially under time pressure, "just use the admin client, it definitely has permission" is a tempting shortcut that silently reintroduces the relaxed-RLS anti-pattern D-03 forbids.
**Why it happens:** Both clients have an identical `.from(table).select()/.insert()/.update()` API surface — nothing type-level distinguishes "this query is tenant-isolated" from "this query sees everything."
**How to avoid:** Enforce a file-boundary convention: only `app/actions/admin-tenants.ts` (or an `(admin)`-scoped actions folder) ever imports `lib/supabase/admin.ts`; add the `server-only` package's import guard to `admin.ts` so any accidental client-side import fails the build, not just a code review.
**Warning signs:** Any `(owner)` route file with `import { createAdminClient } from '@/lib/supabase/admin'` in its diff during code review.

## Code Examples

### Zod schema shared between react-hook-form and a Server Action
```typescript
// lib/schemas/profesional.ts
// Source: pattern per @hookform/resolvers docs + zod v4 (already project-locked)
import { z } from 'zod'

export const profesionalSchema = z.object({
  nombre: z.string().min(1, 'El nombre es obligatorio'),
  activo: z.boolean().default(true),
})
export type ProfesionalInput = z.infer<typeof profesionalSchema>
```
```typescript
// components/profesional-form.tsx (client component, excerpt)
'use client'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { profesionalSchema, type ProfesionalInput } from '@/lib/schemas/profesional'

const form = useForm<ProfesionalInput>({
  resolver: zodResolver(profesionalSchema),
  mode: 'onBlur', // client-side UX validation; the Server Action re-validates authoritatively
})
```

### `@dnd-kit/sortable` service reordering (SVC-02)
```typescript
// Source: pattern per docs.dndkit.com/presets/sortable (official dnd-kit docs)
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable'

function onDragEnd(event: DragEndEvent, servicios: Servicio[], setServicios: (s: Servicio[]) => void) {
  const { active, over } = event
  if (!over || active.id === over.id) return
  const oldIndex = servicios.findIndex((s) => s.id === active.id)
  const newIndex = servicios.findIndex((s) => s.id === over.id)
  const reordered = arrayMove(servicios, oldIndex, newIndex)
  setServicios(reordered) // optimistic UI per UI-SPEC
  reorderServiciosAction(reordered.map((s, i) => ({ id: s.id, orden: i }))) // Server Action, rolls back on failure via toast
}
```

### Logout Server Action (AUTH-04)
```typescript
// app/actions/auth.ts
'use server'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|-------------------|---------------|--------|
| `@supabase/auth-helpers-nextjs` | `@supabase/ssr` | Deprecated, officially replaced (already reflected in this project's locked stack) | N/A — project already on the current package |
| Next.js `cookies()` synchronous | `cookies()` returns a Promise, must be `await`ed | Next.js 15+ (this project is on 16.2.x) | Every `lib/supabase/server.ts`-style helper must be an `async` function |
| `useFormState` (React 18) | `useActionState` (React 19) | React 19 / Next.js 15+ | If the planner opts into the "react-hook-form + `useActionState` bridge" pattern for any form, use `useActionState`, not the removed `useFormState` |
| `getSession()` as the middleware trust check | `getUser()` (network-verified) or `getClaims()` (local JWT verify, newer) | Ongoing docs transition, not fully settled — see Pitfall 1 | Never use `getSession()` alone to gate access server-side; it can return a stale/unverified session |

**Deprecated/outdated:**
- `@supabase/auth-helpers-nextjs`: superseded by `@supabase/ssr`; not applicable here since the project never adopted it.
- Manual `tailwind.config.js` for a fresh shadcn+Tailwind v4 project: current `shadcn init` scaffolds CSS-first `@theme`/`@import "tailwindcss"` config in `globals.css` instead — do not add a `tailwind.config.js` "just in case," it's not needed and can create dual-config confusion.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Exact pinned versions for `next-themes`, `sonner`, `@dnd-kit/*`, `react-hook-form`, `@hookform/resolvers`, `lucide-react`, `shadcn` CLI, `class-variance-authority`, `tailwind-merge`, `clsx` | Standard Stack, Package Legitimacy Audit | Low — all are hugely popular (millions of weekly downloads), multi-year-old, official-org-repo packages; worst case is a minor version drift at install time, not a wrong/hallucinated package. Re-run `npm view <pkg> version` immediately before install per the Version Verification note. |
| A2 | `getUser()` is the correct/safer choice for the `/admin` middleware gate over `getClaims()` | Architecture Patterns Pattern 2, Pitfall 1 | Medium — if Supabase's docs fully settle on `getClaims()` as equally secure (e.g., if it starts checking a revocation list), this recommendation becomes overly conservative but not wrong/unsafe. Confirm against the live `supabase.com/docs/guides/auth/server-side/nextjs` page at implementation time. |
| A3 | Superadmin tenant-creation must use a compensating-transaction pattern (no native cross-system transaction) | Architecture Patterns Pattern 3 | Low-Medium — if Supabase ever ships a transactional way to link Admin API user creation with a Postgres RPC in one call, this manual rollback becomes unnecessary complexity; until then, skipping it risks orphaned `auth.users` rows with no `perfil`. |
| A4 | shadcn CLI flags `-t next -b radix --css-variables -c apps/dashboard -y` (from 02-UI-SPEC.md) are current and valid | Standard Stack (Installation) | Low — independently confirmed via a direct fetch of `ui.shadcn.com/docs/cli`, which lists `-t/--template`, `-b/--base`, `-c/--cwd`, `--css-variables`, `-y/--yes` as exactly these flags with these accepted values. `[CITED]`, not assumed. |

**If this table is empty:** N/A — table is populated; see above.

## Open Questions

1. **`getUser()` vs `getClaims()` in middleware — which does Supabase's docs ultimately standardize on?**
   - What we know: both are currently documented, in different pages, with conflicting recommendations for middleware/page protection specifically (tracked in `supabase/supabase#39947`).
   - What's unclear: whether this resolves before Phase 2 implementation, and whether `getClaims()` will gain revocation-detection parity with `getUser()`.
   - Recommendation: implement with `getUser()` for `/admin` (this research's recommendation); re-check the official Next.js SSR guide's code sample at implementation time and adjust only if it has clearly converged on one method with an explicit security rationale.

2. **First superadmin credentials — who decides the email/password, and how are they delivered?**
   - What we know: Phase 1 established a `checkpoint:human-action` pattern for exactly this kind of "real secret must come from the human" gap (Plan 01-04, Task 1).
   - What's unclear: whether the superadmin's login should be the actual product owner's real email, or another seed-style throwaway credential for now.
   - Recommendation: planner should insert a `checkpoint:human-action` task (mirroring 01-04's Task 1 structure) asking the human to supply/confirm the first superadmin's email before the bootstrap script runs, rather than hardcoding one.

3. **Should the middleware `perfil` lookup be cached to reduce per-request DB round-trips?**
   - What we know: at this project's realistic v1 scale (a handful of tenants, low request volume on a small VPS), an extra RLS-scoped query per request is very unlikely to be a bottleneck.
   - What's unclear: whether the planner wants to preemptively add caching (e.g., a short-TTL signed cookie carrying `rol`) for defense against future scale.
   - Recommendation: do not add caching in Phase 2 — it introduces a stale-role attack surface (a deactivated/role-changed user could retain elevated access until the cache expires) that isn't justified by current scale. Revisit only if profiling in a later phase shows middleware latency is actually a problem.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|--------------|-----------|---------|----------|
| Live Supabase credentials (`.env`, `bdgufnitakelyialjoqg`) | Verifying live schema state directly, running any migration/seed script | ✗ (no `.env` present in this research sandbox — only `.env.example`) | — | Relied on `packages/db-types/src/database.types.ts` (mechanically generated from the live DB in Phase 1 Plan 01-04) as the authoritative live-schema evidence instead of a fresh live query. At execution time, the human must populate `.env` per the `.env.example` template and the Phase 1 Plan 01-04 checkpoint pattern before any Phase 2 task that needs live DB access (superadmin bootstrap script, manual verification). |
| Node.js 24.x / pnpm | Running `pnpm dlx shadcn@latest`, `pnpm add`, dev server | Not probed in this sandbox (no repo build attempted) | — | Already a locked, working project dependency per Phase 1 (arm64 build verified) — no fallback needed, just confirm at execution time with `node --version` / `pnpm --version`. |
| `slopcheck` (Python/pip) | Package Legitimacy Gate | ✗ (`pip`/`pip3` not found in this sandbox) | — | Manual registry/age/downloads/repo/postinstall-script checks performed instead (see Package Legitimacy Audit); all packages tagged `[ASSUMED]`, planner must add `checkpoint:human-verify` before each new install. |

**Missing dependencies with no fallback:**
- None — every gap above has a documented fallback or is deferred to a human-gated execution-time task, consistent with how Phase 1 handled the identical "no live credentials in this environment" situation.

**Missing dependencies with fallback:**
- Live Supabase credentials — fallback: generated types file as schema evidence (this session); real credentials still required at execution time for the superadmin bootstrap script and any live verification task.
- `slopcheck` — fallback: manual package legitimacy checks (age/downloads/repo/postinstall), all packages still tagged `[ASSUMED]`.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | **None installed yet, anywhere in the monorepo** (`apps/bot` has one ad-hoc `tsx`-run smoke test with no framework; `apps/dashboard` has zero test files). Recommend **Vitest** — confirmed current version `4.1.9` via `npm view`, ESM-native (matches this monorepo's `"type": "module"` packages), officially documented for Next.js App Router (`nextjs.org/docs/app/guides/testing/vitest`). `[ASSUMED]` package choice, `[CITED: nextjs.org/docs/app/guides/testing]` for the pattern. |
| Config file | none yet — Wave 0 must add `apps/dashboard/vitest.config.ts` |
| Quick run command | `pnpm --filter @turnosbot/dashboard exec vitest run --silent` (once configured) |
| Full suite command | `pnpm -r --if-present run test` (once each package's `package.json` gets a `test` script) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|---------------------|-------------|
| AUTH-01/02 | Login persists session across refresh | integration (real live DB, mirrors Phase 1's `tenantScoped.test.ts` style) | `pnpm exec tsx scripts/verify-auth-login.ts` | ❌ Wave 0 |
| AUTH-03 | Owner A cannot see/query tenant B's data via the dashboard client | integration, reuses seeded `TENANT_A`/`TENANT_B` fixtures from `scripts/seed-fixtures.ts` | `pnpm exec tsx scripts/verify-dashboard-isolation.ts` | ❌ Wave 0 (fixtures already exist, script does not) |
| AUTH-04 | Logout clears session from any page | manual / smoke (low risk, trivial Server Action) | manual QA per `02-UI-SPEC.md` copywriting contract | n/a — manual-only, low risk justifies it |
| PRO-01..04, SVC-01..02, BIZ-01..03 | zod schema validation rejects invalid input (e.g., negative `precio`, `hora_fin <= hora_inicio`) | unit | `pnpm --filter @turnosbot/dashboard exec vitest run lib/schemas` | ❌ Wave 0 |
| SVC-02 | Reordering persists `orden` correctly (no gaps/dupes after reorder) | unit (pure function: given old array + drag event, assert new `orden` assignment) | `pnpm --filter @turnosbot/dashboard exec vitest run lib/reorder` | ❌ Wave 0 |
| SADMIN-01/02/03 | Superadmin can create a tenant+owner atomically; owner role can never reach `/admin`; a failed tenant-create rolls back the auth user | integration (service_role, real live DB) | `pnpm exec tsx scripts/verify-admin-tenant-lifecycle.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** run the relevant unit test file (`vitest run <path>`) for pure-logic changes; skip live-DB integration scripts per-commit (they're slower and need credentials).
- **Per wave merge:** run the full Vitest suite + all `scripts/verify-*.ts` integration scripts against the live `bdgufnitakelyialjoqg` project.
- **Phase gate:** full suite green (including all integration scripts) before `/gsd:verify-work`.

### Wave 0 Gaps
- [ ] `apps/dashboard/vitest.config.ts` + `vitest` added to `apps/dashboard/package.json` devDependencies — no test framework exists yet anywhere for this app.
- [ ] `scripts/verify-dashboard-isolation.ts` — covers AUTH-03, reusing the two existing seeded tenants/owners from `scripts/seed-fixtures.ts` (no new seed data needed).
- [ ] `scripts/verify-admin-tenant-lifecycle.ts` — covers SADMIN-01/02/03, including the compensating-rollback path (Pattern 3).
- [ ] `lib/schemas/*.test.ts` — one file per zod schema (profesional, servicio, negocio, tenant-admin).
- [ ] Superadmin bootstrap script itself (`scripts/apply-superadmin-seed.ts` or similar) is a prerequisite for the SADMIN test scripts to have a superadmin session to authenticate as — see Pitfall 3.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|----------------|---------|-------------------|
| V2 Authentication | yes | Supabase Auth (`signInWithPassword`, `auth.admin.createUser`) — never hand-roll password hashing/storage (already a locked project decision) |
| V3 Session Management | yes | `@supabase/ssr` cookie-based session, `getUser()` for server-side revalidation in the highest-privilege gate (`/admin`) — see Pitfall 1 |
| V4 Access Control | yes | RLS (`auth_tenant_id()`, already live) for tenant isolation; middleware role gate + structural file-boundary (only one file may import the service_role client) for owner-vs-superadmin separation |
| V5 Input Validation | yes | zod schemas, shared between `react-hook-form`'s client-side resolver and the authoritative server-side re-validation inside each Server Action |
| V6 Cryptography | partial | Out of scope for Phase 2 by explicit decision (D-04) — `tenant.whatsapp_token` remains unwired/plaintext-column-but-unused until Phase 7 (SEC-01, Vault/AES-GCM). Phase 2 must NOT write any real token into this column. |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|-----------------------|
| Owner escalates to `/admin` by guessing the URL | Elevation of Privilege | Middleware role gate reading live `perfil.rol` on every request (Pattern 2) — not a client-side hide, not a JWT claim |
| Tenant A's owner tampers with a form's hidden `tenant_id` field to write into tenant B's rows | Tampering | RLS `WITH CHECK (tenant_id = auth_tenant_id())` makes this structurally impossible regardless of what the client sends; Server Action should still set `tenant_id` server-side, never trust the client value, as defense-in-depth |
| `service_role` key leaks into a client bundle via an incorrectly-scoped import | Information Disclosure / Elevation of Privilege | `server-only` package import guard in `lib/supabase/admin.ts`; file-boundary convention (Pitfall 4); `SUPABASE_SERVICE_ROLE_KEY` never prefixed `NEXT_PUBLIC_` |
| A deactivated (`perfil.activo = false`) user's still-valid JWT continues to pass a `getClaims()`-only gate | Elevation of Privilege / Repudiation | Use `getUser()` (network-verified) for the `/admin` gate specifically (Pitfall 1); also explicitly check `perfil.activo` in middleware, not just `rol` |
| Orphaned `auth.users` row with no `perfil`/tenant after a failed superadmin tenant-creation | Denial of Service (for that would-be owner) / data integrity | Compensating-transaction rollback (Pattern 3) — always delete the just-created auth user if the follow-up Postgres inserts fail |

## Sources

### Primary (HIGH confidence)
- `packages/db-types/src/database.types.ts` (this repo, generated live by Phase 1 Plan 01-04 from `bdgufnitakelyialjoqg`) — authoritative live-schema evidence for the entire Schema Readiness Audit.
- `supabase/migrations/0001_schema_core.sql`, `0002_rls_policies.sql` (this repo) — authored schema/RLS, cross-checked against the generated types above.
- `.planning/phases/01-fundaci-n-multitenant/*` (CONTEXT, 01-04-PLAN, seed files) — established patterns this research extends (seeded fixtures, `.env` credential-gating pattern, `tenantScoped` isolation-testing style).
- npm registry (`npm view <package> version`, direct tool calls on 2026-07-04) — confirmed current published versions for every package in Standard Stack.
- `api.npmjs.org/downloads/point/last-week/<pkg>` (direct tool calls) — download-volume evidence for Package Legitimacy Audit.

### Secondary (MEDIUM confidence)
- `ui.shadcn.com/docs/cli` (WebFetch) — confirmed exact CLI flag syntax (`-t`, `-b`, `-c`, `--css-variables`, `-y`) matches what 02-UI-SPEC.md's init command already specifies.
- `supabase.com/docs/guides/auth/server-side/nextjs` and `.../creating-a-client` (WebFetch) — SSR client/middleware pattern, with the noted `getUser()`/`getClaims()` inconsistency (see Pitfall 1).
- `supabase.com/docs/reference/javascript/auth-admin-createuser` (WebFetch) — Admin API signature for superadmin-driven owner creation.

### Tertiary (LOW confidence)
- WebSearch results on `getUser()` vs `getClaims()`, react-hook-form + `useActionState` bridging, and `@dnd-kit/sortable` table-row patterns — directionally consistent across multiple community sources but not a single authoritative fetch; the GitHub issue `supabase/supabase#39947` (found via WebSearch, not directly opened) is cited as evidence the docs inconsistency is real and tracked, not a misreading on this research's part.

## Metadata

**Confidence breakdown:**
- Standard stack: MEDIUM — package existence/versions confirmed via direct npm registry calls, but Context7 was unavailable this session so package-name provenance stays `[ASSUMED]` per the strict provenance rule; the shadcn CLI flag syntax itself is HIGH (official docs fetch).
- Architecture: HIGH — the dual-client/RLS/service_role separation is a direct, low-risk extension of Phase 1's already-verified-live RLS model; the compensating-transaction pattern for superadmin tenant creation is a standard, well-documented technique for spanning Auth-API + Postgres.
- Schema Readiness: HIGH — based on the live-generated `database.types.ts`, not just the authored SQL file; explicitly resolves a documentation/DDL discrepancy in the migration file's comments (Pitfall 2).
- Pitfalls: MEDIUM — Pitfall 1 (`getUser()`/`getClaims()`) reflects a genuinely unsettled, currently-changing area of Supabase's own documentation; the recommendation is reasonable but should be re-checked at implementation time (see Open Questions).

**Research date:** 2026-07-04
**Valid until:** 2026-08-03 (30 days — stable domain overall, but the `getUser()`/`getClaims()` docs inconsistency noted in Pitfall 1 could resolve sooner; re-check that specific point if implementation starts more than ~2 weeks out)
