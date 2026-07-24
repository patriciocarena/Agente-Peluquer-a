---
phase: quick-260712-gnl
plan: 01
subsystem: ui
tags: [next.js, react, dashboard, turnos, auth]

# Dependency graph
requires:
  - phase: 04-turnos-y-agenda
    provides: TurnoFormDialog (modo alta/reagendar), TurnoDetailSheet, DiaPicker de la grilla de /turnos
  - phase: 02-dashboard-y-datos-del-negocio
    provides: require-role.ts (gate owner/superadmin), UserMenu, layouts de (owner) y (admin)
provides:
  - "Sheet de detalle se cierra solo tras un reagendado exitoso (onSuccess?() en TurnoFormDialog)"
  - "DiaPicker resincronizado con la fecha cargada al navegar Dia anterior/siguiente (key={fecha})"
  - "UserMenu con iniciales derivadas del email real y email visible en el dropdown (owner y superadmin)"
affects: [turnos, dashboard-ui, auth]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Callback onSuccess?() opcional en un Dialog hijo para que un contenedor padre reaccione al éxito sin que el hijo conozca al padre (turno-form-dialog.tsx -> turno-detail-sheet.tsx)"
    - "key={prop} en un input no controlado (defaultValue) para forzar remount y resincronizar tras cambios server-side de la misma prop (patrón canónico de React, no requiere convertirlo a input controlado)"
    - "Campo aditivo en el tipo de retorno de un helper de auth (PerfilAutenticado.email) — seguro para todos los callers existentes que descartan el retorno (tipado estructural de TS)"

key-files:
  created: []
  modified:
    - apps/dashboard/components/turno-form-dialog.tsx
    - apps/dashboard/components/turno-detail-sheet.tsx
    - apps/dashboard/components/dia-picker.tsx
    - apps/dashboard/lib/auth/require-role.ts
    - apps/dashboard/app/(owner)/layout.tsx
    - apps/dashboard/app/(admin)/admin/layout.tsx
    - apps/dashboard/components/user-menu.tsx

key-decisions:
  - "El fix del Bug 1 NO refresca el turno in-place dentro del Sheet: cierra el Sheet al éxito, dejando la grilla ya revalidada (revalidatePath) como única fuente de verdad visible — mismo patrón que ya usaba 'Cancelar turno'"
  - "Iniciales del UserMenu derivadas de las primeras 2 letras (mayúsculas) de la parte local del email (antes del @), con fallback '?' — la tabla perfil no tiene columna nombre, user.email de auth.users es el único identificador humano disponible"
  - "Email mostrado en el dropdown vía DropdownMenuLabel, primitivo ya existente en components/ui/dropdown-menu.tsx (text-xs text-muted-foreground) en vez de un div ad-hoc, para consistencia visual con el resto del dropdown"

patterns-established:
  - "Pattern 1: un Dialog reusado en un contexto anidado (Sheet padre) expone onSuccess?() opcional en vez de que el padre le pase su propio onOpenChange como si fuera el mismo estado"
  - "Pattern 2: inputs nativos no controlados (type=date, defaultValue) que dependen de una prop server-side deben llevar key={prop} para resincronizar en navegación client-side sin remount de árbol"

requirements-completed: [UX-BUG-1-sheet-reagendar-stale, UX-BUG-2-diapicker-desync, UX-BUG-3-usermenu-iniciales-hardcodeadas]

# Metrics
duration: ~35min
completed: 2026-07-12
---

# Quick Task 260712-gnl: Fix 3 bugs UX confirmados en dashboard de turnos Summary

**Sheet de reagendar se cierra solo al éxito, DiaPicker resincronizado con `key={fecha}`, y UserMenu con iniciales/email reales derivados de `auth.getUser()` en vez de "OW" hardcodeado.**

## Performance

- **Duration:** ~35 min (incluye corrección del punto base del worktree y bootstrap de dependencias)
- **Started:** 2026-07-12T14:40:00Z (aprox.)
- **Completed:** 2026-07-12T15:15:35Z
- **Tasks:** 3/3 completadas
- **Files modified:** 7

## Accomplishments

