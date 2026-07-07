---
phase: 06-agente-conversacional-de-agendamiento
plan: 06
subsystem: testing
tags: [vitest, promptfoo, gemini, ai-sdk, evals, llm-judge, guardrails]

# Dependency graph
requires:
  - phase: 06-03
    provides: buscarHorariosTool, asignarProfesionalTool, consultarNegocioTool (nombres de tool para traceEsperado)
  - phase: 06-04
    provides: confirmarTurnoTool, reagendarTurnoTool, cancelarTurnoTool (forma del turnoId real en el retorno)
  - phase: 06-05
    provides: closingLanguage.ts (léxico D-12, única fuente), responder.ts (deps inyectable), gate anti-alucinación online
provides:
  - "evals/dataset/conversations.json — 20 conversaciones etiquetadas (5 camino_feliz/5 failure_mode/4 adversarial/3 cancelacion_ambigua/3 fuera_de_dominio) con traceEsperado + veredictos E1-E8"
  - "evals/traceAssertions.ts — 4 helpers deterministas (assertNoPhantomConfirmation/assertScopeIsolation/assertNoDoubleBook/assertConfirmBeforeCancel) sobre result.steps, importan closingLanguage.ts sin redeclararlo"
  - "evals/judge.ts — LLM judge (generateText + Output.object) para E2/E6/E7/E8, advisory hasta calibración >=0.7"
  - "evals/responder.eval.test.ts — runner que corre las 20 conversaciones contra responder() con Gemini mockeado (cero llamadas live)"
  - "evals/promptfooconfig.yaml — regresión de prompt gated nightly/on-change, NO se corre en cada push"
affects: [07-hardening-y-listo-para-produccion]

# Tech tracking
tech-stack:
  added:
    - "promptfoo ^0.121.17 (devDependency de apps/bot)"
  patterns:
    - "Regresión offline de guardrails que importa la fuente única del guardrail online (closingLanguage.ts) en vez de redeclarar el léxico — evita desincronización entre el gate real y su test"
    - "Runner de eval inyecta generateText (mismo idiom de deps de responder.ts, 06-05) para derivar result.steps sintéticos desde las etiquetas del dataset, nunca llama al LLM real"
    - "LLM judge como capa advisory explícitamente no-fuente-de-verdad hasta pasar un gate de calibración numérico (>=0.7 correlación) — evita que un juez no calibrado se trate como ground truth"

key-files:
  created:
    - apps/bot/evals/dataset/conversations.json
    - apps/bot/evals/traceAssertions.ts
    - apps/bot/evals/traceAssertions.test.ts
    - apps/bot/evals/judge.ts
    - apps/bot/evals/judge.test.ts
    - apps/bot/evals/responder.eval.test.ts
    - apps/bot/evals/promptfooconfig.yaml
  modified:
    - apps/bot/vitest.config.ts
    - apps/bot/package.json

key-decisions:
  - "Task 5 (calibración live del judge contra Gemini real + etiquetas de un product owner humano) queda explícitamente fuera del alcance de este cierre: el propio plan la marca `checkpoint:human-verify gate=blocking-human` porque requiere una GOOGLE_GENERATIVE_AI_API_KEY real, consume cuota del free tier, y sobre todo requiere juicio humano genuino (no de la misma IA que redactó el dataset) para decidir si el juez es confiable. Se le presentó la decisión al usuario (no-técnico) y eligió dejarlo pendiente para el teammate developer en vez de intentar una calibración parcial ahora."
  - "Ningún cambio de código fue necesario para cerrar las Tasks 1-4: el commit WIP (592c67b) ya tenía la implementación completa y correcta. Los 2 tests que fallaban (uuidLike undefined en traceAssertions, @ai-sdk/google no encontrado) y la falla de arranque de judge.test.ts/responder.eval.test.ts se debían enteramente a que este working copy nunca había corrido `pnpm install` tras el pull — no había ningún bug real en el código."

