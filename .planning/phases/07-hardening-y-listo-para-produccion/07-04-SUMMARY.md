---
phase: 07-hardening-y-listo-para-produccion
plan: 04
subsystem: verificación / hardening
tags: [concurrencia, gist-exclude, bookAppointment, sec-02, live-db-script]
dependency-graph:
  requires: [CORE-05, AVAIL-03]
  provides: [SEC-02]
  affects: [scripts/verify-concurrent-booking.ts]
tech-stack:
  added: []
  patterns:
    - "freshData compartido por referencia entre N llamadas concurrentes (Pitfall 4)"
    - "Promise.allSettled sobre bookAppointment con assertion EXACTA (nunca 'al menos 1')"
key-files:
  created:
    - scripts/verify-concurrent-booking.ts
  modified: []
decisions:
  - "Invocación canónica real requiere --env-file=.env: `pnpm exec tsx --env-file=.env scripts/verify-concurrent-booking.ts` (tsx no auto-carga .env; mismo patrón ya establecido por scripts/verify-whatsapp-webhook.ts en 05-VERIFICATION.md, no documentado literal en el texto del plan)"
metrics:
  duration: "20 min"
  completed: 2026-07-09
status: complete
---

# Phase 7 Plan 04: Verificación en vivo de anti-doble-reserva concurrente (SEC-02) Summary

Script gated `scripts/verify-concurrent-booking.ts` que dispara 10 llamadas concurrentes a `bookAppointment` sobre el MISMO slot compartiendo un único `freshData`, probando en vivo contra `bdgufnitakelyialjoqg` que la GiST EXCLUDE decide exactamente 1 ganador (3/3 corridas deterministas).

## What Was Built

`scripts/verify-concurrent-booking.ts` — copia verbatim el esqueleto de aislamiento (env + guard `bdgufnitakelyialjoqg`), los helpers de fecha (`arWallClockToUtcIso`/`findTargetMonday`/`dateStrFromUtcNoon`) y el idiom de seed/cleanup de servicio+horario de prueba de `scripts/verify-reschedule.ts`. Flujo:

1. Siembra un servicio + horario de prueba para `TENANT_A` (lunes futuro, 09:00-13:00 AR).
2. Fetchea `freshData: AvailabilityData` **una sola vez** (negocio + horarios/bloqueos/turnos/servicios vía `Promise.all`), scopeado a `NEGOCIO_ID`.
3. Dispara `N=10` llamadas concurrentes a `bookAppointment(...)` sobre el mismo slot (09:00-09:30 AR), pasando el **mismo objeto `freshData` por referencia** a las 10 (Pitfall 4 de 07-RESEARCH.md — nunca re-fetchear por llamada, o el chequeo en memoria de `computeSlots` cortocircuita la carrera antes de llegar a la GiST EXCLUDE real).
4. Asserta **EXACTAMENTE** `oks.length === 1 && slotTaken.length === N - 1` (nunca "al menos 1"), distinguiendo en el reporte de fallo `slot_taken` de cualquier `reason` inesperado (`insert_error`) y de llamadas `rejected`.
5. Limpia el/los turno(s) ganador(es) y el servicio/horario sembrados, dejando el estado idempotente para reruns.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] `pnpm exec tsx scripts/verify-concurrent-booking.ts` (comando literal del plan) no carga `.env`**
- **Found during:** Task 2 (checkpoint live)
- **Issue:** `tsx@4.23.0` no auto-carga archivos `.env` — el comando exacto que el plan escribe en `<action>`/`<how-to-verify>`/`<verify><automated>` (`pnpm exec tsx scripts/verify-concurrent-booking.ts`, sin `--env-file`) aborta inmediatamente con "FALTAN SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en .env" porque `process.env` nunca ve las credenciales de `.env`.
- **Fix:** Se usó `pnpm exec tsx --env-file=.env scripts/verify-concurrent-booking.ts` — mismo patrón ya documentado como precedente en este repo (`05-VERIFICATION.md` línea 70, para `verify-whatsapp-webhook.ts`). No requiere cambios al script en sí (el guard/lógica ya asumen `process.env` poblado por quien invoca); es puramente el flag de invocación.
- **Files modified:** ninguno (solo la invocación usada al correr el checkpoint)
- **Commit:** n/a (no cambia código versionado)

Or: sin más deviaciones — el script en sí se escribió exactamente como especifica el plan (guard inline, `freshData` compartido, assertion exacta, cleanup).

## Checkpoint Live Results (Task 2)

Corrido **3 veces** (el plan pedía 2 para descartar flakiness) contra `bdgufnitakelyialjoqg`, con `.env` real:

| Corrida | Resultado | Éxitos | slot_taken | Exit code |
|---------|-----------|--------|------------|-----------|
| 1       | PASSED    | 1/10   | 9/10       | 0         |
| 2       | PASSED    | 1/10   | 9/10       | 0         |
| 3       | PASSED    | 1/10   | 9/10       | 0         |

Las 3 corridas fueron deterministas: exactamente 1 `{ok:true}` y 9 `{ok:false, reason:"slot_taken"}` en cada una, decidido por la GiST EXCLUDE `turno_no_overlap` (23P01) — no por el chequeo en memoria de `computeSlots` (que el `freshData` compartido garantiza que todas las 10 llamadas pasan). Cleanup verificado implícitamente: cada corrida subsiguiente pudo re-insertar el `servicio`/`horario_trabajo` de prueba con el mismo `id` sin conflicto de PK, confirmando que la corrida anterior no dejó residuos.

## Self-Check

- `scripts/verify-concurrent-booking.ts` existe y contiene guard `bdgufnitakelyialjoqg`, `Promise.allSettled`, `bookAppointment`, `slot_taken` (chequeo automatizado del plan, Task 1 `<verify>`).
- Commit `8cfda09` presente en `git log`.
- 3 corridas live contra la DB real, todas PASSED con exactamente 1 ganador.

## Threat Flags

Ninguno — no se introduce superficie nueva (mismo `bookAppointment` ya existente, cero endpoints/rutas nuevas, cero cambios de schema).
