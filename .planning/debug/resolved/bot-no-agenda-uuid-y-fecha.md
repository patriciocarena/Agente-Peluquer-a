---
status: resolved
trigger: "el bot no puede agendar: ninguna tool expone los UUID de servicios al modelo (Bug B en 06-UAT.md), y el system prompt no inyecta la fecha actual"
created: 2026-07-07
updated: 2026-07-08
phase: 06-agente-conversacional-de-agendamiento
---

## Verificación en vivo (2026-07-08) — AMBOS BUGS RESUELTOS

Smoke interactivo (apps/bot/smoke-interactive.ts, Gemini 3.1-flash-lite + DB real,
Barbería Norte 21111111…) corrido por Patricio:
- Bug B: el bot llamó consultarNegocio(precios) — que ahora devuelve los `id` reales
  (41111111…/42111111…) — y agendó un TURNO REAL citando el UUID del servicio, sin
  inventar slugs. Confirmado también en un turno automatizado previo (consultarNegocio
  devolvió los ids reales al modelo).
- Bug fecha: la fecha agendada fue correcta (hoy inyectado = "miércoles 2026-07-08",
  año correcto). El modelo resolvió la fecha relativa sin inventar el año.

Hallazgo SEPARADO (fuera del scope de este debug, ver follow-up abajo): el bot no captura
el nombre del cliente. Para un cliente nuevo, findOrCreateCliente crea la fila con
nombre:null ("filled in later by the conversation flow") pero ese "later" nunca se
implementó — el parser de WhatsApp (whatsapp/payload.ts) descarta contacts[].profile.name,
no hay tool para guardar el nombre, y el system prompt no lo pide. No bloquea el agendamiento
(el turno se crea igual) pero el turno de un cliente nuevo queda sin nombre en la grilla.
Se trackea como issue aparte — NO reabre este debug session.

## Symptoms

expected: |
  Un cliente conversa por WhatsApp en lenguaje natural y el bot agenda un turno REAL
  (turno_id persistido). Para eso el modelo debe poder llamar buscarHorarios/confirmarTurno
  con el UUID real del servicio elegido, y razonar sobre fechas relativas ("este viernes")
  usando el "hoy" correcto (2026-07, timezone AR).

actual: |
  Bug B (blocker): ninguna tool expone los UUID de los servicios al modelo. consultarNegocio
  (precios) devuelve {nombre, precio} SIN id. Los inputSchema de buscarHorarios/confirmarTurno
  exigen uuidLike, así que el modelo inventa slugs ("corte_clasico") → falla validación UUID →
  loop hasta stopWhen → nunca agenda.

  Bug fecha (major): el system prompt no inyecta la fecha actual ni el timezone AR. En el smoke
  el modelo usó fechaDeseada '2025-07-25' (año equivocado; hoy es 2026-07). Sin "hoy" en contexto
  no puede resolver fechas relativas.

errors: |
  - Validación de inputSchema falla (uuidLike) cuando el modelo pasa un slug inventado.
  - Loop de tool-calls hasta stopWhen sin agendar.
  - fechaDeseada con año 2025 en lugar de 2026.

timeline: Detectado en el smoke en vivo del UAT de la Fase 6 (Gemini 3.1 + DB real), test 2.
  No lo agarró ningún unit test porque los 256 tests mockean negocioScoped y el modelo.

