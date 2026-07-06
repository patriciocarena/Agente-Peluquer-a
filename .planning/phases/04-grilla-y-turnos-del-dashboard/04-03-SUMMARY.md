---
phase: 04-grilla-y-turnos-del-dashboard
plan: 03
subsystem: api
tags: [nextjs, server-actions, supabase, rls, zod]

# Dependency graph
requires:
  - phase: 04-grilla-y-turnos-del-dashboard (Plan 02)
    provides: "bloqueoSchema/BloqueoInput, clienteInlineSchema/ClienteInlineInput, clienteBusquedaSchema/ClienteBusquedaInput (lib/schemas/*)"
  - phase: 03-motor-de-disponibilidad
    provides: "AvailabilityData / TurnoServicioRow contract (packages/availability-engine/src/types.ts), consumed as the exact fetch shape"
provides:
  - "buildAvailabilityData(negocioId): Promise<AvailabilityData> — el único helper de fetch scopeado por negocio, reusado por page.tsx (Plan 07) y las Server Actions de turnos (Plan 04)"
  - "fetchTurnoServicios(negocioId, turnoId) — helper de detalle separado del contrato del motor"
  - "crearBloqueo/eliminarBloqueo (app/actions/bloqueos.ts) — escritura directa a bloqueo, APPT-02"
  - "buscarClientePorTelefono/crearClienteInline (app/actions/clientes.ts) — búsqueda parcial + alta inline, D-09/APPT-06"
