---
phase: quick-260712-g2y
plan: 01
subsystem: ui
tags: [react-hook-form, zod, dnd-kit, dashboard, next.js]

# Dependency graph
requires:
  - phase: 02-dashboard-y-datos-del-negocio
    provides: ServicioDialog (react-hook-form + zodResolver) y ServiciosTable (dnd-kit) del CRUD de Servicios (SVC-01)
provides:
  - Inputs numéricos precio/duracion_min sin NaN (nunca `value={NaN}`, vaciar el campo guarda `undefined`)
  - ServiciosTable re-sincronizada con `initialServicios` en cada render (patrón "adjust state during render", sin useEffect)
affects: [servicios, dashboard-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Inputs numéricos controlados en react-hook-form: sobrescribir value/onChange DESPUÉS de {...field} para evitar value={NaN} y guardar undefined en vez de NaN al vaciar el campo"
    - "Reset de estado derivado durante el render (firma string de props) en vez de useEffect, para re-sincronizar estado local client-side con props revalidadas por revalidatePath"

key-files:
  created: []
  modified:
    - apps/dashboard/components/servicio-dialog.tsx
    - apps/dashboard/components/servicios-table.tsx

key-decisions:
  - "value={Number.isFinite(field.value) ? field.value : \"\"} y onChange que guarda undefined (no NaN) al vaciar el input — deja que zodResolver muestre el mensaje 'obligatorio' de zod en vez de bloquear el submit con un error de NaN confuso"
  - "Firma string derivada (JSON.stringify de id/orden/activo/precio/duracion_min/nombre/descripcion) comparada en render para decidir cuándo re-sembrar el useState de ServiciosTable con initialServicios — patrón oficial de React, sin useEffect"

patterns-established:
  - "Pattern 1: inputs numéricos de react-hook-form siempre sobrescriben value/onChange después del spread {...field} cuando el schema no acepta NaN"
  - "Pattern 2: estado derivado de props revalidadas se resetea comparando una firma en el cuerpo del componente, nunca con useEffect"

requirements-completed: [SVC-01]

# Metrics
duration: ~12min
completed: 2026-07-12
---

# Quick Task 260712-g2y: Corregir NaN en inputs de precio/duración Summary

**Inputs numéricos de precio/duración controlados (sin `value={NaN}`, guardan `undefined` al vaciarse) y `ServiciosTable` re-sincronizada con props revalidadas mediante reset de estado en render.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-07-12T14:29:00Z (aprox.)
- **Completed:** 2026-07-12T14:41:13Z
- **Tasks:** 2/2 completadas
- **Files modified:** 2

## Accomplishments
- Los inputs `precio` y `duracion_min` del diálogo de Servicios nunca renderizan `value={NaN}`: al vaciar el campo se muestra `""` y el form guarda `undefined`, no `NaN`.
- Un submit con precio/duración válidos ya no puede quedar bloqueado silenciosamente por `z.number()` rechazando `NaN` — vaciar el campo ahora dispara el mensaje "obligatorio" normal de zod.
- `ServiciosTable` re-siembra su `useState` cada vez que la firma derivada de `initialServicios` cambia (edición vía diálogo + `revalidatePath`), reflejando la fila actualizada al instante sin recarga dura.
- El patrón "reset de estado derivado durante el render" se implementó sin `useEffect`, preservando intactos los updates optimistas de `handleToggle`/`handleDragEnd` y la ordenación por `orden`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Controlar inputs numéricos de precio y duración para evitar NaN** - `7952cb7` (fix)
2. **Task 2: Re-sincronizar estado local de ServiciosTable con las props revalidadas** - `b51c5e3` (fix)

**Plan metadata:** (pendiente — el orquestador realiza el commit de docs)

## Files Created/Modified
- `apps/dashboard/components/servicio-dialog.tsx` - Ambos `FormField` numéricos (`precio`, `duracion_min`) sobrescriben `value`/`onChange` después de `{...field}`: `value` cae a `""` cuando `field.value` no es finito; `onChange` guarda `undefined` cuando el input queda vacío, `valueAsNumber` en caso contrario.
- `apps/dashboard/components/servicios-table.tsx` - Nueva función `firmaServicios()` (firma string estable de id/orden/activo/precio/duracion_min/nombre/descripcion) + comparación en render (`firmaActual !== firmaPrevia`) que re-siembra `servicios` ordenado por `orden` cuando `initialServicios` cambia.

## Decisions Made
- `value={Number.isFinite(field.value) ? field.value : ""}` y `onChange` que guarda `undefined` (no `NaN`) al vaciar el input — deja que `zodResolver` muestre el mensaje "obligatorio" de zod en vez de bloquear el submit con un error de `NaN` confuso.
- Firma string derivada de los 7 campos relevantes de cada servicio, comparada en el cuerpo del componente (patrón oficial de React "Adjusting state when a prop changes"), en vez de `useEffect`, para re-sincronizar `ServiciosTable` con las props revalidadas.

## Deviations from Plan

None - plan executed exactly as written (ambos diffs coinciden con el patrón prescripto en el `<action>` de cada tarea).

## Issues Encountered

**Dependencias del worktree ausentes:** el worktree de este agente no tenía `node_modules` instalado (`sh: tsc: command not found`). Se corrió `pnpm install --frozen-lockfile` en la raíz del monorepo, lo cual también reconstruyó `packages/availability-engine/dist/` vía su script `prepare` (trampa de entorno ya documentada en `STATE.md`: el `dist/` gitignoreado queda desactualizado tras cambios en `packages/`). No es un bug de este plan, solo un paso de bootstrap del entorno de ejecución.

**Error de typecheck preexistente y fuera de alcance:** `pnpm typecheck` en `apps/dashboard` reporta un único error en `app/(owner)/turnos/page.tsx:250` (`number | null` no asignable a `number`, `fmtPrecio(t.precio_total)`), introducido por el trabajo de la vista Semana (`728cffe`/`83cb5ad`), completamente ajeno a los componentes de Servicios. Confirmado preexistente: `git status --short` mostraba cero cambios a ese archivo en ambos checkpoints. No se tocó — está fuera del alcance estricto de este plan (CLAUDE.md: "SÓLO los dos componentes del dashboard"). Documentado en `deferred-items.md` junto a este SUMMARY. Ambas tareas se verificaron confirmando que el output de `tsc` no cambia (mismo único error preexistente) antes y después de cada edición — es decir, cero errores nuevos introducidos por este plan.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Los dos bugs de UI del CRUD de Servicios quedaron cerrados. Queda pendiente, fuera de este plan, el error de typecheck preexistente en `app/(owner)/turnos/page.tsx` (vista Semana) — no bloquea a Servicios pero impide que `pnpm typecheck` de todo `apps/dashboard` llegue a cero errores; ver `deferred-items.md`.

---
*Quick task: 260712-g2y*
*Completed: 2026-07-12*

## Self-Check: PASSED

- FOUND: apps/dashboard/components/servicio-dialog.tsx
- FOUND: apps/dashboard/components/servicios-table.tsx
- FOUND commit: 7952cb7
- FOUND commit: b51c5e3
