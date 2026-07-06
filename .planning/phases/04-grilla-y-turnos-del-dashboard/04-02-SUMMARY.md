---
phase: 04-grilla-y-turnos-del-dashboard
plan: 02
subsystem: ui
tags: [shadcn, zod, radix-ui, react, nextjs, dashboard]

# Dependency graph
requires:
  - phase: 03-motor-de-disponibilidad
    provides: "uuidLike helper pattern (packages/availability-engine/src/booking.ts) replicated for dashboard-side validation"
  - phase: 02-dashboard-y-datos-del-negocio
    provides: "owner-sidebar.tsx NAV_ITEMS pattern, lib/schemas/servicio.ts molde estructural"
provides:
  - "components/ui/popover.tsx (Popover, PopoverTrigger, PopoverContent) — necesario para slot-popover (D-03) y bloqueo-popover (D-05)"
  - "owner-sidebar.tsx con 'Turnos' como primer ítem de nav, enlazando /turnos"
  - "turnoSchema + TurnoInput (lib/schemas/turno.ts)"
  - "bloqueoSchema + BloqueoInput (lib/schemas/bloqueo.ts)"
  - "clienteInlineSchema + ClienteInlineInput, clienteBusquedaSchema + ClienteBusquedaInput (lib/schemas/cliente.ts)"
