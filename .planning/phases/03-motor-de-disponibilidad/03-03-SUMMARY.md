---
phase: 03-motor-de-disponibilidad
plan: 03
subsystem: availability-engine
tags: [tdd, vitest, date-fns, tzdate, intervals, grid-snapping, timezone, availability-engine]

# Dependency graph
requires:
  - phase: 03-motor-de-disponibilidad
    plan: 01
    provides: "types.ts (Interval, HorarioTrabajoRow), constants.ts, fixtures deterministas (__fixtures__/rows.ts), runner vitest"
provides:
  - "subtractIntervals(free, busy) — resta de intervalos half-open [start, end) espejando tstzrange(inicio, fin, '[)') del DB (AVAIL-01)"
  - "snapToGrid(free, granularidadMin, totalDurationMin, anchor) — slots alineados a grilla, dimensionados a la duración total multi-servicio, con gate Pitfall 5 (AVAIL-02, D-01)"
  - "resolveWorkIntervalsForDate(horarios, dateStr, timezone) — horario_trabajo recurrente → intervalos de fecha en zona IANA vía TZDate (AVAIL-01, Pitfall 2)"
  - "dayStartEpochInZone(dateStr, timezone) — fuente única de medianoche-en-zona, reusable como anchor de snapToGrid en computeSlots (Wave 3)"
affects: [availability-engine, computeSlots, motor-de-disponibilidad]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Intervalos half-open [start, end) con test de no-overlap b.end <= f.start || b.start >= f.end (espeja tstzrange '[)')"
    - "Grid snapping anclado a medianoche-en-zona (marcas absolutas), no a shift-start (Open Q1/A1)"
    - "Gate de emisión candidate + durMs <= free.end (Pitfall 5, hueco muerto aceptado)"
    - "Límites de día vía TZDate con zona IANA — cero new Date(dateStr) UTC-naive, cero offset -3 (Pitfall 2)"
    - "TDD RED→GREEN por primitivo: commit test rojo, luego commit implementación verde"

key-files:
  created:
    - packages/availability-engine/src/intervals.ts
    - packages/availability-engine/src/intervals.test.ts
    - packages/availability-engine/src/grid.ts
    - packages/availability-engine/src/grid.test.ts
    - packages/availability-engine/src/schedule.ts
    - packages/availability-engine/src/schedule.test.ts
  modified: []

key-decisions:
  - "Anchor de grilla = medianoche-en-zona (marcas de reloj absolutas 9:00, 9:30…), NO shift-start — resuelve Open Question 1 de RESEARCH.md hacia A1 (agenda prolija)"
  - "Interval se re-exporta desde types.ts (Plan 03-01); intervals.ts/grid.ts no redeclaran el shape (evita drift)"
  - "resolveWorkIntervalsForDate filtra activo !== false (Rule 2: un horario inactivo no debe aportar disponibilidad)"
  - "dayStartEpochInZone vive en schedule.ts como fuente única de la lógica medianoche-en-zona, compartida con el anchor de snapToGrid"

requirements-completed: [AVAIL-01, AVAIL-02]

# Metrics
duration: 8min
completed: 2026-07-05
---

# Phase 3 Plan 03: Primitivos del motor de intervalos (subtractIntervals, snapToGrid, resolveWorkIntervalsForDate) Summary

**Los tres primitivos puros del motor de disponibilidad — resta half-open de intervalos, alineación a grilla dimensionada a la duración multi-servicio, y resolución de horario_trabajo recurrente a intervalos de fecha en zona IANA — implementados con TDD (test rojo → verde por primitivo) y 20 tests verdes que cachean las condiciones de borde que son el riesgo central de la fase.**

## Performance

- **Duration:** ~8 min
- **Tasks (primitivos):** 3, cada uno con ciclo RED→GREEN
- **Files created:** 6 (3 módulos + 3 suites), **modified:** 0
- **Tests:** 20 passing (7 intervals + 5 grid + 6 schedule + 2 constants preexistentes)

