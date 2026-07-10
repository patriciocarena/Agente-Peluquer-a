---
status: resolved
trigger: "responder-empty-text-after-tool-call: En el tool-loop del agente conversacional (apps/bot/src/conversation/responder.ts, generateText con Gemini 2.5 Flash-Lite), cuando el modelo llama exitosamente a una tool de solo-lectura (ej. consultarNegocio para precios) y recibe el resultado, el SIGUIENTE step del mismo generateText termina con finishReason:\"stop\" pero result.text/step.text vacío (\"\") — el bot nunca verbaliza el dato al cliente, a pesar de que el tool-result sí trae la información correcta."
created: 2026-07-08T00:00:00Z
updated: 2026-07-09T22:20:00Z
---

## Current Focus

hypothesis: "CONFIRMADA. Root cause de dos capas: (1) es un comportamiento documentado, cross-framework y cross-provider-path de la familia Gemini 2.5 (incluyendo flash-lite): tras un function-call exitoso, el modelo a veces termina el turno con finishReason STOP y una parte de texto vacía en vez de continuar narrando el resultado — reportado independientemente contra el Gemini API crudo, Vercel AI SDK (Google Vertex/MCP), LangChain.js, Genkit y Goose, es decir NO es un bug de nuestro código ni específico de @ai-sdk/google. (2) Nuestro system prompt (systemPrompt.ts) no tiene NINGUNA instrucción positiva/explícita tipo 'después de usar una tool de consulta, siempre generá un mensaje de texto que resuma el resultado' — solo tiene negativos (D-12: qué NO inventar). Esta ausencia incrementa la probabilidad de que el modelo trate el tool-call como 'la acción completa' del turno, sin la presión de prompt necesaria para forzar la narración. responder.ts tampoco tiene ningún fallback defensivo para 'result.text vacío tras un tool-result exitoso' — lo retorna/envía tal cual."
test: "Completado. Evidencia: lectura completa de responder.ts + systemPrompt.ts + 06-AI-SPEC.md Section 3/4b + WebSearch de 4 queries cruzando 'gemini empty text after tool call finishReason stop' contra múltiples frameworks independientes."
expecting: "N/A — hipótesis confirmada con evidencia directa (lectura de código) + evidencia externa (múltiples reportes independientes del mismo síntoma exacto en el modelo subyacente)."
next_action: "none — resuelto y archivado (2026-07-09). El fix de ambas capas ya estaba en main (8b16e94, endurecido por b06b81f); esta sesión lo verificó (223/223 vitest, 5 tests de regresión Gap 2b, tsc limpio) y cerró el bookkeeping. Pendiente deseable, NO bloqueante: un re-test conversacional en vivo contra Gemini+Supabase reales, que esta sesión no ejecutó."

## Symptoms

expected: |
  Después de que una tool de lectura devuelve datos reales (ej. precio del
  servicio), el bot responde en un mensaje de texto natural resumiendo esos
  datos para el cliente (ej. "El corte clásico sale $6500").
actual: |
  Probado en vivo contra Gemini real + Supabase real (tenant "Barbería
  Norte", cliente descartable 5491100000097, conversación nueva sin
  historial previo). Mensaje: "hola cuanto sale el corte". El modelo SÍ
  llama a la tool `consultarNegocio` con `{tipo: "precios"}` y el
  tool-result vuelve correcto: `{tipo: "precios", servicios: [{nombre:
  "Corte clásico", precio: 6500, duracionMin: 30}]}` (step 0, finishReason
  "tool-calls"). Pero el step 1 (después del tool-result) tiene
  `finishReason: "stop"`, `text: ""`, sin más tool-calls — el `result.text`
  final es una cadena vacía. Reproducido 2/2 veces con un script de debug
  standalone que invoca `generateText` directamente (mismo
  system/tools/stopWhen/temperature/maxOutputTokens que responder.ts) —
  descartando que sea un problema de la capa de persistencia/historial
  (bug separado, ya reportado aparte como Test 2 de 06-UAT.md). Las otras 2
  corridas del mismo script fallaron por rate-limit del free tier de
  Gemini (503/429), no relacionado con este bug.
errors: |
  Ninguna excepción — generateText retorna normalmente con finishReason
  "stop" y texto vacío, no lanza.
