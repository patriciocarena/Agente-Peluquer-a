---
phase: 03-motor-de-disponibilidad
plan: 04
subsystem: availability-engine
tags: [tdd, vitest, computeSlots, autoAssign, orchestration, availability-engine, barrel]

# Dependency graph
requires:
  - phase: 03-motor-de-disponibilidad
    plan: 01
    provides: "types.ts (ComputeSlotsInput, AvailabilityData, AvailableSlot), constants.ts, fixtures deterministas"
  - phase: 03-motor-de-disponibilidad
    plan: 03
    provides: "subtractIntervals (intervals.ts), snapToGrid (grid.ts), resolveWorkIntervalsForDate + dayStartEpochInZone (schedule.ts)"
provides:
  - "autoAssign(slotsByProfessional) — auto-asignación por hueco más temprano, tie-break estable por professionalId ascendente (AVAIL-05, D-03)"
  - "computeSlots(input, data, now?) — orquestación pura completa: horario − bloqueos − turnos activos → grilla → ventana de reserva → auto-asignación (AVAIL-01/02/04/05, D-04/D-05)"
  - "index.ts como barrel público (computeSlots + tipos + constantes) — path @turnosbot/availability-engine preservado"
affects: [availability-engine, computeSlots, motor-de-disponibilidad, apps/bot, apps/dashboard]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "TDD RED→GREEN por feature: commit test rojo (módulo ausente), luego commit implementación verde"
    - "now inyectable como 3er parámetro de computeSlots (nunca Date.now() implícito en la lógica testeada) para ventana de reserva determinística"
    - "Tie-break de auto-asignación: sort ascendente por professionalId antes de iterar el Map (Pitfall 6), documentado como último recurso, NO balanceo de carga (Assumption A3)"
    - "Aserción defensiva de scoping cross-negocio (T-03-09) — falla ruidosamente en vez de computar disponibilidad cruzada en silencio"
    - "Barrel index.ts con superficie pública mínima: solo computeSlots + tipos + constantes, sin re-exportar primitivos internos"

key-files:
  created:
    - packages/availability-engine/src/autoAssign.ts
    - packages/availability-engine/src/autoAssign.test.ts
    - packages/availability-engine/src/computeSlots.ts
    - packages/availability-engine/src/computeSlots.test.ts
  modified:
    - packages/availability-engine/src/index.ts

key-decisions:
  - "computeSlots es async (Promise<AvailableSlot[]>) preservando la firma del stub original, aunque el cuerpo es 100% síncrono/puro — evolución de contrato, no rediseño (Open Question 3 de RESEARCH.md)"
  - "now se inyecta como 3er parámetro explícito con default Date.now() — hace testeable D-04/D-05 sin mockear el reloj global"
  - "Candidatos de auto-asignación = distinct profesional_id presentes en data.horarios (no se pre-filtra por dia_semana matching, ya que resolveWorkIntervalsForDate devuelve [] naturalmente para profesionales sin horario ese día, produciendo cero slots sin afectar el resultado del auto-assign)"
  - "Sin professionalId, computeSlots devuelve TODOS los slots del profesional auto-asignado (no solo el primero) — interpretación de AVAIL-05 confirmada por el propio <behavior> del plan"
  - "assertScopedToNegocio (T-03-09, Rule 2): aserción interna agregada no solicitada explícitamente como <action> pero sí como 'Opcional (recomendado)' en el threat register del plan — se auto-agregó por ser una mitigación de disposición 'mitigate'"

requirements-completed: [AVAIL-01, AVAIL-02, AVAIL-04, AVAIL-05]

# Metrics
duration: 10min
completed: 2026-07-05
---

# Phase 3 Plan 04: Orquestación pura de computeSlots + auto-asignación + barrel público Summary

**`computeSlots(input, data, now?)` compone los primitivos de Wave 2 (resolveWorkIntervalsForDate → subtractIntervals ×2 → snapToGrid) con el filtro de ventana de reserva (60min/30d) y `autoAssign` (tie-break estable por professionalId) en una única función pura sin cliente DB, y `index.ts` pasa a ser el barrel público que preserva el path `@turnosbot/availability-engine` — 14 tests nuevos verdes (9 computeSlots + 5 autoAssign) sobre las 20 existentes.**

## Performance

- **Duration:** ~10 min
- **Tasks (features):** 3 — autoAssign (TDD), computeSlots (TDD), index.ts barrel (directo)
- **Files created:** 4, **modified:** 1
- **Tests:** 34 passing en total (20 previos + 5 autoAssign + 9 computeSlots)

## Accomplishments