- **Bug 1 (Sheet stale tras reagendar):** `TurnoFormDialog` gana un callback opcional `onSuccess?()` invocado junto a `onOpenChange(false)` cuando el submit termina en éxito. `TurnoDetailSheet` lo usa para cerrarse (`onOpenChange(false)` del Sheet padre) cuando el reagendado del hijo tiene éxito — la grilla de fondo, ya revalidada por la Server Action, queda como única fuente de verdad visible en vez de un Sheet con el horario viejo. El modo "alta" no pasa `onSuccess`, así que su comportamiento no cambió.
- **Bug 2 (DiaPicker desincronizado):** el `<input type="date">` de `dia-picker.tsx` gana `key={fecha}`, forzando a React a desmontar/remontar el input cada vez que cambia la prop `fecha` (navegación server-side vía `Link`) y re-aplicar `defaultValue` con el valor nuevo — antes el input quedaba pegado en el día anterior porque `defaultValue` no tiene efecto en updates, solo en el mount inicial.
- **Bug 3 (iniciales hardcodeadas "OW"):** `PerfilAutenticado` y el retorno de `requireRole()` ganan `email: string` (`user.email ?? ""`), cambio puramente aditivo verificado seguro contra los ~20 callers existentes de `requireRole` (todos descartan el retorno con `await requireRole("owner");`). Ambos layouts (`(owner)` y `(admin)/admin`) capturan `{ email }` y lo pasan a `<UserMenu email={email} />`. `UserMenu` deriva iniciales localmente (`inicialesDeEmail`: primeras 2 letras en mayúsculas de la parte antes del `@`, fallback `"?"`) y muestra el email completo, no clickeable, en el dropdown vía el `DropdownMenuLabel` ya existente en la librería UI.
- Los 7 archivos tocados son exactamente los listados en `<files_modified>` del plan — verificado con `git diff --stat` sobre el rango completo de los 3 commits.

## Task Commits

Each task was committed atomically:

1. **Task 1: Cerrar el Sheet de detalle tras un reagendado exitoso (Bug 1)** - `07cb6b3` (fix)
2. **Task 2: Resincronizar el DiaPicker al navegar días (Bug 2)** - `a8a0955` (fix)
3. **Task 3: Iniciales y email reales en el UserMenu (Bug 3)** - `fdd46f9` (fix)

**Plan metadata:** (pendiente — el orquestador realiza el commit de docs)

## Files Created/Modified

- `apps/dashboard/components/turno-form-dialog.tsx` - Prop opcional `onSuccess?: () => void` en `Props`, destructurada y invocada en `onSubmit()` junto a `onOpenChange(false)` en la rama de éxito.
- `apps/dashboard/components/turno-detail-sheet.tsx` - `<TurnoFormDialog mode="reagendar" ...>` gana `onSuccess={() => onOpenChange(false)}`, cerrando el Sheet padre tras un reagendado exitoso.
- `apps/dashboard/components/dia-picker.tsx` - `<input type="date">` gana `key={fecha}` para forzar remount y resincronizar `defaultValue` al navegar días.
- `apps/dashboard/lib/auth/require-role.ts` - `PerfilAutenticado` gana `email: string`; `requireRole()` devuelve `email: user.email ?? ""`.
- `apps/dashboard/app/(owner)/layout.tsx` - Captura `{ email }` de `requireRole("owner")` y lo pasa a `<UserMenu email={email} />`.
- `apps/dashboard/app/(admin)/admin/layout.tsx` - Captura `{ email }` de `requireRole("superadmin")` y lo pasa a `<UserMenu email={email} />`.
- `apps/dashboard/components/user-menu.tsx` - Nuevo tipo `Props { email: string }`, función local `inicialesDeEmail()`, `<AvatarFallback>` renderiza iniciales derivadas (no "OW"), y `DropdownMenuLabel` con el email completo arriba del toggle de tema.

## Decisions Made

- El fix del Bug 1 no intenta refrescar el `turno` in-place dentro del Sheet (el objeto es una snapshot capturada al click); en cambio cierra el Sheet al éxito, mismo resultado final que ya provocaba "Cancelar turno" — más simple y consistente que introducir estado de refetch.
- Iniciales derivadas de las primeras 2 letras (mayúsculas) de la parte local del email, con fallback `"?"` si el email viene vacío — único identificador humano disponible dado que `perfil` no tiene columna `nombre`.
- Email mostrado vía `DropdownMenuLabel` (ya exportado por `components/ui/dropdown-menu.tsx`, clases `text-xs font-medium text-muted-foreground`) en vez de un `<div>` ad-hoc — reutiliza el primitivo de la librería para consistencia visual, con `font-normal` + `truncate` para no competir visualmente con un heading real y no desbordar con emails largos.

## Deviations from Plan