reproduction: |
  Test 3 de .planning/phases/06-agente-conversacional-de-agendamiento/06-UAT.md
  (transcripción completa del hallazgo). Reproducible preguntando por
  precio/horario en un mensaje único, sin necesidad de historial
  multi-turno.
started: |
  Escrito en el plan 06-05 de esta misma fase, descubierto durante el UAT
  de cierre de Fase 6.

## Eliminated

- hypothesis: "El comportamiento está relacionado con el descarte de providerOptions.google.thoughtSignature en conversationState.ts al persistir mensajes con tool-calls (limitación conocida documentada en 06-06-SUMMARY.md)."
  evidence: |
    Grep case-insensitive de "thoughtSignature" y "signature" en TODO el
    repo (incluyendo .planning/) NO encuentra ninguna mención de
    "thoughtSignature" en ningún archivo — ni en 06-06-SUMMARY.md (leído
    completo), ni en ningún otro artefacto de la Fase 6. Los únicos hits de
    "signature" en el repo son de la verificación HMAC del webhook de
    WhatsApp (apps/bot/src/whatsapp/signature.ts), un tema completamente
    no relacionado. Además, el bug es reproducible standalone (script de
    debug que llama generateText directamente, sin pasar por
    conversationState.ts/persistencia en absoluto), lo cual ya de por sí
    hace estructuralmente imposible que conversationState.ts sea la causa
    — el bug ocurre DENTRO de la llamada a generateText, antes de que el
    código propio toque el resultado. La afirmación del preliminary_finding
    sobre "06-06-SUMMARY.md documenta esto como limitación conocida #2" no
    se corrobora en el archivo real.
  timestamp: 2026-07-08T00:05:00Z

## Evidence

- timestamp: 2026-07-08T00:00:00Z
  checked: apps/bot/src/conversation/responder.ts (completo)
  found: |
    El tool-loop usa `deps.generateText({ model, system: buildSystemPrompt(),
    messages: [...history, {role:"user", content: mensajeEntrante}],
    stopWhen: isStepCount(6), temperature: 0.3, maxOutputTokens: 512,
    maxRetries: 3, tools })`. `result.text` se usa directo como `finalText`
    salvo que el gate D-12 dispare (closingLanguageDetected). No hay ningún
    manejo especial de "result.text vacío pero hubo tool-calls exitosos" —
    si `result.text === ""` y no hay lenguaje de cierre detectado (obvio,
    porque no hay texto), `finalText` queda como cadena vacía y ESO es lo
    que se retorna/envía al cliente.
  implication: |
    El código de responder.ts no tiene ningún fallback para "el modelo
    terminó sin texto tras un tool-result exitoso" — simplemente confía en
    que `result.text` no esté vacío. Esto es una gap de robustez en el
    código (posible mitigación), pero no explica todavía POR QUÉ Gemini
    decide parar sin texto.

- timestamp: 2026-07-08T00:01:00Z
  checked: apps/bot/src/conversation/systemPrompt.ts (completo)
  found: |
    El system prompt cubre voz (D-01), dominio estricto (D-05), la regla de
    oro anti-invención (D-12: nunca confirmar sin tool real), cancelaciones
    (D-08), quejas/fuera de dominio (D-06), aislamiento anti-injection
    (D-13), y 3 ejemplos few-shot (extracción natural, queja, cancelación).
    NINGUNO de los 3 ejemplos few-shot cubre el caso "cliente pregunta un
    dato de consulta (precio/horario) → tool responde → el bot debe
    VERBALIZAR ese dato en un mensaje de texto". La "regla de oro" section
    dice qué NO hacer (no inventar) pero no dice explícitamente "siempre
    respondé con un mensaje de texto que resuma el resultado de la
    herramienta al cliente, en el mismo turno".
  implication: |
    Confirma el preliminary_finding: no hay instrucción positiva/explícita
    de "después de usar una tool de consulta, siempre generá un mensaje de
    texto". El prompt es fuerte en NEGATIVOS (qué no decir) pero débil en
    POSITIVOS (qué SÍ hacer después de una tool-call de solo lectura).

