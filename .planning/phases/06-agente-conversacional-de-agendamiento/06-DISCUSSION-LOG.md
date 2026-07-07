# Phase 6: Agente conversacional de agendamiento - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-07
**Phase:** 6-Agente conversacional de agendamiento
**Areas discussed:** Personalidad y tono, Estilo del flujo de reserva, Fuera de alcance y handoff, Cancelar/reagendar/identidad

---

## Personalidad y tono

| Option | Description | Selected |
|--------|-------------|----------|
| Informal argentino, mismo para todos | Trato de "vos", cálido, mensajes cortos, emoji puntual, voz única v1 | ✓ |
| Neutro-profesional | Cordial sobrio, sin emojis, más formal | |
| Configurable por tenant | Cada peluquería define su tono/nombre desde el dashboard | |

**User's choice:** Informal argentino, mismo para todos (recomendado)
**Notes:** Configurable por tenant se defiere a fase futura.

---

## Estilo del flujo de reserva

| Option | Description | Selected |
|--------|-------------|----------|
| Extrae lo que pueda, pregunta solo lo que falta | Toma servicios/día/franja del mensaje libre, ofrece 2-3 slots reales | ✓ |
| Guiado estricto paso a paso | Orden fijo servicio→profesional→día→hora, un dato por vez | |

**User's choice:** Extracción natural (recomendado)
**Notes:** "Sin preferencia" resuelto con autoAssign; ofrecer 2-3 horarios concretos por vez.

---

## Fuera de alcance y handoff

| Option | Description | Selected |
|--------|-------------|----------|
| Turnos + info del negocio, lo demás deriva | Responde dominio turnos/negocio; quejas y temas raros → atención humana | ✓ |
| Estricto: solo turnos | Corta todo lo que no sea agendar/consultar/cancelar | |
| Conversador amplio | Small talk + respuestas libres | |

**User's choice:** Turnos + info del negocio, lo demás deriva (recomendado)

**Sub-decisión — mecanismo de handoff v1:**

| Option | Description | Selected |
|--------|-------------|----------|
| Marca la conversación y deja de responder | Flag needs_human, bot pausa; sin inbox nuevo | ✓ |
| Marca + notifica al dueño | Flag + aviso proactivo al dueño | |
| Solo responde "comunicate con el local" sin marcar | Mensaje genérico sin persistir estado | |

**User's choice:** Marca la conversación y deja de responder (recomendado)
**Notes:** No se construye inbox nuevo en el dashboard — sería otra fase.

---

## Cancelar / reagendar / identidad

| Option | Description | Selected |
|--------|-------------|----------|
| Número = cliente, confirma antes de cancelar | Identidad por WhatsApp, confirmación explícita, reagendar con lead 60min, sin terceros | ✓ |
| Igual pero permite turno para terceros | Además permite agendar a nombre de otra persona | |
| Cancela sin confirmar | Cancela directo ante "cancelame" | |

**User's choice:** Número = cliente, confirma antes de cancelar (recomendado)
**Notes:** Turno para terceros deferido a fase futura.

---

## Claude's Discretion

- Nombre exacto y persistencia del flag de handoff (columna `conversacion` vs `mensaje.context`).
- Esquema Zod de cada tool, diseño del system prompt y guardrails anti-injection.
- Estrategia de estado conversacional multi-turno en `mensaje.context`.

## Deferred Ideas

- Tono/voz configurable por tenant.
- Turno para terceros.
- Inbox / bandeja de atención humana en el dashboard.
- Notificación proactiva al dueño en handoff.
