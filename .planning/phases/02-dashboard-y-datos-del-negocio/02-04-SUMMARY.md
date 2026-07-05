---
phase: 02-dashboard-y-datos-del-negocio
plan: 04
subsystem: dashboard-owner-shell
tags: [nextjs-app-router, shadcn-sidebar, server-actions, zod, react-hook-form, rls, tdd]

# Dependency graph
requires:
  - phase: 02-02
    provides: dashboard Next.js 16 con Tailwind v4 + shadcn/ui (sidebar, select, dropdown-menu, avatar, form, textarea) + vitest operativo
  - phase: 02-03
    provides: lib/supabase/server.ts (RLS), lib/auth/require-role.ts, app/actions/auth.ts (signIn/signOut), middleware con gate de rol
provides:
  - Shell completo del owner (app/(owner)/layout.tsx + owner-sidebar/negocio-selector/user-menu) montado y navegable
  - lib/negocio-context.ts — única fuente server-side del negocio activo (D-13), consumida por Servicios/Profesionales/Perfil
  - Página de Perfil del negocio (BIZ-01/02/03) + Server Action updateNegocio + negocioSchema (zod, con test)
affects: [profesionales (02-05), servicios (02-06), panel superadmin (02-08)]

# Tech tracking
tech-stack:
  added: []
  patterns: ["negocio-context.ts como única fuente server-side del negocio activo (nunca resolver negocio_id por su cuenta ni confiar en un campo del cliente)", "Server Component (page.tsx) + Client Component separado (negocio-form.tsx) cuando una página necesita await de datos server-side Y react-hook-form", "Server Action deriva negocio_id/tenant_id SIEMPRE del contexto server-side, nunca de un campo del form"]

key-files:
  created:
    - "apps/dashboard/app/(owner)/layout.tsx"
    - "apps/dashboard/app/(owner)/negocio/page.tsx"
    - "apps/dashboard/app/(owner)/negocio/negocio-form.tsx"
    - apps/dashboard/app/actions/negocio.ts
    - apps/dashboard/lib/schemas/negocio.ts
    - apps/dashboard/lib/schemas/negocio.test.ts
  modified: []

key-decisions:
  - "Task 1 (owner-sidebar, negocio-selector, user-menu, negocio-context, negocio-activo.ts) ya existía del commit ea823e4 previo a esta sesión; se verificó contra los acceptance criteria del plan y se encontró que faltaba app/(owner)/layout.tsx — el archivo que efectivamente ensambla esas piezas en un shell navegable. Se completó esa pieza faltante como continuación de Task 1, no como un nuevo task."
  - "negocio-form.tsx se agrega como archivo nuevo (no listado en el files_modified original del Task 2): page.tsx necesita ser Server Component para poder `await getNegocioActivo()`, y react-hook-form/zodResolver requieren `\"use client\"` — Next.js no permite ambas directivas en un mismo archivo, así que el form interactivo se separa a un Client Component propio (mismo patrón de necesidad estructural que negocio-activo.ts en Task 1)."
  - "horario_general (jsonb, 'display only' según 0001_schema_core.sql — el horario autoritativo vive en horario_trabajo por profesional, fuera de alcance) se edita en el form como un resumen de texto libre; se serializa a JSON string en la persistencia y se deserializa de forma tolerante (si el valor legado no es un string plano, se muestra JSON.stringify en vez de romper)."
  - "granularidad_min se modela con z.union([z.literal(15), z.literal(30)]) en vez de z.enum, porque son valores numéricos, no strings."

patterns-established:
  - "Todo Server Action de escritura sobre `negocio` deriva el id del contexto server-side (getNegocioActivo()), nunca de un parámetro del form — mismo espíritu que tenantScoped()/require-role.ts."

requirements-completed: [BIZ-01, BIZ-02, BIZ-03]

# Metrics
duration: ~20min (esta sesión — completa Task 1 preexistente + ejecuta Task 2 entero)
completed: 2026-07-04
status: complete
---

# Phase 2 Plan 04: Shell del owner + selector de negocio + Perfil del negocio Summary