- timestamp: 2026-07-08T00:02:00Z
  checked: |
    .planning/phases/06-agente-conversacional-de-agendamiento/06-AI-SPEC.md
    Section 3 "Common Pitfalls" (#1-#5) y Section 4b
  found: |
    Pitfall #1 documentado: "stopWhen isn't optional... without it,
    generateText returns after the FIRST model turn". Este pitfall YA está
    mitigado en responder.ts (stopWhen: isStepCount(6) está presente) — así
    que el pitfall documentado NO es la causa (el step 1 SÍ ocurre, solo
    que vuelve vacío). No hay ningún pitfall documentado en 06-AI-SPEC.md ni
    06-RESEARCH.md sobre "texto vacío específicamente en el step
    inmediatamente posterior a un tool-result exitoso, con finishReason
    stop". El AI-SPEC tampoco documenta explícitamente en el system prompt
    sugerido (Section 4b.3) ninguna instrucción de "siempre respondé texto
    tras una tool-call" — su propio texto de ejemplo del prompt no lo
    incluye tampoco.
  implication: |
    Este comportamiento específico (empty text turno post-tool-result) no
    fue anticipado ni documentado como pitfall conocido por la
    investigación previa de la fase — es nuevo, hay que investigarlo desde
    cero (research externo sobre @ai-sdk/google + gemini-2.5-flash-lite).

- timestamp: 2026-07-08T00:10:00Z
  checked: |
    WebSearch (4 queries): "@ai-sdk/google generateText empty text finishReason
    stop after tool call gemini-2.5-flash-lite"; "Gemini 2.5 flash lite empty
    response after tool call thinking budget maxOutputTokens workaround";
    "gemini function calling empty response finishReason STOP thinkingConfig
    includeThoughts workaround"; "vercel ai sdk google provider tool call
    then empty text step github issue stepCountIs"
  found: |
    El síntoma exacto — tool-call exitoso seguido de un step con
    finishReason "STOP"/"stop" y texto vacío — está documentado de forma
    independiente y repetida a través de MÚLTIPLES frameworks/wrappers
    distintos, no solo @ai-sdk/google:
    - Google AI Developers Forum, hilo titulado literalmente "Gemini 2.5
      flash lite empty response after tool call" (discuss.ai.google.dev/t/
      gemini-2-5-flash-lite-empty-response-after-tool-call/108895):
      reportado como reproducible consistentemente para inputs específicos,
      "más con algunas tools que otras" — coincide con nuestra reproducción
      2/2.
    - Vercel Community: "Vercel AI SDK returns empty text after MCP tool
      call resolution" — mismo síntoma en el mismo SDK (`generateText`,
      `result.text` vacío tras un tool-result con datos válidos).
    - LangChain.js issue #8589 (Gemini 2.5-flash-lite stops with
      UNEXPECTED_TOOL_CALL), Genkit issue #3513 ("[JS] Gemini
      2.5-flash-lite sometimes fails to resolve tool requests"), Goose
      issue #6293 ("Gemini causing empty replies after tool use"),
      gemini-cli issue #5339 — mismo patrón general a través de stacks
      completamente distintos (JS/Python, SDKs distintos).
    - Se descartó explícitamente la causa alternativa "stopWhen por default
      stepCountIs(1)" reportada en un hilo de Vercel Community — NO
      aplica acá: responder.ts fija expresamente `stopWhen: isStepCount(6)`
      (confirmado por lectura directa, línea 196), y el propio síntoma
      reportado por el usuario ya muestra que el step 1 SÍ ocurre (el loop
      continuó tras el tool-call) — el problema no es que el loop se corte
      después de 1 step, es que el step 2 vuelve vacío.
    - La hipótesis de "thinking tokens consumiendo maxOutputTokens" (causa
      documentada para otros modelos Gemini 2.5 con thinking habilitado por
      default) tiene confianza BAJA-MEDIA para flash-lite específicamente:
      fuentes indican que flash-lite tiene thinking OFF por default a
      diferencia de flash/pro — no se pudo confirmar con alta confianza si
      esto aplica igual en la versión de @ai-sdk/google instalada
      (^4.0.8) sin poder ejecutar el código en este entorno (node_modules
      no instalados en este worktree). No se descarta del todo como
      variable agravante, pero no es necesaria para explicar el síntoma
      dado que el mismo patrón se reproduce ampliamente incluso sin
      thinking involucrado en varios de los reportes citados.
  implication: |
    El síntoma es un comportamiento conocido, no-determinista, a nivel del
    propio modelo/API de Gemini (particularmente 2.5 flash-lite): tras
    ejecutar una function-call exitosa, el modelo a veces cierra el turno
    con finishReason STOP y una parte de texto vacía en vez de continuar
    narrando el resultado. Esto ocurre independientemente del framework
    (Gemini API cruda, AI SDK, LangChain.js, Genkit, Goose) — no es un bug
    introducido por nuestro código ni por @ai-sdk/google específicamente.
    Sin embargo, la ausencia de una instrucción explícita en systemPrompt.ts
    que exija narrar el resultado de la tool en texto (evidencia ya
    registrada arriba) es la variable que SÍ está bajo nuestro control y
    que la literatura citada (y la práctica estándar de prompt engineering
    para tool-calling) señala como la mitigación más directa: una
    instrucción positiva fuerte reduce (no garantiza eliminar) la
    probabilidad de que el modelo trate la tool-call como el fin del turno.
    El segundo control bajo nuestro alcance es defensivo: responder.ts no
    tiene ningún manejo especial para "hubo tool-calls exitosos pero
    result.text vino vacío" — hoy ese texto vacío se envía tal cual al
    cliente como si fuera una respuesta válida.

