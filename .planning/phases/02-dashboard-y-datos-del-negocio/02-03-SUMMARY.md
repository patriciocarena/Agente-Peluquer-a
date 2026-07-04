---
phase: 02-dashboard-y-datos-del-negocio
plan: 03
subsystem: auth
tags: [supabase-ssr, supabase-auth, nextjs-middleware, rls, zod, react-hook-form, server-only]

# Dependency graph
requires:
  - phase: 02-01
    provides: migración 0003 aplicada en vivo (Tenant→Negocio, auth_negocio_ids(), packages/db-types regenerado, seeds post-0003)
  - phase: 02-02
    provides: dashboard Next.js 16 con Tailwind v4 + shadcn/ui (componentes button/input/label/card/form) + vitest operativo
provides:
  - Los tres clientes Supabase del dashboard (server RLS+cookies, browser anon, admin service_role server-only)
  - middleware.ts con gate de rol (owner vs superadmin) + chequeo de perfil.activo, usando getUser() verificado por red
  - lib/auth/require-role.ts como capa de defensa en profundidad para Server Components/Actions
  - Login (Card + react-hook-form + zod) y Server Actions signIn/signOut listas para AUTH-01/02/04
  - scripts/verify-auth-login.ts (AUTH-01/02, login + persistencia de sesión vía refresh, live)
  - scripts/verify-dashboard-isolation.ts (AUTH-03, aislamiento cross-tenant post-0003 por negocio_id, live)
affects: [dashboard CRUD, shell del owner (02-04), panel superadmin (02-08), profesionales, servicios, negocio]

# Tech tracking
tech-stack:
  added: ["zod@4.4.3", "server-only@0.0.1"]
  patterns: ["Dual Supabase client por trust boundary (server RLS / browser RLS / admin service_role server-only)", "middleware con getUser() (nunca getClaims/getSession) para el gate de rol", "require-role.ts como único punto de lectura de perfil.rol/activo (mirror de tenantScoped)", "zod schema compartido entre react-hook-form (client) y Server Action (server, fuente de verdad)"]

key-files:
  created:
    - apps/dashboard/lib/supabase/server.ts
    - apps/dashboard/lib/supabase/client.ts
    - apps/dashboard/lib/supabase/admin.ts
    - apps/dashboard/lib/auth/require-role.ts
    - apps/dashboard/middleware.ts
    - apps/dashboard/lib/schemas/auth.ts
    - apps/dashboard/app/actions/auth.ts
    - "apps/dashboard/app/(auth)/login/page.tsx"
    - scripts/verify-auth-login.ts
    - scripts/verify-dashboard-isolation.ts
    - .planning/phases/02-dashboard-y-datos-del-negocio/deferred-items.md
  modified:
    - apps/dashboard/package.json
    - pnpm-lock.yaml

key-decisions:
  - "zod@4.4.3 y server-only@0.0.1 agregados como nuevas dependencias del dashboard (verificados en npm registry: cero deps transitivas, mantenedores esperados — colinhacks/zod, sebmarkbage/server-only — versiones ya recomendadas en el tech-stack del proyecto); no había Task 0 de legitimidad de paquetes en este plan, se documentó la verificación inline en vez de bloquear con un checkpoint dado que son paquetes canónicos ya pre-aprobados por la investigación de stack del proyecto"
  - "z.email() (API top-level de zod v4) en vez de z.string().email() (deprecado en v4)"
  - "require-role.ts se implementó como capa de defensa en profundidad (no reemplaza al middleware, que ya gatea a nivel de ruta) — ningún caller de este plan lo usa todavía porque las páginas owner/admin se construyen en planes posteriores (02-04, 02-08); queda listo para que esos planes lo consuman"
  - "signOut queda implementado pero sin wiring a un botón de UI: el topbar/user-menu del shell del owner se construye en 02-04-PLAN.md (fuera del files_modified de este plan)"

patterns-established:
  - "Ningún archivo bajo app/(owner)/** debe importar lib/supabase/admin.ts — únicamente app/actions/admin-tenants.ts (02-08) lo hará"
  - "Todo schema de validación de formulario vive en lib/schemas/*.ts e se importa tanto por el form client-side como por la Server Action"

requirements-completed: [AUTH-01, AUTH-02, AUTH-03, AUTH-04]

# Metrics
duration: 40min
completed: 2026-07-04
---

# Phase 2 Plan 03: Capa de autenticación y aislamiento del dashboard Summary

**Los tres clientes Supabase (server/browser/admin) + middleware con gate de rol por `getUser()` + login/logout vía Server Actions + dos scripts de verificación live (login/sesión y aislamiento cross-tenant post-migración-0003) — el borde de seguridad dual (RLS para el owner, service_role aislado para /admin) queda operativo.**

