---
phase: 04-grilla-y-turnos-del-dashboard
plan: 05
subsystem: ui
tags: [nextjs, react-client-components, shadcn, server-actions]

# Dependency graph
requires:
  - phase: 04-grilla-y-turnos-del-dashboard (Plan 03)
    provides: "buscarClientePorTelefono/crearClienteInline (app/actions/clientes.ts)"
  - phase: 04-grilla-y-turnos-del-dashboard (Plan 04)
    provides: "crearTurnoManual/cancelarTurno/reagendarTurno (app/actions/turnos.ts), obtenerSlotsDisponibles/profesionalesElegibles (app/actions/slots.ts)"
provides:
  - "ClienteSearch (components/cliente-search.tsx) — busca/crea cliente al vuelo (D-09), devuelve clienteId por onSelect"
  - "SlotSelector (components/slot-selector.tsx) — selector de slot real compartido, backed 100% por computeSlots via las Server Actions de Plan 04 (D-10/D-13)"
  - "TurnoFormDialog (components/turno-form-dialog.tsx) — Dialog dual-mode alta/reagendar que compone ClienteSearch + SlotSelector"
  - "TurnoDetailSheet (components/turno-detail-sheet.tsx) — Sheet de detalle con cancelar (D-12) y disparo de reagendar"