affects: ["04-grilla-y-turnos-del-dashboard Plan 04", "04-grilla-y-turnos-del-dashboard Plan 05", "04-grilla-y-turnos-del-dashboard Plan 06", "04-grilla-y-turnos-del-dashboard Plan 07"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "buildAvailabilityData centraliza el Promise.all de las 5 tablas que computeSlots necesita, en vez de que cada consumidor arme su propio fetch — evita drift entre lo que la grilla muestra y lo que el motor valida al escribir"
    - "fetchTurnoServicios se mantiene deliberadamente fuera del contrato AvailabilityData (dato de UI de detalle, no input del motor)"

key-files:
  created:
    - apps/dashboard/lib/availability-data.ts
    - apps/dashboard/app/actions/bloqueos.ts
    - apps/dashboard/app/actions/clientes.ts
  modified: []

key-decisions:
  - "buscarClientePorTelefono usa .ilike con match parcial (no .eq exacto como sugería el skeleton de RESEARCH.md Pattern 4) para soportar búsqueda incremental por dígitos mientras el dueño tipea (04-RESEARCH.md A3) — cambio consciente respecto al skeleton, alineado con la acceptance criteria explícita del PLAN.md Task 3"
  - "crearClienteInline no revalida ninguna ruta: crear un cliente no cambia el estado de la grilla de turnos; el modal usa el clienteId devuelto directamente para continuar al slot-picker"

patterns-established: []

requirements-completed: [APPT-02, APPT-06]

# Metrics
duration: 12min
completed: 2026-07-06
---

# Phase 4 Plan 3: Capa de datos y escritura simple (availability-data, bloqueos, clientes) Summary

**buildAvailabilityData centraliza el único fetch scopeado-por-negocio que arma el shape exacto que consume computeSlots, más dos módulos de Server Actions (bloqueo y cliente) que escriben directo a sus tablas sin pasar por el motor, todo derivando negocio_id de getNegocioActivo() y nunca del cliente.**

## Performance

- **Duration:** ~12 min
- **Tasks:** 3 completed
- **Files modified:** 3 (todos nuevos)

## Accomplishments
- `lib/availability-data.ts`: `buildAvailabilityData(negocioId)` hace un `Promise.all` de 5 queries (`horario_trabajo`, `bloqueo`, `turno`, `servicio`, `negocio`) scopeadas por `negocio_id` (o `id` para negocio) usando el cliente RLS del owner; devuelve el shape `AvailabilityData` importado directamente de `@turnosbot/availability-engine` (sin declarar shapes paralelos). Si el fetch de `negocio` falla, lanza el copy de error de 04-UI-SPEC.md. `fetchTurnoServicios(negocioId, turnoId)` queda separado como helper de detalle, fuera del contrato del motor (Pitfall 5).
- `app/actions/bloqueos.ts`: `crearBloqueo`/`eliminarBloqueo` siguiendo el molde exacto de `servicios.ts` (`requireRole("owner")` primero, `negocio_id` de `getNegocioActivo()`, `.eq("negocio_id", ...)` explícito además de RLS en el delete, `revalidatePath("/turnos")` en éxito).
- `app/actions/clientes.ts`: `buscarClientePorTelefono` (match parcial vía `.ilike`, scopeado) y `crearClienteInline` (insert + devuelve `clienteId`), ambas derivando `negocio_id` server-side.
- `pnpm --filter @turnosbot/dashboard typecheck` y `test` (58 tests, 10 archivos) verdes tras los 3 archivos nuevos.

## Task Commits

Each task was committed atomically:

1. **Task 1: buildAvailabilityData + helper de turno_servicio** - `188be8f` (feat)
2. **Task 2: Server Actions de bloqueo (crear/eliminar)** - `e2dc575` (feat)
3. **Task 3: Server Actions de cliente (buscar/crear inline, D-09)** - `91383a9` (feat)

_Nota: no hubo ciclo TDD RED/GREEN (`tdd` no está marcado `true` en las tasks del plan) — se aplicó verificación vía typecheck + acceptance criteria (grep de scoping) por task, como especifica el PLAN.md._

## Files Created/Modified
- `apps/dashboard/lib/availability-data.ts` - `buildAvailabilityData(negocioId)` + `fetchTurnoServicios(negocioId, turnoId)`
- `apps/dashboard/app/actions/bloqueos.ts` - `crearBloqueo`/`eliminarBloqueo`, tipo `BloqueoActionResult`
- `apps/dashboard/app/actions/clientes.ts` - `buscarClientePorTelefono`/`crearClienteInline`, tipos `ClienteResumen`/`ClienteBusquedaResult`/`ClienteCrearResult`

## Decisions Made
- `buscarClientePorTelefono` implementa `.ilike("telefono", "%"+telefono+"%")` en vez del `.eq` exacto que mostraba el skeleton de 04-RESEARCH.md Pattern 4 — el PLAN.md Task 3 pide explícitamente match parcial (resuelve A3: el dueño tipea dígitos incrementales), y la acceptance criteria del propio task lo exige. No hay drift real: RESEARCH.md documenta el `.eq` como una opción, PLAN.md decidió `.ilike` como la implementación final.
- `crearClienteInline` no llama `revalidatePath` — crear un cliente no altera ningún dato mostrado en `/turnos`; el `clienteId` se pasa directo al siguiente paso del flujo (slot-picker, Plan 05/06).
- Tipos de retorno de `clientes.ts` (`ClienteResumen`, `ClienteBusquedaResult`, `ClienteCrearResult`) se nombraron explícitamente en vez del genérico `ClienteActionResult` sugerido en el objective del plan, porque las dos actions devuelven datos (lista de clientes / clienteId), no solo `{success:true}`/`{error}` como las de bloqueo — un solo union type hubiera perdido esa forma en el tipo de retorno real.

## Deviations from Plan

None - el plan se ejecutó tal cual escrito (el único ajuste, `.ilike` vs el `.eq` del skeleton de RESEARCH, ya estaba explícitamente indicado en el PLAN.md Task 3 y su acceptance criteria, no es una deviation).

## Issues Encountered

Ninguno. `pnpm` no está en el PATH del shell (solo `corepack`); se usó `corepack pnpm <cmd>` para typecheck/test, igual que en 04-02.

## User Setup Required

None - no requiere configuración externa.

## Next Phase Readiness

- Plan 04 (Server Actions de turnos que usan el motor) puede importar `buildAvailabilityData` para revalidar disponibilidad antes de `bookAppointment`/`rescheduleAppointment`, y reusar `crearBloqueo`/`eliminarBloqueo`/`buscarClientePorTelefono`/`crearClienteInline` según necesite.
- Plan 07 (página `/turnos`) puede llamar `buildAvailabilityData(negocio.id)` directo desde el Server Component para renderizar la grilla con `computeSlots`.
- Sin bloqueos ni concerns nuevos para el resto de la fase.

---
*Phase: 04-grilla-y-turnos-del-dashboard*
*Completed: 2026-07-06*

## Self-Check: PASSED

- FOUND: apps/dashboard/lib/availability-data.ts
- FOUND: apps/dashboard/app/actions/bloqueos.ts
- FOUND: apps/dashboard/app/actions/clientes.ts
- FOUND commit: 188be8f
- FOUND commit: e2dc575
- FOUND commit: 91383a9
