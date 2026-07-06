---
phase: 04-grilla-y-turnos-del-dashboard
plan: 07
subsystem: ui
tags: [nextjs, react-server-components, css-grid, radix-popover, turbopack, date-fns-tz]

# Dependency graph
requires:
  - phase: 04-grilla-y-turnos-del-dashboard (Plan 03)
    provides: "buildAvailabilityData/fetchTurnoServicios (lib/availability-data.ts)"
  - phase: 04-grilla-y-turnos-del-dashboard (Plan 05)
    provides: "TurnoFormDialog, TurnoDetailSheet (+ tipo TurnoDetalle), ClienteSearch, SlotSelector"
  - phase: 04-grilla-y-turnos-del-dashboard (Plan 06)
    provides: "BloqueoFormDialog, BloqueoPopover"
  - phase: 03-motor-de-disponibilidad
    provides: "computeSlots / AvailabilityData contract (@turnosbot/availability-engine)"
provides:
  - "TurnosPage (app/(owner)/turnos/page.tsx) — pantalla /turnos completa, Goal de la Fase 4 (APPT-01/03)"
  - "GrillaTurnos (components/grilla-turnos.tsx) — CSS Grid profesionales x horas, 4 estados D-02, monta todas las interacciones"
  - "SlotPopover (components/slot-popover.tsx) — D-03, popover de slot libre"
  - "DiaPicker (components/dia-picker.tsx) — date-picker minimo de navegacion de dia"
  - "loading.tsx skeleton de /turnos"
  - "BloqueoPopover.anchor (prop nueva, retrocompatible) — resuelve el anclaje visual dejado abierto por Plan 06"
affects: []

# Tech tracking
tech-stack:
  added: ["@date-fns/tz@^1.5.0 (dashboard, ya vetado como dep de availability-engine)"]
  patterns:
    - "Servicio sintetico local (nunca persistido, id 'grid-slot') para dimensionar computeSlots a UN slot de negocio.granularidad_min en vez de la duracion de un servicio real -- sigue siendo el motor compartido quien calcula el hueco, page.tsx no reimplementa snapToGrid/subtractIntervals"
    - "Continuacion de bloque multi-slot (turno/bloqueo que ocupan >1 fila) detectada client-side comparando turno.id/bloqueo.id contra el slot adyacente en la misma columna, en vez de un campo `span` numerico pre-computado por el server"
    - "computeSlots se usa para distinguir 'sin horario cargado' (cero libres Y cero ocupados) de 'agenda llena' (cero libres pero con turnos/bloqueos) -- D-07 sigue pintando toda celda no cubierta como libre e interactiva, sin atarse al resultado del motor para decidir si una celda es clickeable"
    - "Paquetes workspace TS sin build step (main/types -> src/*.ts con especificadores NodeNext .js) resueltos por Turbopack: requieren dist compilado real -- ver deviation de Task 3"

key-files:
  created:
    - apps/dashboard/components/slot-popover.tsx
    - apps/dashboard/components/grilla-turnos.tsx
    - apps/dashboard/components/dia-picker.tsx
    - apps/dashboard/app/(owner)/turnos/page.tsx
    - apps/dashboard/app/(owner)/turnos/loading.tsx
    - .planning/phases/04-grilla-y-turnos-del-dashboard/deferred-items.md
  modified:
    - apps/dashboard/components/bloqueo-popover.tsx
    - packages/availability-engine/package.json
    - apps/dashboard/package.json

key-decisions:
  - "BloqueoPopover gana una prop opcional `anchor` (PopoverAnchor asChild) para resolver el anclaje visual que Plan 06 dejo explicitamente abierto ('el anclaje visual... queda a resolver por Plan 07') -- retrocompatible, default undefined preserva el comportamiento de Plan 06"
  - "@turnosbot/availability-engine cambia main/types de ./src/index.ts a ./dist/index.js|d.ts (Rule 3, blocking): Turbopack no resuelve especificadores NodeNext '.js' que apuntan a hermanos '.ts' (a diferencia de tsc/vitest), y este gap preexistente nunca se habia ejercitado porque ningun plan anterior corrio `pnpm build`. Cero cambios al codigo fuente del motor; se agrega `prepare: tsc -b` para que pnpm install regenere dist"
  - "Rango horario de la grilla = union de TODOS los horario_trabajo cargados (cualquier dia), fallback 09:00-20:00 si el negocio no cargo ninguno -- UI-SPEC no especifica el rango exacto, esta resolucion permite operar el dia siguiente aun si el horario recien se carga"
  - "DiaPicker (input type=date nativo) en vez de Popover+Calendar: 04-UI-SPEC.md explicitamente autoriza este fallback ('si Calendar no esta instalado, usar un input date simple') y Calendar no esta en el Component Inventory de esta fase"