requirements-completed: [BOT-04, BOT-11]
# BOT-04 (gate anti-confirmación-fantasma) y BOT-11 (aislamiento tenant/prompt-injection) ya estaban
# implementados en código por 06-05; este plan les agrega la red de regresión determinista
# (Tasks 1-4, verde) que impide que un cambio futuro los rompa sin que nadie lo note. La calibración
# del LLM judge (Task 5) cubre dimensiones DISTINTAS (E2/E6/E7/E8, subjetivas) — no es parte de lo
# que BOT-04/BOT-11 miden, así que su estado pendiente no reabre estos requirements-completed.

coverage:
  - id: D1
    description: "Dataset de 20 conversaciones etiquetadas (5/5/4/3/3) con trace esperado + veredictos E1-E8 por caso, sin secretos ni PII real"
    requirement: "BOT-04"
    verification:
      - kind: unit
        ref: "evals/responder.eval.test.ts > 'el dataset tiene exactamente 20 ejemplos'"
        status: pass
      - kind: other
        ref: "node -e (conteo por grupo 5/5/4/3/3 + campos requeridos) — ver Task 1 acceptance_criteria de 06-06-PLAN.md"
        status: pass
    human_judgment: false
  - id: D2
    description: "traceAssertions.ts: 4 helpers deterministas E1/E3/E4/E5 sobre result.steps, importan closingLanguage.ts (06-05) sin redeclarar el léxico"
    requirement: "BOT-04"
    verification:
      - kind: unit
        ref: "apps/bot/evals/traceAssertions.test.ts (14 tests)"
        status: pass
    human_judgment: false
  - id: D3
    description: "judge.ts: LLM judge generateText + Output.object {pasa,score,motivo} para E2/E6/E7/E8, framing anti-injection, degradación segura ante error, API key nunca logueada"
    verification:
      - kind: unit
        ref: "apps/bot/evals/judge.test.ts (generateText siempre inyectado, cero Gemini live)"
        status: pass
    human_judgment: false
  - id: D4
    description: "responder.eval.test.ts corre las 20 conversaciones contra responder() con Gemini mockeado, asertando E1/E3/E4/E5 contra los veredictos etiquetados; promptfooconfig.yaml gated on-change sin secretos"
    requirement: "BOT-11"
    verification:
      - kind: unit
        ref: "apps/bot/evals/responder.eval.test.ts (78 tests: por-ejemplo + confirmación fantasma + adversarial + cancelación ambigua)"
        status: pass
      - kind: other
        ref: "grep -c 'AIza\\|sk-\\|Bearer ' apps/bot/evals/promptfooconfig.yaml == 0"
        status: pass
    human_judgment: false
  - id: D5
    description: "Calibración live del judge (correlación >=0.7 contra >=15 casos etiquetados por un product owner humano) + smoke run de Promptfoo contra Gemini real"
    requirement: "BOT-04"
    verification: []
    human_judgment: true
    rationale: "Bloqueado por diseño del propio plan (checkpoint:human-verify, gate=blocking-human): requiere GOOGLE_GENERATIVE_AI_API_KEY real, consume cuota del free tier de Gemini, y necesita el juicio de una persona real (no de la IA que armó el dataset) para que la calibración sea independiente y significativa. Presentado al usuario, que eligió diferirlo al teammate developer (Patricio) en vez de resolverlo ahora."

duration: 12min (implementación original, commits 0b0ff2b..592c67b) + cierre/verificación posterior
completed: 2026-07-07
status: blocked
---

# Phase 6 Plan 6: Evals del agente (dataset + trace assertions + LLM judge + promptfoo) Summary

**Suite de evals Node-native (Vitest + juez propio + Promptfoo) que da señal barata y determinista sobre los dos guardrails catastróficos del agente (confirmación fantasma D-12/BOT-04, aislamiento tenant D-13/BOT-11); la calibración live del juez contra Gemini real queda pendiente de un checkpoint humano que el usuario decidió diferir.**

## Performance

- **Duration:** ~12 min de implementación original (0b0ff2b → 592c67b) + sesión de cierre/verificación
- **Started:** 2026-07-07T19:10:04-03:00 (Task 1)
- **Completed (Tasks 1-4):** 2026-07-07T19:22:33-03:00 (WIP commit) — verificado y cerrado en esta sesión
- **Tasks:** 4 de 5 completos (Task 5 es un checkpoint `human-verify`, `gate=blocking-human`, diferido)
- **Files modified:** 9 (7 creados, 2 modificados)