affects: ["04-grilla-y-turnos-del-dashboard Plan 03", "04-grilla-y-turnos-del-dashboard Plan 04", "04-grilla-y-turnos-del-dashboard Plan 05", "04-grilla-y-turnos-del-dashboard Plan 06", "04-grilla-y-turnos-del-dashboard Plan 07"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "uuidLike (regex de forma UUID 8-4-4-4-12, no z.uuid() estricto) replicado en el dashboard idéntico al del motor — evita rechazar ids reales que la propia DB guardó"
    - "Popover generado desde el registro oficial de shadcn, sourcing del umbrella radix-ui ya instalado — sin dependencia npm nueva"

key-files:
  created:
    - apps/dashboard/components/ui/popover.tsx
    - apps/dashboard/lib/schemas/turno.ts
    - apps/dashboard/lib/schemas/turno.test.ts
    - apps/dashboard/lib/schemas/bloqueo.ts
    - apps/dashboard/lib/schemas/bloqueo.test.ts
    - apps/dashboard/lib/schemas/cliente.ts
    - apps/dashboard/lib/schemas/cliente.test.ts
  modified:
    - apps/dashboard/components/owner-sidebar.tsx

key-decisions:
  - "motivo de bloqueo SIEMPRE opcional (nunca .min()/required) — D-12/D-05, consistente con la columna nullable de la DB"
  - "uuidLike replicado sin modificarlo — cualquier drift entre el schema del dashboard y el del motor (booking.ts) rompería la consistencia de validación en el límite V5"

patterns-established:
  - "Molde de schema zod (JSDoc explicando cada regla + export const schema + export type Input) aplicado consistentemente a turno/bloqueo/cliente, siguiendo servicio.ts"

requirements-completed: [APPT-01, APPT-02, APPT-06]

coverage:
  - id: D1
    description: "Popover shadcn instalado (components/ui/popover.tsx) sin dependencia npm nueva"
    verification:
      - kind: unit
        ref: "test -f apps/dashboard/components/ui/popover.tsx && grep PopoverContent"
        status: pass
      - kind: other
        ref: "git status --short tras pnpm dlx shadcn add popover: sin cambios a package.json/pnpm-lock.yaml"
        status: pass
    human_judgment: false
  - id: D2
    description: "owner-sidebar.tsx con 'Turnos' como primer ítem de NAV_ITEMS, ícono CalendarDays, enlazando /turnos"
    requirement: "APPT-06"
    verification:
      - kind: unit
        ref: "grep '/turnos' y grep 'CalendarDays' en owner-sidebar.tsx"
        status: pass
    human_judgment: false
  - id: D3
    description: "turnoSchema valida profesionalId/clienteId/serviceIds/inicio/fin con uuidLike consistente con el motor"
    requirement: "APPT-01"
    verification:
      - kind: unit
        ref: "apps/dashboard/lib/schemas/turno.test.ts (5 tests: válido, múltiples serviceIds, serviceIds vacío, UUID inválido, fecha mal formada)"
        status: pass
    human_judgment: false
  - id: D4
    description: "bloqueoSchema con motivo SIEMPRE opcional (D-12)"
    requirement: "APPT-02"
    verification:
      - kind: unit
        ref: "apps/dashboard/lib/schemas/bloqueo.test.ts (4 tests: con motivo, sin motivo, motivo >280 chars, UUID inválido)"
        status: pass
    human_judgment: false
  - id: D5
    description: "clienteInlineSchema (alta al vuelo, D-09) y clienteBusquedaSchema (búsqueda por teléfono), teléfono normalizado (trim)"
    requirement: "APPT-01"
    verification:
      - kind: unit
        ref: "apps/dashboard/lib/schemas/cliente.test.ts (7 tests: con/sin nombre, trim, teléfono corto, búsqueda parcial, búsqueda vacía/corta)"
        status: pass
    human_judgment: false

duration: 15min
completed: 2026-07-05
status: complete
---

# Phase 4 Plan 2: Fundación de la fase (Popover + nav Turnos + schemas zod) Summary

**Popover shadcn instalado desde el registro oficial, nav "Turnos" agregada como primer ítem del sidebar, y tres schemas zod (turno/bloqueo/cliente) con 16 tests que replican el `uuidLike` del motor de disponibilidad.**

## Performance

- **Duration:** ~15 min
- **Tasks:** 2 completed
- **Files modified:** 8 (1 nuevo componente, 1 sidebar modificado, 6 archivos de schemas/tests nuevos)

## Accomplishments
- `components/ui/popover.tsx` generado vía `shadcn@latest add popover`, sourcing del umbrella `radix-ui@^1.6.1` ya instalado — sin dependencia npm nueva (verificado: `git status` tras el install no tocó `package.json` ni `pnpm-lock.yaml`).
- `owner-sidebar.tsx`: "Turnos" agregado como PRIMER ítem de `NAV_ITEMS` con ícono `CalendarDays`, enlazando `/turnos` (pantalla operativa diaria, 04-UI-SPEC.md).
- `turnoSchema`, `bloqueoSchema`, `clienteInlineSchema`/`clienteBusquedaSchema` creados siguiendo el molde de `servicio.ts`, con el mismo helper `uuidLike` (regex de forma UUID) que usa `packages/availability-engine/src/booking.ts` — sin drift de validación entre dashboard y motor.
- 16 tests nuevos (5 turno + 4 bloqueo + 7 cliente), todos verdes junto con los 36 tests preexistentes de otros schemas (52 total en la suite `schemas`).

## Task Commits

Each task was committed atomically:

1. **Task 1: Instalar Popover + agregar nav "Turnos" al sidebar** - `b39d235` (feat)
2. **Task 2: Schemas zod turno / bloqueo / cliente** - `744bcf9` (feat)

_Nota: no hubo ciclo TDD RED/GREEN explícito en este plan (`tdd` no está marcado `true` en las tasks) — los tests se escribieron junto con la implementación en el mismo commit, como en el molde de `servicio.ts`/`servicio.test.ts`._

## Files Created/Modified
- `apps/dashboard/components/ui/popover.tsx` - Componente shadcn Popover/PopoverTrigger/PopoverContent/PopoverAnchor/PopoverHeader/PopoverTitle/PopoverDescription
- `apps/dashboard/components/owner-sidebar.tsx` - "Turnos" como primer ítem de NAV_ITEMS (CalendarDays, /turnos)
- `apps/dashboard/lib/schemas/turno.ts` - `turnoSchema`/`TurnoInput`
- `apps/dashboard/lib/schemas/turno.test.ts` - 5 tests
- `apps/dashboard/lib/schemas/bloqueo.ts` - `bloqueoSchema`/`BloqueoInput`
- `apps/dashboard/lib/schemas/bloqueo.test.ts` - 4 tests
- `apps/dashboard/lib/schemas/cliente.ts` - `clienteInlineSchema`/`ClienteInlineInput`, `clienteBusquedaSchema`/`ClienteBusquedaInput`
- `apps/dashboard/lib/schemas/cliente.test.ts` - 7 tests

## Decisions Made
- `motivo` de bloqueo es SIEMPRE opcional (nunca `.min()`), consistente con la columna `text` nullable de la DB y con D-12/D-05 del 04-UI-SPEC.md — un bloqueo manual nunca debe exigir un motivo.
- El helper `uuidLike` se replicó tal cual del motor (`booking.ts`) en vez de exportarlo desde un paquete compartido, para no introducir una dependencia cruzada dashboard→availability-engine en este plan fundacional; queda documentado en el JSDoc de cada schema por qué debe mantenerse idéntico.

## Deviations from Plan

**None** - el plan se ejecutó tal cual escrito. Una nota operativa (no deviation de código): el worktree no tenía `node_modules` instalado al empezar (worktree recién creado) — se corrió `pnpm install` (vía `corepack pnpm`, dado que `pnpm` no estaba en el PATH de bash pero sí vía corepack) antes de poder correr `typecheck`/`test`. El lockfile no cambió (`Lockfile is up to date, resolution step is skipped`), así que esto no es una deviation de dependencias, es infraestructura de entorno necesaria para ejecutar los comandos de verificación del propio plan.

## Issues Encountered
- `pnpm` no estaba en el `PATH` del shell bash del entorno (solo `corepack`, `node`, `npm`, `npx`); se resolvió usando `corepack pnpm <cmd>` para todos los comandos (`dlx shadcn add popover`, `install`, `typecheck`, `test`). No requirió cambios de código ni configuración del proyecto.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 03 (Server Actions de turnos) y Plan 04 (Server Actions de bloqueos/clientes) pueden importar `turnoSchema`/`bloqueoSchema`/`clienteInlineSchema`/`clienteBusquedaSchema` sin bloqueos.
- Plan 05/06 (UI de slot-popover D-03 y bloqueo-popover D-05) ya tienen `Popover`/`PopoverTrigger`/`PopoverContent` disponibles.
- Plan 07 (ruta `/turnos`) ya tiene el link de nav apuntando a esa ruta desde el sidebar — la página todavía no existe hasta que ese plan corra (comportamiento esperado, documentado en el JSDoc del sidebar).
- Sin bloqueos ni concerns nuevos para el resto de la fase.

---
*Phase: 04-grilla-y-turnos-del-dashboard*
*Completed: 2026-07-05*

## Self-Check: PASSED

- FOUND: apps/dashboard/components/ui/popover.tsx
- FOUND: apps/dashboard/components/owner-sidebar.tsx
- FOUND: apps/dashboard/lib/schemas/turno.ts
- FOUND: apps/dashboard/lib/schemas/turno.test.ts
- FOUND: apps/dashboard/lib/schemas/bloqueo.ts
- FOUND: apps/dashboard/lib/schemas/bloqueo.test.ts
- FOUND: apps/dashboard/lib/schemas/cliente.ts
- FOUND: apps/dashboard/lib/schemas/cliente.test.ts
- FOUND commit: b39d235
- FOUND commit: 744bcf9