patterns-established: []

requirements-completed: [APPT-01, APPT-03]

# Metrics
duration: 55min
completed: 2026-07-06
---

# Phase 4 Plan 7: Ensamblaje de la pantalla /turnos (grilla, D-01/D-02/D-03) Summary

**Pantalla `/turnos` operativa (Goal de la Fase 4): CSS Grid profesionales x horas con los 4 estados de color reales (libre/confirmado/pendiente/bloqueo), popover de slot libre, navegacion de dia por `?fecha=`, y disponibilidad calculada 100% via `computeSlots` del motor compartido — mas un fix de infraestructura que desbloquea `next build` (Turbopack) para todo el dashboard.**

## Performance

- **Duration:** ~55 min
- **Tasks:** 3 completed
- **Files modified:** 9 (6 nuevos, 3 modificados)

## Accomplishments

- `slot-popover.tsx` (D-03): Popover con "Crear turno"/"Bloquear" sobre una celda libre, abre `TurnoFormDialog`/`BloqueoFormDialog` con `profesionalId`/`horaInicio` pre-cargados via props.
- `app/(owner)/turnos/loading.tsx`: skeleton replicando header de columnas + filas de hora.
- `grilla-turnos.tsx` (D-01/D-02, APPT-01): CSS Grid con columna de horas `sticky left-0`, columnas de profesional `minmax(160px,1fr)` (o 160px fijo + `overflow-x-auto` con >=6 profesionales), los 4 estados con sus tratamientos visuales exactos (rayado CSS del bloqueo, amber tenue de pendiente), deteccion de bloques multi-slot por comparacion de id en vez de un campo `span`, y monta `SlotPopover`/`TurnoDetailSheet`/`BloqueoPopover` segun el estado de cada celda.
- `bloqueo-popover.tsx`: agrega prop opcional `anchor` que resuelve el anclaje visual dejado abierto por el Plan 06.
- `app/(owner)/turnos/page.tsx` (APPT-01/03): Server Component que deriva negocio+fecha, llama `buildAvailabilityData`+`computeSlots` (via un servicio sintetico dimensionado a `granularidad_min`) por profesional activo, cruza `turno`(!=cancelado)/`bloqueo` crudos para colorear, arma `celdas`/`TurnoDetalle` (con `turno_servicio`+`cliente` solo para los turnos visibles del dia) y renderiza header de navegacion + `GrillaTurnos` + empty states con el copy exacto de 04-UI-SPEC.md.
- `dia-picker.tsx`: unico Client Component de la navegacion de dia (input `type=date` nativo, sin libreria de calendario).
- **Fix de infraestructura (bloqueante para el propio Task 3):** `@turnosbot/availability-engine` cambia `main`/`types` a su `dist/` compilado -- ver Deviations.
- `pnpm --filter @turnosbot/dashboard typecheck`/`test` (58/58), `pnpm --filter @turnosbot/availability-engine typecheck`/`test` (54/54) y `pnpm --filter @turnosbot/bot typecheck` verdes. `pnpm --filter @turnosbot/dashboard build` completa end-to-end con env vars de Supabase presentes (verificado con valores dummy efimeros, nunca commiteados); sin `.env` real en este entorno, falla SOLO en `/admin/[tenantId]` (gap preexistente documentado, ver `deferred-items.md`) -- `/turnos` compila y tipa sin errores en ambos casos.

## Task Commits

Each task was committed atomically:

1. **Task 1: slot-popover.tsx (D-03) + loading.tsx** - `7fa46c4` (feat)
2. **Task 2: grilla-turnos.tsx (grid renderer, D-01/D-02) + fix anclaje BloqueoPopover** - `cb8d350` (feat)
3. **Task 3 (infra fix, previo al feature commit): resolver availability-engine a dist + @date-fns/tz** - `4ef2a7b` (fix)
4. **Task 3: page.tsx (Server Component) — fetch, computeSlots, merge, nav de dia** - `a049e72` (feat)