## Accomplishments

- Dataset de referencia de 20 conversaciones en español rioplatense informal, cubriendo camino feliz, failure modes de dominio (confirmación fantasma, doble-reserva, drift, precio sin tool), adversarial/prompt-injection, cancelación ambigua y handoff fuera de dominio.
- `traceAssertions.ts`: las mismas cuatro aserciones que protegen la producción (`closingLanguage.ts` de 06-05) ahora corren también como regresión offline determinista, sin duplicar el léxico — un cambio futuro de wording en el guardrail online se propaga automáticamente a la eval.
- `judge.ts`: capa de juicio subjetivo (E2 grounding, E6 drift de intención, E7 voz AR informal, E8 precisión de handoff) explícitamente marcada como *advisory* hasta pasar un gate de calibración — nunca se trata como fuente de verdad prematura.
- `responder.eval.test.ts`: corre el dataset completo contra `responder()` real con `generateText` inyectado — 78 tests, cero llamadas a Gemini, confirma que el gate D-12 online también se refleja en el trace sintético.
- `promptfooconfig.yaml`: regresión de prompt lista para correr manualmente/nightly contra Gemini real, explícitamente gateada para no quemar el free tier en cada push.

## Task Commits

Cada task fue commiteada atómicamente (en la sesión anterior, antes de este cierre):

1. **Task 1: vitest include + dataset de 20 conversaciones + devDependency promptfoo** - `0b0ff2b` (feat)
2. **Task 2: traceAssertions.ts (E1/E3/E4/E5) + tests** - `278fc39` (test) / `9ad0e58` (feat)
3. **Task 3: judge.ts (LLM judge E2/E6/E7/E8) + test mockeado** - `9633767` (test) / `f8f00f2` (feat)
4. **Task 4: responder.eval.test.ts + promptfooconfig.yaml** - `592c67b` (wip, verificado y cerrado en esta sesión sin cambios de código)

**Plan metadata:** (pendiente — se agrega cuando Task 5 se resuelva y el plan cierre por completo)

## Files Created/Modified

- `apps/bot/evals/dataset/conversations.json` - 20 conversaciones etiquetadas (trace esperado + veredictos E1-E8)
- `apps/bot/evals/traceAssertions.ts` - 4 helpers deterministas E1/E3/E4/E5 sobre `result.steps`
- `apps/bot/evals/traceAssertions.test.ts` - 14 tests de los helpers
- `apps/bot/evals/judge.ts` - LLM judge `generateText` + `Output.object`, advisory hasta calibración
- `apps/bot/evals/judge.test.ts` - tests con `generateText` inyectado (cero Gemini live)
- `apps/bot/evals/responder.eval.test.ts` - runner del dataset contra `responder()` mockeado
- `apps/bot/evals/promptfooconfig.yaml` - regresión de prompt, gated nightly/on-change
- `apps/bot/vitest.config.ts` - `include` ampliado a `evals/**/*.test.ts`
- `apps/bot/package.json` - `promptfoo` como devDependency

## Decisions Made

- **Task 5 diferida, no forzada:** se le explicó al usuario (no-técnico) en criollo qué requería el checkpoint (API key real + juicio humano en >=15 casos) y se le preguntó cómo proceder; eligió dejarlo pendiente para el teammate developer. No se intentó una calibración "de emergencia" usando las propias etiquetas del dataset como sustituto del juicio humano — eso habría sido circular (la misma IA que armó el dataset "aprobándose" a sí misma) y contradice el motivo explícito por el que el plan marcó esta task como `no la puede ejecutar Claude solo`.
- **Sin cambios de código:** las Tasks 1-4 ya estaban completas y correctamente implementadas en el commit WIP; el único problema real era que este working copy (recién clonado/pulleado) nunca había corrido `pnpm install`, así que `@ai-sdk/google` no estaba en `node_modules` y el `dist/` compilado de `@turnosbot/availability-engine` no tenía el `uuidLike` agregado en `src/index.ts`. `pnpm install` (que además dispara el `prepare: tsc -b` del engine) resolvió ambos síntomas sin tocar una sola línea de código.

