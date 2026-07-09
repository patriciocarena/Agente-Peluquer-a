---
phase: 07-hardening-y-listo-para-produccion
plan: 05
subsystem: testing
tags: [supabase, service_role, negocioScoped, multitenancy, cross-tenant-isolation, ai-sdk-tool]

# Dependency graph
requires:
  - phase: 06-agente-conversacional-de-agendamiento
    provides: consultarNegocioTool (BOT-05/06/08) y las 5 tools del bot sobre negocioScoped
provides:
  - Prueba en vivo de SEC-03 Success Criterion #3 -- las queries service_role del bot (negocioScoped) nunca devuelven filas del negocio equivocado
  - negocioScoped.test.ts extendido: 12/12 accessors de lectura cubiertos (antes solo turnos())
  - Chequeo a nivel tool (consultarNegocioTool) probando que una tool real del bot no filtra datos cross-negocio
affects: [07-hardening-y-listo-para-produccion, futuras fases que agreguen nuevos accessors a negocioScoped]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "negocioScoped.test.ts: loop sobre un array ReadAccessor tipado (12 accessors) en vez de bloques hard-coded por accessor; negocio() con predicado especial por row.id (su PK)"
    - "Cast pragmático accessorQuery(): un solo shape compartido {select} para llamar dinámicamente cualquiera de los 12 accessors sin pelear con el union-call de TypeScript"
    - "assert() como TS assertion function (asserts condition) -- permite narrowing del discriminated union ConsultarNegocioResult tras cada assert, sin ternarios"

key-files:
  created: []
  modified:
    - apps/bot/src/db/negocioScoped.test.ts

key-decisions:
  - "Se extendió negocioScoped.test.ts (camino service_role), NO scripts/verify-isolation.ts (camino RLS/anon+JWT) -- son dos codepaths distintos, Pitfall 6 de 07-RESEARCH.md"
  - "negocio() se assertea por row.id === negocioId (su PK propia) -- no tiene columna negocio_id"
  - "Los accessors sin seed data (mensajes, recordatorios) pasan vacuamente (0 filas = 0 fugas) -- comportamiento esperado, no un fallo del test"
  - "Los servicio ids del negocio B para el chequeo tool se leen en vivo (negocioScoped(B).servicios()), nunca hardcodeados"

patterns-established:
  - "Extender un smoke test tsx existente a N accessors: array tipado + loop + cast pragmático, en vez de N bloques copy-pasted"

requirements-completed: [SEC-03]

coverage:
  - id: D1
    description: "negocioScoped(A).<cada uno de los 12 accessors de lectura>() nunca devuelve filas del negocio B (y simétricamente B nunca devuelve filas de A)"
    requirement: "SEC-03"
    verification:
      - kind: other
        ref: "pnpm exec tsx --env-file=.env apps/bot/src/db/negocioScoped.test.ts (24 aserciones OK, exit 0)"
        status: pass
    human_judgment: false
  - id: D2
    description: "consultarNegocioTool con contexto del negocio A nunca surfacea ids/datos del negocio B (tipo:'precios')"
    requirement: "SEC-03"
    verification:
      - kind: other
        ref: "pnpm exec tsx --env-file=.env apps/bot/src/db/negocioScoped.test.ts (bloque final: cero overlap de servicio ids con el negocio B, exit 0)"
        status: pass
    human_judgment: false

duration: 15min
completed: 2026-07-09
status: complete
---

# Phase 07 Plan 05: SEC-03 negocioScoped Cross-Tenant Isolation Live Test Summary

**negocioScoped.test.ts extendido de 1 a 12 accessors de lectura + chequeo a nivel tool (consultarNegocioTool), corrido en vivo contra bdgufnitakelyialjoqg con cero fugas cross-negocio.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-07-09T21:11:00Z (aprox.)
- **Completed:** 2026-07-09T21:24:46Z
- **Tasks:** 3 (2 `auto` + 1 `checkpoint:human-verify`)
- **Files modified:** 1

## Accomplishments

- `negocioScoped.test.ts` ahora ejercita los 12 accessors de lectura de `negocioScoped` (antes solo `turnos()`), con un loop tipado sobre un array `READ_ACCESSORS` en vez de bloques copy-pasted.
- `negocio()` (caso especial sin columna `negocio_id`, filtra por su propia PK `id`) tiene su propio predicado de assert (`row.id`, no `row.negocio_id`).
- Aislamiento simétrico probado: pasada completa con negocio A (contra B) y pasada completa con negocio B (contra A).
- Chequeo a nivel tool agregado: `consultarNegocioTool(NEGOCIO_A_ID, CLIENTE_A_ID).execute({tipo:'precios'})` no devuelve ningún servicio del negocio B (ids del negocio B derivados en vivo, no hardcodeados).
- Corrida en vivo contra `bdgufnitakelyialjoqg` (Task 3): **26 aserciones OK, exit 0, "negocioScoped.test.ts: PASSED"**, cero fugas cross-negocio en las 24 combinaciones accessor×negocio + el chequeo de la tool.