_Nota: no hubo ciclo TDD RED/GREEN (`tdd` no esta marcado `true` en las tasks del plan) — verificacion via typecheck/test/build + acceptance criteria por task, como especifica el PLAN.md._

## Files Created/Modified

- `apps/dashboard/components/slot-popover.tsx` - `SlotPopover` (props: `profesionalId`, `horaInicio`, `fecha`, `timezone`, `servicios`, `children`)
- `apps/dashboard/app/(owner)/turnos/loading.tsx` - skeleton de la grilla
- `apps/dashboard/components/grilla-turnos.tsx` - `GrillaTurnos` (props: `profesionales`, `horas`, `celdas`, `profesionalesSinHorario`, `fecha`, `timezone`, `servicios`), exporta tipos `GrillaProfesional`/`GrillaCeldaEstado`/`GrillaCeldaBloqueo`/`GrillaCelda`
- `apps/dashboard/components/bloqueo-popover.tsx` - agrega prop opcional `anchor`
- `apps/dashboard/components/dia-picker.tsx` - `DiaPicker` (props: `fecha`)
- `apps/dashboard/app/(owner)/turnos/page.tsx` - `TurnosPage` (Server Component, searchParam `?fecha=`)
- `packages/availability-engine/package.json` - `main`/`types` -> `dist/`, agrega `prepare: tsc -b`
- `apps/dashboard/package.json` - agrega `@date-fns/tz@^1.5.0`
- `.planning/phases/04-grilla-y-turnos-del-dashboard/deferred-items.md` - gap preexistente de `/admin/[tenantId]` (env vars), fuera de alcance de este plan

## Decisions Made

- `BloqueoPopover.anchor` (prop opcional, `PopoverAnchor asChild`) resuelve el anclaje visual que Plan 06 dejo explicitamente pendiente para Plan 07 — sin este fix el Popover de bloqueo no tenia forma de posicionarse contra la celda clickeada (Radix Popper sin `Trigger`/`Anchor` propio).
- `@turnosbot/availability-engine` pasa a resolver via `dist/` compilado (Rule 3, ver Deviations) — cero cambios al codigo fuente del motor, solo al `main`/`types` del `package.json` y un `prepare` script nuevo.
- Rango horario de la grilla = union de TODOS los `horario_trabajo` del negocio (cualquier dia de la semana), fallback 09:00-20:00 si no hay ninguno cargado todavia.
- `DiaPicker` usa `input type="date"` nativo (no `Calendar` de shadcn, no instalado en esta fase) por indicacion explicita de 04-UI-SPEC.md.
- Continuacion de bloques multi-slot en la grilla se detecta comparando `turno.id`/`bloqueo.id` contra el slot adyacente en el cliente, en vez de que `page.tsx` pre-compute un campo `span` numerico — mismo resultado visual, menos superficie de contrato entre server y cliente.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] BloqueoPopover sin anclaje visual**
- **Found during:** Task 2 (grilla-turnos.tsx)
- **Issue:** `BloqueoPopover` (Plan 06) monta un `Popover` sin `Trigger`/`Anchor` propio — sin un ancla, Radix no puede posicionar el `PopoverContent` contra la celda de bloqueo clickeada (queda flotando sin posicion util). El propio `04-06-SUMMARY.md` deja esto abierto explicitamente para Plan 07.
- **Fix:** Se agrega una prop opcional `anchor?: ReactNode` que envuelve la celda real (ya renderizada en su posicion natural del grid) en `PopoverAnchor asChild`. Retrocompatible: si no se pasa, el comportamiento es identico al de Plan 06.
- **Files modified:** `apps/dashboard/components/bloqueo-popover.tsx`
- **Verification:** `pnpm --filter @turnosbot/dashboard typecheck` verde; `grilla-turnos.tsx` monta `BloqueoPopover` con `anchor={boton}` en la celda de inicio de cada bloque de bloqueo.
- **Committed in:** `cb8d350` (Task 2 commit)

