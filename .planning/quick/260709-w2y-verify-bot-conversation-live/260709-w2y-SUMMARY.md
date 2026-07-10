---
quick_id: 260709-w2y
slug: verify-bot-conversation-live
date: 2026-07-10
status: complete
duration: 25min
key-files:
  created: [scripts/verify-bot-conversation-live.ts]
  modified: [.planning/HANDOFF-milestone-v1.md, .planning/STATE.md]
requirements-touched: [BOT-01, BOT-02, BOT-03, BOT-05]
---

# Quick 260709-w2y — verificación conversacional en vivo del bot

## Qué se hizo

Se creó `scripts/verify-bot-conversation-live.ts`, un script gated que maneja `responder()`
contra **Gemini real + Supabase real** (`bdgufnitakelyialjoqg`), cerrando el ítem 1.2 del
`HANDOFF-milestone-v1.md`. Hasta ahora la única cobertura de los dos bugs de la fase 06 eran
tests unitarios que **mockean `generateText`** — probaban nuestra lógica, no el modelo.

## Resultado: PASSED (exit 0, 0 warnings)

Corrido el 2026-07-10. **Ambos bugs confirmados muertos contra el modelo real.**

### Escenario 1 — memoria multi-turno (`responder-history-drops-user-messages`)

Tres turnos encadenados, re-leyendo la fila de `conversacion` entre cada uno (igual que
`inboundWorker`). Transcripción real:

- `hola quiero sacar un turno para un corte` → el bot pregunta día/franja.
- `mañana a la tarde` → **ofrece horarios reales** (13:00…18:30), no repregunta.
- `el corte clásico nomás` → *"Para mañana viernes 10, tengo estos horarios para el corte
  clásico (que sale $6.000)…"* — recuerda **el día Y el servicio** simultáneamente.

Aserción dura A1: `context.messages` contiene los 3 mensajes `role:"user"` literales, en orden.
Antes del fix este array tenía **0** mensajes de usuario.

### Escenario 2 — texto vacío tras tool-result (`responder-empty-text-after-tool-call`)

`hola cuanto sale el corte` → el bot narró **$6000, el precio real leído de la DB**, más los
otros dos servicios. Sin `SAFE_FALLBACK_MESSAGE`: el modelo verbalizó por sí solo, el guard no
tuvo que actuar.

## Decisiones de diseño

- **Aserciones duras sobre estado observable, no sobre la redacción del modelo.** Gemini es
  no-determinista; un test que exija frases concretas es frágil por construcción. A1/A2/A3 miran
  `context.messages` y la no-vacuidad de la respuesta.
- **A4 (que la respuesta contenga el precio literal) es WARN, no fallo.** El modelo puede
  parafrasear o redondear. En esta corrida pasó, y se reporta como señal fuerte.
- **`SAFE_FALLBACK_MESSAGE` se reporta como WARN explícito, no como éxito silencioso.** Si
  aparece, significa que el guard actuó: el fix contiene el bug, pero el modelo **sigue**
  cerrando turnos sin texto. Es información valiosa que un `PASSED` a secas escondería.
- **Rate limit (429/503) → `SKIPPED`, nunca `FAILED`.** El free tier de Gemini es ~30 RPM y el
  script hace ~4 llamadas; un rate limit no dice nada sobre el fix.
- **No envía WhatsApp.** Llama `responder()` directo y aborta si `WHATSAPP_LIVE=true`.

## Hallazgo de esquema (bug del script, no del bot)

La primera corrida murió con `duplicate key value violates unique constraint
"conversacion_unica_por_cliente"`. La tabla `conversacion` impone **una conversación por
cliente**. Los dos escenarios necesitan historiales independientes, así que el script crea **dos
clientes descartables** (`…042` y `…043`), no uno. `cleanup()` corre en todos los caminos y borra
`mensaje` → `conversacion` → `cliente`; verificado después: 0 clientes de prueba restantes.

## Qué desbloquea

La fase 06 ya no tiene el argumento "sus criterios de éxito son conversaciones reales que nadie
probó". Sus Success Criteria #1, #2 y #3 (identificar servicio en lenguaje natural, proponer
horarios reales del motor, responder consultas de precio) están **probados en vivo**.

Falta todavía para verificar la fase 06 entera: SC#4 (cancelar/reagendar por WhatsApp) y SC#5
(resistencia a prompt injection, hoy cubierto solo por los evals con modelo mockeado).
