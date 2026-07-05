---
phase: 02-dashboard-y-datos-del-negocio
plan: 07
subsystem: ui
tags: [nextjs, react-hook-form, zod, vitest, supabase, tailwind, shadcn]

# Dependency graph
requires:
  - phase: 02-05
    provides: "servicio schema/actions conventions (lib/schemas/servicio.ts, app/actions/servicios.ts) reused as style baseline"
  - phase: 02-06
    provides: "profesional-form.tsx section placeholder (SECCIÓN 02-07) and profesionales.ts scaffold (createProfesional/updateProfesional/toggleProfesionalActivo)"
provides:
  - "horarioSchema (lib/schemas/horario.ts) with multi-block overlap/order validation + bloquesSolapan pure helper"
  - "HorarioEditor client component: 7-day multi-block weekly schedule editor with 'Copiar a todos los días' undo toast"
  - "ServiciosMatrix client component: checkbox 'Realiza' + custom price per servicio"
  - "app/(owner)/profesionales/[id]/editar/page.tsx: full-page profesional edit combining datos generales + horario + matriz"
  - "updateHorario/updateServiciosMatrix Server Actions, negocio-scoped and cross-negocio-rejecting"
affects: [03-motor-de-disponibilidad]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Client-side composite edit form (profesional-editar-form.tsx) driving 3 sequential Server Action calls on a single 'Guardar cambios' submit, with local React state for horario/matriz until save"
    - "delete+insert replace-all pattern for horario_trabajo (avoids diffing block-by-block against DB state)"
    - "upsert with onConflict on profesional_servicio's compound unique + explicit delete for unchecked services"

key-files:
  created:
    - apps/dashboard/lib/schemas/horario.ts
    - apps/dashboard/lib/schemas/horario.test.ts
    - apps/dashboard/components/horario-editor.tsx
    - apps/dashboard/components/servicios-matrix.tsx
    - apps/dashboard/components/profesional-editar-form.tsx
    - "apps/dashboard/app/(owner)/profesionales/[id]/editar/page.tsx"
  modified:
    - apps/dashboard/app/actions/profesionales.ts

key-decisions:
  - "Horario semanal se persiste con patrón delete+insert (no upsert por clave compuesta) por simplicidad ante volumen bajo por profesional"
  - "profesional-editar-form.tsx es un componente nuevo (no una extensión in-place de profesional-form.tsx) para poder orquestar los 3 Server Actions secuenciales sobre un único submit sin acoplar profesional-form.tsx (usado también en /nuevo, donde horario/matriz no aplican todavía)"
  - "Validación de solapamiento se corre tanto client-side (bloquesSolapan vía HorarioEditorHandle.tieneErrores(), bloquea el submit) como server-side (horarioSchema.safeParse en updateHorario, fuente de verdad)"

patterns-established:
  - "Composite full-page edit forms compose multiple Card sections with local state, deferring all persistence to a single save handler that calls each entity's Server Action in sequence and surfaces the first error encountered"

requirements-completed: [PRO-02, PRO-03, PRO-04]

duration: 25min
completed: 2026-07-05
---

# Phase 02 Plan 07: Horario semanal + matriz de servicios Summary

**Editor de horario semanal multi-bloque (con validación de solapamiento client+server) y matriz de servicios con precio custom, integrados en la página de edición full-page del profesional.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-07-04T23:26:00Z
- **Completed:** 2026-07-05T02:31:00Z
- **Tasks:** 3
- **Files modified:** 7 (6 created, 1 modified)