**2. [Rule 3 - Blocking] `pnpm build` (Turbopack) no resuelve especificadores NodeNext `.js` internos de `@turnosbot/availability-engine`**
- **Found during:** Task 3 (page.tsx), al correr la verificacion automatizada `pnpm --filter @turnosbot/dashboard build`.
- **Issue:** `next build` fallaba con `Module not found: Can't resolve './booking.js'` (y `'./types.js'`/`'./constants.js'`/`'./computeSlots.js'`) al bundlear tanto `app/(owner)/turnos/page.tsx` (nuevo, este plan) como `app/actions/slots.ts` (preexistente, Plan 04 — nunca se habia ejercitado porque ningun plan anterior de la fase corrio `pnpm build`, solo `typecheck`/`test`). Causa raiz: `packages/availability-engine/package.json` apunta `main`/`types` directo a `src/index.ts`, cuyas re-exportaciones usan la convencion NodeNext de TypeScript (especificador `.js` que en realidad apunta a un archivo `.ts` hermano) — `tsc`/`vitest` la resuelven nativamente, Turbopack no.
- **Fix:** `main`/`types` del paquete ahora apuntan a `./dist/index.js`/`./dist/index.d.ts` (generados por el `build` script existente, `tsc -b`, ya anticipado por el `"build": "pnpm -r --if-present run build"` de la raiz). Se agrega `prepare: tsc -b` para que `pnpm install` regenere `dist/`. Cero cambios al codigo fuente del motor (mismos especificadores `.js` en `src/`, sin riesgo para el futuro consumo desde `apps/bot` via Node plano).
- **Files modified:** `packages/availability-engine/package.json` (+ `dist/` regenerado, gitignored, no commiteado)
- **Verification:** `pnpm --filter @turnosbot/availability-engine typecheck`/`test` (54/54), `pnpm --filter @turnosbot/dashboard typecheck`/`test` (58/58) y `pnpm --filter @turnosbot/bot typecheck` verdes; `pnpm --filter @turnosbot/dashboard build` completa end-to-end con env vars presentes (probado con valores dummy efimeros).
- **Committed in:** `4ef2a7b`
- **IMPORTANTE para proximos executors:** cualquier cambio a `packages/availability-engine/src/**` requiere correr `pnpm --filter @turnosbot/availability-engine build` (o `pnpm build` en la raiz) antes de que `next build`/`next dev` del dashboard lo reflejen — `dist/` esta gitignored, no se commitea.

---

**Total deviations:** 2 auto-fixed (1 Rule 2 — funcionalidad critica faltante, 1 Rule 3 — bloqueante de infraestructura)
**Impact on plan:** Ambos fixes eran necesarios para que la grilla funcione (anclaje visual real de D-05) y para que el propio Task 3 pudiera pasar su verificacion automatizada declarada (`pnpm build`). Sin scope creep — ningun cambio de comportamiento fuera de lo que el plan pedia.

## Issues Encountered

- `pnpm --filter @turnosbot/dashboard build` en este entorno de ejecucion falla en `/admin/[tenantId]` (Fase 02 Plan 08) por falta de `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` reales — gap preexistente y ya documentado en `STATE.md` (blocker de Plan 02-08), no relacionado a los archivos de este plan. Verificado que `/turnos` compila y tipa sin errores en ambos escenarios (con y sin esas env vars); logueado en `deferred-items.md`, no se intento fabricar credenciales reales.

## User Setup Required

None — no requiere configuracion externa nueva. (El gap preexistente de `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` para `/admin` ya estaba documentado como pendiente desde Plan 02-08.)

## Next Phase Readiness

- **Goal de la Fase 4 cumplido:** `/turnos` es una pantalla operativa completa — grilla real, navegacion de dia, popover de slot libre, detalle/cancelar/reagendar turno, crear/eliminar bloqueo, todo con revalidacion inmediata (`revalidatePath("/turnos")` ya establecido en las Server Actions de Planes 03/04).
- **QA manual obligatoria pendiente (no automatizable con build/typecheck):** correr MQ-1 (grilla APPT-01 + estados de color D-02 + interacciones + nav de dia + empty states) y MQ-4 (crear/eliminar bloqueo APPT-02) de `04-VALIDATION.md` contra el dev server real, con datos de negocio/profesionales/horarios cargados. Esta es la primera vez que la grilla completa existe para poder ejercitar ese flujo end-to-end.
- **Blocker preexistente sin resolver (no de este plan):** `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` reales siguen pendientes para que `/admin` (y por extension, el `pnpm build` completo del dashboard) funcionen fuera de este entorno de ejecucion — ver `deferred-items.md` y el blocker ya trackeado en `STATE.md` desde Plan 02-08.
- Fase 4 (grilla-y-turnos-del-dashboard) queda con sus 7 planes ejecutados; corresponde verificacion/cierre de fase.

---
*Phase: 04-grilla-y-turnos-del-dashboard*
*Completed: 2026-07-06*