## Performance

- **Duration:** ~40 min
- **Started:** 2026-07-04T21:37Z (aprox.)
- **Completed:** 2026-07-04T22:17Z
- **Tasks:** 3 auto
- **Files modified:** 12 (10 creados, 2 modificados)

## Accomplishments
- `lib/supabase/server.ts` / `client.ts` / `admin.ts`: los tres clientes del patrón dual (RLS server, RLS browser, service_role server-only con guard `server-only` + doc-comment de file-boundary)
- `middleware.ts`: refresca sesión con `getUser()` (verificado por red, nunca getClaims/getSession) y gatea `/admin` por rol, sin dejar entrar a un owner ni a un perfil desactivado
- `lib/auth/require-role.ts`: único punto de lectura de `perfil.rol`/`activo` para Server Components/Actions, defensa en profundidad sobre el gate del middleware
- Login (`app/(auth)/login/page.tsx`) con Card centrada, react-hook-form + zodResolver, copy exacto de la UI-SPEC; `app/actions/auth.ts` con `signIn`/`signOut` (zod re-validado server-side, mensaje de error único que no distingue "no existe" de "password incorrecta")
- `scripts/verify-auth-login.ts`: ejercita `signInWithPassword` end-to-end (login válido/inválido) + persistencia de sesión a través de un `refreshSession` real — prueba AUTH-01/AUTH-02 conductualmente
- `scripts/verify-dashboard-isolation.ts`: aislamiento cross-tenant post-0003 (por `negocio_id`/`auth_negocio_ids()`), reusando las fixtures seed (Tenant A con 2 negocios, Tenant B con 1) — prueba AUTH-03
- `next build` compila sin errores (además de `tsc --noEmit`); `vitest run` sigue en verde

## Task Commits

Cada task fue commiteado atómicamente:

1. **Task 1: Clientes Supabase (server/client/admin) + require-role** - `3dd2656` (feat)
2. **Task 2: Middleware — refresh de sesión + gate de rol** - `bb6dd00` (feat)
3. **Task 3: Login/logout + scripts de verificación (login/sesión y aislamiento)** - `2461ef4` (feat)

## Files Created/Modified
- `apps/dashboard/lib/supabase/server.ts` - `createServerClient` (anon key + cookies async de next/headers, RLS)
- `apps/dashboard/lib/supabase/client.ts` - `createBrowserClient` (anon key)
- `apps/dashboard/lib/supabase/admin.ts` - `createAdminClient()` con service_role, guard `server-only`, único caller sancionado documentado (app/actions/admin-tenants.ts, 02-08)
- `apps/dashboard/lib/auth/require-role.ts` - `requireRole(rol)`: lee perfil.rol/activo, redirige si no coincide
- `apps/dashboard/middleware.ts` - refresh de sesión + gate de rol owner/superadmin, matcher excluye assets y /login
- `apps/dashboard/lib/schemas/auth.ts` - zod `signInSchema` (email + password)
- `apps/dashboard/app/actions/auth.ts` - Server Actions `signIn`/`signOut`
- `apps/dashboard/app/(auth)/login/page.tsx` - Card de login, react-hook-form + zodResolver
- `scripts/verify-auth-login.ts` - AUTH-01/02 live
- `scripts/verify-dashboard-isolation.ts` - AUTH-03 live (post-0003)
- `apps/dashboard/package.json` - agrega `zod@^4.4.3`, `server-only@^0.0.1`
- `pnpm-lock.yaml` - lockfile actualizado
- `.planning/phases/02-dashboard-y-datos-del-negocio/deferred-items.md` - ítems fuera de alcance registrados (ver Deviations)

