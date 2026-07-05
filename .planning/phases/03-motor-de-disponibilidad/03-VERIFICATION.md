---
phase: 03-motor-de-disponibilidad
verified: 2026-07-05T21:09:34Z
status: passed
score: 10/10 must-haves (code-level) + 2/2 live checkpoints ejecutados y PASSED (2026-07-05)
overrides_applied: 0
live_checkpoints_resolved:
  - test: "apps/bot/src/db/negocioScoped.test.ts contra bdgufnitakelyialjoqg"
    result: "PASSED (2026-07-05) — negocioScoped(A).turnos() solo filas de A, negocioScoped(B).turnos() solo filas de B; sin error de columna tenant_id, sin fuga cross-negocio."
  - test: "scripts/verify-availability-engine.ts contra bdgufnitakelyialjoqg"
    result: "PASSED (2026-07-05) — computeSlots resta el bloqueo; bookAppointment agenda (precio_total=6000); snapshot congelado pese a cambiar servicio.precio a 8000 (AVAIL-03 live); reintento del mismo slot rechazado por la GiST EXCLUDE (23P01) y traducido a slot_taken (CORE-05)."
    fix_applied: "Durante la verificación se corrigió bookAppointmentInputSchema (booking.ts): z.uuid() estricto → uuidLike (forma 8-4-4-4-12 hex). Los ids reales de la DB/fixtures no son RFC-v4, y la app no debe rechazar un id que su propia base guardó. 44/44 unit tests siguen verdes."
---

# Phase 3: Motor de disponibilidad — Verification Report

**Phase Goal:** El sistema calcula con exactitud qué horarios están libres para cada profesional, de forma aislada y verificable antes de conectarlo a cualquier interfaz.
**Verified:** 2026-07-05T21:09:34Z (live checkpoints ejecutados 2026-07-05)
**Status:** passed — 10/10 must-haves + los 2 smoke tests live PASSED contra bdgufnitakelyialjoqg
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

(Fuente: ROADMAP.md Success Criteria Phase 3 + AVAIL-01..05 de REQUIREMENTS.md — mismo conjunto, sin reducir alcance.)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | El sistema calcula correctamente los slots libres cruzando horario de trabajo, bloqueos manuales y turnos confirmados/pendientes (AVAIL-01) | ✓ VERIFIED | `packages/availability-engine/src/computeSlots.ts:112-137` orquesta `resolveWorkIntervalsForDate` → `subtractIntervals` (bloqueos) → `subtractIntervals` (turnos activos) → `snapToGrid`. Filtro busy exacto `estado IN ('pendiente','confirmado')` en `computeSlots.ts:35,126`. Semántica half-open `[)` en `intervals.ts:34` espeja `tstzrange(...,'[)')` del DB. 9 tests en `computeSlots.test.ts`, todos passing (verificado con `vitest run` propio: 44/44 total). |
| 2 | Un turno con múltiples servicios suma las duraciones y reserva un único bloque contiguo (AVAIL-02) | ✓ VERIFIED | `computeSlots.ts:95-97` suma `servicio.duracion_min` de todos los `serviceIds` en `totalDurationMin`, pasado como único parámetro a `snapToGrid` (`grid.ts:29-46`), que emite un único intervalo contiguo por slot (gate `candidate + durMs <= free.end`, `grid.ts:41`). Test explícito multi-servicio en `grid.test.ts` y en `computeSlots.test.ts`. |
| 3 | Al agendar, el turno queda con nombre/precio/duración de cada servicio congelados; cambios posteriores al servicio no afectan turnos ya creados (AVAIL-03) | ✓ VERIFIED | `booking.ts:97-115` (`buildTurnoServicioSnapshots`) congela `nombre_snapshot`/`precio_snapshot`/`duracion_snapshot` desde la fila `servicio` provista, nunca un join vivo. `sumPrecioTotal` (`booking.ts:123-125`) suma solo sobre snapshots ya congelados. Test explícito de "congelado histórico" en `booking.test.ts` (servicio.precio cambia después, precio_total no se altera). El smoke script live `scripts/verify-availability-engine.ts:261-307` re-verifica esto mismo contra la DB real (pendiente de ejecución humana, ver abajo). |
| 4 | El mismo cálculo de disponibilidad es usado por cualquier consumidor — no hay dos implementaciones que puedan discrepar (AVAIL-04) | ✓ VERIFIED | Un único paquete `@turnosbot/availability-engine` sin dependencia runtime de `@supabase/supabase-js` (`grep` confirma cero imports de valor runtime; solo `import type { PostgrestError, SupabaseClient }` en `booking.ts:57`, type-only). `package.json` no declara `@supabase/supabase-js` como dependency. Barrel `index.ts` expone `computeSlots`/`bookAppointment`/tipos/constantes desde el único path público `@turnosbot/availability-engine`. `computeSlots` recibe todas las filas ya-fetcheadas por parámetro (`AvailabilityData`), sin I/O propio — verificado leyendo el código, no solo el SUMMARY. |
| 5 | Cuando el cliente no pide un profesional específico, el sistema asigna automáticamente el primero disponible para ese horario (AVAIL-05) | ✓ VERIFIED | `computeSlots.ts:150-153` llama `autoAssign` sobre el `Map<profesionalId, slots>` cuando `!input.professionalId`. `autoAssign.ts:35-53` elige el hueco más temprano con tie-break determinístico por `professionalId` ascendente (ordena antes de iterar, documentado como NO-balanceo-de-carga en el doc-comment, A3). Tests de empate con orden de inserción invertido en `autoAssign.test.ts` confirman determinismo. |

