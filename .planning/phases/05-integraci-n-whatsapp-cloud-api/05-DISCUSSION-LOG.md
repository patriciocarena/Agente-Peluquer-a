# Phase 5: Integración WhatsApp Cloud API - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-06
**Phase:** 5-Integración WhatsApp Cloud API
**Areas discussed:** Delegadas a Claude (el usuario respondió "hacé todo vos")

---

## Selección de áreas grises

Se le presentaron al usuario 4 áreas grises para elegir cuáles discutir:

| Área | Descripción | Seleccionada |
|------|-------------|--------------|
| Testing en vivo vs código-primero | ¿Cuenta Meta Developer + WABA de prueba, o simulación local? | — |
| Qué responde el bot en la Fase 5 | Eco/stub end-to-end vs solo capacidad de envío | — |
| Procesamiento async: pg-boss vs simple | Cola Postgres + worker vs inline | — |
| Token de WhatsApp interino | Plano por ahora (TODO Fase 7) vs Vault ya | — |

**Respuesta del usuario (texto libre):** "hace todo vos" → delegación total a Claude.

---

## Claude's Discretion

El usuario delegó **todas** las decisiones. Claude las tomó con criterio técnico alineado al stack de CLAUDE.md (ver CONTEXT.md D-01..D-12). Resumen de las elecciones y sus alternativas descartadas:

| Decisión | Elegido | Alternativa descartada | Razón |
|----------|---------|------------------------|-------|
| D-01 Testing | Código-primero + simulación local firmada; live diferido y gated por env | Bloquear la fase hasta tener Meta verificado | Meta tarda 2-7+ días; no debe bloquear el desarrollo |
| D-02 Respuesta | Stub de eco cableado end-to-end, con un único punto de reemplazo para Fase 6 | Solo dejar la capacidad de envío sin cablear | Prueba el loop entrante→saliente de verdad (WA-04) |
| D-03 Async | pg-boss (session-mode 5432) + dedup por messages[].id | Procesar inline tras el 200 | Es la decisión ya fijada en el stack; desacopla el ACK de Meta |
| D-04 Token | Choke point `getWhatsappToken`, plano por ahora, TODO a SEC-01 | Montar Vault en esta fase | SEC-01 (encriptación) es Fase 7; se deja el seam para el swap |

## Deferred Ideas

- Test en vivo contra Meta real (túnel HTTPS + WABA + número) → cuando el usuario tenga cuenta Meta verificada.
- Encriptación del token en reposo → Fase 7 (SEC-01).
- UI del superadmin para vincular WhatsApp → Fase 2 (SADMIN-02).
- Embedded Signup / auto-onboarding → backlog (ONB-01).
- Recordatorios con plantilla HSM → backlog (REMIND-01).
- Agente conversacional (IA) → Fase 6 (BOT-01..10).
