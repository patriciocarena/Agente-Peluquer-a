---
phase: 02-dashboard-y-datos-del-negocio
plan: 06
subsystem: ui
tags: [nextjs, react-hook-form, zod, supabase, rls, shadcn]

requires:
  - phase: 02-dashboard-y-datos-del-negocio (plan 02-04)
    provides: owner shell (sidebar/topbar), requireRole("owner"), getNegocioActivo() (negocio activo server-side)
provides:
  - CRUD base de profesionales (PRO-01): lista con Tabs/Switch/soft-delete, alta full-page, Server Actions
  - profesionalSchema (zod) compartido cliente/servidor
  - profesional-form.tsx con secciones marcadas para que 02-07 agregue horario semanal + matriz de servicios
affects: [02-07 (horario semanal + matriz de servicios/precio custom del profesional)]

tech-stack:
  added: []
  patterns:
    - "z.input<typeof schema> para useForm cuando el schema usa .default() en algún campo (mismatch input/output de zodResolver); onSubmit normaliza al tipo de salida antes de llamar la Server Action"
    - "Toggle de soft-delete auto-contenido en un sub-componente client (Switch + AlertDialog) dentro del mismo archivo de la tabla, en vez de un archivo separado"

key-files:
  created:
    - apps/dashboard/lib/schemas/profesional.ts
    - apps/dashboard/lib/schemas/profesional.test.ts
    - apps/dashboard/app/(owner)/profesionales/page.tsx
    - apps/dashboard/app/(owner)/profesionales/nuevo/page.tsx
    - apps/dashboard/components/profesionales-table.tsx
    - apps/dashboard/components/profesional-form.tsx
    - apps/dashboard/app/actions/profesionales.ts
  modified: []

key-decisions:
  - "profesionalSchema.activo usa z.boolean().default(true) (per ejemplo de 02-RESEARCH.md); esto crea un mismatch de tipos input/output entre react-hook-form y zodResolver, resuelto tipando useForm con z.input<typeof profesionalSchema> y normalizando a ProfesionalInput (z.infer) en onSubmit antes de llamar a la Server Action"
  - "toggleProfesionalActivo se adelantó del Task 3 al Task 2 (deviation Rule 3): profesionales-table.tsx necesitaba la action para el Switch antes de que existiera el resto del CRUD, sin lo cual tsc --noEmit fallaría"
  - "profesionales-table.tsx filtra Tabs Todos/Activos/Inactivos con estado local (useState), no vía query param en URL, porque servicios-table.tsx (02-05, referencia sugerida por el plan) corre en paralelo en otro worktree de la misma wave y no estaba disponible como referencia; se usó en su lugar el patrón ya existente de components/admin/negocio-activo-switch.tsx + estado-filter-tabs.tsx (mismo Switch/AlertDialog/Tabs, adaptado a Profesional)"

requirements-completed: [PRO-01]

coverage:
  - id: D1
    description: "profesionalSchema (zod): rechaza nombre vacío, acepta activo boolean con default true"
    requirement: "PRO-01"
    verification:
      - kind: unit
        ref: "apps/dashboard/lib/schemas/profesional.test.ts#profesionalSchema"
        status: pass
    human_judgment: false
  - id: D2
    description: "Lista de profesionales del negocio activo con Tabs Todos/Activos/Inactivos, Switch de soft-delete con AlertDialog destructivo (copy exacto), badge gris Inactivo, CTA + Nuevo profesional, empty state exacto"
    requirement: "PRO-01"
    verification:
      - kind: other
        ref: "node verify script (02-06-PLAN.md Task 2 <verify>): comprueba CTA '+ Nuevo profesional' en page.tsx y Tabs/editar en profesionales-table.tsx — pass"
    human_judgment: true
    rationale: "El copy exacto, el estado visual muteado (opacity-60) y el color gris (no rojo) del badge Inactivo son juicios visuales que el verify script no puede confirmar con certeza total; requiere una revisión visual humana antes de considerarlo verificado end-to-end."
  - id: D3
    description: "Alta full-page /profesionales/nuevo con form base (Datos generales) y Server Actions createProfesional/updateProfesional/toggleProfesionalActivo que re-validan con zod y derivan negocio_id server-side"
    requirement: "PRO-01"
    verification:
      - kind: other
        ref: "node verify script (02-06-PLAN.md Task 3 <verify>): comprueba createProfesional/updateProfesional/toggleProfesionalActivo + profesionalSchema en actions/profesionales.ts — pass"
      - kind: unit
        ref: "tsc --noEmit (apps/dashboard) — pass, sin errores"
    human_judgment: false

duration: 25min
completed: 2026-07-04
status: complete
---

# Phase 2 Plan 06: CRUD base de Profesionales Summary