## Accomplishments
- `horarioSchema` (zod) rejects `hora_fin <= hora_inicio` and overlapping same-day blocks; accepts empty days ("Cerrado") and multiple disjoint blocks — RED→GREEN TDD cycle completed with 10 passing tests.
- `HorarioEditor`: 7 always-visible day rows (Lunes–Domingo), multi-block per day, "+ Agregar bloque", "Copiar a todos los días" with a 5s Sonner undo toast, `<input type="time">` stepped by the active negocio's `granularidad_min` (BIZ-03), inline error messages per day when overlap/order is invalid.
- `ServiciosMatrix`: one row per active servicio, checkbox "Realiza", read-only es-AR formatted base price, custom price input (disabled unless checked, cleared on uncheck).
- `app/(owner)/profesionales/[id]/editar/page.tsx` loads the profesional, its `horario_trabajo` rows, its `profesional_servicio` assignments, and the negocio's active servicios — all scoped to the active negocio — and renders the combined edit form.
- `updateHorario`/`updateServiciosMatrix` Server Actions: re-validate server-side, explicitly verify the profesional (and, for the matrix, each servicio) belongs to the active negocio before writing, reject cross-negocio ids.

## Task Commits

Each task was committed atomically:

1. **Task 1: Schema de horario + test (TDD)** - `6bb0fbb` (test, RED) → `8eead8e` (feat, GREEN)
2. **Task 2: Editor de horario + matriz de servicios + página de edición** - `5e8c53b` (feat)
3. **Task 3: Server Actions de horario y matriz de servicios** - `95c2181` (feat)

## TDD Gate Compliance

Gate sequence verified in git log: `test(02-07): add failing test for horario schema` (6bb0fbb) precedes `feat(02-07): implement horario schema with overlap and order validation` (8eead8e). RED confirmed via `vitest run` failing with "Cannot find module './horario'" before the implementation existed; GREEN confirmed with all 10 tests passing after. No REFACTOR commit was needed (implementation was clean on first pass).

## Files Created/Modified
- `apps/dashboard/lib/schemas/horario.ts` - horarioSchema (7-day, multi-block, overlap/order validation) + bloquesSolapan pure helper
- `apps/dashboard/lib/schemas/horario.test.ts` - 10 vitest cases (accept/reject matrix)
- `apps/dashboard/components/horario-editor.tsx` - weekly schedule editor client component
- `apps/dashboard/components/servicios-matrix.tsx` - services + custom price matrix client component
- `apps/dashboard/components/profesional-editar-form.tsx` - composes datos generales + horario + matriz, drives the 3-action save sequence
- `apps/dashboard/app/(owner)/profesionales/[id]/editar/page.tsx` - Server Component loading profesional/horario/asignaciones/servicios scoped to active negocio
- `apps/dashboard/app/actions/profesionales.ts` - added `updateHorario` and `updateServiciosMatrix`

## Decisions Made
- Chose a dedicated `profesional-editar-form.tsx` client component rather than extending `profesional-form.tsx` in place, so the create flow (`/profesionales/nuevo`, which has no horario/matriz yet) stays untouched and simple, while the edit flow can orchestrate three sequential Server Action calls behind one "Guardar cambios" button.
- `horario_trabajo` persistence uses delete+insert per profesional rather than a per-block upsert — simpler given the low row count per profesional and avoids diffing logic.
- Client-side overlap validation (`HorarioEditorHandle.tieneErrores()`) blocks the submit before hitting the server, but `horarioSchema.safeParse` server-side in `updateHorario` remains the actual source of truth (client validation is UX only, per 02-RESEARCH.md Anti-Patterns).

## Deviations from Plan

None - plan executed exactly as written. All three tasks matched their `<action>`/`<verify>`/`<acceptance_criteria>` blocks without needing Rule 1-4 fixes.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required. No live Supabase connection was needed for this plan (pure frontend/schema/action code + unit tests, per executor instructions).

## Next Phase Readiness
- Profesionales now have full CRUD (PRO-01) + weekly schedule (PRO-02) + service assignment with custom pricing (PRO-03/04) — this is the last data-loading plan Phase 3's availability engine needs to reason over real schedules and services.
- No blockers identified. Phase 02 plan 08 (superadmin panel) remains paused at its own checkpoint per STATE.md, unrelated to this plan.

---
*Phase: 02-dashboard-y-datos-del-negocio*
*Completed: 2026-07-05*

## Self-Check: PASSED

All 8 created/modified files verified present on disk; all 4 task commit hashes (6bb0fbb, 8eead8e, 5e8c53b, 95c2181) verified present in git log.
