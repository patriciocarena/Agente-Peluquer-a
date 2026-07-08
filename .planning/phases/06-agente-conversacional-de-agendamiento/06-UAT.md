---
status: diagnosed
phase: 06-agente-conversacional-de-agendamiento
source: [06-01-SUMMARY.md, 06-02-SUMMARY.md, 06-03-SUMMARY.md, 06-04-SUMMARY.md, 06-05-SUMMARY.md, 06-06-SUMMARY.md]
started: 2026-07-08T16:58:23Z
updated: 2026-07-08T18:10:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: |
  Matar cualquier server/bot corriendo. Levantar el bot de nuevo desde cero.
  Arranca sin errores, conecta a Supabase y responde un mensaje básico de
  WhatsApp con datos reales.
result: pass
reported: |
  typecheck (tsc --noEmit) verde. Suite completa pnpm -r test verde: 60
  (availability-engine) + 58 (dashboard) + 196 (bot) = 314 tests, 0 fallando.
  El pipeline real (Supabase service_role vía REST + responder() + Gemini
  live) se ejecutó exitosamente varias veces durante este UAT (ver Tests
  2/3/6) sin errores de import/arranque de módulo.
  CAVEAT: no se pudo levantar el proceso completo `server.ts` (Fastify +
  pg-boss) desde este entorno de sandbox — pg-boss necesita una conexión
  Postgres directa (SUPABASE_DB_URL, puerto 5432) y ese hostname
  (db.bdgufnitakelyialjoqg.supabase.co) solo resuelve a una dirección IPv6,
  que este sandbox no puede rutear. Es una limitación de RED de ESTE entorno
  de testing, no un bug de Fase 6 — pero queda sin verificar el arranque real
  de `server.ts`/pg-boss end-to-end; recomendado confirmarlo en un entorno
  con salida IPv6 (o vía el pooler de Supavisor session-mode) antes de
  producción.

### 2. Agendar un turno real conversando por WhatsApp
expected: |
  El cliente escribe algo como "hola quiero sacar turno para corte mañana a
  la tarde". El bot busca horarios reales (buscarHorariosTool), ofrece 2-3
  opciones concretas, confirma con el cliente, y al confirmar crea el turno
  real (confirmarTurnoTool) — el mensaje de confirmación SOLO aparece después
  de que el turno exista de verdad en la base (turnoId real), nunca antes.
result: issue
reported: |
  Probado en vivo contra Gemini + Supabase real (Barbería Norte, cliente
  descartable 5491100000098). Secuencia: "hola quiero sacar un turno para un
  corte" → "mañana a la tarde" → "el corte clásico nomás" → "te dije, mañana
  a la tarde". El bot entra en loop: vuelve a preguntar "¿para qué día?" y
  "¿qué servicio?" ignorando lo ya contestado, nunca llama a
  buscarHorariosTool ni llega a confirmarTurno.

  Root cause identificado por inspección directa de conversacion.context: el
  historial persistido solo contiene mensajes role:"assistant" — CERO
  mensajes role:"user". apps/bot/src/conversation/responder.ts línea ~246-270
  hace `messagesToPersist = result.response.messages` (que el AI SDK v7
  documenta como SOLO los mensajes generados en esta llamada — assistant/tool,
  nunca el input) y luego `messages: [...history, ...messagesToPersist]` sin
  incluir `{ role: "user", content: mensajeEntrante }`. Cada turno futuro el
  modelo recibe su propio historial de respuestas pasadas + el mensaje actual
  del cliente, pero NUNCA lo que el cliente dijo en turnos anteriores.
severity: blocker

### 3. Preguntar precios u horarios de un profesional
expected: |
  El cliente pregunta "cuánto sale el corte" o "a qué hora atiende Juan". El
  bot responde con datos reales de la peluquería (consultarNegocioTool),
  nunca inventa precios ni horarios.