- **`autoAssign` (AVAIL-05, D-03, Pitfall 6):** elige el profesional con el hueco disponible más temprano; ordena las entradas del Map por `professionalId` ascendente ANTES de iterar para que el tie-break sea determinístico independientemente del orden de inserción upstream. Doc-comment documenta explícitamente que este tie-break es un desempate de último recurso, NO una estrategia de reparto equitativo de carga (Assumption A3 — esa idea está descartada para v1 por D-03). 5 tests cubren: hueco más temprano gana, empate exacto resuelto por menor `professionalId`, invariancia ante orden de inserción invertido, profesional sin slots se saltea, y el caso "todos vacíos → null".
- **`computeSlots` (AVAIL-01/02/04/05, D-04/D-05):** orquesta, por cada profesional candidato, `resolveWorkIntervalsForDate` → `subtractIntervals` (− bloqueos) → `subtractIntervals` (− turnos con `estado IN (pendiente, confirmado)`, Pitfall 4) → `snapToGrid` (anclado a `dayStartEpochInZone`) → filtro de ventana de reserva (`now+60min` .. `now+30d`, D-04/D-05) → conversión a `AvailableSlot` con horas "HH:mm" en la zona del negocio vía `TZDate`. Sin `professionalId`, delega en `autoAssign` sobre el `Map<profId, slots>` y devuelve TODOS los slots del ganador. 9 tests mapean 1:1 con las filas del Test Map de RESEARCH.md: resta AVAIL-01, cancelado-libera/pendiente-bloquea (Pitfall 4), multi-servicio contiguo 30+15=45 con gate Pitfall 5, lead D-04, max-advance D-05 (filtrado y dentro-de-ventana), auto-asignación AVAIL-05, y filtro por `professionalId` dado.
- **`index.ts` barrel (AVAIL-04):** reemplaza el stub `throw new Error` por re-exports de `types.ts`/`constants.ts`/`computeSlots.ts`. El path público `@turnosbot/availability-engine` (usado por `apps/dashboard/package.json`) queda intacto; los primitivos internos (intervals/grid/schedule/autoAssign) NO se re-exportan — superficie pública mínima.

## Task Commits

Cada feature TDD se committeó atómicamente en ciclo RED→GREEN; el barrel fue un commit directo (sin test dedicado, verificado por la suite existente + tsc):

1. **autoAssign** — `b19ea4b` (test, RED) → `21b7b2c` (feat, GREEN)
2. **computeSlots** — `df972b4` (test, RED) → `218bb8f` (feat, GREEN)
3. **index.ts barrel** — `c7d3f17` (feat)

Cada commit RED se verificó fallando (`Cannot find module`) antes de committear; cada GREEN se verificó con `vitest run` del archivo del feature + `tsc --noEmit` exit 0. Verificación final: suite completa (`vitest run`, 34/34) + `tsc --noEmit` exit 0 tras el barrel.

## Files Created/Modified

- `packages/availability-engine/src/autoAssign.ts` — `autoAssign(slotsByProfessional)`, sort ascendente por `professionalId` antes de iterar, doc-comment cita AVAIL-05, D-03, Pitfall 6 y Assumption A3.
- `packages/availability-engine/src/autoAssign.test.ts` — 5 tests (hueco más temprano, empate determinístico, invariancia de orden de inserción, sin slots se saltea, todos vacíos → null).
- `packages/availability-engine/src/computeSlots.ts` — `computeSlots(input, data, now?)`, `assertScopedToNegocio` (T-03-09), `toInterval`/`formatHHmmInZone` helpers. Importa `./autoAssign`, `./constants`, `./grid`, `./intervals`, `./schedule`, `./types` — cero import del SDK de Supabase (AVAIL-04).
- `packages/availability-engine/src/computeSlots.test.ts` — 9 tests con `fixtureFor`/`inputFor` (estilo `horario.test.ts`), uno por fila del Test Map de RESEARCH.md.
- `packages/availability-engine/src/index.ts` — barrel: `export * from "./types.js"`, `export * from "./constants.js"`, `export { computeSlots } from "./computeSlots.js"`.

## Decisions Made

- **`computeSlots` async, cuerpo síncrono:** preserva `Promise<AvailableSlot[]>` del stub original (evolución de contrato per Open Question 3 de RESEARCH.md), aunque no hay `await` real — el motor sigue siendo puro (sin I/O), solo mantiene la forma de la API para no romper a los futuros consumidores async (bot/dashboard).
- **`now` inyectable:** tercer parámetro explícito con default `Date.now()` — hace la ventana de reserva (D-04/D-05) testeable sin mockear el reloj global, siguiendo la nota de test-determinismo del plan.
- **Candidatos de auto-asignación:** se toman como el conjunto distinct de `profesional_id` en `data.horarios`, sin pre-filtrar por `dia_semana` — los profesionales que no trabajan ese día quedan con lista vacía de forma natural (vía `resolveWorkIntervalsForDate`), sin afectar el resultado de `autoAssign` (que ya salta listas vacías).
- **AVAIL-05 devuelve TODOS los slots del ganador:** confirmado por el `<behavior>` del plan ("devuelve slots del profesional auto-asignado... etiquetados con su professionalId"), no solo el slot más temprano — se retorna la lista completa de `slotsByProfessional.get(winner.professionalId)`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] `assertScopedToNegocio` (T-03-09)**
- **Found during:** implementación de `computeSlots.ts`
- **Issue:** el threat register del plan marca T-03-09 (Information Disclosure / scoping por negocio) como `mitigate` con "Opcional (recomendado): aserción interna que falle ruidosamente si alguna fila de `data` tiene un `negocio_id` distinto al `input.negocioId`".
- **Fix:** se agregó `assertScopedToNegocio` al inicio de `computeSlots`, que revisa `horarios`/`bloqueos`/`turnos`/`servicios`/`negocio` contra `input.negocioId` y lanza un error descriptivo ante cualquier fila cruzada.
- **Files modified:** `packages/availability-engine/src/computeSlots.ts`
- **Committed in:** `218bb8f` (GREEN de computeSlots)

