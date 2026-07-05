---
phase: 03-motor-de-disponibilidad
plan: 01
subsystem: infra
tags: [vitest, date-fns, zod, typescript, monorepo, availability-engine, db-types]

# Dependency graph
requires:
  - phase: 02-dashboard-y-datos-del-negocio
    provides: "migración 0003 (tenant_id → negocio_id) + packages/db-types regenerado con los Row shapes post-split"
provides:
  - "Toolchain de tests (vitest 4.1.9) configurado en @turnosbot/availability-engine"
  - "Dependencias del motor instaladas: date-fns, @date-fns/tz, zod"
  - "constants.ts con la ventana de reserva hardcodeada (60 min / 30 días, D-04/D-05)"
  - "types.ts: contratos públicos evolucionados + row aliases type-only desde db-types (sin shapes paralelos)"
  - "Fixtures deterministas (horario/bloqueo/turno/servicio/negocio) con helpers makeX"
affects: [availability-engine, motor-de-disponibilidad, computeSlots, bookAppointment, bot, dashboard]

# Tech tracking
tech-stack:
  added: [date-fns@^4.4.0, "@date-fns/tz@^1.5.0", zod@^4.4.3, vitest@4.1.9]
  patterns:
    - "Row-type sourcing type-only desde @turnosbot/db-types (nunca hand-declare)"
    - "Intervalos half-open [start, end) espejando tstzrange(inicio, fin, '[)') del DB"
    - "Fixtures makeX(partial) con defaults sensatos y override por dimensión probada"
    - "Imports relativos con extensión .js explícita (moduleResolution NodeNext)"

key-files:
  created:
    - packages/availability-engine/vitest.config.ts
    - packages/availability-engine/src/constants.ts
    - packages/availability-engine/src/constants.test.ts
    - packages/availability-engine/src/types.ts
    - packages/availability-engine/src/__fixtures__/rows.ts
  modified:
    - packages/availability-engine/package.json

key-decisions:
  - "Ventana de reserva 60min/30d como constantes en un único archivo (D-05), promovibles a config por-negocio en Fase 4"
  - "El motor es puro: types.ts importa Database type-only, sin dependencia runtime de ningún cliente DB (AVAIL-04)"
  - "Contrato evolucionado del stub: tenantId→negocioId, serviceId→serviceIds[] (AVAIL-02), + AvailabilityData/BookAppointmentInput/Interval"
  - "vitest.config.ts sin bloque de path-aliasing (el paquete usa imports relativos, no el alias @/* de Next.js del dashboard)"

patterns-established:
  - "Interval { start: number; end: number } epoch ms, half-open [start, end) — reutilizable por intervals.ts/grid.ts (Wave 2+)"
  - "AvailabilityData documenta el contrato de scoping: el caller pasa SOLO filas del negocio correcto (T-03-01)"

requirements-completed: [AVAIL-04]

# Metrics
duration: 12min
completed: 2026-07-05
---

# Phase 3 Plan 01: Fundación del paquete availability-engine Summary

**Toolchain de tests (vitest) + deps (date-fns/@date-fns/tz/zod) + contratos de tipos contra @turnosbot/db-types + constantes de ventana de reserva + fixtures deterministas — la Wave 0 que desbloquea el algoritmo de disponibilidad.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-07-05T18:53:00Z
- **Completed:** 2026-07-05T19:03:45Z
- **Tasks:** 3
- **Files created:** 5, **modified:** 1

## Accomplishments
- `@turnosbot/availability-engine` pasa de CERO dependencias a un paquete testeable en aislamiento: date-fns, @date-fns/tz, zod instalados + vitest 4.1.9 con runner configurado.
- `constants.ts` materializa la ventana de reserva (D-04/D-05) como única fuente de verdad, con test GREEN (2 passing).
- `types.ts` evoluciona el contrato del stub (negocioId, serviceIds[], AvailabilityData, BookAppointmentInput, Interval) usando alias de filas de `@turnosbot/db-types` type-only — cero shapes paralelos, cero acoplamiento a un cliente DB (materializa AVAIL-04 por construcción).
- Fixtures deterministas (`__fixtures__/rows.ts`) con helpers `makeX(partial)` para horario/bloqueo/turno/servicio/negocio, cubriendo la estrategia de test PRIMARIA dado que la DB live tiene `horario_trabajo`/`bloqueo` vacíos (Pitfall 8).

## Task Commits

Each task was committed atomically:

1. **Task 1: Instalar deps + configurar vitest** - `2bf459c` (feat)
2. **Task 2: constants.ts (ventana de reserva D-04/D-05) + su test** - `54d13d6` (test, RED) → `a159415` (feat, GREEN)
3. **Task 3: types.ts (contratos + row aliases) + fixtures** - `772c1a4` (feat)

