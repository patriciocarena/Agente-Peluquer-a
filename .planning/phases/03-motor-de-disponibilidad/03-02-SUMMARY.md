---
phase: 03-motor-de-disponibilidad
plan: 02
subsystem: database
tags: [supabase, postgres, negocio_id, tenant-isolation, service_role]

# Dependency graph
requires:
  - phase: 03-01
    provides: "Fundación de @turnosbot/availability-engine (types.ts, constants.ts, fixtures) — este plan repara el data-feed del lado del bot que ese motor consumirá"
provides:
  - "negocioScoped(negocioId): capa de acceso a datos del bot filtrando por negocio_id en las 11 tablas operacionales (profesional, horario_trabajo, servicio, profesional_servicio, cliente, turno, turno_servicio, bloqueo, conversacion, mensaje, recordatorio)"
  - "negocio() accessor conservado, filtrando por su FK legítimo tenant_id"
  - "Smoke test negocioScoped.test.ts actualizado, listo para correr contra bdgufnitakelyialjoqg (pendiente de .env)"
affects: [03-03, 03-04, 03-05, phase-06-agente-whatsapp]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Capa de acceso mandatoria por negocio_id (in-place fix del patrón CORE-03 previo, ya no tenant_id)"

key-files:
  created: []
  modified:
    - apps/bot/src/db/negocioScoped.ts (renombrado desde tenantScoped.ts)
    - apps/bot/src/db/negocioScoped.test.ts (renombrado desde tenantScoped.test.ts)
    - apps/bot/src/db/client.ts (doc-comment actualizado)

key-decisions:
  - "negocio() accessor NO se renombra a negocio_id: negocio.tenant_id es el FK legítimo al tenant padre (confirmado en packages/db-types/src/database.types.ts), no fue tocado por la migración 0003"
  - "Fixtures del smoke test usan TENANT_A.negocioId / TENANT_B.negocioId reales de scripts/seed-fixtures.ts (negocio.id, no tenant.id) en vez de las constantes de nivel-tenant que usaba el test viejo"

patterns-established:
  - "Pattern: cualquier tabla operacional nueva del bot debe agregarse a negocioScoped() con .eq('negocio_id', negocioId), nunca acceder a supabaseAdmin.from(...) directamente"

requirements-completed: [AVAIL-04]

# Metrics
duration: ~6min
completed: 2026-07-05
---

# Phase 03 Plan 02: Fix negocioScoped (Pitfall 7) Summary

**Reparado el defecto bloqueante de columna: la capa de acceso a datos del bot (`tenantScoped.ts`) ahora es `negocioScoped(negocioId)` y filtra las 11 tablas operacionales por `negocio_id` (post-migración 0003), preservando `negocio()` con su FK legítimo `tenant_id`. Smoke test cross-negocio actualizado y listo, pero SIN correr contra la DB live (falta `.env`) — checkpoint humano pendiente.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-07-05T19:06:32Z (aprox., según STATE.md previo a la ejecución)
- **Completed:** 2026-07-05T19:12:00Z (aprox.)
- **Tasks:** 2 de 3 completadas (Task 3 es un checkpoint humano bloqueado por falta de `.env`)
- **Files modified:** 3 (2 renombrados + 1 con doc-comment actualizado)

## Accomplishments

- `apps/bot/src/db/tenantScoped.ts` → `apps/bot/src/db/negocioScoped.ts` (git mv, historia preservada). Función renombrada `tenantScoped(tenantId)` → `negocioScoped(negocioId)`.
- Las 11 tablas operacionales (`profesional`, `horario_trabajo`, `servicio`, `profesional_servicio`, `cliente`, `turno`, `turno_servicio`, `bloqueo`, `conversacion`, `mensaje`, `recordatorio`) ahora filtran por `.eq("negocio_id", negocioId)` en vez de `.eq("tenant_id", tenantId)` (columna que ya no existe post-migración 0003).
- El accessor `negocio()` se mantiene filtrando por `.eq("tenant_id", negocioId)` — documentado inline por qué NO se toca (FK legítimo al tenant padre, confirmado en `packages/db-types/src/database.types.ts`).
- `apps/bot/src/db/tenantScoped.test.ts` → `negocioScoped.test.ts`: import actualizado, constantes `TENANT_A_ID`/`TENANT_B_ID` reemplazadas por `NEGOCIO_A_ID`/`NEGOCIO_B_ID` usando los `negocio.id` reales de `scripts/seed-fixtures.ts` (`TENANT_A.negocioId` / `TENANT_B.negocioId`), aserciones migradas a `negocio_id`, guard de aislamiento `SUPABASE_URL.includes("bdgufnitakelyialjoqg")` agregado.
- `apps/bot/src/db/client.ts`: doc-comment actualizado para referenciar `negocioScoped`/`negocio_id`.
- `pnpm --filter @turnosbot/bot exec tsc --noEmit` verde tras cada task.
- `grep -rn "tenantScoped" apps/bot/src` → 0 referencias de código activo (solo prosa histórica en el propio doc-comment de `negocioScoped.ts`, explicando el fix).

