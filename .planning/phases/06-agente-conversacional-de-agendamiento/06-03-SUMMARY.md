---
phase: 06-agente-conversacional-de-agendamiento
plan: 03
subsystem: api
tags: [ai-sdk, zod, vercel-ai-sdk, computeSlots, autoAssign, negocioScoped, tool-calling]

# Dependency graph
requires:
  - phase: 06-01
    provides: cancelAppointment/uuidLike exportados desde @turnosbot/availability-engine
  - phase: 06-02
    provides: buildBotAvailabilityData.ts, systemPrompt.ts, conversationState.ts
provides:
  - "buscarHorariosTool(negocioId, deps?) — tool de lectura que envuelve computeSlots"
  - "asignarProfesionalTool(negocioId, deps?) — tool de lectura que envuelve autoAssign"
  - "consultarNegocioTool(negocioId, clienteId, deps?) — tool de lectura para precios/horarios/estado de turno"
  - "autoAssign reexportado desde el barrel de @turnosbot/availability-engine (antes solo interno)"
affects: [06-04, 06-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Tool factory con negocioId (y clienteId cuando aplica) closure-captured, nunca en el inputSchema del modelo (D-13/BOT-11)"
    - "Deps opcional inyectable con default real (computeSlots/autoAssign/buildBotAvailabilityData/negocioScoped reales por defecto, fakes en tests)"
    - "uuidLike (regex de forma) reusado del barrel del motor en vez de z.uuid() estricto"

key-files:
  created:
    - apps/bot/src/conversation/tools/buscarHorarios.ts
    - apps/bot/src/conversation/tools/buscarHorarios.test.ts
    - apps/bot/src/conversation/tools/asignarProfesional.ts
    - apps/bot/src/conversation/tools/asignarProfesional.test.ts
    - apps/bot/src/conversation/tools/consultarNegocio.ts
    - apps/bot/src/conversation/tools/consultarNegocio.test.ts
  modified:
    - packages/availability-engine/src/index.ts

key-decisions:
  - "autoAssign se agregó al barrel público de @turnosbot/availability-engine (Rule 3: el plan asumía que ya estaba exportado para que asignarProfesional.ts lo importe 'del barrel', pero index.ts solo tenía computeSlots/bookAppointment/rescheduleAppointment/cancelAppointment/uuidLike)"
  - "buscarHorarios devuelve TODOS los slots que computeSlots calculó dentro de la ventana de reserva (no trunca a 2-3 en la tool) — el filtrado a un puñado de opciones concretas para no abrumar al cliente por WhatsApp es responsabilidad del prompt/modelo (systemPrompt.ts), no de la tool, que debe seguir siendo la única fuente de verdad de disponibilidad real sin post-proceso (D-12)"
  - "consultarNegocio con tipo horarios_profesional sin profesionalId devuelve bloques:[] en vez de lanzar (defensivo ante un modelo que omita el campo opcional, sin bloquear la respuesta)"

requirements-completed: [BOT-01, BOT-02, BOT-03, BOT-05, BOT-06, BOT-07, BOT-08]

# Metrics
duration: 20min
completed: 2026-07-07
---

# Phase 6 Plan 03: Tools de lectura del agente (buscarHorarios/asignarProfesional/consultarNegocio) Summary

**Tres tools de lectura del agente conversacional — buscarHorarios (wraps computeSlots), asignarProfesional (wraps autoAssign puro), consultarNegocio (precios/horarios/estado de turno vía negocioScoped con snapshots congelados) — todas cerradas sobre negocioId/clienteId sin exponerlos al modelo.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-07-07T18:15:27-03:00 (tras dd210a4, cierre de 06-02)
- **Completed:** 2026-07-07T18:29:34-03:00
- **Tasks:** 2
- **Files modified:** 7 (6 nuevos + 1 modificado)

## Accomplishments
- `buscarHorariosTool` entrega disponibilidad REAL calculada por `computeSlots` (nunca inventada, D-12), con `inputSchema` validado por `uuidLike` + regex `YYYY-MM-DD`, sin `negocioId` como campo del modelo.
- `asignarProfesionalTool` resuelve "sin preferencia" delegando 100% en `autoAssign` (D-04) — arma el mapa slots-por-profesional y no reimplementa ninguna heurística de selección.
- `consultarNegocioTool` responde precios (BOT-05), horarios de profesionales (BOT-06) y estado de turnos existentes del cliente actual (BOT-08) — todo vía `negocioScoped(negocioId)`, con el estado de turno leyendo los `turno_servicio.*_snapshot` congelados (nunca `servicio.precio` vivo, Pattern 6/T-06-10) y filtrado SIEMPRE por el `clienteId` cerrado en la closure (T-06-07).
- `autoAssign` quedó reexportado desde el barrel público de `@turnosbot/availability-engine`, cerrando un gap descubierto al implementar la Task 1.

## Task Commits

Each task was committed atomically:

1. **Task 1: tool buscarHorarios (computeSlots) + asignarProfesional (autoAssign)** - `3958487` (feat)
2. **Task 2: tool consultarNegocio — precios / horarios profesionales / estado de turno (BOT-05/06/08)** - `8b62a97` (feat)

**Plan metadata:** (pending — this commit)

## Files Created/Modified
- `apps/bot/src/conversation/tools/buscarHorarios.ts` - factory `buscarHorariosTool(negocioId, deps?)`, wraps `computeSlots` vía `buildBotAvailabilityData`
- `apps/bot/src/conversation/tools/buscarHorarios.test.ts` - 4 casos del bloque `<behavior>`, `computeSlots` real sobre fixtures
- `apps/bot/src/conversation/tools/asignarProfesional.ts` - factory `asignarProfesionalTool(negocioId, deps?)`, wraps `autoAssign` puro
- `apps/bot/src/conversation/tools/asignarProfesional.test.ts` - 2 casos (resultado igual a `autoAssign` real, mapa vacío → null sin lanzar)
- `apps/bot/src/conversation/tools/consultarNegocio.ts` - factory `consultarNegocioTool(negocioId, clienteId, deps?)`, ramifica por `tipo` (precios/horarios_profesional/estado_turno) vía `negocioScoped`
- `apps/bot/src/conversation/tools/consultarNegocio.test.ts` - 5 casos del bloque `<behavior>`, incluido el aislamiento cross-cliente
- `packages/availability-engine/src/index.ts` - agrega `export { autoAssign } from "./autoAssign.js";`

## Decisions Made
- `autoAssign` se agregó al barrel público del motor (ver `key-decisions` en el frontmatter) — antes era un primitivo interno no reexportado; ahora `asignarProfesional.ts` del bot lo importa desde `@turnosbot/availability-engine` tal como el plan lo especificaba.
- `buscarHorarios` no trunca la lista de slots que devuelve — devuelve el resultado completo de `computeSlots` y deja que el prompt/modelo decida cómo presentar 2-3 opciones al cliente (D-03), preservando a la tool como única fuente de verdad sin post-proceso que pueda introducir un dato no verificado.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `autoAssign` no estaba exportado desde el barrel público del motor**
- **Found during:** Task 1 (implementación de `asignarProfesional.ts`)
- **Issue:** El plan (`<action>` de Task 1) instruye envolver `autoAssign` "importado del barrel", pero `packages/availability-engine/src/index.ts` solo reexportaba `computeSlots`/`bookAppointment`/`rescheduleAppointment`/`cancelAppointment`/`uuidLike` — `autoAssign` era un primitivo interno (documentado explícitamente como "NO se re-exporta" en el comentario de cabecera del barrel, escrito antes de que existiera este consumidor externo). El test de `asignarProfesionalTool` fallaba con `TypeError: deps.autoAssign is not a function` porque el import resolvía a `undefined`.
- **Fix:** Se agregó `export { autoAssign } from "./autoAssign.js";` al barrel y se actualizó el comentario de cabecera para reflejar el nuevo consumidor (Fase 6 Plan 03).
- **Files modified:** `packages/availability-engine/src/index.ts`
- **Verification:** `pnpm --filter @turnosbot/availability-engine build` + `pnpm --filter @turnosbot/availability-engine test` (60/60 verdes) + los 6 tests de `asignarProfesional.test.ts`/`buscarHorarios.test.ts` verdes.
- **Committed in:** `3958487` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Fix necesario para completar el plan tal como estaba escrito (el plan asumía la exportación existente). Sin scope creep — no se tocó ninguna otra parte del motor.

## Issues Encountered
- Las tools importan `buildBotAvailabilityData.ts`/`negocioScoped.ts` transitivamente, lo cual arrastra `apps/bot/src/db/client.ts` — este módulo lanza sincrónicamente en import-time si `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` no están seteadas (no lo están en este entorno de test). Resuelto con `vi.mock("../../db/client.js", () => ({ supabaseAdmin: {} }))` en los tres archivos de test, el mismo fix ya usado en `apps/bot/src/queue/inboundWorker.test.ts` — no es un problema nuevo, es el patrón ya establecido del repo.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Las tres tools de lectura quedan listas para registrarse en el tool-loop de `responder.ts` (plan 06-05), junto con las tools de escritura (`confirmarTurno`/`reagendarTurno`/`cancelarTurno`) que produce el plan 06-04.
- Sin bloqueadores. `apps/bot` typecheck verde (`tsc --noEmit`), suite completa del bot verde (55/55 tests, 11 archivos), suite del motor verde (60/60 tests).

---
*Phase: 06-agente-conversacional-de-agendamiento*
*Completed: 2026-07-07*
