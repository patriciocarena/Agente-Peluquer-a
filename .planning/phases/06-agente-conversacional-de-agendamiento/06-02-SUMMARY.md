---
phase: 06-agente-conversacional-de-agendamiento
plan: 02
subsystem: ai
tags: [ai-sdk-v7, gemini, vercel-ai-sdk, conversation-state, system-prompt, availability-engine, negocioScoped]

# Dependency graph
requires:
  - phase: 06-01
    provides: cancelAppointment en @turnosbot/availability-engine (base compartida de escritura)
  - phase: 05
    provides: findOrCreateConversacion.ts (contrato abierto de conversacion.context), negocioScoped.ts, whatsapp/payload.ts (patrón de parsing defensivo)
  - phase: 04
    provides: apps/dashboard/lib/availability-data.ts (analog de buildAvailabilityData que buildBotAvailabilityData espeja)
  - phase: 03
    provides: "@turnosbot/availability-engine — AvailabilityData, computeSlots, tipos"
provides:
  - "ai, @ai-sdk/google, @turnosbot/availability-engine, promptfoo instalados en apps/bot"
  - "parseConversationContext/serializeConversationContext (de)serialización defensiva de conversacion.context"
  - "buildSystemPrompt() — system prompt fijo con guardrails D-01/05/06/08/12/13 y few-shots"
  - "buildBotAvailabilityData(negocioId, deps?) — AvailabilityData scopeado 100% vía negocioScoped"
affects: [06-03, 06-04, 06-05, evaluación/promptfoo]

# Tech tracking
tech-stack:
  added: ["ai@^7.0.16", "@ai-sdk/google@^4.0.8", "@turnosbot/availability-engine@workspace:* (nueva dep de apps/bot)", "promptfoo (devDependency)"]
  patterns:
    - "Parsing defensivo de columnas jsonb sin schema (parseConversationContext nunca lanza, cae a defaults seguros — mismo criterio que whatsapp/payload.ts)"
    - "System prompt puro sin interpolación de ids internos (D-13) — el scope de negocio vive solo en closures de tools, nunca en el texto del prompt"
    - "Deps opcional inyectable con default real (BuildBotAvailabilityDataDeps) para testear sin DB real, mismo patrón que ProcessInboundWhatsappEventDeps/BookAppointmentDeps"

key-files:
  created:
    - apps/bot/src/conversation/conversationState.ts
    - apps/bot/src/conversation/conversationState.test.ts
    - apps/bot/src/conversation/systemPrompt.ts
    - apps/bot/src/conversation/buildBotAvailabilityData.ts
  modified:
    - apps/bot/package.json
    - pnpm-lock.yaml

key-decisions:
  - "buildBotAvailabilityData toma negocioRes.data?.[0] porque negocioScoped().negocio() filtra por tenant_id (no negocio_id) y puede devolver más de una fila por tenant — se documenta explícitamente para no romperlo en el futuro (Pitfall 3 de negocioScoped.ts)"
  - "systemPrompt.ts evita el literal 'negocioId' incluso en comentarios de cabecera para satisfacer el grep de acceptance criteria (D-13) sin perder la documentación del porqué"

requirements-completed: [BOT-01, BOT-02, BOT-11]

# Metrics
duration: 22min
completed: 2026-07-07
---

# Phase 06 Plan 02: Fundación del agente conversacional (conversationState/systemPrompt/buildBotAvailabilityData) Summary

**Deps del AI SDK v7 instaladas en apps/bot + tres módulos puros (parse/serialize de conversacion.context, system prompt con guardrails D-01/05/06/08/12/13, y ensamblador de AvailabilityData 100% scopeado vía negocioScoped) que todo el tool-loop de los planes 06-03/06-04/06-05 va a importar.**

## Performance

- **Duration:** 22 min
- **Started:** 2026-07-07T20:50:00Z (aprox.)
- **Completed:** 2026-07-07T21:12:10Z
- **Tasks:** 3 completed
- **Files modified:** 6 (4 creados, 2 modificados)