affects: ["04-grilla-y-turnos-del-dashboard Plan 07"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Offset fijo -03:00 (Argentina, sin DST desde 2009) para convertir el HH:mm local que devuelve computeSlots a ISO timestamptz — mismo criterio ya establecido por bloqueo-form-dialog.tsx (Plan 06), reusado acá en slot-selector.tsx en vez de agregar @date-fns/tz al dashboard"
    - "Intl.DateTimeFormat con timeZone nativo (sin librería) para formatear ISO -> HH:mm de exhibición en turno-form-dialog.tsx/turno-detail-sheet.tsx, distinto del caso de conversión local->ISO (que sí necesita el offset fijo porque el navegador no puede invertir una zona horaria arbitraria sin una tabla de reglas)"
    - "SlotSelector siempre llama profesionalesElegibles aunque venga profesionalIdFijo, solo para resolver el nombre a mostrar en el empty-copy 'sin horarios' — nunca se salta el gate de Pitfall 6, incluso en el camino donde el profesional ya viene fijado desde afuera"

key-files:
  created:
    - apps/dashboard/components/cliente-search.tsx
    - apps/dashboard/components/slot-selector.tsx
    - apps/dashboard/components/turno-form-dialog.tsx
    - apps/dashboard/components/turno-detail-sheet.tsx
  modified: []

key-decisions:
  - "TurnoFormDialog agrega un prop `servicios?: Tables<\"servicio\">[]` no listado en el resumen abreviado de artifacts_produced del PLAN.md, pero explícitamente requerido por la prosa del Task 2 ('selección de servicios ... pasar la lista como prop desde el padre') — sin este prop no hay forma de renderizar las checkboxes de servicios del modo alta."
  - "Los cuatro props de PLAN.md Task 2/3 (timezone en TurnoFormDialog/TurnoDetailSheet, fecha en TurnoDetailSheet) se tomaron de la prosa detallada de cada Task, no del resumen `artifacts_produced` (que los omite) — la prosa de cada Task es la fuente autoritativa cuando hay discrepancia con el resumen."
  - "horaInicioPreload se implementó como hint informativo (texto 'Horario sugerido: HH:mm') en vez de pre-seleccionar un chip del SlotSelector — D-03 solo exige que profesionalId+horaInicio 'no se retipeen', y el click en un chip real no es re-tipeo; auto-seleccionar un chip específico habría requerido agregar soporte de preselección a SlotSelector, fuera del contrato de props que Task 1 definió para ese componente."

patterns-established: []

requirements-completed: [APPT-03, APPT-04, APPT-05, APPT-06]

# Metrics
duration: 18min
completed: 2026-07-06
---

# Phase 4 Plan 5: UI de alta manual, reagendado y detalle de turno Summary

**Cuatro componentes cliente que completan el flujo operativo de turnos del dueño (búsqueda/alta de cliente al vuelo, selector de slot real compartido, alta/reagendado dual-mode, y panel de detalle con cancelación sin motivo), todos delegando 100% en las Server Actions de Plan 03/04 sin recalcular disponibilidad a mano.**

## Performance

- **Duration:** ~18 min
- **Tasks:** 3 completed
- **Files modified:** 4 (todos nuevos)

## Accomplishments

- `cliente-search.tsx`: input "Buscar por teléfono" → `buscarClientePorTelefono`; sin resultados, ofrece alta inline (`crearClienteInline`) con el copy exacto de 04-UI-SPEC.md ("No encontramos un cliente con ese teléfono." + "Cargar datos del cliente" + "Usar este cliente"). Devuelve `clienteId` por `onSelect`, nunca navega a otra pantalla.
- `slot-selector.tsx`: compartido D-10/D-13 entre alta y reagendar. Profesionales SOLO vía `profesionalesElegibles` (Pitfall 6 — exige elegibilidad para TODOS los serviceIds); horarios SOLO vía `obtenerSlotsDisponibles`; chips `grid-cols-4 gap-2` con `HH:mm`. Empty-copy exacto cuando no hay slots. Conversión HH:mm local → ISO con offset fijo `-03:00` (mismo criterio que `bloqueo-form-dialog.tsx`, sin agregar `@date-fns/tz` al dashboard).
- `turno-form-dialog.tsx`: shell de `servicio-dialog.tsx` adaptado a composición de sub-componentes (sin react-hook-form, porque `ClienteSearch`/`SlotSelector` manejan su propio estado). Modo alta compone `ClienteSearch` + checkboxes de servicios + `SlotSelector`, llama `crearTurnoManual`. Modo reagendar reusa el mismo `SlotSelector` con los `serviceIds` fijos del turno, llama `reagendarTurno`. El error de slot ocupado se muestra con el copy que devuelve la action, sin texto hardcodeado alternativo.
- `turno-detail-sheet.tsx`: `Sheet` lateral (D-04) con servicios+precio, total `font-semibold`, horario `HH:mm – HH:mm` (vía `Intl.DateTimeFormat` con la timezone del negocio, sin librería), profesional. "Cancelar turno" abre un `AlertDialog` SIN motivo (D-12, molde de `profesionales-table.tsx` pero sin `AlertDialogDescription`), llama `cancelarTurno`. "Reagendar" abre `TurnoFormDialog` en `mode="reagendar"`.
- `pnpm --filter @turnosbot/dashboard typecheck` y `test` (58/58) verdes tras los 4 archivos nuevos.

## Task Commits

Each task was committed atomically:

1. **Task 1: cliente-search.tsx + slot-selector.tsx (sub-componentes)** - `2edf97c` (feat)
2. **Task 2: turno-form-dialog.tsx (alta manual + reagendar, dual-mode)** - `6fb19f1` (feat)
3. **Task 3: turno-detail-sheet.tsx (detalle + cancelar + reagendar, D-04)** - `5d50f5a` (feat)

_Nota: no hubo ciclo TDD RED/GREEN (`tdd` no está marcado `true` en las tasks del plan) — se aplicó verificación vía typecheck + acceptance criteria por task, como especifica el PLAN.md. La verificación runtime de toasts/confirmaciones/formateo de precios queda explícitamente diferida a QA manual (MQ-2/MQ-3 de 04-VALIDATION.md), tal como el propio PLAN.md lo declara en su sección `<verification>`._

## Files Created/Modified

- `apps/dashboard/components/cliente-search.tsx` - `ClienteSearch` (props: `onSelect`)
- `apps/dashboard/components/slot-selector.tsx` - `SlotSelector` (props: `serviceIds`, `fecha`, `onSelect`, `profesionalIdFijo?`)
- `apps/dashboard/components/turno-form-dialog.tsx` - `TurnoFormDialog` (props: `mode`, `turno?`, `servicios?`, `profesionalIdPreload?`, `horaInicioPreload?`, `fecha`, `timezone`, `open`, `onOpenChange`)
- `apps/dashboard/components/turno-detail-sheet.tsx` - `TurnoDetailSheet` (props: `turno`, `fecha`, `timezone`, `open`, `onOpenChange`), exporta también el tipo `TurnoDetalle`

## Decisions Made

- `TurnoFormDialog` agrega `servicios?: Tables<"servicio">[]` — no listado en el resumen `artifacts_produced` del PLAN.md pero exigido explícitamente por la prosa del Task 2 para renderizar las checkboxes del modo alta. Sin drift real: la prosa de cada Task es más detallada y autoritativa que el índice abreviado de artifacts.
- `timezone`/`fecha` en `TurnoFormDialog`/`TurnoDetailSheet` se tomaron literal de los Props declarados en la prosa de Task 2/3 (que sí los incluye), aunque el resumen de artifacts los omite.
- `horaInicioPreload` se implementa como hint textual, no como preselección forzada de un chip — evita expandir el contrato de props de `SlotSelector` (Task 1) más allá de lo que ese Task definió.
- La conversión de horario local a ISO reusa el mismo offset fijo `-03:00` que ya estableció `bloqueo-form-dialog.tsx` (Plan 06, ya mergeado) en vez de introducir una segunda estrategia de timezone en la misma fase — consistencia intencional, documentada como patrón en el frontmatter.

## Deviations from Plan

None (estructurales) - el plan se ejecutó tal cual escrito. Las únicas adiciones (prop `servicios` en `TurnoFormDialog`, prop `timezone`/`fecha` completos) fueron tomadas de la prosa detallada de cada Task, que es más específica que el resumen `artifacts_produced` — no hay contradicción entre ambos documentos, solo un nivel de detalle distinto.

## Issues Encountered

Ninguno. `pnpm` no está en el PATH del shell (solo `corepack`); se usó `corepack pnpm <cmd>` para typecheck/test, igual que en plans anteriores de esta fase.

## User Setup Required

None - no requiere configuración externa.

## Next Phase Readiness

- Plan 07 (página `/turnos`, grilla) puede importar `TurnoFormDialog` (para el popover D-03 rama "Crear turno" y como target del botón "Reagendar" del detalle) y `TurnoDetailSheet` (click en celda confirmada, D-04) directamente, pasando `fecha`/`timezone` que ya resuelve desde `getNegocioActivo()`/`buildAvailabilityData`.
- `TurnoFormDialog` espera la lista de servicios activos del negocio como prop (`servicios`) — Plan 07 debe fetchearla (ya disponible vía `buildAvailabilityData` o un query directo a `servicio`) y pasarla al montar el Dialog en modo alta.
- Sin bloqueos ni concerns nuevos para el resto de la fase.

---
*Phase: 04-grilla-y-turnos-del-dashboard*
*Completed: 2026-07-06*
