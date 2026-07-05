---
phase: 02-dashboard-y-datos-del-negocio
plan: 05
subsystem: ui
tags: [servicios, dnd-kit, zod, react-hook-form, supabase-rls, vitest, tdd, nextjs-app-router]

requires:
  - phase: 02-dashboard-y-datos-del-negocio (plan 02-04)
    provides: negocio-context.ts (getNegocioActivo), require-role.ts, negocioSchema pattern, owner shell/sidebar with /servicios nav link already wired
provides:
  - servicioSchema (zod) — validación de nombre/descripcion/precio/duracion_min
  - reorder() puro con test unitario (arrayMove + reasignación de orden contiguo)
  - Server Actions createServicio/updateServicio/toggleServicioActivo/reorderServicios
  - Página /servicios con tabla Tabs/Switch/soft-delete + drag-and-drop + dialog crear/editar
affects: [02-06-profesionales (consume servicio.activo/precio para la matriz de servicios por profesional), 02-07-horarios-precios]

tech-stack:
  added: []
  patterns:
    - "Server Action reutiliza requireRole('owner') + getNegocioActivo() como única fuente del negocio_id, nunca un campo del cliente (mismo patrón que app/actions/negocio.ts de 02-04)"
    - "Tabla client-component con estado local de array (no filtro por URL) cuando la tabla ya necesita estado reactivo propio para drag-and-drop optimista"
    - "reorder() puro delega el movimiento de array a arrayMove de @dnd-kit/sortable (ya dependencia) en vez de reimplementar swap manual"

key-files:
  created:
    - apps/dashboard/lib/schemas/servicio.ts
    - apps/dashboard/lib/schemas/servicio.test.ts
    - apps/dashboard/lib/reorder.ts
    - apps/dashboard/lib/reorder.test.ts
    - apps/dashboard/app/actions/servicios.ts
    - apps/dashboard/app/(owner)/servicios/page.tsx
    - apps/dashboard/components/servicios-table.tsx
    - apps/dashboard/components/servicio-dialog.tsx
  modified: []

key-decisions:
  - "Tabs Todos/Activos/Inactivos en servicios-table.tsx usa estado React local, no ?estado= en la URL (a diferencia de components/admin/estado-filter-tabs.tsx) — la tabla ya mantiene un array de estado reactivo para el drag-and-drop optimista, y acoplar el filtro a la URL forzaría sincronizar dos fuentes de verdad para el mismo array"
  - "createServicio calcula orden como el count actual de servicios del negocio (sin filtrar por activo) — un servicio nuevo siempre se agrega al final del orden visual completo, independientemente de cuántos estén desactivados"

patterns-established:
  - "Pattern: dialog reutilizado create/edit con prop opcional de la entidad + useForm({ values: {...} }) reactivo (mismo patrón que components/admin/negocio-dialog.tsx)"

requirements-completed: [SVC-01, SVC-02]

coverage:
  - id: D1
    description: "servicioSchema rechaza nombre vacío, precio negativo, duracion_min <= 0 o no entera; acepta descripción opcional"
    requirement: SVC-01
    verification:
      - kind: unit
        ref: "apps/dashboard/lib/schemas/servicio.test.ts — 7 tests (válido completo, válido sin descripción, nombre vacío, precio negativo, duracion 0, duracion negativa, duracion no entera)"
        status: pass
    human_judgment: false
  - id: D2
    description: "reorder(items, fromId, toId) reasigna orden 0..n-1 sin huecos ni duplicados; no-op si from===to"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "apps/dashboard/lib/reorder.test.ts — 5 tests (primero->último, último->primero, no-op, movimientos encadenados, movimiento de elemento medio)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Server Actions de servicios re-validan con servicioSchema y derivan negocio_id server-side (nunca del cliente); toggle y reorder scoped al negocio activo"
    requirement: SVC-01
    verification:
      - kind: other
        ref: "tsc --noEmit (sin errores) + node script de verificación del plan (createServicio/updateServicio/toggleServicioActivo/reorderServicios + servicioSchema presentes)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Página /servicios lista servicios del negocio activo con CTA + empty state exacto; tabla con Tabs/Switch/AlertDialog destructivo/badge gris/drag-handle accesible"
    requirement: SVC-02
    verification:
      - kind: other
        ref: "tsc --noEmit (sin errores) + node script de verificación del plan (Reordenar servicio, GripVertical, Tabs, + Nuevo servicio presentes en el código)"
        status: pass
    human_judgment: true
    rationale: "El script automatizado confirma presencia de los elementos requeridos en el código fuente, pero el comportamiento visual real (opacidad ~60% en filas inactivas, drag-and-drop funcionando end-to-end en el navegador, toast de rollback ante fallo real de red) requiere verificación manual con la app corriendo — no ejecutado en este entorno de worktree (sin servidor dev levantado)."

duration: ~20min
completed: 2026-07-04
status: complete
---

# Phase 02 Plan 05: Servicios (CRUD + soft-delete + orden drag-and-drop) Summary

**CRUD completo de servicios con soft-delete (Tabs/Switch/AlertDialog) y reordenamiento drag-and-drop vía @dnd-kit, con `reorder()` puro y schema zod cubiertos por 12 tests unitarios (TDD RED→GREEN).**

## Performance

- **Duration:** ~20 min
- **Tasks:** 3
- **Files modified:** 8 (todos nuevos)

## Accomplishments