## Accomplishments
- `ai@^7.0.16`, `@ai-sdk/google@^4.0.8` y `@turnosbot/availability-engine@workspace:*` resuelven en `apps/bot`; `promptfoo` disponible como devDependency para el plan de evaluación
- `parseConversationContext`/`serializeConversationContext` con TDD RED→GREEN completo: 8 tests verdes cubriendo `{}`, `null`, `undefined`, shape válido, `messages` malformado y `needsHuman` malformado, todos sin lanzar
- `buildSystemPrompt()` produce un system prompt puro (sin negocioId ni ningún id interno interpolado) con voz AR informal (D-01), boundary de dominio (D-05), regla anti-fantasma D-12 (léxico de cierre prohibido sin tool), confirmación explícita de cancelación (D-08), derivación a humano (D-06), framing anti-injection (D-13) y 3 few-shots inline (D-02/D-06/D-08)
- `buildBotAvailabilityData(negocioId, deps?)` arma `AvailabilityData` completo con un único `Promise.all` de 5 lecturas, todas vía `negocioScoped(negocioId)` — cero acceso raw a `supabaseAdmin.from`/`createClient`

## Task Commits

Each task was committed atomically:

1. **Task 1: Instalar dependencias del AI SDK en apps/bot** - `9fbc2cc` (feat)
2. **Task 2 (RED): add failing test for parseConversationContext/serializeConversationContext** - `6376b7c` (test)
2. **Task 2 (GREEN): implementar parseConversationContext/serializeConversationContext** - `6f653ee` (feat)
3. **Task 3: systemPrompt.ts + buildBotAvailabilityData.ts** - `c619976` (feat)

_TDD task (Task 2) tiene 2 commits (test → feat); no hubo refactor necesario._

## Files Created/Modified
- `apps/bot/package.json` - agrega ai/@ai-sdk/google/@turnosbot/availability-engine (runtime) y promptfoo (dev)
- `pnpm-lock.yaml` - lockfile actualizado con las nuevas deps y su árbol transitivo (incluye Playwright, dependencia de promptfoo)
- `apps/bot/src/conversation/conversationState.ts` - `ConversationContext` type + `parseConversationContext`/`serializeConversationContext`, puro, nunca lanza
- `apps/bot/src/conversation/conversationState.test.ts` - 8 tests (6 del bloque behavior + 2 de round-trip/serializable)
- `apps/bot/src/conversation/systemPrompt.ts` - `buildSystemPrompt()`, string fijo con guardrails + few-shots
- `apps/bot/src/conversation/buildBotAvailabilityData.ts` - `buildBotAvailabilityData(negocioId, deps?)`, análogo de `buildAvailabilityData` del dashboard vía `negocioScoped`

## Decisions Made
- Se documentó explícitamente por qué `negocio()` requiere `.data?.[0]` en vez de `.single()` (filtra por `tenant_id`, no `negocio_id` — Pitfall 3 de `negocioScoped.ts`), evitando que una futura "corrección" rompa el accessor.
- Se reformuló un comentario de cabecera de `systemPrompt.ts` para no contener el literal `negocioId` (aunque solo aparecía en prosa explicativa, no en el prompt en sí) y así cumplir estrictamente el acceptance criteria `grep -c "negocioId" == 0` sin perder la documentación de la regla D-13.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required

None para esta plan — la verificación live de Gemini (declarada en `user_setup` del frontmatter) se ejecuta en un plan posterior del tool-loop (06-05, responder real), no en esta fundación de módulos puros.

## Next Phase Readiness
- `conversationState.ts`, `systemPrompt.ts` y `buildBotAvailabilityData.ts` listos para ser importados sin scavenger hunt por los planes de tools (06-03/06-04) y el responder (06-05).
- `promptfoo` instalado, listo para el plan de evaluación (Section 5 del AI-SPEC).
- Ningún bloqueo — Wave 1 cerrada.

## Self-Check: PASSED

All created files and task commit hashes verified present on disk / in git log.

---
*Phase: 06-agente-conversacional-de-agendamiento*
*Completed: 2026-07-07*
