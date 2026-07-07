---
phase: 06-agente-conversacional-de-agendamiento
plan: 04
subsystem: api
tags: [ai-sdk, zod, tool-calling, supabase, availability-engine]

# Dependency graph
requires:
  - phase: 06-agente-conversacional-de-agendamiento
    provides: "cancelAppointment/uuidLike exportados del barrel de @turnosbot/availability-engine (06-01), buildBotAvailabilityData.ts + negocioScoped.ts (06-02), tools de lectura buscarHorarios/asignarProfesional/consultarNegocio (06-03) como referencia de patrón"
provides:
  - "confirmarTurnoTool: única tool que crea un turno, envuelve bookAppointment y surface el turnoId real (BOT-04/D-12)"
  - "reagendarTurnoTool: envuelve rescheduleAppointment con la misma forma de input que el dashboard (BOT-10/D-09)"
  - "cancelarTurnoTool: envuelve cancelAppointment compartido sin UPDATE inline (BOT-09/AVAIL-04)"
affects: ["06-05 (responder/tool-loop y gate D-12 sobre turnoId)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Write-tool wrapper pattern: factory(negocioId, clienteId, deps?) cierra sobre ambos ids (D-13); inputSchema nunca los incluye"
    - "Anti-cache: freshData fetcheado DENTRO del execute, nunca reusado entre turnos de conversación"
    - "Mapeo de discriminated union de dominio (BookAppointmentResult/CancelAppointmentResult) a estructura user-facing sin turnoId en el camino de error"

key-files:
  created:
    - apps/bot/src/conversation/tools/confirmarTurno.ts
    - apps/bot/src/conversation/tools/confirmarTurno.test.ts
    - apps/bot/src/conversation/tools/reagendarTurno.ts
    - apps/bot/src/conversation/tools/reagendarTurno.test.ts
    - apps/bot/src/conversation/tools/cancelarTurno.ts
    - apps/bot/src/conversation/tools/cancelarTurno.test.ts
  modified: []

key-decisions:
  - "clienteId se recibe en las factories de reagendarTurno/cancelarTurno para paridad de firma (Pattern 1) aunque no se usa dentro del execute — el scoping real lo hacen rescheduleAppointment/cancelAppointment por negocioId+turnoId, igual que el dashboard"
  - "Comentarios de código evitan deliberadamente las cadenas literales 'skipBookingWindow' y 'estado...cancelado' en confirmarTurno.ts/reagendarTurno.ts/cancelarTurno.ts para satisfacer los acceptance_criteria de grep -c del plan sin perder la intención documental"

patterns-established:
  - "Pattern 9 (nuevo): write-tool wrapper — nunca reimplementa el INSERT/UPDATE de dominio, solo arma el input con el mismo shape que el caller del dashboard y mapea el resultado discriminado a copy user-facing"

requirements-completed: [BOT-04, BOT-09, BOT-10]

# Metrics
duration: 15min
completed: 2026-07-07
---

# Phase 06 Plan 04: Tools de escritura del agente (confirmar/reagendar/cancelar) Summary

**Tres tools de escritura del bot (confirmarTurno, reagendarTurno, cancelarTurno) que envuelven exclusivamente bookAppointment/rescheduleAppointment/cancelAppointment del motor compartido — nunca un INSERT/UPDATE paralelo — con negocioId/clienteId cerrados en closure y el turnoId real siempre surfaceado en el caso ok.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-07-07T18:32Z (aprox., primera lectura de contexto)
- **Completed:** 2026-07-07T18:41:22-03:00
- **Tasks:** 2 completadas (3 tools + 3 test suites)
- **Files modified:** 6 (todos nuevos)

## Accomplishments
- `confirmarTurnoTool(negocioId, clienteId, deps?)`: envuelve `bookAppointment`, fetchea `freshData` dentro del execute (anti-cache), nunca activa el bypass opt-in de la ventana de reserva (a diferencia del alta manual del dueño), y surface el `turnoId` real en el caso `ok` — base del gate D-12 que implementará el plan 06-05.
- `reagendarTurnoTool(negocioId, clienteId, deps?)`: trae los `serviceIds` del turno vía `negocioScoped(negocioId).turnoServicios()` filtrando por `turnoId`, y llama `rescheduleAppointment` con exactamente la misma forma de input que `apps/dashboard/app/actions/turnos.ts#reagendarTurno` (D-09).
- `cancelarTurnoTool(negocioId, clienteId, deps?)`: delega 100% en `cancelAppointment` (motor compartido agregado en 06-01) — cero UPDATE inline; `already_cancelled` se mapea a un mensaje benigno de éxito, nunca a un error duro (misma semántica que el dashboard).
- Las tres factories excluyen `negocioId` de su `inputSchema` (verificado con test estructural en las tres suites) — imposible que un prompt-injection cambie el scope de negocio de una escritura.

## Task Commits

Each task was committed atomically:

1. **Task 1: tool confirmarTurno (bookAppointment, surface turno_id real)** - `48b396b` (feat)
2. **Task 2: tools reagendarTurno (rescheduleAppointment) + cancelarTurno (cancelAppointment compartido)** - `f99ef4a` (feat)

**Plan metadata:** (este commit, docs: complete plan)

## Files Created/Modified
- `apps/bot/src/conversation/tools/confirmarTurno.ts` - factory de la tool que envuelve `bookAppointment`, mapea `BookAppointmentResult` a estructura user-facing con `turnoId` real en el caso ok
- `apps/bot/src/conversation/tools/confirmarTurno.test.ts` - 6 tests: surface turnoId, sin bypass de ventana, closure de negocioId/clienteId, slot_taken, validation_error/insert_error
- `apps/bot/src/conversation/tools/reagendarTurno.ts` - factory que trae serviceIds via `negocioScoped.turnoServicios()` y envuelve `rescheduleAppointment`
- `apps/bot/src/conversation/tools/reagendarTurno.test.ts` - 4 tests: forma exacta del input a rescheduleAppointment (filtra por turnoId), caso ok, slot_taken, inputSchema sin negocioId
- `apps/bot/src/conversation/tools/cancelarTurno.ts` - factory que envuelve `cancelAppointment` compartido, sin UPDATE inline
- `apps/bot/src/conversation/tools/cancelarTurno.test.ts` - 5 tests: delega en cancelAppointment con negocioId de closure, already_cancelled benigno, not_found/update_error, inputSchema sin negocioId

## Decisions Made
- `clienteId` se recibe en las factories de `reagendarTurno`/`cancelarTurno` únicamente por paridad de firma con el resto de las tools de escritura (Pattern 1 de 06-PATTERNS.md); no se usa dentro del `execute` porque el scoping real de la mutación lo hacen `rescheduleAppointment`/`cancelAppointment` por `negocioId`+`turnoId` — el mismo modelo de confianza que usa el dashboard (el owner tampoco filtra por `cliente_id` al reagendar/cancelar).
- Los comentarios de código evitan deliberadamente las cadenas literales exactas `skipBookingWindow` y el patrón `estado...cancelado` en los tres archivos de producción, para satisfacer los `acceptance_criteria` de `grep -c` del plan (que verifican ausencia literal de esas cadenas) sin sacrificar la documentación de por qué el bypass nunca se activa / por qué no hay UPDATE inline.

## Deviations from Plan

None - plan ejecutado exactamente como estaba escrito. Los únicos ajustes fueron de fraseo en comentarios (ver Decisions Made arriba), no de comportamiento.

## Issues Encountered
- El primer intento de `confirmarTurno.ts` incluía la cadena literal `skipBookingWindow` dentro de comentarios explicativos, lo que hacía fallar el acceptance criterion `grep -c "skipBookingWindow" ... es 0`. Se reescribieron los comentarios para describir el mismo comportamiento ("bypass opt-in de la ventana de reserva") sin usar el nombre literal del campo. Mismo ajuste aplicado preventivamente en `reagendarTurno.ts` y en `cancelarTurno.ts` (para el patrón `estado.*cancelado`).
- TypeScript inferís `.mock.calls[0]` como tupla vacía `[]` cuando el mock se declara con una función sin parámetros tipados; se resolvió tipando explícitamente los mocks (`fakeBookAppointment`/`fakeRescheduleAppointment`/`fakeCancelAppointment`) con la misma firma `Parameters<typeof realFn>` que la función real, y casteando el `negocioScoped` fake de `reagendarTurno.test.ts` (que solo implementa `turnoServicios`) a `typeof negocioScoped` real.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Las 3 tools de escritura (confirmarTurno/reagendarTurno/cancelarTurno) están listas para cablearse en el tool-loop del responder (plan 06-05), junto con las 3 tools de lectura del plan 06-03.
- El plan 06-05 debe implementar el gate D-12 que inspecciona el `turnoId` del resultado de `confirmarTurno`/`reagendarTurno` antes de dejar salir cualquier mensaje de confirmación al cliente — esta tool ya expone ese campo de forma consistente (`ok:true` siempre trae `turnoId`; `ok:false` nunca lo incluye).
- `typecheck` de `apps/bot` verde; suite completa de vitest del bot (14 archivos, 70 tests) verde tras agregar estas 3 suites.

## Self-Check: PASSED

- FOUND: apps/bot/src/conversation/tools/confirmarTurno.ts
- FOUND: apps/bot/src/conversation/tools/confirmarTurno.test.ts
- FOUND: apps/bot/src/conversation/tools/reagendarTurno.ts
- FOUND: apps/bot/src/conversation/tools/reagendarTurno.test.ts
- FOUND: apps/bot/src/conversation/tools/cancelarTurno.ts
- FOUND: apps/bot/src/conversation/tools/cancelarTurno.test.ts
- FOUND commit: 48b396b (Task 1)
- FOUND commit: f99ef4a (Task 2)

---
*Phase: 06-agente-conversacional-de-agendamiento*
*Completed: 2026-07-07*
