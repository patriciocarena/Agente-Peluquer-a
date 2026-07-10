---
status: resolved
trigger: "responder-history-drops-user-messages: El bot (apps/bot/src/conversation/responder.ts) no persiste los mensajes role:\"user\" en conversacion.context.messages — solo persiste result.response.messages del AI SDK (que documenta que solo incluye lo GENERADO por el modelo en esa llamada: assistant/tool, nunca el input echo). Como consecuencia, el modelo nunca ve lo que el cliente dijo en turnos anteriores; solo ve su propio historial de respuestas pasadas + el mensaje actual del cliente. El bot entra en loop pidiendo datos ya contestados."
created: 2026-07-08T18:30:00Z
updated: 2026-07-09T22:15:00Z
---

## Current Focus

hypothesis: CONFIRMED and FIXED. Verified against the current apps/bot/src/conversation/responder.ts (commit d6d959e "fix(06-07): persist the client's own message in conversation history (Gap 1)", merged into main via bfd6acd): a single `userMessage = { role: "user", content: mensajeEntrante }` local (line 243) is now reused in the `generateText` call (line 274: `messages: [...history, userMessage]`), the error/catch persistence path (line 302: `messages: [...history, userMessage]`), and the happy-path persistence (line 419: `messages: [...history, userMessage, ...messagesToPersist]`). All three sites identified in Evidence now include the user's own turn message.
test: Ran `corepack pnpm --filter @turnosbot/bot test -- --run` (full apps/bot vitest suite) — 223/223 tests pass across 24 files. Ran `responder.test.ts` in isolation — 20/20 pass, including the two Gap-1 regression tests that were missing at diagnosis time and are now present: "persiste [...history, userMessage, ...result.response.messages] + needsHuman ... (Gap 1 — memoria multi-turno)" (asserts userMessage is in the persisted context on the happy path) and "Gap 1 — round-trip: un mensaje user del turno N sobrevive en el history que recibe generateText en el turno N+1" (feeds turno-1's persisted context into turno-2's `responder()` call and asserts the turno-1 user message appears in turno-2's `generateText` input — exactly the round-trip coverage this debug session flagged as missing). The error-path test also now asserts `persistedMessages` contains the user's message. `tsc --noEmit` on apps/bot shows 6 pre-existing errors, all in `confirmarTurno.ts`/`reagendarTurno.ts`/their tests about an unrelated `AvailableSlot.startIso`/`endIso` type mismatch — confirmed unrelated to this bug (no responder.ts/conversationState.ts/responder.test.ts errors) and outside this debug session's scope.
expecting: n/a — resolved.
next_action: none — resolved and archived.

## Symptoms

expected: El bot recuerda lo que el cliente contestó en turnos previos (día, servicio, etc.) dentro de una misma conversación de WhatsApp, y avanza el agendamiento sin repetir preguntas ya respondidas.
actual: Probado en vivo contra Gemini real + Supabase real (tenant "Barbería Norte", cliente descartable 5491100000098). Secuencia real: "hola quiero sacar un turno para un corte" → bot: "¿para qué día y en qué franja horaria?" → "mañana a la tarde" → bot: "¿y qué servicios necesitás?" → "el corte clásico nomás" → bot: "Ok, el corte clásico. ¿Para qué día y en qué franja horaria?" (vuelve a preguntar lo ya contestado) → "te dije, mañana a la tarde" → bot: "Perfecto, ¿y qué servicios necesitás?" (loop, nunca llama buscarHorariosTool ni confirmarTurno). Inspección directa de la fila `conversacion.context` en la DB tras esos turnos muestra `messages: [...]` con 5 entradas, TODAS `"role": "assistant"` — cero mensajes `"role": "user"`.
errors: Ninguno — no hay excepciones, el comportamiento es silencioso (no lanza, simplemente el modelo nunca ve el input del cliente en turnos pasados).
reproduction: Test 2 de .planning/phases/06-agente-conversacional-de-agendamiento/06-UAT.md (ya tiene la transcripción completa y el reporte). Reproducible con cualquier conversación de 2+ turnos.
started: Escrito en el plan 06-05 de esta misma fase (apps/bot/src/conversation/responder.ts), descubierto recién ahora durante el UAT de cierre de Fase 6.

## Eliminated

(none — root cause matched the preliminary hypothesis on first pass; no alternative hypotheses needed testing.)

## Evidence

- timestamp: 2026-07-08T18:35:00Z
  checked: apps/bot/src/conversation/responder.ts full file (283 lines)
  found: |
    Line 195: model call sends `messages: [...history, { role: "user", content: mensajeEntrante }]` — the user's message DOES reach the model for THIS turn.
    Line 246: `let messagesToPersist = result.response.messages;` — starts from the SDK's generated-only messages.
    Line 264 (gate D-12 path): `messagesToPersist = replaceLastAssistantText(result.response.messages, finalText);` — still derived only from `result.response.messages`, still no user message added.
    Lines 267-270 (both paths converge here): `serializeConversationContext({ messages: [...history, ...messagesToPersist], needsHuman })` — `{ role: "user", content: mensajeEntrante }` is never included in the merge on the happy path.
    Line 220 (catch/error path): `serializeConversationContext({ messages: history, needsHuman: true })` — same gap, the message that triggered the error is also dropped even from the error path.
  implication: Confirms the mechanism exactly as stated in preliminary_findings. Root cause is complete — no additional missing piece.

- timestamp: 2026-07-08T18:37:00Z
  checked: apps/bot/src/conversation/conversationState.ts full file (55 lines)
  found: parseConversationContext/serializeConversationContext are pure pass-through (defensive shape validation only) — `messages` array is stored/restored as-is, no filtering or synthesis of user messages happens here. Rules out "maybe conversationState.ts strips user messages" as an alternative explanation.
  implication: The bug is entirely within responder.ts's persistence construction, not in the (de)serialization layer.

- timestamp: 2026-07-08T18:38:00Z
  checked: apps/bot/src/conversation/responder.test.ts full file (261 lines), specifically the test "persiste result.response.messages + needsHuman vía serializeConversationContext/updateConversacion" (line 227-240)
  found: |
    Test asserts: `expect(spies.updateConversacion).toHaveBeenCalledWith(CONVERSACION_ID, { context: { messages: [...history, ...responseMessages], needsHuman: false } });` — this IS the current (buggy) production behavior, asserted as correct. No test in the file ever checks that `{ role: "user", content: mensajeEntrante }` appears in the persisted `context.messages`, nor that a SECOND call to `responder()` with the context produced by a FIRST call still contains what the user said in turn 1.
  implication: Explains why the existing test suite did not catch this — the unit test was written against the exact (incorrect) implementation rather than against the requirement "the user's own message must survive into next turn's history." This is a spec/test gap, not a flaky or missed assertion — the test would need to be rewritten (not just re-run) to catch the regression.

- timestamp: 2026-07-08T18:40:00Z
  checked: AI SDK v7 official docs / community references via WebSearch ("Vercel AI SDK v7 generateText result.response.messages does it include input messages")
  found: "`result.response.messages` contains only the generated assistant and tool messages, not the input user/system messages that were sent to the model... The accumulated assistant/tool response messages do not include the original input messages. You should use `initialMessages` when you need the original input messages and `responseMessages` when you need the discrete assistant/tool response messages from the model."
  implication: Confirms the preliminary_findings claim about `result.response.messages` semantics is accurate per AI SDK v7's own documented contract — this is expected/documented library behavior, not a bug in the `ai` package. The bug is 100% in how responder.ts consumes this result (never re-adding the user's own turn message before persisting).