_Task 2 siguió el ciclo TDD RED→GREEN: test committeado primero fallando (constants.ts ausente), luego la implementación._

## Files Created/Modified
- `packages/availability-engine/package.json` - Agrega dependencies (date-fns, @date-fns/tz, zod), devDep vitest@4.1.9, script `test`; description ya no dice "stub".
- `packages/availability-engine/vitest.config.ts` - Runner vitest, entorno node, `include: ["src/**/*.test.ts"]`, sin path-aliasing.
- `packages/availability-engine/src/constants.ts` - `BOOKING_MIN_LEAD_MINUTES=60`, `BOOKING_MAX_ADVANCE_DAYS=30` con rationale D-04/D-05.
- `packages/availability-engine/src/constants.test.ts` - Afirma los dos valores exactos (import explícito desde vitest).
- `packages/availability-engine/src/types.ts` - Contratos públicos + row aliases desde `@turnosbot/db-types` (type-only) + `Interval` half-open.
- `packages/availability-engine/src/__fixtures__/rows.ts` - Filas deterministas + helpers `makeX`, con turnos confirmado/pendiente/cancelado (Pitfall 4).

## Decisions Made
- **Ventana de reserva en un único archivo (D-05):** los límites 60min/30d viven en `constants.ts` para que la promoción a config por-negocio en Fase 4 sea un cambio de un solo archivo.
- **Motor puro sin cliente DB:** `types.ts` usa `import type { Database }` (type-only) — cero runtime coupling a `@supabase/supabase-js`, garantizando AVAIL-04 (un único contrato compartido por bot y dashboard sin drift).
- **Contrato evolucionado, no redisñado:** se renombró `tenantId→negocioId` (migración 0003) y `serviceId→serviceIds[]` (AVAIL-02) preservando la convención de doc-comments inline del stub.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] Extensiones .js explícitas en imports relativos (moduleResolution NodeNext)**
- **Found during:** Task 3 (verificación `tsc --noEmit`)
- **Issue:** El `tsconfig.base.json` usa `moduleResolution: NodeNext`, que exige extensiones de archivo explícitas en imports ECMAScript relativos. `tsc` fallaba con TS2835 en `src/__fixtures__/rows.ts` (`../types`) y en `src/constants.test.ts` (`./constants`). Los tests de vitest pasaban (vitest no enforca esto), enmascarando el problema en Task 2.
- **Fix:** Cambié `../types` → `../types.js` y `./constants` → `./constants.js`. La corrección de `constants.test.ts` (committeado en Task 2) se incluyó en el commit de Task 3 junto con los archivos nuevos que dependen del typecheck.
- **Files modified:** `packages/availability-engine/src/__fixtures__/rows.ts`, `packages/availability-engine/src/constants.test.ts`
- **Verification:** `pnpm --filter @turnosbot/availability-engine exec tsc --noEmit` → exit 0; vitest run → 2 passing.
- **Committed in:** `772c1a4` (parte del commit de Task 3)

---

**Total deviations:** 1 auto-fixed (1 Rule 3 - blocking issue)
**Impact on plan:** El fix era necesario para que el typecheck (criterio de aceptación de Task 3 y de la verificación del plan) pasara. Sin scope creep — solo corrige la sintaxis de import exigida por la config existente del monorepo.

## Issues Encountered
Una interrupción por error de API ocurrió entre la fase GREEN de Task 2 (test pasando, verificado) y su commit. El orquestador confirmó el estado del repo (constants.ts escrito pero sin commitear) y se retomó desde ahí: se re-verificó el GREEN y se committeó la implementación (`a159415`) antes de continuar con Task 3.

## User Setup Required
None - no external service configuration required. Este plan es puro andamiaje del paquete; no toca la DB live ni requiere secrets.

## Next Phase Readiness
- **Listo para Wave 2+:** El paquete ya tiene runner de tests, tipos y fixtures. Los siguientes planes pueden escribir `intervals.ts`, `grid.ts`, `schedule.ts`, `computeSlots.ts` y `booking.ts` con TDD sobre los fixtures deterministas.
- **Recordatorio (fuera de este plan):** `apps/bot/src/db/tenantScoped.ts` sigue referenciando la columna `tenant_id` eliminada por migración 0003 (Pitfall 7) — es un defecto pre-existente bloqueante para el path bot-side, planificado como tarea temprana de otro plan de esta fase, no abordado aquí (este plan es solo la fundación del paquete puro).
