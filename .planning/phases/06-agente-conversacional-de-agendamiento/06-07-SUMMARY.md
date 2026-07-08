---
phase: 06-agente-conversacional-de-agendamiento
plan: 07
subsystem: bot
tags: [ai-sdk, gemini, generateText, tool-loop, conversation-memory, prompt-engineering]

requires:
  - phase: 06-agente-conversacional-de-agendamiento
    provides: "responder.ts (tool-loop generateText + gate D-12), systemPrompt.ts (D-01/05/06/08/12/13), plan 06-05/06-06"
provides:
  - "responder() persiste { role:'user', content: mensajeEntrante } en conversacion.context.messages en ambos caminos (feliz y error), restaurando memoria conversacional multi-turno"
  - "buildSystemPrompt() con instrucción positiva de narrar en texto el resultado de cualquier tool de consulta"
  - "Guard de código que garantiza que responder() nunca retorna una cadena vacía, con reintento SIEMPRE en tools:{} (imposibilita una segunda escritura durante el reintento)"
affects: [06-agente-conversacional-de-agendamiento, 06-UAT, whatsapp-bot-e2e]

tech-stack:
  added: []
  patterns:
    - "userMessage = { role:'user' as const, content: mensajeEntrante } declarado UNA vez al inicio de responder() y reutilizado en los 3 puntos de persistencia/uso (llamada a generateText, camino de error, camino feliz) — única fuente de verdad, evita drift entre lo que se envía al modelo y lo que se persiste"
    - "hadToolResult(steps) — helper puro que dispara un reintento defensivo ante CUALQUIER tool-result con texto vacío, indistintamente de si la tool fue de lectura o escritura; la garantía dura vive en que el reintento SIEMPRE usa tools:{} (nunca el toolset de escritura del primer intento), no en distinguir el tipo de tool"

key-files:
  created: []
  modified:
    - apps/bot/src/conversation/responder.ts
    - apps/bot/src/conversation/responder.test.ts
    - apps/bot/src/conversation/systemPrompt.ts
    - apps/bot/evals/promptfooconfig.test.ts

key-decisions:
  - "Gap 1: userMessage se antepone en el merge final (history + userMessage + messagesToPersist), NUNCA se muta result.response.messages ni se toca replaceLastAssistantText/el gate D-12 — mantiene esas dos piezas operando exactamente igual que antes"
  - "Gap 2b: el reintento por texto vacío SIEMPRE va con tools:{}, incluso cuando el tool-result que disparó el guard fue una escritura exitosa (confirmarTurno/reagendarTurno/cancelarTurno) — porque texto vacío evade el gate D-12 (hasClosingLanguage('') es falso) y ese escenario es real y alcanzable; tools:{} es la única garantía estructural contra una segunda escritura"
  - "El nudge sintético de reintento (EMPTY_TEXT_RETRY_NUDGE) nunca se persiste en conversacion.context.messages — solo se usa como el último mensaje de la llamada de reintento, descartado del messagesToPersist final"

requirements-completed: [BOT-01, BOT-04, BOT-05]

coverage:
  - id: D1
    description: "Un mensaje user del turno N sobrevive en el history que recibe generateText en el turno N+1 (memoria multi-turno), en camino feliz y de error"
    requirement: "BOT-01"
    verification:
      - kind: unit
        ref: "apps/bot/src/conversation/responder.test.ts#Gap 1 — round-trip: un mensaje user del turno N sobrevive en el history que recibe generateText en el turno N+1"
        status: pass
      - kind: unit
        ref: "apps/bot/src/conversation/responder.test.ts#persiste [...history, userMessage, ...result.response.messages] + needsHuman vía serializeConversationContext/updateConversacion (Gap 1 — memoria multi-turno)"
        status: pass
      - kind: unit
        ref: "apps/bot/src/conversation/responder.test.ts#un error de generateText (p.ej. NoSuchToolError) no se narra como éxito — mensaje seguro + needsHuman=true, y el mensaje del cliente que disparó el error también se persiste"
        status: pass
    human_judgment: false
  - id: D2
    description: "buildSystemPrompt() exige explícitamente narrar en texto el resultado de una tool de consulta (mitigación de Gap 2a, no elimina el quirk del modelo)"
    requirement: "BOT-05"
    verification:
      - kind: unit
        ref: "apps/bot/evals/promptfooconfig.test.ts#Gap 2a — instrucción positiva de narrar en texto el resultado de una tool de consulta sigue presente"
        status: pass
    human_judgment: true
    rationale: "La efectividad real de la mitigación depende del comportamiento no-determinista de Gemini contra tráfico real (ver .planning/debug/responder-empty-text-after-tool-call.md) — el test unitario solo prueba que la instrucción sigue presente en el prompt, no que reduce la tasa real del quirk. Requiere UAT de cierre de fase / verificación en vivo contra Gemini para confirmar impacto."
  - id: D3
    description: "responder() nunca retorna una cadena vacía ante ningún tool-result con texto vacío (consulta o escritura), reintentando UNA vez con tools:{} y degradando a SAFE_FALLBACK_MESSAGE si hace falta"
    requirement: "BOT-05"
    verification:
      - kind: unit
        ref: "apps/bot/src/conversation/responder.test.ts#Gap 2b: texto vacío tras tool-result de consulta -> reintenta UNA vez con tools:{} y prioriza el texto narrado del reintento"
        status: pass
      - kind: unit
        ref: "apps/bot/src/conversation/responder.test.ts#Gap 2b: ambos intentos vacíos -> SAFE_FALLBACK_MESSAGE (nunca cadena vacía)"
        status: pass
      - kind: unit
        ref: "apps/bot/src/conversation/responder.test.ts#Gap 2b: texto vacío SIN ningún tool-result en result.steps -> SAFE_FALLBACK_MESSAGE sin reintento"
        status: pass
      - kind: unit
        ref: "apps/bot/src/conversation/responder.test.ts#Gap 2b: texto no vacío -> generateText se llama una sola vez, reply intacto (no regresión del camino sano)"
        status: pass
      - kind: unit
        ref: "apps/bot/src/conversation/responder.test.ts#Gap 2b (RESTRICCIÓN DE SEGURIDAD DURA): tool-result de ESCRITURA exitosa + texto vacío -> el reintento va con tools:{} (nunca confirmarTurno/reagendarTurno/cancelarTurno), imposibilitando una segunda escritura"
        status: pass
    human_judgment: false

