---
phase: 03-motor-de-disponibilidad
plan: 05
subsystem: api
tags: [bookAppointment, zod, supabase, postgres, exclusion-constraint, tdd]

# Dependency graph
requires:
  - phase: 03-motor-de-disponibilidad (03-01, 03-04)
    provides: "BookAppointmentInput contract (03-01), computeSlots + AvailabilityData + index.ts barrel (03-04)"
provides:
  - "bookAppointment(rawInput, deps) — el único camino de escritura del motor: congela snapshots de nombre/precio/duracion por servicio, suma precio_total en la misma transacción lógica, re-valida freshness contra computeSlots antes de insertar, y traduce el 23P01 (exclusion_violation) de la GiST EXCLUDE en un resultado de dominio slot_taken"
  - "isSlotTakenConcurrently(error) exportado del barrel para que callers (bot/dashboard) branqueen su UX sobre el mismo booleano"
  - "bookAppointmentInputSchema (zod) — validación V5 en el límite del paquete"
  - "scripts/verify-availability-engine.ts — smoke test live opcional (aún no ejecutado, ver Deviations/Checkpoint)"
affects: [04-dashboard-y-datos-del-negocio, 06-agente-whatsapp]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Límite puro/impuro explícito dentro de un mismo módulo: buildTurnoServicioSnapshots/sumPrecioTotal/isSlotTakenConcurrently son funciones puras testeadas con fixtures; solo bookAppointment toca I/O, y recibe el cliente Supabase INYECTADO (deps.supabase) en vez de importarlo como dependencia runtime del paquete."
    - "Traducción de SQLSTATE a resultado de dominio: 23P01 (exclusion_violation) -> {ok:false, reason:'slot_taken'} en vez de lanzar/500, para que el caller decida UX sin acoplarse a códigos Postgres."
    - "Gap de atomicidad documentado (no RPC transaccional en este momento del proyecto): insert de turno + turno_servicio en dos llamadas, con DELETE compensatorio best-effort del turno si el segundo insert falla."

key-files:
  created:
    - packages/availability-engine/src/booking.ts
    - packages/availability-engine/src/booking.test.ts
    - scripts/verify-availability-engine.ts
    - .planning/phases/03-motor-de-disponibilidad/deferred-items.md
  modified:
    - packages/availability-engine/src/index.ts
    - package.json (root: agrega "type":"module" + @turnosbot/availability-engine como devDependency workspace)
    - pnpm-lock.yaml

key-decisions:
  - "isSlotTakenConcurrently usa el tipo PostgrestError importado type-only de @supabase/supabase-js (no un tipo estructural propio) — mantiene el código idéntico al Code Example de 03-RESEARCH.md y sigue sin agregar una dependencia runtime al paquete."
  - "Se agregó 'type':'module' a package.json raíz para que scripts/*.ts compartan el mismo module kind ESM que el resto del monorepo (apps/bot y apps/dashboard ya lo declaraban) — corrige un error de doble-instanciación de tipos de TS al importar un tipo de un paquete workspace que a su vez tipa contra @supabase/supabase-js. Verificado que apps/bot y apps/dashboard siguen typecheckeando limpio tras el cambio."
  - "Se agregó @turnosbot/availability-engine como devDependency workspace de la raíz (mismo patrón que @turnosbot/db-types) para que scripts/verify-availability-engine.ts pueda importar el paquete por nombre."

requirements-completed: [AVAIL-03, AVAIL-04]

# Metrics
duration: 25min
completed: 2026-07-05
---

# Phase 03 Plan 05: bookAppointment — snapshots congelados + manejo de 23P01 Summary

**bookAppointment congela nombre/precio/duración por servicio, suma precio_total desde esos snapshots (nunca desde un join vivo a servicio.precio), re-valida freshness contra computeSlots antes de insertar, y traduce el 23P01 de la GiST EXCLUDE en un resultado de dominio `slot_taken` en vez de un 500 — cierra AVAIL-03/AVAIL-04 con TDD (10 tests unitarios verdes) y deja escrito (pero sin ejecutar aún) un smoke test live opcional.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-07-05T20:35:00Z (aprox., lectura de contexto)
- **Completed:** 2026-07-05T21:00:00Z
- **Tasks:** 3 features (RED+GREEN de bookAppointment, barrel, script live) — checkpoint alcanzado antes de ejecutar el script
- **Files modified:** 8 (2 creados en booking, 1 barrel modificado, 1 script nuevo, package.json + lockfile raíz, 1 deferred-items.md, 1 SUMMARY)

