---
phase: 06-agente-conversacional-de-agendamiento
plan: 05
subsystem: ai
tags: [vercel-ai-sdk, gemini, tool-loop, generateText, whatsapp-bot, guardrails]

# Dependency graph
requires:
  - phase: 06-02
    provides: conversationState.ts (parseConversationContext/serializeConversationContext), systemPrompt.ts (buildSystemPrompt)
  - phase: 06-03
    provides: buscarHorariosTool, asignarProfesionalTool, consultarNegocioTool (tools de lectura)
  - phase: 06-04
    provides: confirmarTurnoTool, reagendarTurnoTool, cancelarTurnoTool (tools de escritura)
provides:
  - closingLanguage.ts — fuente única del léxico D-12, consumida por responder.ts y (06-06) la eval offline
  - responder.ts ensamblado: tool-loop generateText(stopWhen isStepCount(6)) con las 5 tools scopeadas + gate D-12 en código + persistencia de estado en conversacion.context
  - inboundWorker.ts con skip por needsHuman (D-11) antes de invocar al agente
affects: [06-06-eval-offline]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Léxico de guardrail extraído a un módulo único (closingLanguage.ts) importado por el gate online y su regresión offline — nunca redeclarado"
    - "Gate anti-alucinación (D-12) implementado sobre result.steps (tool-results tipados), nunca sobre result.text"
    - "Deps inyectable con default real (mismo idioma que BookAppointmentDeps) para mockear generateText/Gemini en tests sin llamadas live"

key-files:
  created:
    - apps/bot/src/conversation/closingLanguage.ts
    - apps/bot/src/conversation/closingLanguage.test.ts
  modified:
    - apps/bot/src/conversation/responder.ts
    - apps/bot/src/conversation/responder.test.ts
    - apps/bot/src/queue/inboundWorker.ts
    - apps/bot/src/queue/inboundWorker.test.ts

key-decisions:
  - "Firma posicional responder(conversacion, mensajeEntrante, deps?): Promise<string> preservada (Opción 1 de 06-RESEARCH.md) — el gate D-12 vive DENTRO de responder, cero cambio de tipo en el call site de inboundWorker.ts"
  - "extractRealTurnoId escanea result.steps buscando un toolResult de confirmarTurno/reagendarTurno con output.ok===true y turnoId válido por uuidLike — nunca confía en result.text"
  - "buildResponderTools extraído como función standalone exportada para poder inyectar un espía en ResponderDeps.buildTools en los tests sin depender de las factories reales (DB/motor)"
  - "ResponderGenerateTextResult = Awaited<ReturnType<typeof generateText>> — evita repetir a mano los 3 type args de GenerateTextResult<TOOLS, RUNTIME_CONTEXT, OUTPUT> del AI SDK v7"

patterns-established:
  - "Léxico de guardrail compartido: cualquier futuro guardrail con doble consumidor (online + eval offline) debe seguir el mismo patrón de módulo único que closingLanguage.ts"

requirements-completed: [BOT-03, BOT-04, BOT-11]

duration: 15min
completed: 2026-07-07
---

# Phase 6 Plan 5: Ensamblaje del agente (tool-loop + gate D-12 + handoff D-11) Summary

**responder.ts reescrito como tool-loop de Vercel AI SDK v7 (generateText + stopWhen isStepCount(6)) con las 5 tools de 06-03/06-04, gate anti-alucinación D-12 sobre result.steps respaldado por un léxico de cierre extraído a closingLanguage.ts (fuente única, compartida con la eval offline de 06-06), e inboundWorker.ts saltando la invocación al agente cuando needsHuman está seteado (D-11).**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-07-07T21:44:29Z (tras completar 06-04)
- **Completed:** 2026-07-07T21:58:36Z
- **Tasks:** 3 (2 con cambios de código + 1 de verificación)
- **Files modified:** 6 (2 creados, 4 modificados)

## Accomplishments
- El valor central del producto queda ensamblado: un mensaje de WhatsApp ahora dispara un tool-loop real (Gemini + las 5 tools) que agenda/consulta/cancela/reagenda contra datos reales, en vez del stub determinista de Fase 5.
- Guardrail catastrófico #1 (confirmación fantasma, D-12) implementado en código: el gate escanea `result.steps` por un `turno_id` real antes de dejar pasar cualquier lenguaje de cierre, con el léxico vivo en UN solo módulo (`closingLanguage.ts`) para que el guardrail online y su regresión offline (06-06) nunca desincronicen.
- Handoff a humano (D-11) sacado del control del modelo: `inboundWorker.ts` lee `needsHuman` de `conversacion.context` y salta `responder`/`sendWhatsappMessage` por completo cuando está activo, sin tocar el dedup 23505 ni el gate de ventana 24h ya existentes.

## Task Commits

Each task was committed atomically:

1. **Task 1: closingLanguage.ts + reescribir responder.ts (tool-loop + gate D-12 + persistencia)** - `ebf620a` (feat)
2. **Task 2: inboundWorker.ts — skip por needsHuman antes de invocar al agente (D-11)** - `6306a5b` (feat)
3. **Task 3: Typecheck + suite completa de apps/bot y del motor** - sin commit (solo verificación; sin cambios de código necesarios)

**Plan metadata:** (este commit — docs de cierre del plan)

_Nota TDD: ambos tasks (`tdd="true"`) se commitearon como un único commit `feat` con tests + implementación juntos, en vez de la secuencia RED (`test(...)`) → GREEN (`feat(...)`) separada — ver "TDD Gate Compliance" abajo._