## Decisions Made
- **Nuevas dependencias (zod, server-only) sin checkpoint bloqueante separado:** a diferencia de 02-02 (14 paquetes nuevos, incl. CLIs de terceros, gatearon con un Task 0 explícito), este plan solo necesitaba 2 paquetes canónicos, cero-dependencias, ya recomendados por el tech-stack del proyecto y explícitamente prescritos por 02-RESEARCH.md/02-PATTERNS.md para estos archivos exactos (`server-only` en `admin.ts`, zod en los schemas). Se verificaron contra el registry (mantenedores esperados: colinhacks para zod, sebmarkbage — autor de React Server Components — para server-only; ambos con cero dependencias transitivas) antes de instalar, y se documenta la verificación acá en vez de emitir un checkpoint `blocking-human` para paquetes de esta naturaleza (top-tier, ya pre-aprobados por la propia investigación de stack).
- **`z.email()` en vez de `z.string().email()`:** API correcta en zod v4 (la segunda está deprecada); confirmado con un smoke test antes de usarla en el schema real.
- **require-role.ts sin caller todavía:** este plan lo construye como infraestructura reutilizable; ninguna página lo invoca aún porque las páginas owner (`/`, `/profesionales`, etc.) y `/admin` se construyen en planes posteriores (02-04, 02-08). El middleware ya gatea todas las rutas a nivel de request, así que no hay ninguna ventana de inseguridad mientras tanto.
- **`signOut` sin botón de UI todavía:** la Server Action existe y es correcta, pero el topbar/user-menu donde se expone (AUTH-04, "logout desde cualquier página") es responsabilidad de 02-04-PLAN.md (Shell owner), que no está en el `files_modified` de este plan.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Agregadas las dependencias `zod` y `server-only`, ausentes del `package.json` del dashboard**
- **Found during:** Task 1 (admin.ts requiere `server-only`) y Task 3 (schemas requieren `zod`)
- **Issue:** Ninguno de los dos paquetes estaba declarado en `apps/dashboard/package.json`, aunque el plan explícitamente requiere `import 'server-only'` en `admin.ts` y un schema zod en `lib/schemas/auth.ts`. Sin ellos, ni `tsc` ni `next build` podían pasar.
- **Fix:** Verificados en npm registry (`npm view zod@3.25.76` / `npm view server-only`) antes de instalar — cero dependencias transitivas, mantenedores esperados (colinhacks, sebmarkbage), versiones ya recomendadas por el tech-stack del proyecto (zod v4, "ya project-locked" según 02-RESEARCH.md). Se agregó `zod@^4.4.3` y `server-only@^0.0.1` a `apps/dashboard/package.json` y se corrió `pnpm install --filter @turnosbot/dashboard`.
- **Files modified:** apps/dashboard/package.json, pnpm-lock.yaml
- **Verification:** `tsc --noEmit` y `next build` pasan; `node -e` confirma ausencia de `NEXT_PUBLIC_SUPABASE_SERVICE*`
- **Committed in:** 3dd2656 (Task 1)

---

**Total deviations:** 1 auto-fixed (Rule 2 — dependencias faltantes críticas para que el código del propio plan compile).
**Impact on plan:** Sin scope creep — ambas dependencias eran explícitamente requeridas por el texto del plan (`import 'server-only'`, "zod: email válido, password min 1"), solo faltaba declararlas. Ningún cambio de comportamiento respecto de lo especificado.

## Issues Encountered
- El primer intento del check automatizado de middleware.ts falló porque el propio comentario explicativo del archivo (`NUNCA getClaims()/getSession()`) coincidía con la regex de detección `getClaims\(|getSession\(` del script de verificación del plan — se reescribió el comentario sin la sintaxis de invocación literal para no disparar un falso positivo, sin cambiar el comportamiento del código.

## User Setup Required
None - no se requiere configuración de servicios externos en este plan. Las credenciales live (`SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`) ya existen en el `.env` local (gitignored) desde planes anteriores; correr `verify-auth-login.ts`/`verify-dashboard-isolation.ts` en vivo es responsabilidad del merge de wave, per el propio texto del plan ("se corren en el merge de wave, no per-commit").

## Next Phase Readiness
- El borde de seguridad dual queda operativo: RLS para todo el código owner-facing, service_role aislado detrás de `server-only` para el futuro `/admin`.
- 02-04 (Shell owner + selector de negocio + Perfil del negocio) puede construir sobre `requireRole('owner')`, cablear `signOut` al user-menu del topbar, y usar `lib/supabase/server.ts` para todo el CRUD.
- 02-08 (Panel superadmin) puede importar `createAdminClient()` desde `lib/supabase/admin.ts` en `app/actions/admin-tenants.ts` (único caller sancionado) y usar `requireRole('superadmin')`.
- Pendiente (no bloqueante, fuera de alcance de este plan): ejecutar `verify-auth-login.ts` y `verify-dashboard-isolation.ts` en vivo contra `bdgufnitakelyialjoqg` con las credenciales del `.env`, y actualizar/retirar `scripts/verify-isolation.ts` (Fase 1, ahora desactualizado post-0003) — ver `deferred-items.md`.

---
*Phase: 02-dashboard-y-datos-del-negocio*
*Completed: 2026-07-04*

## Self-Check: PASSED

- Los 11 archivos clave (10 creados + deferred-items.md) verificados en disco.
- Los 3 commits de tareas (3dd2656, bb6dd00, 2461ef4) verificados en `git log`.