**Shell del owner (sidebar + topbar con selector de negocio y user-menu) ensamblado en `app/(owner)/layout.tsx`, más la página de Perfil del negocio con edición inline (nombre/dirección/teléfono/timezone/granularidad) y WhatsApp vinculado en solo-lectura, con `negocio_id` siempre derivado server-side.**

## Performance

- **Duration:** ~20 min (esta sesión; Task 1 había sido implementado casi completo en una sesión anterior — commit `ea823e4` — pero le faltaba el layout que ensambla las piezas)
- **Completed:** 2026-07-04
- **Tasks:** 2 (Task 1 verificado + completado, Task 2 completo con TDD)
- **Files created esta sesión:** 5 (`app/(owner)/layout.tsx`, `app/(owner)/negocio/page.tsx`, `app/(owner)/negocio/negocio-form.tsx`, `app/actions/negocio.ts`, `lib/schemas/negocio.ts` + `negocio.test.ts`)

## Accomplishments

### Task 1 — Owner shell (verificado + completado)

El commit previo `ea823e4` ya había creado correctamente:
- `lib/negocio-context.ts` — `getNegocioActivo()`, única fuente server-side del negocio activo, valida la cookie contra la lista ya scopeada por RLS (`auth_tenant_id()`), cae al primer negocio (alfabético) si la cookie es inválida/ajena/inexistente.
- `components/negocio-selector.tsx` — `Select` que persiste el negocio elegido vía Server Action; colapsa a etiqueta fija si el tenant tiene un solo negocio (D-13).
- `components/owner-sidebar.tsx` — sidebar shadcn con las tres secciones (Profesionales/Servicios/Negocio), item activo por `usePathname()`.
- `components/user-menu.tsx` — avatar + dropdown con theme toggle (`aria-label="Cambiar tema"`) y "Cerrar sesión" (invoca `signOut`).
- `app/actions/negocio-activo.ts` — Server Action que persiste la cookie, re-validando que el `negocio_id` pertenezca al tenant antes de escribir (T-02-10).

**Lo que faltaba y se completó esta sesión:** `app/(owner)/layout.tsx` no existía — sin él, ninguna de esas piezas tenía un shell donde montarse (no había ninguna carpeta `app/(owner)/` en el repo). Se creó el layout: `requireRole("owner")` (defensa en profundidad) + `getNegocioActivo()` resuelto una sola vez, `SidebarProvider`/`SidebarInset` del bloque shadcn envolviendo `OwnerSidebar`, un header con `SidebarTrigger` + `NegocioSelector` a la izquierda y `UserMenu` a la derecha, y `children` renderizados en el `<main>` central.

### Task 2 — Perfil del negocio (BIZ-01/02/03), TDD completo

- `lib/schemas/negocio.ts`: `negocioSchema` (zod) — nombre requerido, dirección/teléfono opcionales, timezone IANA no vacío, `granularidad_min` restringido a `{15, 30}` vía `z.union([z.literal(15), z.literal(30)])`, `horario_general` como resumen de texto opcional.
- `lib/schemas/negocio.test.ts`: 5 tests — acepta perfil válido completo, acepta con opcionales ausentes, rechaza nombre vacío, rechaza timezone vacío, rechaza granularidad fuera de `{15,30}`.
- **Gate RED confirmado:** se corrió el test con el schema temporalmente ausente — falló con `Cannot find module './negocio'` (commit `f84ab77`, `test(...)`) — antes de restaurar la implementación.
- **Gate GREEN confirmado:** con `negocio.ts` restaurado, los 5 tests pasan (commit `e28d275`, `feat(...)`).
- `app/actions/negocio.ts`: `updateNegocio` re-valida con `negocioSchema` server-side y deriva el `negocio_id` **siempre** de `getNegocioActivo()` — nunca de un parámetro del form (T-02-11); el `.update()` va además RLS-scoped por `negocio.id` (T-02-10, defensa en profundidad).
- `app/(owner)/negocio/page.tsx` (Server Component) + `negocio-form.tsx` (Client Component, react-hook-form + zodResolver): edita nombre/dirección/teléfono/timezone/granularidad (Select 15/30) con CTA "Guardar cambios"; muestra `negocio.display_phone_number` en un bloque de solo-lectura con la nota "Este dato lo configura el superadmin de la plataforma" (BIZ-02).