duration: 12min
completed: 2026-07-08
status: complete
---

# Phase 06 Plan 07: Cierre de gaps de memoria conversacional y texto vacío Summary

**responder.ts ahora persiste el mensaje del cliente en cada turno (memoria multi-turno real) y nunca envía un WhatsApp en blanco — con reintento defensivo `tools:{}` que blinda contra una segunda escritura**

## Performance

- **Duration:** 12 min
- **Started:** 2026-07-08T15:02:00-03:00 (aprox., worktree spawn)
- **Completed:** 2026-07-08T15:12:06-03:00
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments
- Gap 1 (memoria conversacional) cerrado: `responder()` ahora persiste `{ role: "user", content: mensajeEntrante }` en `conversacion.context.messages` en el camino feliz Y el de error, vía una única constante `userMessage` reutilizada en los 3 puntos donde antes se perdía — probado con un test de round-trip determinista (turno 1 → context persistido → turno 2 recibe el mensaje user del turno 1 en `generateText`).
- Gap 2a (instrucción positiva) cerrado: `buildSystemPrompt()` suma una sección "Siempre comunicá el resultado de una consulta" que exige narrar en texto cualquier dato real devuelto por una tool de consulta, complementaria (no reemplaza) al negativo D-12 existente.
- Gap 2b (guard de código) cerrado: `hadToolResult(steps)` + reintento único con `tools: {}` cuando `finalText` viene vacío tras cualquier tool-result — incluida una escritura exitosa (`confirmarTurno`/`reagendarTurno`/`cancelarTurno`), donde el `tools: {}` hace estructuralmente imposible una segunda escritura durante el reintento (mitiga T-06-07-04, severidad `high` del threat register). Degrada a `SAFE_FALLBACK_MESSAGE` si el reintento también falla o vuelve vacío; sin reintento si no hubo ningún tool-result.

## Task Commits

Each task was committed atomically (TDD RED→GREEN por task):

1. **Task 1: Persistir el mensaje del cliente en el historial (Gap 1)**
   - `9e4ad64` (test) — RED: reescribe el test de persistencia existente al nuevo contrato, agrega el test de round-trip y la aserción del camino de error.
   - `d6d959e` (fix) — GREEN: `userMessage` local reutilizada en `messages` de `generateText`, `serializeConversationContext` del camino de error y del camino feliz.
2. **Task 2: Instrucción positiva de narración en el system prompt (Gap 2a)**
   - `3cd37e7` (test) — RED: freshness guard nuevo en `promptfooconfig.test.ts`.
   - `0d3e720` (feat) — GREEN: sección "Siempre comunicá el resultado de una consulta" agregada a `buildSystemPrompt()` + comentario de cabecera actualizado.
3. **Task 3: Guard de código contra texto vacío tras un tool-result (Gap 2b)**
   - `01e7c12` (test) — RED: 5 tests deterministas (consulta con reintento exitoso, ambos intentos vacíos, sin tool-result, camino sano intacto, caso de escritura con verificación dura de `tools:{}`).
   - `a922d16` (fix) — fix de typecheck (`tsc --noEmit`) en el test de round-trip de Task 1, encontrado al validar Task 3.
   - `8b16e94` (feat) — GREEN: `hadToolResult`, `EMPTY_TEXT_RETRY_NUDGE`, y el bloque de reintento con `tools: {}`.