**Score:** 5/5 truths verified a nivel de código (unit tests + lectura directa de fuente).

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/availability-engine/src/constants.ts` | BOOKING_MIN_LEAD_MINUTES=60, BOOKING_MAX_ADVANCE_DAYS=30 | ✓ VERIFIED | Valores exactos confirmados; usados en `computeSlots.ts:107-108`. |
| `packages/availability-engine/src/types.ts` | Contratos + row aliases desde `@turnosbot/db-types` | ✓ VERIFIED | Type-only import confirmado; `negocioId`, `serviceIds[]` presentes. |
| `packages/availability-engine/src/intervals.ts` | `subtractIntervals` resta half-open | ✓ VERIFIED | Semántica `b.end <= f.start \|\| b.start >= f.end` exacta; 7 tests. |
| `packages/availability-engine/src/grid.ts` | `snapToGrid` alineado a granularidad, gate Pitfall 5 | ✓ VERIFIED | Gate `candidate + durMs <= free.end` presente; anchor medianoche-en-zona documentado; 5 tests. |
| `packages/availability-engine/src/schedule.ts` | `resolveWorkIntervalsForDate` vía TZDate | ✓ VERIFIED | `TZDate` importado de `@date-fns/tz`; sin `new Date(dateStr)` UTC-naive ni offset -3 hardcodeado; 6 tests. |
| `packages/availability-engine/src/autoAssign.ts` | Auto-asignación hueco más temprano, tie-break estable | ✓ VERIFIED | Sort por `professionalId` antes de iterar; 5 tests incluyendo determinismo de empate. |
| `packages/availability-engine/src/computeSlots.ts` | Orquestación pura AVAIL-01/02/04/05 | ✓ VERIFIED | Cero import runtime de supabase-js; compone los 4 primitivos; 9 tests. |
| `packages/availability-engine/src/booking.ts` | `bookAppointment`: snapshots + 23P01 | ✓ VERIFIED | `precio_snapshot`, `23P01`, `negocio_id` (no `tenant_id`) presentes; cliente inyectado vía `deps.supabase`; 10 tests. |
| `packages/availability-engine/src/index.ts` | Barrel público | ✓ VERIFIED | `export { computeSlots }` y `export { bookAppointment }` presentes; sin `throw new Error` residual del stub. |
| `apps/bot/src/db/negocioScoped.ts` | Capa de datos del bot filtrando por `negocio_id` | ✓ VERIFIED | 11 accessors operacionales usan `.eq("negocio_id", negocioId)`; `negocio()` conserva correctamente `.eq("tenant_id", negocioId)` (FK legítimo). Archivo viejo `tenantScoped.ts` ya no existe. |
| `scripts/verify-availability-engine.ts` | Smoke test live opcional (round-trip) | ✓ VERIFIED (estructura) / ? PENDIENTE (ejecución) | Existe, guard de aislamiento `bdgufnitakelyialjoqg` presente, usa `computeSlots`/`bookAppointment` reales. No pudo ejecutarse en este entorno (sin `.env`) — ver Human Verification. |
| `apps/bot/src/db/negocioScoped.test.ts` | Smoke test cross-negocio live | ✓ VERIFIED (estructura) / ? PENDIENTE (ejecución) | Existe, guard de aislamiento presente, asserts correctos sobre `negocio_id`. No pudo ejecutarse (sin `.env`) — ver Human Verification. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `computeSlots.ts` | `intervals.ts`/`grid.ts`/`schedule.ts`/`autoAssign.ts` | imports directos | ✓ WIRED | Los 4 imports presentes y usados (no solo importados: cada función se invoca en la orquestación). |
| `index.ts` | `computeSlots.ts` | re-export barrel | ✓ WIRED | `export { computeSlots } from "./computeSlots.js"` — path público preservado. |
| `index.ts` | `booking.ts` | re-export barrel | ✓ WIRED | `export { bookAppointment }` y `export { isSlotTakenConcurrently }`. |
| `booking.ts` | `computeSlots.ts` | freshness re-validation | ✓ WIRED | `bookAppointment` llama `computeSlots(computeInput, freshData, now)` inmediatamente antes de insertar (anti-cache, línea 230). |
| `booking.ts` | `turno_servicio.precio_snapshot` → `turno.precio_total` | suma en la misma función antes del insert | ✓ WIRED | `sumPrecioTotal(snapshots)` se computa antes del insert de `turno` y se escribe como `precio_total` (`booking.ts:241,253`). |
| `negocioScoped.ts` | tablas operacionales | `.eq("negocio_id", negocioId)` | ✓ WIRED | Confirmado en las 11 tablas; `negocio()` es la única excepción legítima documentada. |
| `scripts/verify-availability-engine.ts` | `@turnosbot/availability-engine` | import del barrel público | ✓ WIRED | Importa `bookAppointment, computeSlots` desde el paquete, no reimplementa nada localmente. |

### Data-Flow Trace (Level 4)

No aplica en el sentido estricto de UI/estado — este paquete es lógica pura sin render. Se verificó en su lugar que `computeSlots` no tiene ninguna ruta de retorno hardcodeada: cada rama (con/sin `professionalId`, con/sin bloqueos, con/sin turnos) depende genuinamente del `AvailabilityData` recibido, confirmado por los 9 tests de `computeSlots.test.ts` que varían esos inputs y obtienen outputs distintos (no un valor estático).

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Suite completa de unit tests del motor | `corepack pnpm --filter @turnosbot/availability-engine test` | `Test Files 7 passed (7)` / `Tests 44 passed (44)` | ✓ PASS (re-ejecutado independientemente por el verificador, no solo tomado del SUMMARY) |
| Typecheck del paquete | `corepack pnpm --filter @turnosbot/availability-engine exec tsc --noEmit` | exit 0, sin output | ✓ PASS |
| Pureza del motor (sin runtime de supabase-js) | `grep -rn "@supabase/supabase-js" packages/availability-engine/src/` | Solo 2 matches, ambos `import type` en `booking.ts`/`booking.test.ts`; `package.json` sin la dependency | ✓ PASS |
| Ausencia de deuda/stubs en archivos de la fase | `grep -rn -E "TBD\|FIXME\|XXX\|TODO\|HACK\|PLACEHOLDER"` sobre `packages/availability-engine/src/`, `negocioScoped.ts`, `verify-availability-engine.ts` | Sin matches | ✓ PASS |

### Probe Execution

No hay probes formales (`scripts/*/tests/probe-*.sh`) declarados por esta fase. Los dos "smoke scripts" documentados (`negocioScoped.test.ts`, `verify-availability-engine.ts`) están gateados por credenciales `.env` inexistentes en este entorno — no son probes en el sentido de Step 7c, son checkpoints humanos explícitamente declarados como `checkpoint:human-verify` en `03-02-PLAN.md` Task 3 y como Feature 3 opcional en `03-05-PLAN.md`. Ver sección Human Verification.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| AVAIL-01 | 03-01, 03-03, 03-04 | Cruce horario − bloqueos − turnos | ✓ SATISFIED | `computeSlots.ts` orquestación + 9 tests propios + tests de `intervals`/`grid`/`schedule`. |
| AVAIL-02 | 03-01, 03-03, 03-04 | Multi-servicio, bloque contiguo | ✓ SATISFIED | Suma de duraciones en `computeSlots.ts:95-97`, dimensionado único en `snapToGrid`. |
| AVAIL-03 | 03-01, 03-05 | Snapshots congelados al agendar | ✓ SATISFIED | `buildTurnoServicioSnapshots`/`sumPrecioTotal` en `booking.ts`; test de congelado histórico. |
| AVAIL-04 | 03-01, 03-02, 03-04, 03-05 | Módulo único compartido | ✓ SATISFIED | Paquete puro sin cliente DB runtime; barrel único; `negocioScoped.ts` es el único data-feed sancionado del bot. |
| AVAIL-05 | 03-04 | Auto-asignación hueco más temprano | ✓ SATISFIED | `autoAssign.ts` + wiring en `computeSlots.ts`. |

Sin requisitos huérfanos: los 5 AVAIL-* mapeados a Fase 3 en REQUIREMENTS.md aparecen todos en el campo `requirements` de al menos un plan de esta fase.

### Anti-Patterns Found

Ninguno. Escaneo de `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER`, "not yet implemented"/"coming soon"/"placeholder", y stubs de retorno vacío (`return null`/`return {}`/`return []`/`=> {}`) sobre todos los archivos fuente modificados por esta fase: cero matches.

Nota menor (no bloqueante, fuera de alcance de esta fase): quedan comentarios de prosa mencionando el nombre viejo `tenantScoped` en `apps/dashboard/lib/negocio-context.ts:12`, `apps/dashboard/lib/auth/require-role.ts:5` y `scripts/seed-fixtures.ts:4,11` — son referencias documentales a un archivo de Fase 1/2 ya renombrado, no código roto ni parte del scope AVAIL-01..05. No se reporta como gap de esta fase.

### Human Verification Required

### 1. Smoke test cross-negocio live (`negocioScoped.test.ts`)

**Test:** Ejecutar `pnpm exec tsx apps/bot/src/db/negocioScoped.test.ts` con un `.env` real (`SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` apuntando a `bdgufnitakelyialjoqg`).
**Expected:** Imprime "OK: negocioScoped(A)..." y "OK: negocioScoped(B)..." con conteos de filas > 0, ningún `column ... tenant_id does not exist`, ninguna fuga cross-negocio, termina en "negocioScoped.test.ts: PASSED".
**Why human:** No existe `.env` en este entorno (solo `.env.example`); las credenciales de Supabase son del usuario y no deben generarse ni simularse. Este era ya un checkpoint humano explícito planificado (`03-02-PLAN.md` Task 3, `gate="blocking"`), no un gap introducido por la verificación.

### 2. Smoke test de round-trip live (`verify-availability-engine.ts`)

**Test:** Ejecutar `pnpm exec tsx scripts/verify-availability-engine.ts` con el mismo `.env` real.
**Expected:** Siembra servicio/horario/bloqueo de prueba, `computeSlots` real resta el bloqueo correctamente (09:00 disponible, 10:00 no), `bookAppointment` agenda con `precio_total` correcto, subir `servicio.precio` después NO altera el `precio_total` ya escrito, reintentar el mismo slot con datos stale es rechazado por la GiST EXCLUDE (23P01) y traducido a `slot_taken`. Termina en "verify-availability-engine.ts: PASSED".
**Why human:** Mismo motivo — requiere credenciales reales contra la DB live, que este entorno de verificación no posee. Documentado como "SECUNDARIO/opcional" en `03-05-PLAN.md` Feature 3, con la validación primaria (unit tests con fixtures) ya verde e independientemente confirmada.

### Gaps Summary

No se encontraron gaps de código. Las 5 verdades observables del roadmap (AVAIL-01..05) están implementadas, testeadas (44/44 unit tests pasando, re-ejecutados por el verificador, no solo citados del SUMMARY), tipadas sin errores (`tsc --noEmit` limpio), y el motor es efectivamente puro (sin dependencia runtime de `@supabase/supabase-js`, confirmado en `package.json` y por grep de imports). El único punto pendiente son los dos smoke tests contra la base de datos viva, que están correctamente gateados como checkpoints humanos desde la planificación original (no un artefacto faltante ni un defecto de wiring) y no pueden ejecutarse en este entorno por ausencia deliberada de `.env`. Esto no es un fallo del código: es trabajo que, por diseño de la fase, requiere al humano con las credenciales reales para cerrar el ciclo de verificación end-to-end contra `bdgufnitakelyialjoqg`.

**Veredicto:** PASSED-WITH-PENDING-CHECKPOINTS — el código satisface todos los requisitos AVAIL-01..05 a nivel unitario/estático; faltan dos ejecuciones humanas contra la DB live para el cierre completo.

---

*Verified: 2026-07-05T21:09:34Z*
*Verifier: Claude (gsd-verifier)*