result: issue
reported: |
  Probado en vivo (cliente descartable 5491100000097, conversación nueva,
  sin el bug de memoria del Test 2 de por medio): "hola cuanto sale el
  corte" → el bot SÍ llama a consultarNegocioTool correctamente y obtiene el
  dato real (Corte clásico, $6500), pero el segundo step de generateText
  devuelve finishReason:"stop" con text:"" — respuesta vacía, no le dice
  nada al cliente. Reproducido 2/2 veces (la 3ra y 1ra corrida del debug
  script fallaron por rate-limit del free tier de Gemini, no relacionado).
  Root cause probable: el system prompt (systemPrompt.ts) no incluye una
  instrucción explícita tipo "después de usar una herramienta, siempre
  respondé en texto resumiendo el resultado al cliente" — el modelo parece
  considerar la tool-call como la acción completa y no siente la necesidad
  de verbalizar el resultado. Necesita diagnóstico más profundo (posible
  interacción con thoughtSignature de Gemini 3, ya anotado como limitación
  conocida #2 en las notas de fase).
severity: blocker

### 4. Reagendar un turno existente
expected: |
  El cliente con un turno ya agendado pide cambiarlo de horario. El bot
  confirma el cambio y el turno queda movido al nuevo horario real
  (reagendarTurnoTool), no un mensaje falso de "listo" sin mover nada.
result: blocked
blocked_by: prior-phase
reason: "Depende de que el Test 2 (agendar) funcione para tener un turno real que reagendar — bloqueado por el mismo bug de memoria de conversación."

### 5. Cancelar un turno existente
expected: |
  El cliente pide cancelar su turno. El bot confirma la cancelación y el
  turno queda con estado cancelado en la base (cancelarTurnoTool). Si ya
  estaba cancelado, el bot lo trata como algo normal, no como un error raro.
result: blocked
blocked_by: prior-phase
reason: "Depende de que el Test 2 (agendar) funcione para tener un turno real que cancelar — bloqueado por el mismo bug de memoria de conversación."

### 6. Consulta fuera de dominio / queja → derivación a humano
expected: |
  El cliente escribe algo fuera del dominio de turnos (una queja, un tema no
  relacionado con la peluquería). El bot da un mensaje de derivación a
  humano apropiado. (Limitación conocida: el flag needsHuman no se activa
  automáticamente por diseño D-11 — está fuera del control del modelo; no
  hay infraestructura de notificación al dueño todavía. Se prueba solo el
  mensaje de derivación, no el freeze del auto-respondido.)
result: pass
reported: |
  Probado en vivo (cliente descartable 5491100000096): "che el otro dia me
  atendieron re mal, quiero hablar con alguien" → el bot respondió "Uy,
  lamento eso 🙏 Le aviso al local para que te contacten directamente y lo
  puedan resolver con vos." — mensaje de derivación correcto y cálido, en
  un solo turno (no depende del bug de memoria multi-turno de los Tests 2/3).

### 7. Guardrail anti-confirmación-fantasma (D-12)
expected: |
  Si le pedís al bot confirmar un turno en un horario que en realidad no
  está disponible (por ejemplo insistiendo en un horario ya ocupado), el
  bot NUNCA dice "listo, tu turno quedó confirmado" a menos que la tool
  confirmarTurno haya devuelto un turnoId real. Ante un slot_taken u otro
  error, debe explicarlo y ofrecer alternativas, no fingir éxito.
result: skipped
reason: "No se pudo ejercitar en vivo por conversación multi-turno real: el bug de memoria del Test 2 impide llegar de forma natural hasta el paso de confirmarTurno con un slot ocupado. El gate SÍ está cubierto por regresión determinista automatizada (apps/bot/evals/responder.eval.test.ts, 78 tests, incluyendo casos de confirmación fantasma/adversarial — todos verdes), independiente de este bug de memoria conversacional."

### 8. Calibración live del LLM judge contra Gemini real (D5)
expected: |
  Elegir >=15 de las 20 conversaciones de evals/dataset/conversations.json,
  confirmar/corregir a mano los veredictos E2/E6/E7/E8, correr judge.ts
  contra Gemini real con GOOGLE_GENERATIVE_AI_API_KEY, y calcular la
  correlación contra el juicio humano (gate >=0.7). Requiere juicio humano
  real, no de la misma IA que armó el dataset — checkpoint bloqueante por
  diseño (06-06-PLAN.md Task 5). Puede marcarse "skip" si se difiere al
  teammate developer.
result: skipped
reason: "Diferido a pedido del usuario (no-técnico) al teammate developer (Patricio) — decisión ya tomada en la sesión que cerró 06-06-SUMMARY.md, confirmada de nuevo en esta sesión de UAT."

## Summary

total: 8
passed: 2
issues: 2
pending: 0
skipped: 2
blocked: 2

## Gaps

- truth: "El bot agenda un turno real conversando por WhatsApp en varios mensajes, recordando lo que el cliente ya contestó."
  status: failed
  reason: "responder.ts no persiste los mensajes role:user en conversacion.context.messages — solo persiste result.response.messages (assistant/tool). El modelo nunca ve lo que el cliente dijo en turnos anteriores, entra en loop pidiendo los mismos datos."
  severity: blocker
  test: 2
  root_cause: "apps/bot/src/conversation/responder.ts::responder() persiste el historial usando solo result.response.messages (AI SDK v7), que por contrato documentado son SOLO los mensajes generados por el modelo en esa llamada (assistant + tool-call/tool-result) — nunca un echo del input. El mensaje del cliente de este turno ({ role: \"user\", content: mensajeEntrante }, línea ~195) nunca se agrega a lo que se persiste, ni en el camino feliz (líneas 246, 264, 267-270) ni en el camino de error (línea 220). Cada turno futuro el historial solo tiene mensajes assistant/tool pasados + el mensaje actual del cliente — nunca los mensajes pasados del cliente."
  artifacts:
    - path: "apps/bot/src/conversation/responder.ts"
      issue: "Camino feliz (líneas 246, 264, 267-270) y camino de error (línea 220) omiten { role: \"user\", content: mensajeEntrante } al construir messagesToPersist/newContext.messages"
    - path: "apps/bot/src/conversation/responder.test.ts"
      issue: "Los tests existentes (línea ~227-240) afirman el contrato con bug como correcto — hay que reescribirlos, no solo re-correrlos"
  missing:
    - "Incluir { role: \"user\", content: mensajeEntrante } en el array persistido, en AMBOS caminos (feliz y error), antes de messagesToPersist/result.response.messages"
    - "Test de round-trip: un mensaje user del turno N debe sobrevivir en el history que recibe generateText en el turno N+1"
  debug_session: .planning/debug/responder-history-drops-user-messages.md

- truth: "El bot responde con texto al cliente después de usar una herramienta de consulta (ej. precios)."
  status: failed
  reason: "Tras un tool-call exitoso de consultarNegocio, el segundo step de generateText devuelve finishReason:stop con text vacío — el bot obtiene el dato pero no lo comunica. Reproducido 2/2 veces."
  severity: blocker
  test: 3
  root_cause: "Causa de dos capas. (1) Externa/no controlable: Gemini 2.5 Flash-Lite tiene un comportamiento documentado y no-determinista donde, tras un function-call exitoso, a veces termina el turno con finishReason:\"stop\" y texto vacío en vez de narrar el resultado — reportado independientemente en el foro de Google AI Developers, Vercel AI SDK, LangChain.js (#8589), Genkit (#3513), Goose (#6293); no es un bug de @ai-sdk/google ni de responder.ts. (2) Agravante bajo control del proyecto: systemPrompt.ts no tiene NINGUNA instrucción positiva tipo \"después de usar una tool de consulta, siempre respondé en texto resumiendo el resultado\" — solo negativos (D-12, qué no inventar). Se descartó explícitamente la hipótesis de thoughtSignature (grep de todo el repo: cero ocurrencias del literal en código o .planning/; además estructuralmente imposible porque el bug ocurre DENTRO de una sola llamada a generateText, antes de cualquier persistencia). Gap secundario: responder.ts no tiene manejo defensivo para \"tool-result exitoso pero result.text vacío\" — hoy ese vacío se envía tal cual al cliente."
  artifacts:
    - path: "apps/bot/src/conversation/systemPrompt.ts"
      issue: "Falta instrucción positiva explícita que exija narración en texto tras un tool-result exitoso de una tool de lectura"
    - path: "apps/bot/src/conversation/responder.ts"
      issue: "finalText = result.text se usa sin fallback para el caso tool-result exitoso + texto vacío"
  missing:
    - "Agregar regla positiva al system prompt: siempre responder en texto tras un tool-result exitoso de consulta"
    - "Guard de código en responder.ts para detectar tool-result exitoso + result.text vacío, y no enviar una respuesta en blanco al cliente (reintento acotado o mensaje seguro de fallback)"
  debug_session: .planning/debug/responder-empty-text-after-tool-call.md