None - plan executed exactly as written (los 3 diffs coinciden con el patrón prescripto en el `<action>` de cada tarea; el `DropdownMenuLabel` reutilizado es una interpretación fiel de "o similar, consistente con el resto del dropdown").

## Issues Encountered

**Punto base del worktree incorrecto (corregido antes de tocar código):** el `<worktree_branch_check>` inicial reveló que `git merge-base HEAD 6dd705c...` devolvía `728cffe...` (no `6dd705c...` como esperaba el chequeo) — el worktree había quedado anclado en el commit padre del pre-dispatch de este plan, sin los últimos commits de `main` (incluido el propio `260712-gnl-PLAN.md`). Verificado que era un fast-forward seguro (`728cffe` ancestro de `6dd705c`, árbol de trabajo limpio, sin commits propios que perder) y corregido con `git reset --hard 6dd705c...` por instrucción explícita del protocolo de arranque. Re-verificado que los 7 archivos objetivo eran bit-idénticos entre ambos commits (el `reset` solo trajo docs + 2 archivos de Servicios ajenos a este plan), así que no hizo falta releer nada más allá de re-apuntar las rutas de `Read` al worktree correcto antes de cada `Edit`.

**Dependencias del worktree ausentes:** `node_modules` no estaba instalado (`sh: tsc: command not found`). Se corrió `corepack pnpm install` en la raíz del monorepo, que también reconstruyó `packages/availability-engine/dist/` vía su script `prepare` (trampa de entorno ya documentada en `STATE.md`).

**Error de typecheck preexistente y fuera de alcance:** `corepack pnpm typecheck` en `apps/dashboard` reporta un único error en `app/(owner)/turnos/page.tsx:250` (`number | null` no asignable a `number`, `fmtPrecio(t.precio_total)`), introducido por el trabajo de la vista Semana (`728cffe`/`83cb5ad`) y ya documentado como pendiente en `STATE.md` y en el `deferred-items.md` de la quick task `260712-g2y`. La nota de `<verification>` del plan afirmaba que este error "ya fue resuelto en un commit posterior" — no fue el caso para el punto base real de este worktree; sigue presente y sigue siendo completamente ajeno a los 7 archivos de este plan. No se tocó — fuera de alcance estricto. Documentado en `260712-gnl-deferred-items.md`. Las 3 tareas se verificaron confirmando que `tsc` no cambia (mismo único error preexistente) antes y después de cada edición — cero errores nuevos introducidos por este plan.

## Known Stubs

Ninguno. Los 3 fixes conectan datos/comportamiento reales ya existentes (revalidatePath, `user.email` de `auth.getUser()`, la prop `fecha` server-side) — no se introdujo ningún placeholder ni dato mockeado.

## Threat Flags

Ninguno nuevo. El único cambio con superficie de datos (email visible en `UserMenu`) ya estaba cubierto por el `<threat_model>` del plan (T-gnl-01, disposition `accept`: el email es del propio usuario autenticado, renderizado solo en su propio topbar). El cambio de tipo de retorno de `requireRole()` (T-gnl-02, `accept`) es puramente aditivo y no altera ninguna decisión de acceso.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Los 3 bugs de UX confirmados en vivo quedaron cerrados a nivel de código y typecheck. Verificación conductual final (los 3 `<human-check>` del plan, en `/turnos` y `/admin` contra `localhost:5202`) queda para el usuario — `apps/dashboard` no tiene framework de render de componentes, así que el comportamiento visual/interactivo requiere ojos humanos, consistente con el resto de los pendientes visuales ya trackeados en `STATE.md` (fase 04). Sigue pendiente, fuera de este plan, el error de typecheck preexistente en `turnos/page.tsx:250` (vista Semana) — ver `260712-gnl-deferred-items.md`.

---
*Quick task: 260712-gnl*
*Completed: 2026-07-12*

## Self-Check: PASSED

- FOUND: apps/dashboard/components/turno-form-dialog.tsx
- FOUND: apps/dashboard/components/turno-detail-sheet.tsx
- FOUND: apps/dashboard/components/dia-picker.tsx
- FOUND: apps/dashboard/lib/auth/require-role.ts
- FOUND: apps/dashboard/app/(owner)/layout.tsx
- FOUND: apps/dashboard/app/(admin)/admin/layout.tsx
- FOUND: apps/dashboard/components/user-menu.tsx
- FOUND commit: 07cb6b3
- FOUND commit: a8a0955
- FOUND commit: fdd46f9