## Resolution

root_cause: |
  Causa de dos capas, ambas necesarias para explicar el síntoma completo:

  (1) CAUSA RAÍZ EXTERNA (no controlable por este código): Gemini 2.5
  Flash-Lite (y la familia Gemini 2.5 en general) tiene un comportamiento
  documentado de forma independiente y repetida por múltiples equipos
  externos (Google AI Developers Forum, Vercel AI SDK community/GitHub,
  LangChain.js, Genkit, Goose) donde, tras ejecutar exitosamente una
  function-call, el modelo a veces termina el turno con finishReason
  STOP/"stop" y una parte de texto vacía, en vez de continuar generando
  una narración en lenguaje natural del resultado. Es un comportamiento
  no-determinista del modelo/API, no un bug de @ai-sdk/google ni de
  responder.ts — se reproduce en stacks completamente distintos.

  (2) FACTOR AGRAVANTE BAJO CONTROL DEL PROYECTO: systemPrompt.ts
  (buildSystemPrompt()) no contiene ninguna instrucción positiva/explícita
  que exija "después de usar una herramienta de consulta, siempre generá
  un mensaje de texto que resuma el resultado real al cliente, en el mismo
  turno" — el prompt actual solo especifica NEGATIVOS (D-12: qué no
  inventar), nunca un POSITIVO equivalente ("y si consultaste un dato real,
  siempre comunicalo"). Esta ausencia elimina la única palanca de mitigación
  bajo nuestro control (prompt pressure) que reduce la probabilidad de que
  el modelo caiga en el comportamiento de (1).

  Adicionalmente, responder.ts no tiene NINGÚN manejo defensivo en código
  para el caso "result.steps contiene un tool-result exitoso, pero
  result.text vino vacío" — hoy ese texto vacío es justamente lo que
  `finalText` termina siendo y lo que se retorna/envía al cliente, sin
  ningún fallback ni reintento.
fix: |
  Mitigación en las DOS capas que están bajo control del proyecto (la capa (1),
  el no-determinismo de Gemini 2.5 Flash-Lite, es externa y no se puede eliminar
  — solo reducir su probabilidad y contener su efecto).

  (a) PROMPT PRESSURE — `apps/bot/src/conversation/systemPrompt.ts` (líneas ~106-107)
  gana la instrucción positiva que faltaba, bajo el encabezado "# Siempre comunicá
  el resultado de una consulta": obliga a escribir un mensaje de texto en lenguaje
  natural tras CUALQUIER tool de consulta que devuelva datos, en el mismo turno, y
  explicita que "usar la herramienta no alcanza: nunca termines un turno en silencio
  después de consultar un dato". Cierra el hueco registrado en Evidence (el prompt
  tenía negativos D-12 pero ningún positivo equivalente).

  (b) GUARD DEFENSIVO EN CÓDIGO — `apps/bot/src/conversation/responder.ts` (línea ~349):
  `if (finalText.trim() === "" && hadToolResult(result.steps))` dispara un reintento
  ÚNICO de `generateText` con `tools: {}` (línea ~363). Ir sin tools en el reintento
  es una restricción de seguridad dura, no una optimización: imposibilita que el
  reintento ejecute una SEGUNDA escritura (confirmarTurno/reagendarTurno/cancelarTurno)
  tras una escritura ya exitosa. Si el reintento también vuelve vacío — o si el texto
  vacío ocurrió sin ningún tool-result — se envía `SAFE_FALLBACK_MESSAGE`
  ("Dame un segundo que verifico y te confirmo 🙌", línea 82) en vez de una cadena
  vacía. El bot nunca más puede mandarle "" al cliente.

  El fix ya estaba en `main` antes de esta sesión (Gap 2b del cierre de fase 06-07,
  commit 8b16e94; endurecido después por b06b81f "CR-01/CR-02 gate hardening" tras un
  code review). Esta sesión NO cambió código: verificó que ambas capas están presentes
  y cubiertas por tests, y cerró el bookkeeping que había quedado en `diagnosed`.