## Task Commits

1. **Task 1: Renombrar tenantScoped → negocioScoped y fijar el filtro a negocio_id** - `8533140` (fix)
2. **Task 2: Actualizar el smoke test negocioScoped.test.ts** - `adec798` (test)
3. **Task 3: Verificación humana del smoke test cross-negocio contra la DB live** - **NO EJECUTADA** (checkpoint humano, ver abajo)

**Plan metadata:** (pendiente — se registra tras cerrar el checkpoint)

## Files Created/Modified

- `apps/bot/src/db/negocioScoped.ts` - Capa de acceso a datos del bot; 11 accessors filtrando por `negocio_id`, `negocio()` filtrando por `tenant_id` (FK padre)
- `apps/bot/src/db/negocioScoped.test.ts` - Smoke test cross-negocio (assert-based, sin vitest), listo para correr contra la DB live
- `apps/bot/src/db/client.ts` - Doc-comment actualizado (sin cambios de comportamiento)

## Decisions Made

- **`negocio()` conserva `tenant_id`:** confirmado directamente contra `packages/db-types/src/database.types.ts` (`negocio.Row.tenant_id`, FK `negocio_tenant_id_fkey` → `tenant.id`). No es el mismo bug que las otras 11 tablas; es el vínculo negocio→tenant padre, correcto y sin tocar.
- **Fixtures del test = `negocio.id`, no `tenant.id`:** el test viejo usaba IDs de nivel tenant como si fueran negocio IDs (bug latente adicional que este plan también corrige). Se usaron los valores reales `TENANT_A.negocioId` (`21111111-...`) y `TENANT_B.negocioId` (`22222222-...`) de `scripts/seed-fixtures.ts`, que pertenecen a tenants distintos, preservando también la cobertura de aislamiento cross-tenant.

## Deviations from Plan

None - plan ejecutado exactamente como estaba escrito para las Tasks 1 y 2. La única desviación respecto al flujo normal es que Task 3 (checkpoint humano) no pudo ejecutarse por ausencia de `.env` — esto estaba anticipado explícitamente en las instrucciones de ejecución de este plan, no es un descubrimiento nuevo.

## Issues Encountered

- **Bloqueante esperado:** este repo no tiene archivo `.env` (solo `.env.example`), y el smoke test `negocioScoped.test.ts` requiere `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` reales para conectarse a `bdgufnitakelyialjoqg`. No se inventaron credenciales ni se tocó ningún otro proyecto. El código y el test quedaron completos y compilando; solo falta la ejecución en vivo.

## User Setup Required

**Acción pendiente del usuario para cerrar este plan (Task 3, checkpoint humano bloqueante):**

1. Confirmar que existe un `.env` en la raíz del repo con `SUPABASE_URL` (apuntando a `bdgufnitakelyialjoqg`) y `SUPABASE_SERVICE_ROLE_KEY`.
2. Correr: `pnpm exec tsx apps/bot/src/db/negocioScoped.test.ts`
3. Resultado esperado: dos líneas `OK: negocioScoped(A).turnos() devuelve N fila(s), todas del negocio A.` / `...negocio B.`, y `negocioScoped.test.ts: PASSED`. NO debe aparecer `column ... tenant_id does not exist`.
4. Si algún negocio no tiene turnos sembrados, el assert de ">0 filas" para el negocio A puede fallar legítimamente — en ese caso reportar qué `negocio_id` se usó y cuántas filas devolvió para ajustar los fixtures.
5. Responder "approved" si PASSED, o pegar el output si falló, para que un agente de continuación cierre el plan (registre el resultado en este SUMMARY y complete el `state`/`roadmap` update final).

## Next Phase Readiness

- El código de `negocioScoped.ts` está completo, compila limpio, y es estructuralmente correcto (11/11 accessors operacionales usan `negocio_id`; `negocio()` usa su FK legítimo). Los planes 03-03/03-04/03-05 (que consumen esta capa desde el lado del bot) pueden construirse sobre este contrato con confianza estructural.
- **Bloqueante para cerrar 03-02 completamente:** falta la verificación en vivo (Task 3) contra `bdgufnitakelyialjoqg`. Hasta que el usuario provea `.env` y corra el smoke test, este plan queda en estado "checkpoint" — no se debe asumir que el aislamiento cross-negocio fue probado en vivo, solo que es estructuralmente correcto por inspección de código y typecheck.

---
*Phase: 03-motor-de-disponibilidad*
*Completed (código): 2026-07-05 — Task 3 pendiente de checkpoint humano*

## Self-Check: PASSED

- FOUND: apps/bot/src/db/negocioScoped.ts
- FOUND: apps/bot/src/db/negocioScoped.test.ts
- CONFIRMED ABSENT: apps/bot/src/db/tenantScoped.ts
- FOUND commit: 8533140 (Task 1)
- FOUND commit: adec798 (Task 2)