**Plan metadata:** (este commit — `docs(06-07): complete plan summary`)

_Nota: cada task siguió el ciclo RED (test commit, falla sin el fix) → GREEN (feat/fix commit, pasa con el fix), verificado corriendo la suite completa antes de cada commit GREEN._

## Files Created/Modified
- `apps/bot/src/conversation/responder.ts` - `userMessage` como fuente única del mensaje del cliente (Gap 1); `hadToolResult`/`EMPTY_TEXT_RETRY_NUDGE`/bloque de reintento con `tools:{}` (Gap 2b)
- `apps/bot/src/conversation/responder.test.ts` - Test de round-trip + persistencia reescrita (Gap 1); 5 tests deterministas del guard de empty-text (Gap 2b)
- `apps/bot/src/conversation/systemPrompt.ts` - Sección "Siempre comunicá el resultado de una consulta" (Gap 2a)
- `apps/bot/evals/promptfooconfig.test.ts` - Freshness guard de la nueva instrucción de narración (Gap 2a)

## Decisions Made
- El merge final de historial (`[...history, userMessage, ...messagesToPersist]`) respeta el orden cronológico real del turno sin mutar `result.response.messages` — `replaceLastAssistantText` y el gate D-12 siguen operando exactamente igual que antes (verificado: los 6 tests preexistentes del gate D-12/CR-01/CR-02 siguen verdes sin cambios).
- El reintento del guard de empty-text (Gap 2b) dispara ante CUALQUIER tool-result con texto vacío — no se intentó distinguir entre tool de lectura y de escritura para decidir si reintentar, porque la garantía dura no depende de esa distinción sino de que el reintento SIEMPRE use `tools: {}` (ningún toolset disponible = ninguna tool ejecutable, sin importar cuál disparó el guard).
- El nudge sintético de continuación se descarta explícitamente de `messagesToPersist` cuando el reintento produce texto — nunca debe aparecer en el historial como si el cliente lo hubiera escrito.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Cast de tipo faltante en el test de round-trip (Task 1) descubierto por `tsc --noEmit` durante la verificación de Task 3**
- **Found during:** Verificación final (`pnpm exec tsc --noEmit`), tras completar Task 3
- **Issue:** El test de round-trip de Task 1 alimentaba el `context` (tipado `unknown` desde el mock de `updateConversacion`) directo a `makeConversacion({ context: ... })`, que espera `Json`/`Tables<"conversacion">["context"]` — typecheck fallaba con `TS2322`.
- **Fix:** Cast explícito `persistedContextTurno1 as Tables<"conversacion">["context"]` en el punto de uso.
- **Files modified:** `apps/bot/src/conversation/responder.test.ts`
- **Verification:** `pnpm exec tsc --noEmit` verde; `pnpm test` (203/203) sigue verde.
- **Committed in:** `a922d16`

---

**Total deviations:** 1 auto-fixed (1 blocking/typecheck)
**Impact on plan:** Fix puramente de tipos en un test, sin cambio de comportamiento ni de aserciones. No scope creep — sigue dentro de `responder.test.ts`, uno de los 4 archivos declarados en el plan.

## Issues Encountered
- El worktree no tenía `node_modules` instalados (aislamiento de worktree respecto al checkout principal) — se corrió `pnpm install --frozen-lockfile` antes de poder ejecutar cualquier test. No es un deviation de código, solo un paso de entorno necesario para poder verificar.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Los 2 blockers de 06-UAT.md (Test 2: memoria conversacional, Test 3: texto vacío tras consulta) quedan cerrados en código con tests de regresión deterministas (fallan sin el fix, pasan con el fix) — listo para re-ejecutar el UAT de cierre de Fase 6 en vivo contra Gemini real + Supabase real (Tests 2, 3, y potencialmente 4/5/7 que estaban `blocked_by: prior-phase` por el mismo Gap 1).
- Gap 2a (instrucción positiva del prompt) es una mitigación de probabilidad, no una eliminación del quirk no-determinista de Gemini 2.5 Flash-Lite documentado en `.planning/debug/responder-empty-text-after-tool-call.md` — el guard de código (Gap 2b, D3 en `coverage`) es la garantía dura real; D2 queda marcado `human_judgment: true` para que el UAT de cierre confirme el impacto real contra Gemini en vivo.
- Suite completa del bot: 203/203 tests verdes, `tsc --noEmit` limpio. Ningún archivo fuera de los 4 declarados en el frontmatter del plan fue tocado.

---
*Phase: 06-agente-conversacional-de-agendamiento*
*Completed: 2026-07-08*