- `servicioSchema` (zod) valida nombre/descripcion/precio/duracion_min, con 7 tests unitarios cubriendo el `<behavior>` declarado en el plan.
- `reorder()` puro (usa `arrayMove` de `@dnd-kit/sortable`) reasigna `orden` 0..n-1 sin huecos ni duplicados, con 5 tests unitarios (incluyendo movimientos encadenados).
- Cuatro Server Actions (`createServicio`, `updateServicio`, `toggleServicioActivo`, `reorderServicios`) que re-validan con zod y derivan `negocio_id` siempre de `getNegocioActivo()` — nunca de un campo del cliente (T-02-13, mitigado).
- Página `/servicios` completa: lista del negocio activo, CTA "+ Nuevo servicio", empty state exacto, tabla con Tabs Todos/Activos/Inactivos, Switch + AlertDialog destructivo (copy exacto de 02-UI-SPEC.md), badge gris "Inactivo", drag-and-drop accesible (`aria-label="Reordenar servicio"`, keyboard sensor), y dialog crear/editar reutilizable.

## Task Commits

Each task was committed atomically (Task 1 siguió TDD RED→GREEN, dos commits):

1. **Task 1 (RED): Tests fallidos de servicio schema + reorder** - `30246bc` (test)
2. **Task 1 (GREEN): Implementación de servicioSchema + reorder** - `06b4cd2` (feat)
3. **Task 3: Server Actions de servicios (crear/editar/toggle/reorder)** - `f86198e` (feat)
4. **Task 2: Página de servicios + tabla + dialog** - `1c7d352` (feat)

_Nota: se ejecutó Task 1 (RED→GREEN) primero, luego Task 3 (Server Actions) antes que Task 2 (UI) porque la tabla/dialog de Task 2 importan las Server Actions de Task 3 — mismo objetivo del plan, orden de commit ajustado por dependencia real de imports, no por preferencia._

## Files Created/Modified

- `apps/dashboard/lib/schemas/servicio.ts` - zod schema de servicio (nombre/descripcion/precio/duracion_min)
- `apps/dashboard/lib/schemas/servicio.test.ts` - 7 tests unitarios del schema
- `apps/dashboard/lib/reorder.ts` - función pura de reordenamiento (arrayMove + reasignación de orden)
- `apps/dashboard/lib/reorder.test.ts` - 5 tests unitarios de reorder
- `apps/dashboard/app/actions/servicios.ts` - Server Actions create/update/toggle/reorder
- `apps/dashboard/app/(owner)/servicios/page.tsx` - página de listado (Server Component)
- `apps/dashboard/components/servicios-table.tsx` - tabla client-component (Tabs/Switch/dnd-kit)
- `apps/dashboard/components/servicio-dialog.tsx` - dialog crear/editar (react-hook-form + zodResolver)

## Decisions Made

- El filtro Tabs Todos/Activos/Inactivos de `servicios-table.tsx` usa estado React local en vez de query params en la URL (a diferencia del patrón de `components/admin/estado-filter-tabs.tsx` en 02-04/02-08) — justificación: esta tabla ya necesita mantener el array `servicios` en estado local reactivo para el drag-and-drop optimista con rollback; acoplar el filtro a la URL habría creado dos fuentes de verdad para el mismo array sin ningún beneficio (no hay necesidad de que el filtro sea bookmarkeable/compartible en este caso de uso).
- `createServicio` calcula el `orden` del nuevo servicio como el conteo total de servicios del negocio (activos e inactivos) — un servicio nuevo siempre se agrega al final visual completo.

## Deviations from Plan

None - plan ejecutado según lo especificado. El único ajuste fue de **orden de ejecución** (Task 3 antes que Task 2, ver nota en Task Commits) por dependencia real de imports entre los archivos del propio plan — no constituye una deviation de contenido, solo de secuencia de commits.

## Issues Encountered

- El worktree no tenía `node_modules` instalado (git worktrees no incluyen artefactos de build). Se ejecutó `pnpm install --frozen-lockfile` antes de correr los tests — no es una deviation de código, es un paso de entorno necesario para poder verificar el plan en este worktree aislado.
- `pnpm` no estaba en el `PATH` de la shell de este entorno; se usó `corepack pnpm` como wrapper (el `packageManager` del repo ya fija `pnpm@9.15.0` via corepack) para todos los comandos de verificación (`vitest`, `tsc`).

## User Setup Required

None - no external service configuration required. Todas las mutaciones son RLS-scoped contra `bdgufnitakelyialjoqg` (ya configurada desde fases anteriores); no se agregó ninguna dependencia nueva (`@dnd-kit/*`, `react-hook-form`, `@hookform/resolvers`, `sonner`, `zod` ya estaban instalados desde 02-04).

## Next Phase Readiness

- `servicio.activo` / `servicio.precio` / `servicio.duracion_min` quedan disponibles para que 02-06 (Profesionales) construya la matriz de servicios-por-profesional con precio custom (PRO-03/04).
- El patrón de Server Action (`requireRole` + `getNegocioActivo` + re-validación zod + `.eq("negocio_id", ...)` defensivo) queda establecido y reutilizable para 02-06/02-07.
- Verificación manual pendiente (no bloqueante): confirmar visualmente en el navegador que el drag-and-drop persiste correctamente y que el toast de rollback aparece ante un fallo real de red — no verificado en este entorno de worktree sin servidor dev levantado (ver coverage D4).

---
*Phase: 02-dashboard-y-datos-del-negocio*
*Completed: 2026-07-04*