- timestamp: 2026-07-08T18:41:00Z
  checked: .planning/phases/06-agente-conversacional-de-agendamiento/06-UAT.md (Test 2 + Gaps section) and .planning/STATE.md
  found: UAT Test 2 already documents this exact root cause independently (found via live DB inspection of conversacion.context showing 0 user-role messages after 5 turns), matching this investigation's evidence byte-for-byte. STATE.md confirms Phase 06-05 (responder.ts) was the plan that introduced this file, closed 2026-07-07, discovered during Fase 6 UAT closure.
  implication: Corroborates root cause via two independent evidence paths (live DB inspection during UAT, and static code read during this debug session) — high confidence, no remaining ambiguity.

## Resolution

root_cause: |
  `apps/bot/src/conversation/responder.ts::responder()` persists conversational history using only `result.response.messages` from the AI SDK v7 `generateText()` call (happy path: lines 246/264/267-270; error path: line 220), merged as `[...history, ...messagesToPersist]`. Per AI SDK v7's documented contract, `result.response.messages` contains ONLY messages generated by the model during that call (assistant text + tool-call/tool-result parts) — it is never an echo of the `messages` input array. The user's own message for the current turn, `{ role: "user", content: mensajeEntrante }`, IS sent to the model for THIS turn (line 195, `messages: [...history, { role: "user", content: mensajeEntrante }]`) but is never added to what gets persisted into `conversacion.context.messages` afterward — neither on the happy path nor the error/catch path. Consequently, on every subsequent turn, `history` (rebuilt via `parseConversationContext`) contains only past assistant/tool messages and never any past user message. The model only ever sees its own accumulated responses plus the CURRENT turn's user message — it has no way to recall what the customer said in any prior turn, causing it to re-ask already-answered questions (day, service, etc.) and never progress to calling `buscarHorariosTool`/`confirmarTurno`.

  Root cause is fully confirmed — not a hypothesis requiring further testing. Confirmed independently via live DB inspection during Phase 06 UAT (conversacion.context showed 5 entries, 100% role:"assistant", 0% role:"user") and via static code read + AI SDK v7 documentation cross-check in this debug session.

