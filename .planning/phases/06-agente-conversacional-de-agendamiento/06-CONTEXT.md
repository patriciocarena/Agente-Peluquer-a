# Phase 6: Agente conversacional de agendamiento - Context

**Gathered:** 2026-07-07
**Status:** Ready for planning

<domain>
## Phase Boundary

El "cerebro" de IA del bot: un agente conversacional (Vercel AI SDK v7 tool-loop + `@ai-sdk/google` Gemini Flash-lite 2.5) que interpreta lenguaje natural en español AR, orquesta herramientas de dominio y conversa por WhatsApp hasta **agendar, consultar, cancelar o reagendar un turno real** — sin intervención humana de la peluquería. Es el valor central del producto (BOT-01..BOT-11).

Esta fase **reemplaza el stub determinista** de Fase 5 (`apps/bot/src/conversation/responder.ts`) por el agente real. **NO reimplementa** la infraestructura de mensajería (recibir/enviar/persistir — Fase 5) ni la lógica de reservas (`bookAppointment`/`rescheduleAppointment`/`computeSlots`/`autoAssign` — Fase 3/4): las envuelve como herramientas.

**Fuera de alcance:**
- Inbox / bandeja de atención humana en el dashboard → **no se construye** en esta fase (ver D-11). El handoff se limita a un flag de estado.
- Encriptar tokens en reposo (SEC-01) → Fase 7.
- Tests de concurrencia y aislamiento cross-tenant a nivel carga (SEC-02/03) → Fase 7. En Fase 6 el bot debe *respetar* el aislamiento por tenant, pero el test de carga formal es Fase 7.
- Recordatorios con plantilla HSM / mensajes fuera de ventana 24h (REMIND-01) → backlog.
- Turno para terceros (a nombre de otra persona distinta al número que escribe) → deferido (ver D-10).
- Tono/voz configurable por tenant → deferido (ver D-01).
</domain>

<decisions>
## Implementation Decisions

### Personalidad y tono
- **D-01:** Voz **informal argentina**, misma para todos los tenants en v1: trato de "vos", cálido y cercano, mensajes cortos, algún emoji puntual (no saturar). Tono/voz configurable por tenant se **defiere** a fase futura (evita trabajo de UI+datos ahora).

### Estilo del flujo de reserva
- **D-02:** Flujo de **extracción natural**: el bot toma del mensaje libre todo lo que pueda (servicios, profesional, día, franja) y **solo pregunta lo que falta**. No fuerza un orden rígido paso a paso.
- **D-03:** Al proponer horarios, ofrece **2-3 opciones concretas reales** por vez (provenientes de `computeSlots`), no un volcado completo de la agenda.
- **D-04:** "Sin preferencia" de profesional se resuelve con `autoAssign` (lógica ya existente).

### Fuera de alcance conversacional y handoff
- **D-05:** Alcance del bot = **turnos + info del negocio** (precios, horarios de profesionales, servicios que ofrece/no ofrece, disponibilidad, estado de turnos). Mantiene la conversación dentro de este dominio; no hace small talk amplio (menor superficie de prompt-injection).
- **D-06:** Para quejas, temas que no puede resolver, o pedidos fuera de dominio → avisa que **lo verá el local** y **deriva a atención humana** (ver D-11).

### Identidad, cancelar y reagendar
- **D-07:** El cliente se identifica por su **número de WhatsApp** (ya resuelto por `findOrCreateCliente.ts`). El turno se agenda **a nombre de quien escribe**.
- **D-08:** Antes de **cancelar**, el bot pide **confirmación explícita** (no cancela ante un "cancelame" ambiguo).
- **D-09:** **Reagendar** reutiliza la misma lógica y reglas de dominio que el dashboard (lead mínimo 60 min, máx 30 días de anticipación, concurrency-safe vía `rescheduleAppointment`).

### Anti-alucinación (crítico, del success criteria)
- **D-12:** El bot **confirma un turno SOLO cuando una herramienta devolvió un `turno_id` real**. Nunca inventa una confirmación, un horario disponible ni un precio: todo dato que da al cliente proviene de una llamada a herramienta, no del conocimiento del modelo.

### Seguridad (BOT-11)
- **D-13:** El bot resiste prompt-injection y **nunca expone datos de otro cliente ni de otro tenant**. Todas las herramientas operan scopeadas al `tenant_id`/`negocio` de la conversación (patrón `negocioScoped.ts`); el contexto del tenant no es sobreescribible por el contenido del mensaje del usuario.

### Handoff (mecanismo v1)
- **D-11:** "Derivar a humano" = **marcar la conversación con un flag** (ej. `needs_human`) y **el bot deja de auto-responder** en ese hilo. **NO se construye un inbox nuevo** en el dashboard (eso sería otra fase). Mínimo suficiente para v1.