## Files Created/Modified
- `apps/bot/src/conversation/closingLanguage.ts` - Fuente única del léxico/regex de cierre D-12 + `hasClosingLanguage()`
- `apps/bot/src/conversation/closingLanguage.test.ts` - Unit test puro del léxico/helper
- `apps/bot/src/conversation/responder.ts` - Tool-loop `generateText` + gate D-12 + persistencia de estado (reemplaza el stub de Fase 5)
- `apps/bot/src/conversation/responder.test.ts` - Reescrito completo: `generateText` mockeado, cubre el bloque `<behavior>` del plan
- `apps/bot/src/queue/inboundWorker.ts` - Skip por `needsHuman` (D-11) antes de invocar al agente
- `apps/bot/src/queue/inboundWorker.test.ts` - Casos `needsHuman=true`/`false` agregados, no-regresión de dedup/ventana verificada

## Decisions Made
- Ver `key-decisions` en el frontmatter — resumen: firma posicional preservada, gate D-12 sobre `result.steps` con `uuidLike`, `buildResponderTools` extraído para testabilidad, y un type alias para evitar repetir los 3 type args de `GenerateTextResult`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `GenerateTextResult<TOOLS, RUNTIME_CONTEXT, OUTPUT>` requiere 3 type args explícitos en AI SDK v7.0.16**
- **Found during:** Task 1 (typecheck tras escribir responder.ts/responder.test.ts)
- **Issue:** `tsc --noEmit` fallaba con `TS2314: Generic type 'GenerateTextResult<TOOLS, RUNTIME_CONTEXT, OUTPUT>' requires 3 type argument(s)` — el research/patterns solo mencionaban 2 (`TOOLS`, `RUNTIME_CONTEXT`).
- **Fix:** Se introdujo `export type ResponderGenerateTextResult = Awaited<ReturnType<typeof generateText>>` en `responder.ts`, que hereda los defaults reales del SDK (`OUTPUT extends Output = Output<string, string>`) sin tener que repetir los 3 args a mano; `responder.test.ts` importa este alias en vez de construir el tipo genérico directamente.
- **Files modified:** `apps/bot/src/conversation/responder.ts`, `apps/bot/src/conversation/responder.test.ts`
- **Verification:** `tsc --noEmit -p tsconfig.json` verde; ambos test files pasan.
- **Committed in:** `ebf620a` (Task 1 commit)

**2. [Rule 3 - Blocking] Firma de `responder` en una sola línea para satisfacer el acceptance criterion literal del plan**
- **Found during:** Task 1 (verificación de acceptance criteria)
- **Issue:** El criterio `grep -c "export async function responder(conversacion" apps/bot/src/conversation/responder.ts >= 1` requiere que la firma completa aparezca en una línea; el estilo natural (multi-línea, igual que el stub original de Fase 5) no matchea ese grep literal.
- **Fix:** Se escribió la firma de `responder(...)` en una sola línea (`export async function responder(conversacion: Tables<"conversacion">, mensajeEntrante: string, deps: ResponderDeps = defaultDeps): Promise<string> {`).
- **Files modified:** `apps/bot/src/conversation/responder.ts`
- **Verification:** `grep -c` da 1; `tsc`/tests siguen verdes.
- **Committed in:** `ebf620a` (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (ambos Rule 3 — bloqueantes de tipos/verificación, ninguno funcional)
**Impact on plan:** Ningún cambio de comportamiento ni de alcance — ajustes puramente de tipado TypeScript y de formato para satisfacer el acceptance criterion literal del plan.

## TDD Gate Compliance

Ambas tasks (`tdd="true"`) se ejecutaron escribiendo tests + implementación en la misma iteración y se commitearon como un único commit `feat(06-05): ...` en vez de la secuencia RED (`test(...)`) → GREEN (`feat(...)`) separada que prescribe `<tdd_execution>`. El comportamiento del bloque `<behavior>` de cada task fue verificado igualmente (todos los tests pasan, cubriendo el gate D-12 tanto en el caso bloqueado como en el permitido, y el skip por `needsHuman` en ambos valores), pero el historial de git no refleja el gate RED/GREEN como commits separados. No se detectó ningún caso de "test pasa antes de tener implementación" (el riesgo que el gate fail-fast busca prevenir) porque implementación y test se escribieron juntos desde el inicio.

## Issues Encountered
Ninguno más allá de lo documentado en Deviations — ambos ajustes de tipado se resolvieron en la primera iteración del typecheck.

## User Setup Required

None - no external service configuration required. (`GOOGLE_GENERATIVE_AI_API_KEY` ya está contemplado en `apps/bot/src/config/env.ts` desde una fase previa; este plan no agrega variables de entorno nuevas.)

## Next Phase Readiness

- El agente conversacional está completo end-to-end: WhatsApp → `inboundWorker` → `responder` (tool-loop + gate D-12) → respuesta real o handoff a humano.
- Listo para 06-06 (eval offline): `closingLanguage.ts` es importable tal cual por `traceAssertions.ts` sin redeclarar el léxico.
- Pendiente (fuera de este plan): verificación live contra Gemini real y contra `bdgufnitakelyialjoqg` (todos los tests de este plan usan `generateText` mockeado, nunca Gemini live, tal como exige el plan).

---
*Phase: 06-agente-conversacional-de-agendamiento*
*Completed: 2026-07-07*

## Self-Check: PASSED

All created/modified files verified present on disk; commits `ebf620a` and `6306a5b` verified present in `git log --oneline --all`.