## Task Commits

1. **Task 1 (completado, previamente parcial):** `7a6cf85` (feat) — `app/(owner)/layout.tsx`
2. **Task 2 — RED:** `f84ab77` (test) — `lib/schemas/negocio.test.ts`
3. **Task 2 — GREEN:** `e28d275` (feat) — `lib/schemas/negocio.ts`, `app/actions/negocio.ts`, `app/(owner)/negocio/page.tsx`, `app/(owner)/negocio/negocio-form.tsx`

(Task 1 original: `ea823e4`, en el historial previo a esta sesión, fuera del alcance de estos commits pero verificado como correcto.)

## Files Created/Modified

- `apps/dashboard/app/(owner)/layout.tsx` — shell owner: `requireRole("owner")` + `getNegocioActivo()` + `SidebarProvider`/`SidebarInset` + topbar (`NegocioSelector`/`UserMenu`)
- `apps/dashboard/app/(owner)/negocio/page.tsx` — Server Component, carga negocio activo
- `apps/dashboard/app/(owner)/negocio/negocio-form.tsx` — Client Component, form de edición + WhatsApp solo-lectura
- `apps/dashboard/app/actions/negocio.ts` — `updateNegocio` Server Action
- `apps/dashboard/lib/schemas/negocio.ts` — `negocioSchema` zod
- `apps/dashboard/lib/schemas/negocio.test.ts` — 5 tests unitarios (vitest)

## Decisions Made

- **Task 1 se trató como "verificar y completar", no "redo":** los 5 archivos del commit `ea823e4` eran correctos y de buena calidad (comentarios detallados, T-02-10 ya mitigado en `negocio-context.ts`/`negocio-activo.ts`); solo faltaba el archivo que los ensambla. Se documenta acá en vez de reescribir código que ya funcionaba.
- **`negocio-form.tsx` como archivo nuevo no listado en el plan:** ver "Deviations" abajo.
- **`horario_general` como texto libre, no editor estructurado:** la columna es jsonb "display only" (comentario explícito en `0001_schema_core.sql`: el horario autoritativo vive en `horario_trabajo` por profesional). Un editor semanal completo para este campo sería sobre-ingeniería fuera del alcance de BIZ-01; se modela como un resumen de texto (`Textarea`) que se persiste como JSON string.
- **`granularidad_min` con `z.union` de literales numéricos, no `z.enum`:** `z.enum` de zod v4 opera sobre strings; los valores de este campo son `number` (15/30), por lo que `z.union([z.literal(15), z.literal(30)])` es la forma correcta de restringir un `number` a un set discreto.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] `app/(owner)/layout.tsx` faltante — Task 1 no podía considerarse completo sin él**
- **Found during:** verificación inicial de Task 1 (instrucción explícita del prompt de resume)
- **Issue:** El commit previo `ea823e4` creó `negocio-context.ts`, `negocio-selector.tsx`, `owner-sidebar.tsx`, `user-menu.tsx` y `negocio-activo.ts`, pero nunca `app/(owner)/layout.tsx`. No existía ninguna carpeta `app/(owner)/` en el repo — sin el layout, esos componentes no tenían dónde montarse y el owner no podía navegar nada.
- **Fix:** Se creó `app/(owner)/layout.tsx`: `requireRole("owner")` (defensa en profundidad) + `getNegocioActivo()` resuelto una vez server-side, envolviendo `OwnerSidebar` + un header (`SidebarTrigger` + `NegocioSelector` + `UserMenu`) + `SidebarInset` para el contenido de cada página hija, usando el bloque `SidebarProvider`/`SidebarInset` de shadcn ya instalado en 02-02.
- **Files modified:** `apps/dashboard/app/(owner)/layout.tsx`
- **Verification:** `tsc --noEmit` limpio; verify automatizado del plan (`user-menu.tsx` contiene "Cerrar sesión" + `aria-label`; `negocio-context.ts` existe) → `shell OK`.
- **Committed in:** `7a6cf85`

