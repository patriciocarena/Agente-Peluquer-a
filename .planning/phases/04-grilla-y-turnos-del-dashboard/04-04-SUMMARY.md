---
phase: 04-grilla-y-turnos-del-dashboard
plan: 04
subsystem: api
tags: [nextjs, server-actions, supabase, availability-engine, zod]

# Dependency graph
requires:
  - phase: 04-grilla-y-turnos-del-dashboard (Plan 01)
    provides: "computeSlots.skipBookingWindow (D-08), rescheduleAppointment (D-14), BookAppointmentResult union"
  - phase: 04-grilla-y-turnos-del-dashboard (Plan 03)
    provides: "buildAvailabilityData(negocioId), fetchTurnoServicios(negocioId, turnoId)"
provides:
  - "crearTurnoManual/cancelarTurno/reagendarTurno (app/actions/turnos.ts) — único camino de escritura de turno = bookAppointment/rescheduleAppointment"
  - "obtenerSlotsDisponibles/profesionalesElegibles (app/actions/slots.ts) — selector de slots respaldado por computeSlots + gate de elegibilidad profesional×servicio"
  - "TurnoActionResult union type"
affects: ["04-grilla-y-turnos-del-dashboard Plan 05", "04-grilla-y-turnos-del-dashboard Plan 06", "04-grilla-y-turnos-del-dashboard Plan 07"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "mapBookResult(result): traduce el union BookAppointmentResult del motor a TurnoActionResult con los copys exactos de 04-UI-SPEC.md — un solo lugar de mapeo para las 3 actions que llaman al motor"
    - "profesionalesElegibles: Map<profesionalId, Set<servicioId>> en memoria + Array.every() para exigir elegibilidad en TODOS los serviceIds pedidos, no solo alguno (Pitfall 6)"

key-files:
  created:
    - apps/dashboard/app/actions/turnos.ts
    - apps/dashboard/app/actions/slots.ts
  modified:
    - packages/availability-engine/src/index.ts

key-decisions:
  - "Rule 3 (blocking fix): BookAppointmentDeps/BookAppointmentResult no estaban exportados desde el barrel @turnosbot/availability-engine (solo se exportaban las funciones bookAppointment/rescheduleAppointment que los devuelven/reciben) — se agregó `export type { BookAppointmentDeps, BookAppointmentResult } from './booking.js'` a index.ts. Sin este fix, turnos.ts no podía tipar mapBookResult ni typecheckear."
  - "mapBookResult usa un default en el switch (case 'insert_error': default:) para satisfacer noImplicitReturns de tsc sobre el switch exhaustivo del union de 3 reasons — comportamiento idéntico (insert_error y cualquier reason no contemplado devuelven GENERIC_ERROR_COPY)."
  - "obtenerSlotsDisponibles valida input con un zod schema local (obtenerSlotsInputSchema) en vez de reusar turnoSchema — el shape de input (serviceIds/fecha/profesionalId) no coincide con TurnoInput (que espera clienteId/inicio/fin), así que un schema propio evita forzar campos irrelevantes."

patterns-established: []

requirements-completed: [APPT-04, APPT-05, APPT-06]

# Metrics
duration: ~20min
completed: 2026-07-06
---

# Phase 4 Plan 4: Server Actions de turnos vía el motor compartido (turnos.ts + slots.ts) Summary

**crearTurnoManual/cancelarTurno/reagendarTurno delegan 100% en bookAppointment/rescheduleAppointment del motor compartido (sin insert/update paralelo de disponibilidad), y obtenerSlotsDisponibles/profesionalesElegibles respaldan el selector de slots con computeSlots + un gate de elegibilidad profesional×servicio.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-07-06T01:52:00Z (approx.)
- **Completed:** 2026-07-06T01:56:12Z
- **Tasks:** 2 completed
- **Files modified:** 2 created, 1 modified (package export fix)

## Accomplishments

- `app/actions/turnos.ts`: `crearTurnoManual` llama `bookAppointment({ ..., skipBookingWindow: true })` (D-07/D-11) y, si el insert tiene éxito, hace un UPDATE solo-de-`estado` a `confirmado` (no toca inicio/fin/profesional_id, así que no compite con el motor). `cancelarTurno` hace `UPDATE estado='cancelado'` (nunca `DELETE`, D-06). `reagendarTurno` trae los `serviceIds` originales vía `fetchTurnoServicios` y delega en `rescheduleAppointment` (UPDATE del mismo turno, D-14). Las tres derivan `negocio_id` de `getNegocioActivo()` y terminan en `revalidatePath("/turnos")`.
- `app/actions/slots.ts`: `obtenerSlotsDisponibles` envuelve `computeSlots` con `skipBookingWindow: true` sobre `buildAvailabilityData`, con try/catch para el throw de `assertScopedToNegocio` del motor (Pitfall 3). `profesionalesElegibles` filtra los profesionales activos que tienen fila en `profesional_servicio` para TODOS los `serviceIds` pedidos (no solo alguno), cerrando el gap de Pitfall 6 / Open Question 3 de 04-RESEARCH.md.
- Grep-gates de aislamiento verificados: sin `.from("turno").insert(` directo en `turnos.ts`, `cancelarTurno` usa `.update()` no `.delete()`, `reagendarTurno` llama `rescheduleAppointment` no `bookAppointment`.
- `pnpm --filter @turnosbot/dashboard typecheck` y `test` (58/58) verdes; `pnpm --filter @turnosbot/availability-engine build` verde tras el fix del barrel.

## Task Commits

Each task was committed atomically:

1. **Task 1: turnos.ts — crearTurnoManual, cancelarTurno, reagendarTurno** - `be43c58` (feat)
2. **Task 2: slots.ts — obtenerSlotsDisponibles + profesionalesElegibles (Pitfall 6)** - `08c8885` (feat)

**Plan metadata:** (this commit)

_Nota: no hubo ciclo TDD RED/GREEN (`tdd` no está marcado `true` en las tasks del plan) — se aplicó verificación vía typecheck + acceptance criteria (grep de scoping/aislamiento) por task, como especifica el PLAN.md._

## Files Created/Modified

- `apps/dashboard/app/actions/turnos.ts` - `crearTurnoManual`/`cancelarTurno`/`reagendarTurno`, tipo `TurnoActionResult`, helper `mapBookResult`
- `apps/dashboard/app/actions/slots.ts` - `obtenerSlotsDisponibles`/`profesionalesElegibles`, tipo `ProfesionalElegible`
- `packages/availability-engine/src/index.ts` - agregado `export type { BookAppointmentDeps, BookAppointmentResult }` (Rule 3 fix, ver Deviations)

## Decisions Made

- `mapBookResult` centraliza el mapeo del union `BookAppointmentResult` del motor a los 3 copys exactos de 04-UI-SPEC.md (`SAVE_ERROR_COPY`/`SLOT_TAKEN_COPY`/`GENERIC_ERROR_COPY`) — reusado por `crearTurnoManual` y `reagendarTurno`, evitando duplicar el switch.
- `obtenerSlotsDisponibles` define su propio zod schema local (`obtenerSlotsInputSchema`) en vez de reusar `turnoSchema` de Plan 02 — el shape de input no coincide (no hay `clienteId`/`inicio`/`fin`, sí hay `fecha` y `profesionalId` opcional).
- `profesionalesElegibles` calcula la elegibilidad en memoria (Map + Set) tras dos queries scopeadas, en vez de un `IN`/agregación SQL — el volumen esperado por negocio (pocos profesionales, pocos servicios) hace este approach simple y suficientemente performante, consistente con la filosofía de `buildAvailabilityData` (fetch completo scopeado, filtrar en memoria).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Exportados BookAppointmentDeps/BookAppointmentResult desde el barrel del motor**
- **Found during:** Task 1 (turnos.ts — primer typecheck)
- **Issue:** `packages/availability-engine/src/index.ts` exportaba las funciones `bookAppointment`/`rescheduleAppointment` pero no los tipos `BookAppointmentDeps`/`BookAppointmentResult` que ambas devuelven/reciben — `tsc` fallaba con `TS2724: has no exported member named 'BookAppointmentResult'` al intentar tipar `mapBookResult(result: BookAppointmentResult)` en `turnos.ts`.
- **Fix:** Se agregó `export type { BookAppointmentDeps, BookAppointmentResult } from "./booking.js";` a `index.ts` del paquete `@turnosbot/availability-engine`.
- **Files modified:** `packages/availability-engine/src/index.ts`
- **Verification:** `pnpm --filter @turnosbot/dashboard typecheck` y `pnpm --filter @turnosbot/availability-engine build` verdes tras el fix; `pnpm --filter @turnosbot/dashboard test` (58/58) sigue verde.
- **Committed in:** `be43c58` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Fix estrictamente necesario para que el archivo del plan (`turnos.ts`) typecheckeara contra la superficie pública que el propio Plan 01 documentó como entregada; no agrega alcance nuevo, solo cierra un gap de exports del barrel.

## Issues Encountered

None.

## User Setup Required

None - no requiere configuración externa.

## Next Phase Readiness

- Plan 05/06 (modales de alta manual / reagendado, UI del dashboard) pueden importar `crearTurnoManual`/`reagendarTurno`/`cancelarTurno` de `app/actions/turnos.ts` y `obtenerSlotsDisponibles`/`profesionalesElegibles` de `app/actions/slots.ts` directamente, sin duplicar lógica de disponibilidad.
- Plan 07 (página `/turnos`) puede reusar `cancelarTurno` para la acción de cancelar desde la grilla.
- El barrel de `@turnosbot/availability-engine` ahora expone `BookAppointmentDeps`/`BookAppointmentResult` como tipos públicos — cualquier consumidor futuro (bot, Fase 6) puede tipar sus propios wrappers sin repetir este fix.
- Sin bloqueos ni concerns nuevos para el resto de la fase.

---
*Phase: 04-grilla-y-turnos-del-dashboard*
*Completed: 2026-07-06*

## Self-Check: PASSED

- FOUND: apps/dashboard/app/actions/turnos.ts
- FOUND: apps/dashboard/app/actions/slots.ts
- FOUND commit: be43c58
- FOUND commit: 08c8885