reproduction: |
  Correr el bot contra Gemini real + DB real e intentar agendar ("quiero corte y barba el
  sábado a la tarde"). El modelo pide franja/día (slot-filling OK), propone horarios reales
  (Bug A ya arreglado en 3cc8d39), pero al confirmar no tiene el UUID del servicio.

## Current Focus

reasoning_checkpoint:
  hypothesis: |
    Bug B: consultarNegocio(tipo:"precios") devuelve {nombre,precio,duracionMin} sin `id`,
    pero buscarHorarios/confirmarTurno (y asignarProfesional para servicioIds) EXIGEN
    uuidLike en servicioIds vía zod. Ninguna tool de lectura expone tampoco el id de un
    profesional cuando el cliente lo pide por nombre (mismo patrón, hallazgo adicional no
    listado en el UAT: asignarProfesional SÍ devuelve un profesionalId real, pero solo para
    el caso "sin preferencia" — no hay forma de resolver el id de un profesional nombrado).
    Root cause: falta de un mapeo nombre->id expuesto al modelo antes del punto donde el
    schema exige uuidLike.
    Bug fecha: buildSystemPrompt() no toma parámetros y el texto no menciona la fecha
    actual ni timezone — responder.ts llama `buildSystemPrompt()` sin inyectar reloj ni
    negocio.timezone (que sí se fetchea en inboundWorker.ts línea 92 pero se descarta).
  confirming_evidence:
    - "apps/bot/src/conversation/tools/consultarNegocio.ts:41-45,101-109 — PrecioServicioView
      y el branch tipo==='precios' solo mapean {nombre,precio,duracionMin}, sin id."
    - "apps/bot/src/conversation/tools/buscarHorarios.ts:36 y confirmarTurno.ts:41-42 —
      servicioIds: z.array(uuidLike).min(1) — falla validación ante cualquier string que no
      tenga forma de UUID."
    - "apps/bot/src/conversation/tools/asignarProfesional.ts — no expone lista de
      profesionales por nombre; solo devuelve un id cuando el cliente NO tiene preferencia."
    - "apps/bot/src/conversation/systemPrompt.ts:41-75 — buildSystemPrompt(): string, cero
      parámetros, cero mención de fecha/timezone en el texto."
    - "apps/bot/src/conversation/responder.ts:194 — system: buildSystemPrompt() (sin args)."
    - "apps/bot/src/queue/inboundWorker.ts:90-94 — negocio.timezone SÍ se lee de la DB en
      cada evento entrante, pero nunca se propaga a responder()/buildSystemPrompt()."
  falsification_test: |
    Si consultarNegocio ya incluyera `id` en precios y el smoke igual fallara con el mismo
    error de validación uuidLike, la hipótesis sería falsa. No es el caso: se verificó
    leyendo el código fuente completo de las 3 tools — el campo simplemente no existe en el
    tipo ni en el mapeo. Confirmado por lectura directa, no por inferencia.
  fix_rationale: |
    Opción elegida (a, con una extensión): agregar `id` a consultarNegocio(precios) +
    agregar un nuevo tipo "profesionales" (id+nombre) al mismo consultarNegocio, e instruir
    al modelo en el system prompt a resolver SIEMPRE el id real vía consultarNegocio antes
    de llamar buscarHorarios/confirmarTurno — nunca inventar un id. Se prefiere sobre la
    opción (b) (nombre-matching interno en buscarHorarios/confirmarTurno) porque: mantiene
    el inputSchema uuidLike existente sin abrir una segunda vía de entrada (nombre libre) que
    tendría que resolver ambigüedad/fuzzy-match DENTRO de una tool de escritura — mayor
    superficie de error silencioso (ej. matchear el servicio equivocado) que exponer el id
    real y dejar que el modelo lo cite. Es también el cambio de menor superficie: no toca
    los inputSchema de buscarHorarios/confirmarTurno/asignarProfesional en absoluto.
    Para la fecha: agregar apps/bot/src/conversation/dateContext.ts (función pura,
    Intl.DateTimeFormat nativo, sin nueva dependencia) que responder.ts usa para calcular
    fechaHoy/diaSemanaHoy a partir de negocio.timezone (fetched vía negocioScoped, mismo
    patrón que buildBotAvailabilityData.ts) + un reloj inyectable (`deps.now`), y pasarlos a
    buildSystemPrompt(fechaHoy, diaSemanaHoy, timezone).
  blind_spots: |
    No se corrió aún el smoke en vivo contra Gemini real tras el fix (solo unit tests
    deterministas) — la verificación end-to-end de que el modelo efectivamente llama
    consultarNegocio ANTES de buscarHorarios/confirmarTurno depende del prompt engineering,
    no solo del schema; si Gemini igual intenta inventar un id, hace falta iterar el texto
    del prompt (no solo el schema/tool). No se investigó si otros tenants no-AR (fuera de
    scope actual del producto) tendrían timezone distinta — se usa negocio.timezone real,
    así que no debería importar, pero no hay tenant de prueba con timezone distinto a
    Buenos Aires para confirmarlo.

next_action: awaiting_human_verify — correr un smoke en vivo (Gemini real + DB real,
  Barbería Norte) intentando agendar un turno completo con un slot libre, y confirmar que
  el modelo (1) llama consultarNegocio(precios) y cita el id real en buscarHorarios/
  confirmarTurno en vez de inventar un slug, y (2) usa el año/día correctos al resolver
  una fecha relativa ("este viernes").

## Evidence

- timestamp: 2026-07-07
  checked: apps/bot/src/conversation/tools/consultarNegocio.ts (completo)
  found: PrecioServicioView y el mapeo de tipo "precios" NUNCA incluyen servicio.id — solo
    nombre/precio/duracion_min.
  implication: el modelo no tiene forma de citar el id real de un servicio en
    buscarHorarios/confirmarTurno.

- timestamp: 2026-07-07
  checked: apps/bot/src/conversation/tools/buscarHorarios.ts y confirmarTurno.ts (inputSchema)
  found: servicioIds: z.array(uuidLike).min(1) en ambas; confirmarTurno además exige
    profesionalId: uuidLike (requerido, no optional).
  implication: cualquier slug/nombre inventado por el modelo falla validación zod antes de
    llegar al execute — confirma el mecanismo exacto del loop hasta stopWhen.

- timestamp: 2026-07-07
  checked: apps/bot/src/conversation/tools/asignarProfesional.ts
  found: devuelve un profesionalId real, pero SOLO para el flujo "sin preferencia" —
    ninguna tool lista profesionales por nombre+id para el caso "quiero con Marcos".
  implication: hallazgo adicional (mismo root cause, no cubierto por el texto original del
    Bug B) — se incluye en el fix para no dejar la misma clase de bug abierta.

- timestamp: 2026-07-07
  checked: apps/bot/src/conversation/systemPrompt.ts y responder.ts (completos)
  found: buildSystemPrompt() no recibe parámetros ni menciona fecha/timezone;
    responder.ts línea 194 la invoca sin argumentos.
  implication: confirma el Bug fecha — el modelo no tiene "hoy" en contexto, coherente con
    el fechaDeseada '2025-07-25' observado en el smoke.

- timestamp: 2026-07-07
  checked: apps/bot/src/queue/inboundWorker.ts líneas 90-94
  found: negocio.timezone se lee de la DB en cada evento entrante pero se descarta (solo se
    usa negocio.id para findOrCreateCliente/Conversacion) — nunca llega a responder().
  implication: el dato necesario para el fix de fecha ya existe en la capa de datos
    (negocio.timezone), no hace falta agregar columna ni migración — solo wiring.

- timestamp: 2026-07-07
  checked: apps/bot/evals/responder.eval.test.ts (buildDeps, aserción línea 211) y
    apps/bot/evals/promptfooconfig.test.ts (3 llamados a buildSystemPrompt())
  found: ambos archivos llaman buildSystemPrompt() sin argumentos y/o mockean
    negocioScoped sin un accessor .negocio() — cambiar la firma de buildSystemPrompt y
    agregar un fetch de negocio dentro de responder() rompe estos call sites si no se
    actualizan en el mismo cambio.
  implication: el fix debe incluir actualizar estos 2 archivos de test (y
    responder.test.ts, cuyo mock de negocioScoped tampoco expone .negocio()) para no
    romper la suite verde existente.

## Eliminated

(none yet)

- timestamp: 2026-07-08
  checked: RE-VERIFICACIÓN INDEPENDIENTE del fix (la Resolution previa la escribió
    el session-manager que se cortó por límite de sesión — se re-corrió todo desde cero).
  found: |
    - `pnpm --filter @turnosbot/bot test` → 21 files, 201/201 verdes.
    - `pnpm run typecheck` (tsc -b) → exit 0, cero errores.
    - `pnpm -r test` (monorepo) → availability-engine 60/60, bot 201/201, dashboard 58/58.
    - Diff revisado a mano: consultarNegocio expone `id` en "precios" + nuevo tipo
      "profesionales" ({id,nombre} activos vía db.profesionales()); systemPrompt inyecta
      "# Fecha y hora actuales" + sección "# ID reales"; dateContext.ts pura (Intl nativo);
      responder.ts wirea negocio.timezone (filtrando row.id===negocioId, coherente con Bug A)
      + reloj inyectable deps.now.
  implication: el fix está confirmado a nivel código/tests de forma independiente. Lo único
    pendiente es el smoke en vivo (Gemini real + DB real), que requiere la API key real
    (hoy placeholder) y queda para Patricio — ver next_action.

## Resolution

root_cause: |
  Bug B: consultarNegocio(tipo:"precios") nunca incluía `id` en su respuesta, y ninguna
  tool exponía id+nombre de profesionales tampoco. buscarHorarios/confirmarTurno exigen
  servicioIds/profesionalId con forma de UUID (zod uuidLike) — el modelo, sin ningún id
  real que citar, inventaba slugs a partir de nombres ("corte_clasico"), que siempre
  fallan la validación → loop de tool-calls hasta stopWhen sin agendar nunca.
  Bug fecha: buildSystemPrompt() no tomaba parámetros y responder.ts la invocaba sin
  argumentos — el modelo nunca tuvo un "hoy"/timezone real en contexto, así que resolvía
  fechas relativas con un año inventado (2025 en vez de 2026).

fix: |
  Bug B (opción a elegida — ver reasoning_checkpoint arriba para el rationale completo):
  - consultarNegocio: agregado `id` a PrecioServicioView/tipo "precios"; agregado nuevo
    tipo "profesionales" (lista {id,nombre} de profesionales activos) para el caso de
    preferencia nombrada — el caso "sin preferencia" ya lo cubre asignarProfesional.
  - systemPrompt.ts: nueva sección que instruye al modelo a resolver SIEMPRE los id reales
    vía consultarNegocio (o asignarProfesional) antes de llamar buscarHorarios/
    confirmarTurno, nunca inventar un id a partir de un nombre.
  Bug fecha:
  - dateContext.ts (nuevo): buildDateContext(nowMs, timezone) función pura con
    Intl.DateTimeFormat nativo (sin nueva dependencia) — resuelve fechaHoy (YYYY-MM-DD) y
    diaSemanaHoy en la timezone del negocio.
  - systemPrompt.ts: buildSystemPrompt ahora toma (fechaHoy, diaSemanaHoy, timezone) y
    los inyecta en una nueva sección "# Fecha y hora actuales".
  - responder.ts: fetchea negocio.timezone vía negocioScoped(negocioId).negocio() (mismo
    patrón que buildBotAvailabilityData.ts), agrega deps.now() inyectable (reloj,
    default Date.now), calcula fechaHoy/diaSemanaHoy con dateContext.ts y se los pasa a
    buildSystemPrompt(). Fallback DEFAULT_TIMEZONE = "America/Argentina/Buenos_Aires" si
    la fila del negocio no se pudo leer.
  La firma posicional responder(conversacion, mensajeEntrante) no cambió (constraint D-02
  preservado) — todo el nuevo dato se resuelve vía deps opcionales o queries internas.

verification: |
  - `pnpm --filter @turnosbot/bot test` → 21 test files, 201 tests verdes (subió de 196 a
    201: +2 consultarNegocio [precios con id / profesionales], +4 dateContext.test.ts
    nuevo, ajustes en responder.test.ts/responder.eval.test.ts/promptfooconfig.test.ts
    para las nuevas firmas sin romper ninguna aserción existente).
  - `pnpm -r test` (monorepo completo) → availability-engine 60/60, bot 201/201,
    dashboard 58/58 — nada roto en otros paquetes.
  - `pnpm run typecheck` (tsc -b --pretty) → limpio, cero errores.
  - Pendiente (no verificado en este pase, requiere Gemini real + DB real): smoke en vivo
    confirmando que el modelo efectivamente llama consultarNegocio(precios) antes de
    buscarHorarios/confirmarTurno y usa el fechaHoy inyectado para resolver "este viernes"
    — el fix de schema/prompt está verificado a nivel código pero la verificación
    end-to-end del comportamiento del modelo (prompt engineering) queda para el checkpoint
    humano, igual que el resto de tests 2/4/6/7 de 06-UAT.md.

files_changed:
  - apps/bot/src/conversation/tools/consultarNegocio.ts
  - apps/bot/src/conversation/tools/consultarNegocio.test.ts
  - apps/bot/src/conversation/systemPrompt.ts
  - apps/bot/src/conversation/dateContext.ts (nuevo)
  - apps/bot/src/conversation/dateContext.test.ts (nuevo)
  - apps/bot/src/conversation/responder.ts
  - apps/bot/src/conversation/responder.test.ts
  - apps/bot/evals/responder.eval.test.ts
  - apps/bot/evals/promptfooconfig.test.ts