## Accomplishments
- `bookAppointment` implementado con TDD estricto: RED (`8321556`, 10 tests fallando por módulo inexistente) -> GREEN (`780386d`, 10/10 tests pasando, `tsc --noEmit` limpio).
- Snapshots congelados (AVAIL-03, Pitfall 3): `buildTurnoServicioSnapshots` + `sumPrecioTotal` prueban explícitamente que un cambio posterior de `servicio.precio` NO altera un `precio_total` ya calculado.
- `isSlotTakenConcurrently` (23P01 -> true, otro código -> false, null -> false) — CORE-05/T-03-12.
- `bookAppointmentInputSchema` (zod) rechaza `serviceIds` vacío, UUIDs inválidos y timestamps no-ISO (V5).
- `index.ts` re-exporta `bookAppointment` e `isSlotTakenConcurrently` junto a `computeSlots` — un único path público (AVAIL-04).
- `scripts/verify-availability-engine.ts` escrito completo: siembra servicio/horario_trabajo/bloqueo de prueba (Pitfall 8: esas tablas están vacías en vivo), llama `computeSlots` y `bookAppointment` REALES contra `bdgufnitakelyialjoqg`, y verifica el congelado histórico y el rechazo `23P01` en vivo — **no ejecutado todavía** (ver Checkpoint abajo).

## Task Commits

Cada feature fue commiteada atómicamente:

1. **RED: tests fallidos de bookAppointment** - `8321556` (test)
2. **GREEN: implementación de bookAppointment** - `780386d` (feat)
3. **Barrel: re-export de bookAppointment/isSlotTakenConcurrently** - `653aff5` (feat)
4. **Script live smoke test + fix de resolución de módulos** - `900f777` (feat)

_Gate TDD verificado en `git log`: `test(03-05)` antes de `feat(03-05)` — RED antes de GREEN, sin excepciones._

**Plan metadata:** (pendiente — se commitea junto con este SUMMARY + STATE/ROADMAP/REQUIREMENTS)

## Files Created/Modified
- `packages/availability-engine/src/booking.ts` - `bookAppointment`, `buildTurnoServicioSnapshots`, `sumPrecioTotal`, `isSlotTakenConcurrently`, `bookAppointmentInputSchema`
- `packages/availability-engine/src/booking.test.ts` - 10 tests unitarios (snapshots, congelado histórico, concurrencia, validación zod)
- `packages/availability-engine/src/index.ts` - agrega `export { bookAppointment }` / `export { isSlotTakenConcurrently }`
- `scripts/verify-availability-engine.ts` - smoke test live opcional (round-trip completo contra `bdgufnitakelyialjoqg`)
- `package.json` (raíz) - `"type":"module"` + `@turnosbot/availability-engine` como devDependency workspace
- `pnpm-lock.yaml` - actualizado por el `pnpm install --offline` tras el cambio de dependencias
- `.planning/phases/03-motor-de-disponibilidad/deferred-items.md` - bug pre-existente fuera de alcance documentado (ver Deviations)

## Decisions Made
- `isSlotTakenConcurrently` usa `PostgrestError` (type-only) de `@supabase/supabase-js` en vez de un tipo estructural propio — sigue el Code Example de 03-RESEARCH.md casi verbatim y no agrega dependencia runtime.
- El cliente Supabase se inyecta vía `deps.supabase: SupabaseClient<Database>` (type-only) — `booking.ts` no importa `@supabase/supabase-js` como valor en ningún punto (verificado por grep).
- Gap de atomicidad (turno + turno_servicio en 2 inserts, no 1 transacción/RPC) aceptado explícitamente por el `<action>` del plan; documentado extensamente en el doc-comment de `booking.ts` con la razón (no existe RPC transaccional en este momento del proyecto) y la mitigación (DELETE compensatorio best-effort).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `scripts/verify-availability-engine.ts` no podía resolver `@turnosbot/availability-engine` ni tipar limpio contra un paquete workspace**
- **Found during:** Feature 3 (escritura del script live)
- **Issue:** `scripts/` no tiene su propio `package.json`, así que la resolución de módulos para scripts corre contra el `package.json` de la raíz. Este no declaraba `@turnosbot/availability-engine` (a diferencia de `@turnosbot/db-types`, que sí estaba declarado y por eso los demás `verify-*.ts` lo resuelven bien) ni tampoco `"type":"module"` — a diferencia de `apps/bot`/`apps/dashboard`, que sí lo declaran. La falta de `"type":"module"` en la raíz hacía que TypeScript tratara `scripts/*.ts` como CommonJS "ambiente", lo que producía una doble-instanciación nominal del tipo `SupabaseClient<Database>` (una resuelta vía la condición `import`, otra vía `require` del mismo paquete) y un error `TS2322: Property 'supabaseUrl' is protected...` al pasar el cliente creado en el script a `deps.supabase` de `bookAppointment`.
- **Fix:** se agregó `@turnosbot/availability-engine` como `devDependency` (`workspace:*`) en el `package.json` raíz (mismo patrón ya usado para `@turnosbot/db-types`), y se agregó `"type":"module"` a nivel raíz. Se corrió `pnpm install --offline` (sin tocar el registry, solo re-linkear el workspace).
- **Files modified:** `package.json`, `pnpm-lock.yaml`
- **Verification:** Se armó un tsconfig de scratch extendiendo `tsconfig.base.json` con `include: scripts/**/*.ts` y se corrió `tsc` contra él — el error de doble-instanciación desapareció por completo tras el fix. Se re-corrieron `apps/bot`'s y `apps/dashboard`'s propios `tsc --noEmit` (ambos ya declaraban `"type":"module"` localmente) para confirmar que el cambio a nivel raíz no rompió nada — ambos siguen limpios. También se re-corrió `pnpm --filter @turnosbot/availability-engine exec vitest run` (44/44) y `tsc --noEmit` del paquete (limpio) tras el cambio.
- **Committed in:** `900f777` (Feature 3 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking, Rule 3)
**Impact on plan:** Necesario para que el script live (Feature 3) sea siquiera tipeable/ejecutable; no afecta la lógica de negocio de `bookAppointment`. Sin scope creep — no se tocó ningún archivo fuera de lo que el propio Feature 3 requería.

