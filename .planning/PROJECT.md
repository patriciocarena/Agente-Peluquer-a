# TurnosBot — SaaS de agentes de WhatsApp para peluquerías

## What This Is

Plataforma **SaaS multitenant B2B** donde peluquerías masculinas de Argentina contratan un agente de IA que agenda turnos por WhatsApp mediante conversación natural. Cada peluquería (tenant) tiene su propio número de WhatsApp oficial, sus profesionales, servicios y agenda, todo aislado por `tenant_id`. Un único bot atiende a todos los tenants, contextualizado dinámicamente. Los dueños administran profesionales, servicios, precios, horarios y turnos desde un dashboard web. Un superadmin (el operador de la plataforma) gestiona todos los tenants.

## Core Value

Un cliente puede agendar un turno real, en un horario realmente disponible, conversando por WhatsApp en lenguaje natural — sin intervención humana de la peluquería. Si eso funciona de forma confiable, el producto tiene valor; todo lo demás es secundario.

## Requirements

### Validated

(Ninguno todavía — greenfield, se valida al shippear)

### Active

- [ ] Bot de WhatsApp que identifica el servicio deseado en lenguaje natural
- [ ] Bot que pregunta y asigna profesional
- [ ] Motor de disponibilidad que cruza horario de trabajo − bloqueos − turnos confirmados
- [ ] Bot que negocia día/horario contra disponibilidad real y confirma el turno
- [ ] Bot que responde consultas: precios, horarios de profesionales, disponibilidad en tiempo real, estado de turnos existentes
- [ ] Bot que permite al cliente cancelar/reagendar un turno por WhatsApp
- [ ] Integración con WhatsApp Business Cloud API oficial (webhook entrante + envío saliente)
- [ ] Enrutamiento multitenant: identificar el tenant por el número de WhatsApp del negocio
- [ ] Dashboard con auth y aislamiento de datos por tenant
- [ ] Dashboard: CRUD de profesionales + sus horarios de trabajo
- [ ] Dashboard: CRUD de servicios (precio, duración, descripción) + precio custom por profesional
- [ ] Dashboard: grilla de turnos por profesional y por día con bloqueo manual de slots
- [ ] Dashboard: administración de turnos confirmados (ver, cancelar, reagendar)
- [ ] Dashboard: perfil del negocio (nombre, dirección, horario general, número de WhatsApp vinculado)
- [ ] Panel de superadmin: alta y gestión manual de todos los tenants

### Out of Scope

- **Cobro de seña / pago para reservar** — v1 agenda sin pago; se evalúa como fase futura (agrega integración MercadoPago + complejidad).
- **Recordatorios automáticos de turnos** — requieren plantillas HSM aprobadas por Meta + cron de envío; la tabla `REMINDER` queda en el schema pero no se cablea en v1.
- **Onboarding self-service de tenants** — en v1 el superadmin da de alta cada peluquería manualmente.
- **Métricas, gráficos, analytics y reportes** — explícitamente diferido por el usuario.
- **Soluciones de WhatsApp no oficiales (Baileys / WhatsApp Web / QR)** — prohibido por incompatibilidad con Meta Tech Provider.

## Context

- El usuario está en proceso de convertirse en **Meta Tech Provider**; esto hace obligatoria la Cloud API oficial y descarta cualquier solución no oficial.
- El usuario **no escribe código**: Claude hace toda la implementación. Las explicaciones y decisiones deben ser claras para alguien que dirige el producto, no que lo codea.
- Ya tiene: VPS en Oracle Cloud (ARM, Ubuntu, 2 CPU / 12 GB RAM / 200 GB), API key de Gemini que usa en otros proyectos, y experiencia previa con Supabase.
- El usuario aportó un **schema de base de datos de referencia muy completo y bien pensado** (16 tablas, reglas de negocio, lógica de cálculo de disponibilidad) que se adopta como base del modelo de datos.
- Mercado inicial: peluquerías **masculinas en Argentina** (español rioplatense, timezone `America/Argentina/*`, precios en ARS).

## Constraints

- **Tech stack — WhatsApp**: WhatsApp Business **Cloud API oficial de Meta** — requisito de Tech Provider; no negociable.
- **Tech stack — LLM**: **Gemini Flash-lite 2.5** (free tier para empezar) — el usuario ya tiene API key.
- **Tech stack — Base de datos**: **Supabase (Postgres)** — multitenant por RLS con `tenant_id`; el usuario ya la conoce.
- **Tech stack — Agente**: **Vercel AI SDK (TypeScript)** con provider de Google (Gemini) — reemplaza a OpenClaw (ver Key Decisions).
- **Hosting**: VPS Oracle Cloud ARM Ubuntu (2 CPU / 12 GB / 200 GB) — todo debe correr en ARM y dentro de esos recursos.
- **Multitenancy**: aislamiento row-level por `tenant_id` desde el día 1; un bot compartido contextualizado por tenant.
- **Idioma/región**: español (AR), timezones argentinos, ARS.

## Key Decisions

| Decisión | Rationale | Outcome |
|----------|-----------|---------|
| Reemplazar OpenClaw por **Vercel AI SDK (TS)** | La doc oficial de OpenClaw confirma que usa Baileys (WhatsApp Web, QR) y es un gateway self-hosted de un solo operador — choca frontalmente con la Cloud API oficial y con el modelo multitenant B2B. Vercel AI SDK da tool-calling nativo, es provider-agnostic (Gemini hoy) y unifica el stack TS con el dashboard. | ✓ Good |
| **WhatsApp Cloud API oficial** (no Baileys) | Requisito para ser Meta Tech Provider; Meta prohíbe soluciones no oficiales para providers. | ✓ Good |
| **Supabase (Postgres)** como base multitenant | Aislamiento por RLS + `tenant_id`, Auth integrada, el usuario ya la usó. | — Pending |
| **Supabase Auth** en vez de `password_hash` a mano | El schema de referencia guarda `password_hash` en `ADMIN_USER`/`SUPER_ADMIN`; se reemplaza por `auth.users` + tabla de perfil, para no manejar credenciales manualmente y aprovechar RLS. | — Pending |
| **Next.js (App Router)** para el dashboard | Stack TS unificado con el bot; integración directa con Supabase Auth y RLS. | — Pending |
| Servicio del bot **separado del dashboard** (webhook Node long-running) | El bot necesita procesar webhooks entrantes de forma confiable e independiente del ciclo de request del dashboard. | — Pending |
| Sin seña, sin recordatorios, sin self-service en v1 | Reducir superficie de v1 al core: agendar turnos reales por conversación. | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-07-03 after initialization*