**2. [Rule 3 - Blocking issue] `negocio-form.tsx` agregado, fuera del `files_modified` original del Task 2**
- **Found during:** Task 2 (diseño de `page.tsx`)
- **Issue:** El plan solo listaba `app/(owner)/negocio/page.tsx` como archivo de UI, pero `page.tsx` necesita `await getNegocioActivo()` (requiere ser Server Component) y el form interactivo necesita `react-hook-form` + `zodResolver` (requiere `"use client"`). Next.js no permite mezclar ambas directivas en el mismo archivo.
- **Fix:** Se separó el form interactivo a `negocio-form.tsx` (Client Component), recibiendo el `negocio` ya cargado como prop desde `page.tsx` (Server Component). Mismo patrón de necesidad estructural que `negocio-activo.ts` en Task 1 (ya documentado como precedente en el propio código).
- **Files modified:** `apps/dashboard/app/(owner)/negocio/negocio-form.tsx` (nuevo), `apps/dashboard/app/(owner)/negocio/page.tsx` (delega a él)
- **Verification:** `tsc --noEmit` limpio; `vitest run` en verde.
- **Committed in:** `e28d275`

---

**Total deviations:** 2 auto-fijadas (Rule 3 — ambas son piezas estructuralmente necesarias para que el código explícitamente pedido por el plan compile y sea navegable; ninguna introduce comportamiento fuera de lo especificado).

## TDD Gate Compliance

Task 2 tiene `tdd="true"`. Gate sequence verificado en `git log`:
1. **RED:** `f84ab77` — `test(02-04): agrega negocio.test.ts (RED) para negocioSchema` — corrido contra un `lib/schemas/negocio.ts` temporalmente removido; falló con `Cannot find module './negocio'`, confirmando que el test efectivamente ejercita código que no existía todavía (no un falso-positivo).
2. **GREEN:** `e28d275` — `feat(02-04): implementa Perfil del negocio (BIZ-01/02/03)` — con el schema restaurado, los 5 tests pasan.
3. **REFACTOR:** no fue necesario (el schema quedó correcto en el primer pase GREEN).

## Issues Encountered

- **Dependencias no instaladas en el worktree:** el worktree paralelo no tenía `node_modules` (fresh checkout). `corepack enable`/`corepack prepare pnpm@9.15.0 --activate` falló con `EPERM` al intentar escribir `pnpx` en `C:\Program Files\nodejs\` (permisos de Windows). Se resolvió usando `npx --yes pnpm@9.15.0 <comando>` para todas las verificaciones (`install --frozen-lockfile`, `tsc --noEmit`, `vitest run`) — no requirió cambios de código, solo de tooling de esta sesión.

## User Setup Required

None — no se requiere configuración de servicios externos en este plan. Todo el trabajo es contra el schema `negocio` ya migrado (0003, Plan 02-01) y clientes Supabase ya construidos (Plan 02-03).

## Next Phase Readiness

- El shell del owner queda completo y navegable: cualquier página que se monte bajo `app/(owner)/**` (Profesionales en 02-05, Servicios en 02-06) hereda automáticamente el sidebar, el selector de negocio y el user-menu sin trabajo adicional.
- `getNegocioActivo()` es la fuente que 02-05/02-06 deben consumir para saber sobre qué `negocio_id` operar — no deben resolverlo por su cuenta.
- El patrón "Server Component page.tsx + Client Component *-form.tsx separado" queda establecido como el approach para cualquier página que necesite cargar datos server-side y a la vez un form interactivo con react-hook-form.

---
*Phase: 02-dashboard-y-datos-del-negocio*
*Completed: 2026-07-04*

## Self-Check: PASSED

- Los 6 archivos clave (5 nuevos de esta sesión + negocio.test.ts) verificados en disco.
- Los 3 commits de esta sesión (`7a6cf85`, `f84ab77`, `e28d275`) verificados en `git log`.
- `tsc --noEmit`: limpio. `vitest run`: 2 archivos, 6 tests, todos en verde.