## Issues Encountered

Durante el mismo diagnóstico de tipos extendido (no gateado por el plan, ver arriba), se descubrió que `scripts/verify-double-booking.ts` y `scripts/verify-timezone.ts` todavía insertan `turno.tenant_id` en vez de `turno.negocio_id` (bug pre-existente, predata la migración 0003 — el propio `03-05-PLAN.md` ya lo señala en `<interfaces>`). Esto está **fuera de alcance** de este plan (scope boundary: solo se tocan archivos de `files_modified` del frontmatter) y se documentó en `.planning/phases/03-motor-de-disponibilidad/deferred-items.md` para una fase/plan posterior, sin arreglarlo aquí.

## User Setup Required

**Ejecutar el smoke test live requiere un `.env` que no existe en este repo (solo `.env.example`).** Ver la sección Checkpoint abajo — este plan quedó pausado antes de correr `scripts/verify-availability-engine.ts` en vivo.

## Next Phase Readiness

- `@turnosbot/availability-engine` está completo para esta fase: `computeSlots` (03-04) + `bookAppointment` (03-05) exportados desde el mismo barrel público, con 44/44 tests unitarios verdes y `tsc --noEmit` limpio. AVAIL-03/AVAIL-04 quedan satisfechos a nivel de unit tests + revisión de código.
- **Pendiente antes de cerrar la Fase 03 con confianza total:** correr `scripts/verify-availability-engine.ts` contra la DB live (`bdgufnitakelyialjoqg`) una vez exista un `.env` con `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`. El script ya está escrito, referencia el proyecto correcto, y limpia sus propias filas de prueba al inicio/fin.
- Fase 04 (dashboard) y Fase 06 (bot/WhatsApp) son los primeros consumidores reales de `computeSlots`/`bookAppointment` — hoy no hay imports desde `apps/bot`/`apps/dashboard` (esperado, esas fases no empezaron).
- Bug pre-existente fuera de alcance documentado en `deferred-items.md` (ver Issues Encountered) — no bloquea esta fase, pero debería resolverse antes de confiar en `verify-double-booking.ts`/`verify-timezone.ts` como gates automatizados de un futuro CI.

---

## CHECKPOINT: Live-verify pendiente (autonomous: false)

Este plan es `autonomous:false` porque su última verificación (Feature 3, smoke test live) requiere credenciales reales contra `bdgufnitakelyialjoqg` que no existen en este entorno (solo `.env.example`, sin `.env`).

**Todo el trabajo de código está completo y commiteado:**
- `bookAppointment` implementado con TDD (RED `8321556` -> GREEN `780386d`).
- Barrel actualizado (`653aff5`).
- `scripts/verify-availability-engine.ts` escrito completo (`900f777`), listo para ejecutar.
- 44/44 tests unitarios verdes, `tsc --noEmit` limpio (ambos re-verificados varias veces durante la ejecución).

**Lo único que falta — y que NO se puede completar en este entorno:**
1. Crear un `.env` real (nunca commitear) con `SUPABASE_URL=https://bdgufnitakelyialjoqg.supabase.co` y `SUPABASE_SERVICE_ROLE_KEY=<key real>` (ver `.env.example` para el formato exacto de las variables).
2. Correr: `pnpm exec tsx scripts/verify-availability-engine.ts`
3. Confirmar que imprime `verify-availability-engine.ts: PASSED` (el script hace `process.exit(1)` con un mensaje `FAIL: ...` específico si algo no coincide, y limpia sus propias filas de prueba en cualquier camino de salida).

**Para retomar:** una vez que el `.env` exista, correr el comando del paso 2 manualmente (o a través de un nuevo plan/checkpoint de ejecución) — no se requiere ningún cambio de código adicional, solo la ejecución en vivo.

---
*Phase: 03-motor-de-disponibilidad*
*Completed: 2026-07-05*

## Self-Check: PASSED

Todos los archivos creados existen (`booking.ts`, `booking.test.ts`, `index.ts` modificado, `verify-availability-engine.ts`, `deferred-items.md`, este SUMMARY) y los 4 commits citados (`8321556`, `780386d`, `653aff5`, `900f777`) existen en `git log`. Nada faltante.