### Claude's Discretion
- Nombre exacto del flag de handoff, forma de persistirlo (columna en `conversacion` vs `mensaje.context` jsonb), y esquema exacto de cada tool (Zod) → decisión del planner/executor, alineado a patrones existentes.
- Estrategia de estado conversacional multi-turno (qué se guarda en `mensaje.context`) → planner, respetando lo ya montado en Fase 5.
- Diseño del system prompt y guardrails anti-injection concretos → executor.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Alcance y requisitos de la fase
- `.planning/ROADMAP.md` §"Phase 6: Agente conversacional de agendamiento" — goal, success criteria, dependencias (Fase 3/4/5).
- `.planning/REQUIREMENTS.md` — BOT-01..BOT-11 (definición de cada requisito del bot).

### Contexto heredado
- `.planning/phases/05-integraci-n-whatsapp-cloud-api/05-CONTEXT.md` — infra de mensajería, dedup, ventana 24h, persistencia `conversacion`/`mensaje`, estado del bot en `mensaje.context` jsonb.

### Contrato de dominio a envolver como herramientas
- `packages/availability-engine/src/index.ts` — superficie pública del motor.
- `packages/availability-engine/src/booking.ts` — `bookAppointment`, `rescheduleAppointment`, `bookAppointmentInputSchema`, `rescheduleAppointmentInputSchema`, `isSlotTakenConcurrently`, `buildTurnoServicioSnapshots`, `sumPrecioTotal`.
- `packages/availability-engine/src/computeSlots.ts` — `computeSlots` (disponibilidad real), y reglas `BOOKING_MIN_LEAD_MINUTES = 60` / `BOOKING_MAX_ADVANCE_DAYS = 30` (en `constants.ts`).
- `packages/availability-engine/src/autoAssign.ts` — `autoAssign` para "sin preferencia".

### Stack del agente
- `CLAUDE.md` §"Technology Stack" / §"Stack Patterns by Variant" — AI SDK v7 tool-loop (`generateText` + `stopWhen`/`isStepCount` o `ToolLoopAgent`), provider `@ai-sdk/google` (`gemini-2.5-flash-lite`), Zod para tool params. **Research flag del ROADMAP:** verificar primitivas AI SDK v7 contra versión instalada y confirmar rate limits reales del free tier de Gemini antes de planificar capacidad.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/availability-engine` (`bookAppointment`, `rescheduleAppointment`, `computeSlots`, `autoAssign`): lógica de dominio completa y concurrency-safe → el agente la envuelve como tools; **no reimplementar**.
- `apps/bot/src/conversation/findOrCreateCliente.ts` / `findOrCreateConversacion.ts`: resuelven identidad por número de WhatsApp y el hilo de conversación (soporte a D-07).
- `apps/bot/src/db/negocioScoped.ts`: patrón de acceso a DB scopeado al negocio/tenant → base para el aislamiento de D-13.
- `apps/bot/src/queue/inboundWorker.ts`: punto donde se procesa cada mensaje entrante (aquí se invoca al agente).
- `apps/bot/src/whatsapp/graphClient.ts`: envío saliente por Cloud API (respuestas del bot).

### Established Patterns
- El "cerebro" a reemplazar es `apps/bot/src/conversation/responder.ts` (stub determinista de Fase 5). Fase 6 sustituye su implementación manteniendo la misma interfaz de entrada/salida hacia el worker.
- Estado del bot persistido en `mensaje.context` (jsonb) — Fase 5. El agente lee/escribe ahí su estado conversacional.

### Integration Points / Gaps a resolver
- **Cancelación (BOT-09) NO tiene función de dominio dedicada** en `availability-engine`: hoy es un status-update a `estado='cancelado'`. El planner debe definir un helper de cancelación reutilizable (idealmente en `availability-engine` o compartido con el dashboard) en lugar de que el agente escriba el estado directo, para mantener "misma lógica de dominio que el dashboard".
- Confirmar dónde vive la lógica de cancelar del dashboard (server action de Fase 4) para reutilizarla o extraer un núcleo compartido.
</code_context>

<specifics>
## Specific Ideas

- Ejemplo de extracción natural (D-02): ante "quiero corte y barba el sábado a la tarde", el bot ya tiene servicios + día + franja y solo pregunta profesional (o aplica `autoAssign`) y confirma horario concreto.
- El bot ofrece pocos horarios concretos (2-3), no la agenda completa (D-03).
</specifics>

<deferred>
## Deferred Ideas

- **Tono/voz configurable por tenant** (nombre del bot y estilo por peluquería desde el dashboard) — futura fase; en v1 voz única informal AR.
- **Turno para terceros** (agendar a nombre de otra persona distinta al número que escribe) — futura mejora; en v1 siempre a nombre de quien escribe.
- **Inbox / bandeja de atención humana** en el dashboard (ver y responder conversaciones derivadas) — futura fase; en v1 solo el flag `needs_human` + pausa del bot.
- **Notificación proactiva al dueño** cuando una conversación necesita atención — futura fase.

*Discusión se mantuvo dentro del scope de la fase; estas ideas surgieron como límites explícitos.*
</deferred>

---

*Phase: 6-Agente conversacional de agendamiento*
*Context gathered: 2026-07-07*