## Task Commits

Cada task se commiteó atómicamente:

1. **Task 1: Extender negocioScoped.test.ts a los 12 accessors de lectura** - `3fd9c81` (test)
2. **Task 2: Agregar chequeo a nivel tool del bot (consultarNegocioTool)** - `3ccecd2` (test)
3. **Task 3: Correr negocioScoped.test.ts extendido en vivo** - sin commit (checkpoint de verificación, no modifica archivos) — corrido y confirmado PASSED/exit 0.

**Plan metadata:** (este commit — docs de cierre del plan)

## Files Created/Modified

- `apps/bot/src/db/negocioScoped.test.ts` - Extendido de 1 (`turnos()`) a 12 accessors de lectura + chequeo a nivel tool `consultarNegocioTool`; guard de aislamiento inline preexistente (`bdgufnitakelyialjoqg`) preservado sin duplicar.

## Decisions Made

- Se dividió la extensión en 2 commits atómicos (uno por task): Task 1 agrega el loop de los 12 accessors; Task 2 agrega el bloque del chequeo tool. Ambos tocan el mismo archivo, pero cada commit corresponde exactamente a una task del plan.
- `assert()` se tipó como TS assertion function (`asserts condition`) — mejora menor sobre el helper original que permite que TypeScript haga narrowing del discriminated union `ConsultarNegocioResult` después de cada `assert`, evitando un ternario/cast adicional. No cambia el comportamiento runtime (sigue siendo `console.error` + `process.exit(1)` en fallo).
- Se usó un cast pragmático (`accessorQuery`) para poder llamar dinámicamente cualquiera de los 12 accessors desde un loop tipado — TypeScript no permite invocar una unión de 12 funciones con firmas de retorno distintas (una por tabla) sin este tipo de cast. El cast solo afecta la forma en que el script *lee* `data`/`error`; no relaja ningún chequeo real de negocio_id.

## Deviations from Plan

None - plan ejecutado exactamente como estaba escrito. Los 2 tasks `auto` y el checkpoint se completaron sin desvíos de las rule 1-4 (ni bugs, ni funcionalidad crítica faltante, ni bloqueos, ni cambios arquitectónicos).

**Nota fuera de alcance (no un deviation de este plan):** Al correr `pnpm --filter @turnosbot/bot typecheck` para validar el archivo modificado, aparecieron 7 errores preexistentes en `responder.ts`/`confirmarTurno.ts`/`reagendarTurno.ts` (y sus tests) relacionados con `AvailableSlot.startIso`/`endIso` — confirmados preexistentes en `main` (vía `git stash` + re-run, mismos 7 errores antes de este plan). No relacionados con `negocioScoped.test.ts` (el único archivo en el scope de este plan), así que quedan fuera de alcance y **no se tocaron**. Documentado en `.planning/phases/07-hardening-y-listo-para-produccion/deferred-items.md` para una fase/quick-task futura.

## Issues Encountered

None - la corrida en vivo (Task 3) pasó en el primer intento, sin necesidad de debugging.

## User Setup Required

None - no se requiere configuración de servicio externo nueva. El `.env` real (SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY apuntando a `bdgufnitakelyialjoqg`) ya existía de fases previas y fue usado directamente para correr el script vía `pnpm exec tsx --env-file=.env apps/bot/src/db/negocioScoped.test.ts`.

## Next Phase Readiness

- SEC-03 Success Criterion #3 queda formalmente probado en vivo: el camino service_role del bot (negocioScoped + una tool real) nunca filtra datos cross-negocio, ni en los 12 accessors de lectura ni en `consultarNegocioTool`.
- Deferred: los 7 errores de typecheck preexistentes (`AvailableSlot.startIso`/`endIso`) en `apps/bot` deberían resolverse antes de shippear la Fase 7 -- ver `deferred-items.md`.

---
*Phase: 07-hardening-y-listo-para-produccion*
*Completed: 2026-07-09*

## Self-Check: PASSED

- FOUND: apps/bot/src/db/negocioScoped.test.ts
- FOUND: .planning/phases/07-hardening-y-listo-para-produccion/deferred-items.md
- FOUND: .planning/phases/07-hardening-y-listo-para-produccion/07-05-SUMMARY.md
- FOUND: commit 3fd9c81 (Task 1)
- FOUND: commit 3ccecd2 (Task 2)