**2. [Rule 1 - Bug] Redacción del doc-comment de `computeSlots.ts` para no matchear el grep de acceptance de AVAIL-04**
- **Found during:** verificación post-GREEN de computeSlots
- **Issue:** el doc-comment inicial mencionaba literalmente el string `@supabase/supabase-js` (para explicar el anti-patrón a evitar), lo cual hacía que `grep -c "@supabase/supabase-js" computeSlots.ts` devolviera 1 en vez de 0 — el criterio de aceptación del plan exige literalmente 0 matches, sin distinguir comentario de import real.
- **Fix:** se reescribió la frase para decir "el SDK de Supabase" en vez de nombrar el paquete literalmente, preservando el significado sin el string exacto.
- **Files modified:** `packages/availability-engine/src/computeSlots.ts`
- **Committed in:** `218bb8f` (GREEN de computeSlots, antes del commit)

---

**Total deviations:** 2 auto-fixed (1 Rule 2 - mitigación de threat model, 1 Rule 1 - ajuste de redacción para cumplir un grep de aceptación literal). Sin scope creep — ambos están anclados en el propio plan/threat register.
**Impact on plan:** Ninguno en la lógica pública; refuerza defensa en profundidad (T-03-09) sin cambiar la firma de `computeSlots`.

## Threat Flags

Ninguno nuevo. La mitigación T-03-09 del threat register de esta fase quedó implementada (`assertScopedToNegocio`); T-03-08 (ventana enforced dentro del motor) y T-03-10 (filtro busy espejo del constraint DB) están cubiertos por el diseño mismo de `computeSlots` y por los tests de Pitfall 4 / ventana.

## Known Stubs

Ninguno. `computeSlots` y `autoAssign` son funciones puras completas, sin datos hardcodeados ni placeholders. `booking.ts` (AVAIL-03, `bookAppointment`) queda explícitamente diferido a Wave 4 (Plan 03-05), tal como indica el `<objective>` del plan.

## Verification

- `corepack pnpm --filter @turnosbot/availability-engine test` → **34 passing** (6 suites: constants, intervals, grid, schedule, autoAssign, computeSlots).
- `corepack pnpm --filter @turnosbot/availability-engine exec tsc --noEmit` → **exit 0**.
- `grep -rn "@supabase/supabase-js" packages/availability-engine/src/` → sin matches (motor puro, AVAIL-04).
- `grep -c "@supabase/supabase-js" computeSlots.ts` → `0`.
- `grep "pendiente\|confirmado" computeSlots.ts` → matchea (filtro busy explícito).
- `grep "BOOKING_MIN_LEAD_MINUTES\|BOOKING_MAX_ADVANCE_DAYS" computeSlots.ts` → matchea (ventana enforced).
- `grep "sort" autoAssign.ts` → matchea (tie-break ordenado).
- `grep "export { computeSlots }" index.ts` → matchea; `grep "throw new Error" index.ts` → sin matches (stub reemplazado).

## Next Phase Readiness

- **Listo para Wave 4 (Plan 03-05):** `bookAppointment` (AVAIL-03) puede re-usar `computeSlots` para la re-validación anti-cache antes del insert transaccional (`turno` + `turno_servicio` con snapshots), y sumarse al barrel `index.ts` (`export { bookAppointment } from "./booking.js"`) sin tocar lo entregado en este plan.
- `computeSlots` y `autoAssign` tienen firmas estables, cubiertas por 14 tests nuevos que fijan el comportamiento de cruce, multi-servicio, ventana y auto-asignación — la superficie de riesgo central de la fase (AVAIL-01/02/04/05) queda cerrada.

## Self-Check: PASSED

Los 4 archivos creados existen (`autoAssign.ts`, `autoAssign.test.ts`, `computeSlots.ts`, `computeSlots.test.ts`), `index.ts` fue modificado, y los 5 commits (`b19ea4b`, `21b7b2c`, `df972b4`, `218bb8f`, `c7d3f17`) están en el historial. Suite verde (34/34), `tsc --noEmit` exit 0.