## Deviations from Plan

None - plan ejecutado exactamente como estaba escrito en las Tasks 1-4. Ninguna categoría de deviation rule (bug/missing-critical/blocking/over-engineering) aplicó — el único obstáculo fue de entorno (dependencias no instaladas), no de diseño o implementación.

## Issues Encountered

- **`@ai-sdk/google` no encontrado + `uuidLike.safeParse` undefined:** ambos síntomas desaparecieron después de `pnpm install` en la raíz del monorepo (que también re-corrió `tsc -b` en `@turnosbot/availability-engine`, regenerando su `dist/` con el `uuidLike` que Task 2 ya esperaba consumir). No era un bug de código — era una instalación de dependencias desactualizada en este working copy después del `git pull`.
- **Ninguno relacionado con el diseño del plan.**

## User Setup Required

**Bloqueado en un checkpoint humano (Task 5) — el propio checkpoint documenta los pasos exactos, ver `06-06-PLAN.md` Task 5 `<how-to-verify>`.**

Para desbloquear (requiere a alguien con acceso técnico, ej. Patricio):

1. Confirmar que `GOOGLE_GENERATIVE_AI_API_KEY` está en `.env` (ya debería estarlo — la usa el resto del bot desde Fase 6) y que nunca quedó commiteada.
2. Elegir >=15 de las 20 conversaciones de `evals/dataset/conversations.json` y, para las dimensiones E2/E6/E7/E8, confirmar o corregir los veredictos existentes con juicio humano real (¿esto suena bien para un cliente de peluquería argentino? ¿el handoff es preciso?).
3. Correr `judge.ts` contra Gemini real sobre esos casos y comparar su veredicto (`pasa`) contra las etiquetas humanas del paso 2; calcular la correlación.
4. Si la correlación es `>= 0.7`: el juez deja de ser advisory-only para esas dimensiones. Si es menor: documentar que sigue siendo advisory y que la decisión en esas dimensiones la sigue dando la revisión humana.
5. Correr el smoke de Promptfoo: `pnpm --filter @turnosbot/bot exec promptfoo eval -c apps/bot/evals/promptfooconfig.yaml`, respetando el rate limit del free tier (batch, no paralelo masivo).
6. Reportar el resultado (correlación alcanzada, o "advisory" + motivo) para que un agente de continuación escriba el commit final de Task 5 y cierre el plan.

## Next Phase Readiness

- **El valor central de la Fase 6 ya está en producción desde 06-05:** un cliente puede agendar/consultar/cancelar/reagendar un turno real conversando por WhatsApp, con los dos guardrails catastróficos (confirmación fantasma, aislamiento tenant) implementados en código Y ahora cubiertos por regresión determinista (este plan, Tasks 1-4).
- **Bloqueante solo para la calibración formal del LLM judge**, no para el valor del producto ni para Fase 7: Fase 7 (hardening pre-producción) puede avanzar en paralelo — no depende de que el judge esté calibrado, depende de las tools/guardrails que ya están completos y probados.
- **Suite completa verde en esta sesión:** 60 tests `@turnosbot/availability-engine` + 58 `apps/dashboard` + 179 `apps/bot` (87 previos + 92 de `evals/`) — sin regresiones.

---
*Phase: 06-agente-conversacional-de-agendamiento*
*Completed: 2026-07-07 (Tasks 1-4 completos y verificados; Task 5 pausada en checkpoint humano, diferida a pedido del usuario)*

## Self-Check: PASSED

Los 7 archivos creados (`evals/dataset/conversations.json`, `evals/traceAssertions.ts` + `.test.ts`,
`evals/judge.ts` + `.test.ts`, `evals/responder.eval.test.ts`, `evals/promptfooconfig.yaml`) y las 2
modificaciones (`vitest.config.ts`, `package.json`) existen en disco. Los 4 commits de Task
(`0b0ff2b`, `278fc39`/`9ad0e58`, `9633767`/`f8f00f2`, `592c67b`) existen en `git log`. Suite completa
(`pnpm -r --if-present run test` + `pnpm --filter @turnosbot/bot exec vitest run evals/`) verde: 60 +
58 + 179 tests pasando, 0 fallando.