## Accomplishments

- **`subtractIntervals` (AVAIL-01):** resta pura de intervalos half-open `[start, end)` con el test de no-overlap `b.end <= f.start || b.start >= f.end`, espejando exactamente `tstzrange(inicio, fin, '[)')` del constraint `turno_no_overlap` del DB (T-03-06). 7 tests cubren reparto en dos, back-to-back sin buffer (D-02/Pitfall 1), borde exacto, cobertura total, resta acumulada multi-busy, filtrado de longitud cero y fast-path de busy vacío. Helper reutilizable `assertBordesHalfOpen`.
- **`snapToGrid` (AVAIL-02, D-01):** emite slots alineados a granularidad desde un anchor de **medianoche-en-zona** (decisión A1, documentada), dimensionados a la duración total multi-servicio, con el gate obligatorio `candidate + durMs <= free.end` (Pitfall 5). 5 tests incluyen el caso de hueco muerto (17:30-18:15 NO se emite) y la suma multi-servicio corte 30 + barba 15 = 45 en un bloque contiguo.
- **`resolveWorkIntervalsForDate` + `dayStartEpochInZone` (AVAIL-01, Pitfall 2):** resuelve `horario_trabajo` por `dia_semana` (0=domingo..6=sábado, coincide con el `CHECK` del DB) en el timezone del negocio vía `TZDate`, sin ningún `new Date(dateStr)` UTC-naive ni offset -3 hardcodeado. 6 tests incluyen el day-boundary explícito 00:00-02:00 (medianoche AR ≠ medianoche UTC), multi-bloque mañana/tarde, filtrado por día, y tolerancia al `:ss` extra de las columnas `time` de Postgrest.

## Task Commits

Cada primitivo se committeó atómicamente en ciclo TDD RED→GREEN:

1. **subtractIntervals** — `591610b` (test, RED) → `70112d2` (feat, GREEN)
2. **snapToGrid** — `3c63813` (test, RED) → `ce16ed2` (feat, GREEN)
3. **resolveWorkIntervalsForDate** — `4b2bc5c` (test, RED) → `505bf43` (feat, GREEN)

Cada commit RED se verificó fallando (módulo ausente: `Cannot find module`) antes de committear; cada GREEN se verificó con `vitest run` de la suite del primitivo + `tsc --noEmit` exit 0.

## Files Created/Modified

- `packages/availability-engine/src/intervals.ts` — `subtractIntervals` half-open + re-export de `Interval` desde types.ts. Doc-comment cita el caller (computeSlots), la semántica `[)` y T-03-06.
- `packages/availability-engine/src/intervals.test.ts` — 7 tests + helper `assertBordesHalfOpen`.
- `packages/availability-engine/src/grid.ts` — `snapToGrid` con anchor medianoche-en-zona (A1) y gate Pitfall 5. Doc-comment cita D-01, AVAIL-02, la decisión de anchor y Pitfall 5.
- `packages/availability-engine/src/grid.test.ts` — 5 tests (alineación, último-que-entra, hueco muerto, multi-servicio, múltiplos de anchor).
- `packages/availability-engine/src/schedule.ts` — `resolveWorkIntervalsForDate` + `dayStartEpochInZone`, TZDate en todo límite de día. Doc-comment cita Pitfall 2, la convención dia_semana y la regla dura anti-offset-hardcodeado.
- `packages/availability-engine/src/schedule.test.ts` — 6 tests (resolución básica, filtrado por día, multi-bloque, day-boundary Pitfall 2, tolerancia HH:mm:ss, dayStartEpochInZone).

## Decisions Made

