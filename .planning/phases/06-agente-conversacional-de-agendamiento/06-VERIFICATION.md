---
phase: 06-agente-conversacional-de-agendamiento
verified: 2026-07-10T00:00:00Z
status: passed
score: 5/5 success criteria verified live (SC#4 fully verified for BOTH halves — cancelar y reagendar)
behavior_unverified: 0
overrides_applied: 0
warnings:
  - "RESUELTO (2026-07-10): SC#4 mitad REAGENDAR ahora tiene cobertura conversacional en vivo. Escenario 5 de scripts/verify-bot-conversation-live.ts (full run PASSED, exit 0) condujo un reagendamiento por lenguaje natural contra Gemini + Supabase reales: A8 — la MISMA fila de turno movió `inicio` de 2026-07-12T02:00:00Z a 2026-07-10T19:00:00Z (16:00 local, lo pedido) y siguió `estado='confirmado'`; A8b — es UPDATE no INSERT (el cliente sigue con exactamente 1 turno). Probe instrumentado capturó los args reales del modelo: reagendarTurno ARGS {turnoId,profesionalId,nuevaFecha,nuevaHoraInicio} -> RES {ok:true,turnoId,precioTotal:6000}. Warning original (reagendar no ejercido live) cerrado."
  - "Invariante implícita del modelo de datos (falso positivo investigado, NO un bug de producto): un turno sin fila `turno_servicio` se puede CANCELAR pero NO REAGENDAR — reagendarTurno deriva serviceIds de negocioScoped().turnoServicios() para recomputar duración, y rescheduleAppointment no tiene de dónde sacar cuánto dura. El fallo aparente inicial de reagendar era una seed de test incompleta (turno sin servicios), ya corregida; el código de producto es correcto."
  - "Las evals offline (apps/bot/evals/) mockean generateText (vi.fn en responder.eval.test.ts, línea 166) por diseño: asertan NUESTRA lógica (gate D-12, scope, no-double-book, confirm-before-cancel sobre result.steps sintéticos), NO el comportamiento del modelo. La cobertura de eval NO debe confundirse con cobertura en vivo — esa la da scripts/verify-bot-conversation-live.ts (PASSED contra Gemini real)."
  - "responder.ts línea 139 usa google('gemini-3.1-flash-lite'); CLAUDE.md y el stack doc referencian 'Gemini 2.5 Flash-lite'. El id resuelve y el script en vivo PASSED contra Gemini real, así que no es un blocker — informativo (discrepancia de versión de modelo respecto a la doc del stack)."
  - "Informativo (env / free tier): el free tier de Gemini permite 15 requests/minuto, no ~30 como cita STACK.md — la corrida final agotó cuota mid-escenario (RESOURCE_EXHAUSTED, quotaValue '15', modelo gemini-3.1-flash-lite). Actualizar STACK.md al planear capacidad."
  - "Informativo (degradación graceful confirmada bajo presión REAL, no mockeada): cuando el siguiente paso del tool-loop pegó contra la cuota DESPUÉS de que reagendarTurno ya ejecutó (fila ya movida), responder() tomó el camino de error y devolvió SAFE_FALLBACK_MESSAGE en vez de crashear o emitir string vacío. El camino de error de generateText quedó ejercido en vivo, no solo en unit tests."
---

# Phase 6: Agente conversacional de agendamiento — Verification Report

**Phase Goal:** Un cliente puede agendar un turno real conversando en lenguaje natural por WhatsApp, sin intervención humana de la peluquería — el valor central del producto.
**Verified:** 2026-07-10
**Status:** passed
**Re-verification:** Sí — warning #1 (reagendar conversacional) cerrado con nueva evidencia en vivo (Escenario 5). Verificación inicial fue human_needed.

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth (Success Criterion) | Status | Evidence |
|---|---------------------------|--------|----------|
| 1 | El bot identifica en lenguaje natural qué servicio(s) y con qué profesional (o "sin preferencia") | ✓ VERIFIED | `asignarProfesional.ts` envuelve `autoAssign` (D-04) para "sin preferencia"; `consultarNegocio.ts` resuelve servicios/ids reales. Live: Turn 1 "quiero un turno para un corte" → pide día/hora; Turn 3 "el corte clásico nomás" → servicio resuelto correctamente. |
| 2 | Propone horarios reales del motor; confirma solo con `turno_id` real, nunca inventa | ✓ VERIFIED | `buscarHorarios.ts` envuelve `computeSlots`. Gate D-12 en `responder.ts` (`extractRealTurnoId` escanea `result.steps`, líneas 154-171; `hasClosingLanguage` + bloqueo líneas 330-347). Live: ofreció slots reales 13:00-18:30; A1 asertó los 3 `role:"user"` en `conversacion.context.messages` en orden. |
| 3 | Responde precios/horarios/disponibilidad/estado de turno | ✓ VERIFIED | `consultarNegocio.ts` (negocioScoped). Regla de narración POSITIVA en `systemPrompt.ts` línea 107. Live: "cuanto sale el corte" → "$6000" leído de la DB real, sin disparar SAFE_FALLBACK. |
| 4 | Cliente cancela **o** reagenda por WhatsApp con la misma lógica de dominio que el dashboard | ✓ VERIFIED (ambas mitades) | `cancelarTurno.ts` → `cancelAppointment` compartido (CR-03 ownership check líneas 113-120). `reagendarTurno.ts` → `rescheduleAppointment` (CR-03 líneas 123-126). Live cancelar: A5a pide confirmación, A5b → fila `estado='cancelado'`. Live reagendar (Escenario 5): A8 la MISMA fila movió `inicio` 2026-07-12T02:00:00Z → 2026-07-10T19:00:00Z, sigue `confirmado`; A8b UPDATE no INSERT (1 turno). Args reales del modelo capturados por probe → RES ok:true. |
| 5 | Resiste prompt injection; nunca expone datos de otro cliente/tenant | ✓ VERIFIED | Framing anti-injection D-13 en `systemPrompt.ts` línea 121. Seguridad code-side: ownership check en `cancelarTurno.ts` (`turno.cliente_id === clienteId`), no depende del LLM. Live A6: attacker con turnoId de víctima + injection explícita → modelo INDUCIDO a intentar cancelar, detenido por el ownership check; víctima sigue `confirmado`; A7 sin leak de teléfono ni system prompt. |

**Score:** 5/5 criterios verificados en vivo (SC#4 completo — cancelar Y reagendar; 0 behavior-unverified).

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/bot/src/conversation/responder.ts` | tool-loop + gate D-12 + persistencia | ✓ VERIFIED | 435 líneas. `generateText` con `stopWhen: isStepCount(6)`, 7 tools scopeadas por negocioId/clienteId. Firma posicional preservada. |
| `apps/bot/src/conversation/closingLanguage.ts` | léxico D-12 fuente única | ✓ VERIFIED | `hasClosingLanguage` + `hasSuccessfulCancel` (CR-01). Importado por responder y traceAssertions, nunca redeclarado. |
| `apps/bot/src/conversation/conversationState.ts` | parse/serialize context | ✓ VERIFIED | `parseConversationContext` no lanza ante {} o malformado. |
| `apps/bot/src/conversation/systemPrompt.ts` | voz AR + D-12 + D-13 + narración | ✓ VERIFIED | Anti-injection (línea 121), narración positiva (107), confirm-before-cancel (115). |
| `apps/bot/src/conversation/buildBotAvailabilityData.ts` | AvailabilityData vía negocioScoped | ✓ VERIFIED | 100% negocioScoped, sin acceso raw. |
| tools/buscarHorarios, asignarProfesional, consultarNegocio | tools de lectura | ✓ VERIFIED | computeSlots / autoAssign / negocioScoped respectivamente. |
| tools/confirmarTurno | bookAppointment, turno_id real, sin skipBookingWindow | ✓ VERIFIED | `bookAppointment` (línea 141); resultado ok incluye turnoId real; error nunca incluye turnoId. Sin `skipBookingWindow` (grep confirma ausencia). |
| tools/reagendarTurno | rescheduleAppointment + CR-03 | ✓ VERIFIED | `rescheduleAppointment` (línea 159), ownership check líneas 123-126. Comportamiento conversacional ejercido en vivo (Escenario 5, A8/A8b). |
| tools/cancelarTurno | cancelAppointment compartido + CR-03 | ✓ VERIFIED | `cancelAppointment` (línea 124), ownership check líneas 113-120, no distingue "no existe" de "no es tuyo". |
| `apps/bot/src/queue/inboundWorker.ts` | needsHuman skip (D-11) | ✓ VERIFIED | `parseConversationContext` antes de responder; `if (needsHuman) return` líneas 132-139. |
| `packages/availability-engine` cancelAppointment | motor compartido (06-01) | ✓ VERIFIED | Extraído al motor, barrel export, dashboard lo consume. |
| `apps/bot/evals/*` (dataset, traceAssertions, judge, runner, promptfoo) | suite de evals | ✓ VERIFIED (offline) | Presentes y wired. generateText MOCKEADO por diseño (ver warnings). |

### Key Link Verification

| From | To | Via | Status |
|------|-----|-----|--------|
| `responder.ts` | closingLanguage + 7 tools + buildSystemPrompt + parseConversationContext | `generateText({ tools })` con closure negocioId/clienteId; gate importa léxico | ✓ WIRED |
| `responder.ts` | persistencia userMessage (Gap 1) | `{role:'user'}` persistido en camino feliz (línea 419) Y de error (línea 302) | ✓ WIRED |
| `responder.ts` guard empty-text | reintento con `tools: {}` (línea 371) | ninguna segunda escritura posible durante reintento | ✓ WIRED |
| `inboundWorker.ts` | `conversacion.context.needsHuman` | parseConversationContext antes de responder (D-11) | ✓ WIRED |
| `cancelarTurno.ts` / `reagendarTurno.ts` | `cancelAppointment` / `rescheduleAppointment` | import desde @turnosbot/availability-engine + ownership CR-03 | ✓ WIRED |
| `dashboard/actions/turnos.ts` | `cancelAppointment` | import compartido, no UPDATE inline | ✓ WIRED |

### Requirements Coverage

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|----------|
| BOT-01 | Identifica servicio(s) en NL | ✓ SATISFIED | consultarNegocio + live SC#1 |
| BOT-02 | Profesional / "sin preferencia" | ✓ SATISFIED | asignarProfesional/autoAssign |
| BOT-03 | Negocia día/hora con slots reales | ✓ SATISFIED | buscarHorarios/computeSlots + live |
| BOT-04 | Confirma atado a turno_id real | ✓ SATISFIED | confirmarTurno + gate D-12 + live A1/D-12 |
| BOT-05 | Precios | ✓ SATISFIED | consultarNegocio + live "$6000" |
| BOT-06 | Horarios de profesionales | ✓ SATISFIED | consultarNegocio (profesionales) |
| BOT-07 | Disponibilidad en tiempo real | ✓ SATISFIED | buscarHorarios/computeSlots |
| BOT-08 | Estado de turno existente | ✓ SATISFIED | consultarNegocio (estado_turno, post-fetch filter) |
| BOT-09 | Cancelar por WhatsApp | ✓ SATISFIED | cancelarTurno + live A5a/A5b |
| BOT-10 | Reagendar por WhatsApp | ✓ SATISFIED | reagendarTurno → rescheduleAppointment + live Escenario 5 (A8/A8b, args reales del modelo, UPDATE de la misma fila) |
| BOT-11 | Resiste injection, no expone datos | ✓ SATISFIED | D-13 + ownership code-side + live A6/A7 |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `buscarHorarios.ts` | 66 | "TODOS" (falso positivo — palabra española "todos", no debt marker) | ℹ️ Info | Ninguno |

No hay TODO/FIXME/XXX reales, ni stubs, ni empty implementations en el source de fase 6. Los 3 debug sessions relacionados están archivados en `.planning/debug/resolved/` (responder-history-drops-user-messages, responder-empty-text-after-tool-call, responder-buildsystemprompt-missing-args).

### Behavioral Evidence (live, no re-ejecutado por el verificador)

Fuente: `scripts/verify-bot-conversation-live.ts` (drive del `responder()` real, sin mocks, tools + DB reales) contra Gemini + Supabase `bdgufnitakelyialjoqg` (ref confirmado). Corrida final con Escenario 5 (reagendar): **PASSED, exit 0.** Cubre en vivo los 5 SCs: SC#1/2/3/5 y SC#4 ambas mitades (cancelar A5a/A5b, reagendar A8/A8b). Soporte adicional citado: apps/bot vitest 223/223 (24 files), availability-engine 61/61 (7 files), `tsc --noEmit` apps/bot 0 errores. Además, el camino de error de `generateText` (SAFE_FALLBACK tras RESOURCE_EXHAUSTED) quedó ejercido en vivo, no solo mockeado. (No re-ejecutado aquí — requiere `.env`.)

### Human Verification Required

Ninguna. El único item que estaba pendiente (reagendamiento conversacional end-to-end) fue cerrado con la evidencia en vivo del Escenario 5.

### Gaps Summary

Sin gaps bloqueantes ni items de verificación humana pendientes. Los 5 criterios de éxito tienen implementación real, wired al camino sancionado, y evidencia en vivo contra Gemini + Supabase reales — incluyendo ahora ambas mitades de SC#4 (cancelar y reagendar). El guardrail catastrófico #1 (confirmación fantasma / gate D-12) y la seguridad anti-injection son code-side (no dependen del LLM), la propiedad correcta, demostrada en vivo. La degradación graceful bajo cuota real (SAFE_FALLBACK, sin crash ni string vacío, con la escritura ya persistida antes del error) refuerza la robustez del camino de error. Warnings restantes son informativas: evals offline mockean el modelo (no confundir con cobertura live), id de modelo `gemini-3.1-flash-lite` vs doc, límite real del free tier (15 rpm) e invariante del modelo de datos (turno sin servicios no reagenda). Status: **passed**.

---

_Verified: 2026-07-10_
_Verifier: Claude (gsd-verifier)_