verification: |
  Verificado en vivo en esta sesión (2026-07-09), sin credenciales — todo con vitest local:

  - `corepack pnpm --filter @turnosbot/bot test -- --run` → 223/223 tests pasan, 24/24
    archivos, 0 skipped. Corrido DOS veces (antes y después de rebuildear el paquete
    availability-engine), verde ambas.
  - 5 tests cubren específicamente este bug en `responder.test.ts` (todos dentro de los 223):
      * "Gap 2b: texto vacío tras tool-result de consulta -> reintenta UNA vez con
        tools:{} y prioriza el texto narrado del reintento" (línea 323)
      * "Gap 2b: ambos intentos vacíos -> SAFE_FALLBACK_MESSAGE (nunca cadena vacía)" (363)
      * "Gap 2b: texto vacío SIN ningún tool-result -> SAFE_FALLBACK_MESSAGE sin
        reintento" (380)
      * "Gap 2b: texto no vacío -> generateText se llama una sola vez, reply intacto
        (no regresión del camino sano)" (390)
      * "Gap 2b (RESTRICCIÓN DE SEGURIDAD DURA): tool-result de ESCRITURA exitosa +
        texto vacío -> el reintento va con tools:{} (nunca confirmarTurno/reagendarTurno/
        cancelarTurno), imposibilitando una segunda escritura" (400)
  - `npx tsc --noEmit` en apps/bot → 0 errores (tras rebuildear availability-engine; ver nota abajo).
  - Presencia de ambas capas confirmada por lectura directa: systemPrompt.ts:106-107
    (instrucción positiva) y responder.ts:349/363/82 (guard + reintento + fallback).

  SIN VERIFICAR (honestidad explícita): NO se re-probó en vivo contra Gemini real +
  Supabase real en esta sesión. La reproducción original del síntoma fue en vivo
  (2/2 corridas, ver Symptoms), pero la confirmación de que el fix elimina el síntoma
  end-to-end contra el modelo real NO se ejecutó acá — descansa en la cobertura de los
  5 tests unitarios (que mockean generateText) más el UAT de fase 07 (4/4) de una sesión
  previa. Un re-test conversacional en vivo sigue siendo deseable antes de producción.

  Nota de entorno descubierta en esta sesión: `tsc --noEmit` en apps/bot arrojaba 6
  errores (`startIso`/`endIso` no existen en `AvailableSlot`) que NO eran un bug de
  código sino un `packages/availability-engine/dist/` desactualizado — `dist/` está
  gitignoreado y apps/bot importa el compilado, no el fuente (decisión de fase 04-07).
  Se resuelve con `corepack pnpm --filter @turnosbot/availability-engine build`.
files_changed:
  - apps/bot/src/conversation/systemPrompt.ts (instrucción positiva; commit 8b16e94, previo a esta sesión)
  - apps/bot/src/conversation/responder.ts (guard empty-text + reintento sin tools + SAFE_FALLBACK_MESSAGE; commits 8b16e94, b06b81f — previos a esta sesión)
  - apps/bot/src/conversation/responder.test.ts (5 tests de regresión Gap 2b; previos a esta sesión)