- **Anchor de grilla = medianoche-en-zona (no shift-start):** resuelve la Open Question 1 de RESEARCH.md hacia A1. Marcas de reloj absolutas (9:00, 9:30…) independientes del inicio de turno de cada profesional — es lo que "agenda prolija" (D-01) pide. Documentado en el doc-comment de grid.ts.
- **`Interval` se re-exporta desde types.ts:** intervals.ts y grid.ts hacen `import type { Interval } from "./types.js"` + `export type { Interval }`; no redeclaran el shape (evita el drift del Pitfall 7).
- **`dayStartEpochInZone` vive en schedule.ts:** fuente única de la lógica de medianoche-en-zona, para que el anchor de snapToGrid (Wave 3, vía computeSlots) comparta exactamente el mismo cero de grilla con la resolución de horarios.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Filtrado de horarios inactivos en resolveWorkIntervalsForDate**
- **Found during:** Task 3 (implementación de schedule.ts)
- **Issue:** El `<action>` del plan menciona filtrar `activo !== false` entre paréntesis pero el Code Example de RESEARCH.md solo filtra por `dia_semana`. Un `horario_trabajo` con `activo=false` NO debe aportar disponibilidad (sería ofrecer slots en un horario deshabilitado por el dueño).
- **Fix:** El filtro es `h.dia_semana === dow && h.activo !== false`. La forma `!== false` (en vez de `=== true`) tolera filas donde `activo` sea `undefined`/ausente sin excluirlas, tratando la ausencia como activo por defecto.
- **Files modified:** `packages/availability-engine/src/schedule.ts`
- **Committed in:** `505bf43` (GREEN de Task 3)

---

**Total deviations:** 1 auto-fixed (1 Rule 2 - correctness). Sin scope creep — está explícitamente indicado en el `<action>` del plan.
**Impact on plan:** Ninguno; refuerza la corrección de AVAIL-01 sin cambiar la firma pública.

## Threat Flags

Ninguno. Los tres primitivos son funciones puras sin superficie de red, auth ni I/O. Las mitigaciones del threat register de esta fase (T-03-06 semántica half-open, T-03-07 day-boundary en zona) están cubiertas por tests explícitos: el test back-to-back / borde exacto de intervals.test.ts y el test day-boundary 00:00-02:00 de schedule.test.ts.

## Known Stubs

Ninguno. `computeSlots` (Wave 3) orquestará estos primitivos; no hay stubs ni datos hardcodeados en los tres módulos entregados.

## Verification

- `corepack pnpm --filter @turnosbot/availability-engine test` → **20 passing** (4 suites).
- `corepack pnpm --filter @turnosbot/availability-engine exec tsc --noEmit` → **exit 0**.
- Grep de aceptación: `b.end <= f.start || b.start >= f.end` (intervals.ts), `candidate + durMs <= free.end` (grid.ts), `import { TZDate } from "@date-fns/tz"` (schedule.ts) — todos matchean. Sin `new Date(dateStr)` UTC-naive ni offset -3 en código de schedule.ts (las únicas ocurrencias de "-3" y "new Date" son en el doc-comment que explica por qué NO usarlos, y un `new Date(...UTC...)` intencional dentro del test de Pitfall 2 para probar la diferencia).

## Next Phase Readiness

- **Listo para Wave 3:** `computeSlots` puede orquestar `resolveWorkIntervalsForDate` → `subtractIntervals` (− bloqueos, − turnos activos) → `snapToGrid` (con `dayStartEpochInZone` como anchor) → filtro de ventana de reserva → auto-asignación. Los tres primitivos tienen firmas estables y suites exhaustivas de borde.
- Los tests de borde (back-to-back, day-boundary, hueco muerto) son la mitigación central del riesgo de la fase: concentran toda la matemática de intervalos en módulos testeados, evitando el fallo clásico de "condiciones de borde inconsistentes entre call sites".

## Self-Check: PASSED

Los 6 archivos creados existen y los 6 commits (591610b, 70112d2, 3c63813, ce16ed2, 4b2bc5c, 505bf43) están en el historial. Suite verde (20 tests), tsc exit 0.