**CRUD base de profesionales (PRO-01): lista con Tabs/Switch/soft-delete y alta full-page con form + Server Actions que derivan negocio_id server-side, dejando el form estructurado en secciones para que 02-07 agregue horario semanal y matriz de servicios.**

## Performance

- **Duration:** 25 min
- **Started:** 2026-07-04T21:38:00Z
- **Completed:** 2026-07-04T22:03:00Z
- **Tasks:** 3
- **Files modified:** 7 (todos nuevos)

## Accomplishments
- `profesionalSchema` (zod) con test unitario (RED → GREEN): rechaza nombre vacío, acepta `activo` boolean con default `true`
- Lista `/profesionales`: CTA "+ Nuevo profesional", empty state exacto, tabla con Tabs Todos/Activos/Inactivos, Switch de soft-delete + AlertDialog destructivo (copy exacto), badge gris "Inactivo", link "Editar" por fila
- Alta full-page `/profesionales/nuevo` con `profesional-form.tsx` (react-hook-form + zodResolver) y sección "Datos generales", con slots marcados para que 02-07 inserte "Horario semanal" y "Servicios que realiza" sin reescribir el componente
- Server Actions (`app/actions/profesionales.ts`): `createProfesional`, `updateProfesional`, `toggleProfesionalActivo` — todas re-validan con `profesionalSchema` y derivan `negocio_id` de `getNegocioActivo()` (nunca del form)

## Task Commits

Each task was committed atomically:

1. **Task 1: Schema profesional + test unitario** - `2f422a3` (test, RED) → `94420cb` (feat, GREEN)
2. **Task 2: Lista de profesionales (Tabs/Switch/soft-delete)** - `2e8cd91` (feat)
3. **Task 3: Alta full-page + form base + Server Action base** - `63fd489` (feat)

_TDD gate sequence verified: `test(02-06)` commit precedes `feat(02-06)` GREEN commit for Task 1 — RED confirmed failing (`Cannot find module './profesional'`) before implementation._

## Files Created/Modified
- `apps/dashboard/lib/schemas/profesional.ts` - zod schema (nombre requerido, activo boolean default true)
- `apps/dashboard/lib/schemas/profesional.test.ts` - test unitario (caso válido, default, nombre vacío rechazado)
- `apps/dashboard/app/(owner)/profesionales/page.tsx` - lista del negocio activo, CTA, empty state
- `apps/dashboard/components/profesionales-table.tsx` - Tabs/Switch/soft-delete, badge, link Editar
- `apps/dashboard/app/(owner)/profesionales/nuevo/page.tsx` - alta full-page
- `apps/dashboard/components/profesional-form.tsx` - form base "Datos generales" + slots para 02-07
- `apps/dashboard/app/actions/profesionales.ts` - createProfesional/updateProfesional/toggleProfesionalActivo

## Decisions Made
- `profesionalSchema.activo` usa `.default(true)` (per el ejemplo literal de 02-RESEARCH.md), lo que introduce un mismatch de tipos entre el tipo de entrada (activo opcional) y el tipo de salida (activo requerido) que `zodResolver` espera de `useForm`. Se resolvió tipando `useForm` con `z.input<typeof profesionalSchema>` y normalizando explícitamente a `ProfesionalInput` (`z.infer`) dentro de `onSubmit` antes de invocar la Server Action — mismo problema, mismo tipo de solución que cualquier proyecto zod+react-hook-form con campos `.default()`.
- El Tabs de estado (Todos/Activos/Inactivos) se implementó con estado local del componente (`useState`), no como filtro por query param en la URL (a diferencia de `components/admin/estado-filter-tabs.tsx`, que sí usa la URL). Se eligió así porque `profesionales-table.tsx` es un Client Component autocontenido que recibe la lista completa ya cargada server-side; no hay necesidad de persistir el filtro entre navegaciones para esta vista, y evita depender de `next/navigation` en un componente que el plan describe como una tabla, no una página.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `toggleProfesionalActivo` adelantada del Task 3 al Task 2**
- **Found during:** Task 2 (Lista de profesionales)
- **Issue:** El plan asigna `app/actions/profesionales.ts` completo al Task 3, pero `profesionales-table.tsx` (Task 2) necesita un Server Action para el Switch de soft-delete — sin él, `tsc --noEmit` fallaría por un import inexistente y Task 2 no podría verificarse.
- **Fix:** Se creó `app/actions/profesionales.ts` en el Task 2 con únicamente `toggleProfesionalActivo` (siguiendo el mismo patrón RLS-scoped que `app/actions/negocio.ts`: `requireRole("owner")` + `getNegocioActivo()` + cliente RLS-scoped, nunca `service_role`). El Task 3 extendió el mismo archivo agregando `createProfesional`/`updateProfesional`, cumpliendo igual el verify de ese task (busca las tres funciones + `profesionalSchema` en el archivo final).
- **Files modified:** `apps/dashboard/app/actions/profesionales.ts`
- **Verification:** `tsc --noEmit` pasa en ambos tasks; el verify script del Task 3 confirma las tres funciones + `profesionalSchema` presentes.
- **Committed in:** `2e8cd91` (Task 2 commit, con nota explícita en el header del archivo)

