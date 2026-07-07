---
phase: 06-agente-conversacional-de-agendamiento
plan: 01
subsystem: database
tags: [supabase, zod, availability-engine, dashboard, cancellation]

# Dependency graph
requires:
  - phase: 04-turnos-y-agenda-del-dashboard
    provides: rescheduleAppointment + BookAppointmentDeps/BookAppointmentResult en @turnosbot/availability-engine (patrón hermano espejado por cancelAppointment)
provides:
  - "cancelAppointment(rawInput, deps) en @turnosbot/availability-engine: UPDATE estado='cancelado' scopeado por id+negocio_id, guard neq('estado','cancelado'), nunca DELETE"
  - "CancelAppointmentInput/CancelAppointmentResult exportados desde el barrel"
  - "uuidLike exportado desde el barrel (reusable por las tools del bot, planes 06-03/06-04)"
  - "dashboard cancelarTurno migrado a delegar en cancelAppointment (ya no UPDATE inline)"
affects: [06-02, 06-03, 06-04, agente-conversacional, bot-tools]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "cancelAppointment como tercer camino de escritura compartido (junto a bookAppointment/rescheduleAppointment) del motor puro AVAIL-04"
    - "already_cancelled tratado como estado benigno idempotente (success), no como error, consistente entre dashboard (Task 2) y bot (plan 06-04 futuro)"
    - "distinción not_found vs already_cancelled vía segundo SELECT de existencia cuando el UPDATE con guard neq() afecta 0 filas"

key-files:
  created: []
  modified:
    - packages/availability-engine/src/booking.ts
    - packages/availability-engine/src/types.ts
    - packages/availability-engine/src/booking.test.ts
    - packages/availability-engine/src/index.ts
    - apps/dashboard/app/actions/turnos.ts

key-decisions:
  - "already_cancelled se mapea a success:true (idempotente) en el dashboard, no a GENERIC_ERROR_COPY — misma semántica que deberá adoptar la tool del bot en 06-04"
  - "uuidLike pasa de const privado a export const en booking.ts, reexportado desde el barrel, para que el bot (06-03/06-04) reuse la misma validación de forma UUID sin duplicar el regex"

patterns-established:
  - "Pattern: not_found vs already_cancelled se distingue con un SELECT de existencia secundario solo cuando el UPDATE con guard no afecta filas (evita ambigüedad de un solo UPDATE)"

requirements-completed: [BOT-09]

# Metrics
duration: 12min
completed: 2026-07-07
---

# Phase 06 Plan 01: Extraer cancelAppointment al motor compartido Summary

**cancelAppointment agregado a @turnosbot/availability-engine como tercer camino de escritura compartido (junto a bookAppointment/rescheduleAppointment); dashboard migrado del UPDATE inline a la función compartida; uuidLike exportado para las tools del bot.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-07-07T20:51:49Z (aprox., según STATE.md)
- **Completed:** 2026-07-07T20:59:06Z
- **Tasks:** 2/2
- **Files modified:** 5

## Accomplishments
- `cancelAppointment` implementado en el motor compartido: UPDATE `estado='cancelado'` filtrado por `.eq("id", turnoId)` Y `.eq("negocio_id", negocioId)` con guard `.neq("estado","cancelado")`, distinguiendo `not_found` de `already_cancelled` con un segundo SELECT de existencia cuando el UPDATE no afecta filas. Nunca ejecuta `.delete()`.
- `CancelAppointmentInput`/`CancelAppointmentResult` (discriminated union: ok / not_found / already_cancelled / update_error / validation_error) y `cancelAppointmentInputSchema` (reusa `uuidLike`).
- `uuidLike` promovido de const privado a export, reexportado desde el barrel para reuso futuro por las tools del bot (planes 06-03/06-04).
- El dashboard (`apps/dashboard/app/actions/turnos.ts`) `cancelarTurno` ya no hace un UPDATE inline propio: delega en `cancelAppointment` importado desde `@turnosbot/availability-engine`. `already_cancelled` se mapea a `success: true` (idempotente); solo `not_found`/`update_error`/`validation_error` devuelven error.
- 6 tests nuevos en `booking.test.ts` cubriendo los 5 caminos de resultado + la aserción explícita de que nunca se llama `.delete()`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Extraer cancelAppointment al motor compartido (BOT-09)** - `d4b8901` (feat)
2. **Task 2: Exportar cancelAppointment + uuidLike desde el barrel y migrar el dashboard** - `2742b9b` (feat)

**Plan metadata:** (pendiente — commit final de este SUMMARY.md/STATE.md/ROADMAP.md)

## Files Created/Modified
- `packages/availability-engine/src/booking.ts` - agrega `cancelAppointmentInputSchema`, `CancelAppointmentResult`, `cancelAppointment`; exporta `uuidLike`
- `packages/availability-engine/src/types.ts` - agrega `CancelAppointmentInput`
- `packages/availability-engine/src/booking.test.ts` - 6 tests nuevos para `cancelAppointment` (ok/not_found/already_cancelled/update_error/validation_error/no-delete)
- `packages/availability-engine/src/index.ts` - reexporta `cancelAppointment`, `CancelAppointmentResult`, `uuidLike`
- `apps/dashboard/app/actions/turnos.ts` - `cancelarTurno` delega en `cancelAppointment`; `already_cancelled` mapeado a éxito idempotente

## Decisions Made
- `already_cancelled` tratado como estado benigno idempotente (no error) en el dashboard — decisión explícita del plan, replicada tal cual sin ajustes.
- `uuidLike` exportado desde `booking.ts` en vez de duplicar un regex de validación de UUID en el bot (planes futuros 06-03/06-04).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

Ninguno. `pnpm` no estaba en `PATH` de la shell del entorno de ejecución (el proyecto usa `packageManager: pnpm@9.15.0` vía Corepack, pero `corepack enable` falló por permisos en `/usr/local/bin`); se usó `npx --yes pnpm@9.15.0` como wrapper legítimo del gestor de paquetes ya declarado y fijado en `package.json` (no es un paquete no verificado/alucinado) para ejecutar tests/build/typecheck sin modificar la configuración del proyecto.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- El ÚNICO gap de dominio real de la Fase 6 (cancelación sin función compartida) está cerrado: bot (plan 06-04) puede importar `cancelAppointment` + `uuidLike` desde el mismo barrel sin reintroducir divergencia bot/dashboard.
- Sin bloqueos para 06-02 en adelante.

---
*Phase: 06-agente-conversacional-de-agendamiento*
*Completed: 2026-07-07*

## Self-Check: PASSED

All created/modified files found on disk; both task commits (`d4b8901`, `2742b9b`) found in git log.
