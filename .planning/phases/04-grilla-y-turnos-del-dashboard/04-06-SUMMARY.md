---
phase: 04-grilla-y-turnos-del-dashboard
plan: 06
subsystem: ui
tags: [react, react-hook-form, zod, shadcn, radix-ui, dashboard]

# Dependency graph
requires:
  - phase: 04-grilla-y-turnos-del-dashboard (Plan 02)
    provides: "bloqueoSchema/BloqueoInput (lib/schemas/bloqueo.ts), Popover (components/ui/popover.tsx)"
  - phase: 04-grilla-y-turnos-del-dashboard (Plan 03)
    provides: "crearBloqueo/eliminarBloqueo Server Actions (app/actions/bloqueos.ts)"
provides:
  - "BloqueoFormDialog (apps/dashboard/components/bloqueo-form-dialog.tsx) — modal de creación de bloqueo con profesional+hora pre-cargados"
  - "BloqueoPopover (apps/dashboard/components/bloqueo-popover.tsx) — popover de detalle+eliminación de bloqueo"
affects: ["04-grilla-y-turnos-del-dashboard Plan 07"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Conversión horario local (Argentina, offset fijo -03:00 sin DST) -> UTC ISO sin dependencia de timezone en el dashboard (@date-fns/tz queda exclusivo del motor puro)"
    - "Duración de bloqueo como estado local de UI (no forma parte de bloqueoSchema) que se resuelve a inicio/fin ISO antes de pasar a react-hook-form vía la opción `values`"

key-files:
  created:
    - apps/dashboard/components/bloqueo-form-dialog.tsx
    - apps/dashboard/components/bloqueo-popover.tsx
  modified: []

key-decisions:
  - "Offset fijo -03:00 hardcodeado para la conversión local->UTC en vez de agregar @date-fns/tz al dashboard: Argentina no observa horario de verano desde 2009, así que TODAS sus IANA zones comparten el mismo offset todo el año — evita una dependencia nueva solo para este cálculo puntual, documentado explícitamente en el header del archivo para que no se asuma erróneamente en una fase multi-país futura"
  - "Duración del bloqueo agregada como prop opcional `granularidadMin` (15|30, default 30) + Select de 15/30/45/60/90/120 min — no estaba en la lista literal de props del plan pero el propio `<action>` del Task 1 pide explícitamente 'incluir un input simple de duración... usar la granularidad del negocio como default'; se implementó como prop OPCIONAL para no romper el contrato mínimo (profesionalId/horaInicio/fecha/open/onOpenChange) si Plan 07 no la pasa"
  - "BloqueoPopover se implementó como Popover completamente autocontenido (Popover+PopoverContent, sin Trigger/Anchor propio) porque el plan no incluye una prop de trigger/anchor en su contrato — el anclaje visual contra la celda de bloqueo específica queda a resolver por Plan 07 al montar este componente sobre la grilla"

patterns-established: []

requirements-completed: [APPT-02]

# Metrics
duration: 15min
completed: 2026-07-06
---

# Phase 4 Plan 6: UI de bloqueos manuales (bloqueo-form-dialog + bloqueo-popover) Summary

**Dos componentes cliente que cierran la superficie visual de APPT-02: un Dialog de creación con profesional+hora pre-cargados y offset fijo Argentina para la conversión UTC, y un Popover de detalle+eliminación con confirmación destructiva — ambos consumiendo directamente las Server Actions de Plan 03 sin lógica de escritura propia.**

## Performance

- **Duration:** ~15 min
- **Tasks:** 2 completed
- **Files modified:** 2 (ambos nuevos)

## Accomplishments
- `bloqueo-form-dialog.tsx`: Dialog `"use client"` totalmente controlado desde afuera (`open`/`onOpenChange`), con `profesionalId` y `horaInicio`/`fecha` recibidos vía props (D-03: "no vía re-tipeo") en vez de inputs. Incluye un `Select` de duración (15/30/45/60/90/120 min, default = `granularidadMin` prop opcional o 30) que junto a `horaInicio`+`fecha` se resuelve a `inicio`/`fin` ISO-UTC antes de pasarlos a `react-hook-form` vía la opción `values`. Campo `motivo` opcional (`Textarea`, molde exacto de `servicio-dialog.tsx` con `value ?? ""`). Submit llama `crearBloqueo`, maneja `"error" in result` con `setServerError`, y en éxito hace `toast.success("Horario bloqueado.")` + `onOpenChange(false)`. Botón submit: "Bloquear horario" / "Bloqueando…" según `isPending`.
- `bloqueo-popover.tsx`: Popover `"use client"` controlado desde afuera, muestra `bloqueo.motivo` o "Sin motivo especificado" (`text-muted-foreground`) cuando es null (D-12). Botón `variant="destructive"` `size="sm"` `aria-label="Eliminar bloqueo"` abre un `AlertDialog` de confirmación (molde de `profesionales-table.tsx`) con el copy exacto de 04-UI-SPEC.md ("¿Eliminar este bloqueo? El horario vuelve a estar disponible." / "Eliminar" destructive / "Cancelar"). Confirmar llama `eliminarBloqueo`, `toast.success("Bloqueo eliminado.")` en éxito y cierra ambos (confirmación + popover).
- Cero `negocio_id`/`service_role` en el cliente en ambos componentes — toda la escritura delega en las Server Actions de Plan 03, que derivan el scoping server-side.
- `pnpm --filter @turnosbot/dashboard typecheck` sin errores y `test` (58 tests, 10 archivos, sin regresiones) verdes tras agregar los 2 archivos nuevos.

## Task Commits

Each task was committed atomically:

1. **Task 1: bloqueo-form-dialog.tsx (crear bloqueo, D-03 rama Bloquear)** - `6c30d8e` (feat)
2. **Task 2: bloqueo-popover.tsx (motivo + eliminar, D-05)** - `ce51426` (feat)

_Nota: no hubo ciclo TDD RED/GREEN (`tdd` no está marcado `true` en las tasks del plan) — verificación vía typecheck + acceptance criteria por task, como especifica el PLAN.md._

## Files Created/Modified
- `apps/dashboard/components/bloqueo-form-dialog.tsx` - `BloqueoFormDialog` (Dialog de creación de bloqueo, D-03/APPT-02)
- `apps/dashboard/components/bloqueo-popover.tsx` - `BloqueoPopover` (Popover de detalle+eliminación de bloqueo, D-05/APPT-02)

## Decisions Made
- Offset fijo `-03:00` hardcodeado (con comentario explícito en el header del archivo) en vez de instalar `@date-fns/tz` en el dashboard — Argentina no tiene horario de verano desde 2009, así que el cálculo es correcto para cualquier IANA zone del país sin agregar una dependencia nueva a un componente cliente. Si el proyecto alguna vez soporta negocios fuera de Argentina, este helper deja de ser válido y debe reemplazarse por conversión real vía timezone (ya documentado en el comentario).
- `granularidadMin` se agregó como prop OPCIONAL (no estaba en la lista literal de `artifacts_produced` del plan) porque el `<action>` del Task 1 pide explícitamente resolver la duración del bloqueo con la granularidad del negocio como default; se mantiene opcional (default 30) para no romper el contrato mínimo de props si Plan 07 no la pasa.
- `BloqueoPopover` no incluye trigger/anchor propio (Popover autocontenido con solo `PopoverContent`) porque el plan no define esa prop — el anclaje visual contra la celda específica de la grilla queda como responsabilidad de Plan 07 al montarlo (ver Next Phase Readiness).

## Deviations from Plan

**None** — el plan se ejecutó tal cual escrito. Las dos decisiones documentadas arriba (offset fijo Argentina, prop opcional `granularidadMin`) son resoluciones de ambigüedades explícitamente dejadas abiertas por el propio `<action>` del plan ("incluir un input simple de duración... usar la granularidad del negocio como default"), no cambios de alcance.

## Issues Encountered

Ninguno. `pnpm` no está en el `PATH` del shell (solo `corepack`); se usó `corepack pnpm <cmd>` para typecheck/test, igual que en planes anteriores de esta fase.

## User Setup Required

None - no requiere configuración externa.

## Next Phase Readiness

- Plan 07 (grilla `/turnos`) puede importar `BloqueoFormDialog` y montarlo desde el slot-popover (D-03, click en slot libre → opción "Bloquear"), pasando `profesionalId`/`horaInicio`/`fecha` del slot clickeado y opcionalmente `granularidadMin={negocio.granularidad_min}`.
- Plan 07 puede importar `BloqueoPopover` y montarlo sobre cada celda de bloqueo (D-05); dado que este componente no expone una prop de trigger/anchor, Plan 07 debe resolver el anclaje visual contra la celda específica (ej. posicionamiento propio o wrapping) al integrarlo en la grilla.
- **QA manual pendiente (no automatizable con typecheck):** MQ-4 de `04-VALIDATION.md` — crear/eliminar bloqueo end-to-end contra el dev server, incluyendo pre-carga de profesional+hora, toasts, confirmación destructiva y repintado del slot liberado. Requiere que Plan 07 exista (grilla real) para poder ejercitar el flujo completo — no se puede correr en aislamiento desde este plan.
- Sin bloqueos ni concerns nuevos para el resto de la fase.

---
*Phase: 04-grilla-y-turnos-del-dashboard*
*Completed: 2026-07-06*

## Self-Check: PASSED

- FOUND: apps/dashboard/components/bloqueo-form-dialog.tsx
- FOUND: apps/dashboard/components/bloqueo-popover.tsx
- FOUND commit: 6c30d8e
- FOUND commit: ce51426