**2. [Rule 1 - Bug] Mismatch de tipos input/output de zodResolver por `.default(true)`**
- **Found during:** Task 3 (`tsc --noEmit` sobre `profesional-form.tsx`)
- **Issue:** `useForm<ProfesionalInput>` (tipo de salida, `activo: boolean` requerido) es incompatible con el `Resolver` que produce `zodResolver(profesionalSchema)` cuando el schema tiene `activo: z.boolean().default(true)` (tipo de entrada, `activo?: boolean`) — 3 errores de TS2322/TS2345.
- **Fix:** Se tipó `useForm` con `z.input<typeof profesionalSchema>` (el tipo real que react-hook-form maneja antes de la validación) y se normalizó explícitamente a `ProfesionalInput` dentro de `onSubmit` antes de llamar a `createProfesional`/`updateProfesional`.
- **Files modified:** `apps/dashboard/components/profesional-form.tsx`
- **Verification:** `tsc --noEmit` pasa sin errores tras el fix.
- **Committed in:** `63fd489` (Task 3 commit, ya incluido en el archivo final — no hubo commit previo con el bug)

**3. [Rule 3 - Blocking] Instalación de dependencias en el worktree**
- **Found during:** Task 1, antes de correr el primer test
- **Issue:** El worktree paralelo no tenía `node_modules` instalado (git worktrees no comparten `node_modules`, que está gitignored).
- **Fix:** Se corrió `corepack pnpm install --offline` (el lockfile ya estaba resuelto, el store local de pnpm ya tenía todos los paquetes cacheados desde el checkout principal — sin descargas de red, 14.4s).
- **Files modified:** ninguno (no se tocó `package.json`/`pnpm-lock.yaml`; instalación pura desde el store existente)
- **Verification:** `corepack pnpm --filter @turnosbot/dashboard exec vitest run` y `exec tsc --noEmit` corrieron correctamente después.
- **Committed in:** N/A (no hay cambios de archivos versionados; `node_modules` sigue gitignored)

---

**Total deviations:** 3 auto-fixed (2 Rule 3 - blocking, 1 Rule 1 - bug)
**Impact on plan:** Ninguno afecta el alcance del plan. El adelanto de `toggleProfesionalActivo` es solo una reorganización temporal necesaria por la dependencia estructural Task2→Task3; el fix de tipos es un bug de compilación resuelto sin cambiar comportamiento; la instalación de dependencias es puramente operativa del entorno de ejecución paralelo (worktree).

## Issues Encountered
- El `read_first` del plan referencia `apps/dashboard/components/servicios-table.tsx` como "mismo patrón ya construido en 02-05" — pero 02-05 corre en paralelo en otro worktree de la misma wave (wave 4) y ese archivo no existe todavía en este worktree. Se usó en su lugar el patrón equivalente ya mergeado de `components/admin/negocio-activo-switch.tsx` + `components/admin/estado-filter-tabs.tsx` (mismo Switch + AlertDialog + Tabs, solo cambia el copy destructivo y las columnas de la tabla) como referencia funcionalmente idéntica.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `profesional-form.tsx` está estructurado con la sección "Datos generales" separada por `space-y-8` (32px, xl) y un comentario `SECCIÓN 02-07` marcando exactamente dónde insertar "Horario semanal" (PRO-02) y "Servicios que realiza" (PRO-03/04) sin reescribir el componente.
- `app/actions/profesionales.ts` queda preparado para que 02-07 agregue las actions de horario semanal y matriz de servicios en el mismo archivo, siguiendo el mismo patrón `requireRole` + `getNegocioActivo` + cliente RLS-scoped ya establecido.
- Falta la página `/profesionales/[id]/editar` (edición) — está fuera de alcance explícito de este plan (Task 3 solo cubre alta); 02-07 deberá crearla o extender `profesional-form.tsx` reutilizándolo también para edición (el componente ya soporta la prop `profesional?` para ese caso).
- Ningún blocker para 02-07.

---
*Phase: 02-dashboard-y-datos-del-negocio*
*Completed: 2026-07-04*

## Self-Check: PASSED

All 7 created files verified present on disk; all 5 commits (2 for Task 1 TDD, 1 for Task 2, 1 for Task 3, 1 docs) verified present in git log.