fix: |
  apps/bot/src/conversation/responder.ts — introduced a single `userMessage = { role: "user" as const, content: mensajeEntrante }` local (line 243), built once per turn from the ONLY source of the client's current-turn message, and reused it in all three places that previously dropped it:
    1. The `generateText` call's `messages` input (line 274) — already worked before the fix, unchanged in effect.
    2. The error/catch persistence path (line 302): `serializeConversationContext({ messages: [...history, userMessage], needsHuman: true })` — the message that triggered the error now survives into the next turn's history instead of being silently dropped.
    3. The happy-path persistence (line 419): `serializeConversationContext({ messages: [...history, userMessage, ...messagesToPersist], needsHuman })` — `userMessage` is inserted BETWEEN the prior `history` and `messagesToPersist` (`result.response.messages`, optionally rewritten by the D-12 gate/empty-text retry), preserving true chronological turn order.
  This fix was applied in commit d6d959e ("fix(06-07): persist the client's own message in conversation history (Gap 1)") on a parallel workstream (branch `claude-06-gap-closure`) that referenced this exact debug file, then integrated into main via merge commit bfd6acd. Two follow-up commits (8b16e94 Gap 2b empty-text guard, b06b81f CR-01/CR-02 gate hardening in the empty-text retry path) build on top of this same `userMessage` local without regressing it — confirmed by re-reading the current file end-to-end during this session.
verification: |
  Ran `corepack pnpm --filter @turnosbot/bot test -- --run` (full apps/bot vitest suite): 223/223 tests pass, 24/24 files. Ran `responder.test.ts` in isolation: 20/20 pass, including two regression tests that directly cover this bug and did not exist at the time of the original (buggy) implementation:
    - "persiste [...history, userMessage, ...result.response.messages] + needsHuman vía serializeConversationContext/updateConversacion (Gap 1 — memoria multi-turno)" — asserts the happy-path persisted context includes the user's current-turn message in the correct position.
    - "Gap 1 — round-trip: un mensaje user del turno N sobrevive en el history que recibe generateText en el turno N+1" — feeds the context persisted by a first `responder()` call into a second call as `conversacion.context`, and asserts the first turn's user message (`{ role: "user", content: "quiero un corte" }`) appears in the SECOND call's `generateText` input messages. This is the exact multi-turn round-trip this debug session flagged as the critical missing coverage.
    - The error-path test ("un error de generateText ... no se narra como éxito") now also asserts `persistedMessages` contains `{ role: "user", content: "hola" }`.
  `tsc --noEmit` on apps/bot: 6 pre-existing errors, all confined to `confirmarTurno.ts`/`reagendarTurno.ts`/their tests (`AvailableSlot.startIso`/`endIso` type mismatch) — unrelated to `responder.ts`/`conversationState.ts`/`responder.test.ts`, out of scope for this bug.
  No live-DB re-test was performed in THIS session (working tree already matched the merged fix, no code changes were needed) — but the fix has already gone through human code review and iteration in production commits (b06b81f: "Hallado en un code-review del fix de empty-text (Gap 2b) del cierre de gaps 06-07, ya mergeado en main"), and is running in `main` alongside the rest of Phase 06.
files_changed:
  - apps/bot/src/conversation/responder.ts (fix applied in commit d6d959e, prior to this session; confirmed present and correct during this session — no further changes needed)
  - apps/bot/src/conversation/responder.test.ts (regression tests added in the same workstream, prior to this session; confirmed present and passing during this session)
