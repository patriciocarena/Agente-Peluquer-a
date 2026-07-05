# Roadmap: TurnosBot

## Overview

TurnosBot se construye en siete fases que van de la base hacia el valor central. Primero se levanta la fundación multitenant (schema, aislamiento por `tenant_id`, protección anti-doble-reserva) porque todo lo demás depende de que esto esté bien desde el primer día. Luego el dashboard cobra vida: login, y la carga de datos que el negocio necesita (profesionales, servicios, precios, perfil del negocio) — sin esto el bot no tiene nada sobre lo cual razonar. Con datos reales cargados, se construye y prueba en aislamiento el motor de disponibilidad, la pieza más crítica de todo el sistema, antes de conectarlo a ninguna interfaz. Ese motor alimenta primero la grilla de turnos del dashboard (para que el dueño pueda operar turnos manualmente) y después la integración con WhatsApp Cloud API (plomería de webhooks, sin lógica de IA todavía). Recién ahí se construye el agente conversacional que usa toda esa base para agendar turnos reales por WhatsApp. Cierra con una fase de hardening que blinda seguridad y concurrencia antes de que el primer tenant real entre en producción.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Fundación multitenant** - Base de datos, aislamiento por tenant y esqueleto de infraestructura listos y verificados
- [x] **Phase 2: Dashboard y datos del negocio** - El dueño puede loguearse y cargar profesionales, servicios, precios y perfil del negocio
- [x] **Phase 3: Motor de disponibilidad** - El sistema calcula con precisión qué horarios están realmente libres, probado en aislamiento (completed 2026-07-05)
- [ ] **Phase 4: Grilla y turnos del dashboard** - El dueño puede ver, bloquear, crear, cancelar y reagendar turnos desde el dashboard
- [ ] **Phase 5: Integración WhatsApp Cloud API** - El sistema recibe y envía mensajes de WhatsApp de forma segura, enrutados al tenant correcto
- [ ] **Phase 6: Agente conversacional de agendamiento** - Un cliente puede agendar, consultar y cancelar/reagendar un turno real conversando por WhatsApp
- [ ] **Phase 7: Hardening y listo para producción** - El sistema resiste concurrencia, aislamiento cross-tenant y protege credenciales antes del primer tenant real

## Phase Details

### Phase 1: Fundación multitenant

**Goal**: La base de datos y el esqueleto de infraestructura garantizan aislamiento por tenant, timezone correcto y protección anti-doble-reserva desde el primer momento
**Depends on**: Nothing (first phase)
**Requirements**: CORE-01, CORE-02, CORE-03, CORE-04, CORE-05
**Success Criteria** (what must be TRUE):

  1. Ninguna consulta a la base puede devolver datos de un tenant distinto al solicitado (verificado con datos de prueba de al menos dos tenants)
  2. Un usuario logueado en el dashboard solo puede ver/operar datos de su propio tenant, aunque intente forzar el acceso a otro
  3. Todo horario y turno se guarda con `TIMESTAMPTZ` y se interpreta correctamente en el timezone del tenant (`America/Argentina/*`)
  4. Un intento de crear dos turnos superpuestos para el mismo profesional es rechazado por la base de datos, no por lógica de aplicación
  5. El proyecto corre (build + arranque) en un contenedor `linux/arm64`, verificado antes de acumular dependencias

**Plans**: 5 plans

- [x] 01-01-PLAN.md — pnpm monorepo workspace + shared package/dashboard stubs (scaffolding)
- [x] 01-02-PLAN.md — apps/bot health server + arm64 Docker build/health-check (Success Criteria #5)
- [x] 01-03-PLAN.md — 14-table reference schema + GiST anti-double-booking + RLS policies (files)
- [x] 01-04-PLAN.md — [BLOCKING] apply migrations to live bdgufnitakelyialjoqg + generate db-types
- [x] 01-05-PLAN.md — Seed 2 tenants + isolation/timezone/double-booking verification + tenantScoped pattern

### Phase 2: Dashboard y datos del negocio

**Goal**: El dueño de la peluquería puede loguearse y cargar toda la información base de su negocio; el superadmin puede dar de alta tenants
**Depends on**: Phase 1
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04, PRO-01, PRO-02, PRO-03, PRO-04, SVC-01, SVC-02, BIZ-01, BIZ-02, BIZ-03, SADMIN-01, SADMIN-02, SADMIN-03
**Success Criteria** (what must be TRUE):

  1. Un dueño puede iniciar sesión con email/contraseña, la sesión persiste al refrescar el navegador, y puede cerrar sesión desde cualquier página
  2. Un dueño puede crear, editar y desactivar profesionales, definir su horario semanal recurrente, y asignarles qué servicios realizan (con precio custom opcional)
  3. Un dueño puede crear, editar, desactivar y ordenar servicios con nombre, precio y duración
  4. Un dueño puede editar el perfil del negocio (nombre, dirección, horario general, timezone, granularidad de grilla) y ver el número de WhatsApp vinculado
  5. Un superadmin puede crear, editar y desactivar tenants, vincular su config de WhatsApp, y listar todos los tenants desde un panel aislado del acceso de los dueños

**Plans**: 7/8 plans executed
**Wave 1**

- [x] 02-01-PLAN.md — [BLOCKING] Migración 0003 (Tenant→Negocio split + RLS auth_negocio_ids) + seeds + apply live/regen db-types (gated)
- [x] 02-02-PLAN.md — Fundación dashboard: Tailwind v4 + shadcn init + tema claro/oscuro + vitest (legitimidad de paquetes gated)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 02-03-PLAN.md — Clientes Supabase (dual + service_role) + middleware role gate + login/logout (AUTH-01..04)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 02-04-PLAN.md — Shell owner + selector de negocio + Perfil del negocio (BIZ-01/02/03)
- [x] 02-08-PLAN.md — Panel superadmin /admin: CRUD Tenant/Negocio + bootstrap superadmin (SADMIN-01/02/03, gated)

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 02-05-PLAN.md — CRUD Servicios + soft-delete + reordenamiento drag-and-drop (SVC-01/02)
- [x] 02-06-PLAN.md — CRUD base Profesionales + soft-delete (PRO-01)

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 02-07-PLAN.md — Horario semanal multi-bloque + matriz de servicios/precio custom (PRO-02/03/04)

**UI hint**: yes

### Phase 3: Motor de disponibilidad

**Goal**: El sistema calcula con exactitud qué horarios están libres para cada profesional, de forma aislada y verificable antes de conectarlo a cualquier interfaz
**Depends on**: Phase 2
**Requirements**: AVAIL-01, AVAIL-02, AVAIL-03, AVAIL-04, AVAIL-05
**Success Criteria** (what must be TRUE):

  1. El sistema calcula correctamente los slots libres de un profesional cruzando su horario de trabajo, sus bloqueos manuales y sus turnos confirmados/pendientes
  2. Un turno con múltiples servicios (ej: corte + barba) suma las duraciones correctamente y reserva un único bloque contiguo
  3. Al agendar, el turno queda con el nombre, precio y duración de cada servicio congelados en ese momento (cambios posteriores al servicio no afectan turnos ya creados)
  4. El mismo cálculo de disponibilidad es usado por cualquier consumidor (no hay dos implementaciones que puedan discrepar)
  5. Cuando el cliente no pide un profesional específico, el sistema asigna automáticamente el primero disponible para ese horario

**Plans**: 5 plans

**Wave 1** *(paralelas — sin overlap de archivos)*

- [x] 03-01-PLAN.md — Wave 0: deps (date-fns/@date-fns/tz/zod/vitest) + vitest.config + types.ts (contra db-types) + constants.ts (60min/30d, D-04/D-05) + fixtures deterministas (AVAIL-04)
- [x] 03-02-PLAN.md — [BLOCKING] fix tenantScoped→negocioScoped (Pitfall 7: columna negocio_id post-0003) + smoke test cross-negocio live (gated)

**Wave 2** *(depende de 03-01)*

- [x] 03-03-PLAN.md — Primitivos puros TDD: subtractIntervals (half-open [)), snapToGrid (D-01, Pitfall 5), resolveWorkIntervalsForDate (TZDate, Pitfall 2) (AVAIL-01/02)

**Wave 3** *(depende de 03-03)*

- [x] 03-04-PLAN.md — computeSlots orquestación pura + autoAssign (hueco más temprano, D-03) + ventana de reserva + barrel index.ts (AVAIL-01/02/04/05)

**Wave 4** *(depende de 03-04)*

- [x] 03-05-PLAN.md — bookAppointment: snapshots congelados + precio_total + manejo 23P01 + verify script live (gated) (AVAIL-03/04)

### Phase 4: Grilla y turnos del dashboard

**Goal**: El dueño puede operar la agenda completa de turnos desde el dashboard, usando el mismo motor de disponibilidad que luego usará el bot
**Depends on**: Phase 3
**Requirements**: APPT-01, APPT-02, APPT-03, APPT-04, APPT-05, APPT-06
**Success Criteria** (what must be TRUE):

  1. El dueño ve una grilla de turnos por profesional y por día, reflejando el estado real de disponibilidad
  2. El dueño puede bloquear manualmente un slot de un profesional (ej: turno médico) y ese bloqueo se refleja de inmediato en la disponibilidad
  3. El dueño puede ver el detalle de un turno confirmado (cliente, servicios, precio, horario)
  4. El dueño puede cancelar, reagendar o crear manualmente un turno desde el dashboard (ej: cliente que llama por teléfono)

**Plans**: TBD
**UI hint**: yes

### Phase 5: Integración WhatsApp Cloud API

**Goal**: El sistema recibe y envía mensajes de WhatsApp de forma segura y confiable, enrutando cada mensaje al tenant correcto, sin lógica conversacional todavía
**Depends on**: Phase 2 (necesita `phone_number_id` configurado por tenant)
**Requirements**: WA-01, WA-02, WA-03, WA-04, WA-05
**Success Criteria** (what must be TRUE):

  1. El sistema verifica la firma `X-Hub-Signature-256` de cada webhook entrante sobre el body crudo, y rechaza (403) firmas falsificadas
  2. Un mensaje entrante se enruta al tenant correcto usando el `phone_number_id`, verificado con al menos dos números de prueba distintos
  3. El sistema responde 200 a Meta de forma rápida y procesa el mensaje de forma asíncrona, sin duplicar el procesamiento si Meta reintenta la entrega
  4. El sistema envía mensajes salientes al cliente dentro de la ventana de 24 horas y registra cuando esa ventana se cierra
  5. Toda conversación y mensaje queda persistido, con el estado del bot guardado en `context` para poder auditar/depurar

**Plans**: TBD

### Phase 6: Agente conversacional de agendamiento

**Goal**: Un cliente puede agendar un turno real conversando en lenguaje natural por WhatsApp, sin intervención humana de la peluquería — el valor central del producto
**Depends on**: Phase 3, Phase 4, Phase 5
**Requirements**: BOT-01, BOT-02, BOT-03, BOT-04, BOT-05, BOT-06, BOT-07, BOT-08, BOT-09, BOT-10, BOT-11
**Success Criteria** (what must be TRUE):

  1. El bot identifica en lenguaje natural qué servicio(s) quiere el cliente y con qué profesional (o gestiona "sin preferencia")
  2. El bot propone horarios reales del motor de disponibilidad, negocia día/hora con el cliente, y confirma el turno solo cuando existe un `turno_id` real devuelto por una herramienta (nunca inventa una confirmación)
  3. El bot responde correctamente consultas de precios, horarios de profesionales, disponibilidad en tiempo real y estado de turnos existentes
  4. Un cliente puede cancelar o reagendar su turno por WhatsApp usando la misma lógica de dominio que el dashboard
  5. El bot resiste intentos de manipulación (prompt injection) y nunca expone datos de otro cliente o de otro tenant

**Plans**: TBD

### Phase 7: Hardening y listo para producción

**Goal**: El sistema está blindado en los puntos de mayor riesgo (concurrencia, aislamiento cross-tenant, credenciales) antes de que el primer tenant real entre en producción
**Depends on**: Phase 6
**Requirements**: SEC-01, SEC-02, SEC-03
**Success Criteria** (what must be TRUE):

  1. Los tokens de acceso de WhatsApp de cada tenant están encriptados en la base (no legibles en una consulta directa a la tabla)
  2. Un test de carga con reservas concurrentes sobre el mismo slot confirma que solo una tiene éxito y el resto recibe un rechazo controlado
  3. Un test de aislamiento cross-tenant confirma que las consultas del bot (service_role) con el contexto del tenant A nunca devuelven filas del tenant B

**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Fundación multitenant | 5/5 | Complete | 2026-07-04 |
| 2. Dashboard y datos del negocio | 8/8 | Complete (verified 16/16; solo resta spot-check visual no bloqueante) | 2026-07-04 |
| 3. Motor de disponibilidad | 5/5 | Complete   | 2026-07-05 |
| 4. Grilla y turnos del dashboard | 0/TBD | Not started | - |
| 5. Integración WhatsApp Cloud API | 0/TBD | Not started | - |
| 6. Agente conversacional de agendamiento | 0/TBD | Not started | - |
| 7. Hardening y listo para producción | 0/TBD | Not started | - |

## Research Flags

Fases que probablemente necesiten investigación adicional al momento de planificar (`/gsd-research-phase`), por hallazgos de `research/SUMMARY.md`:

- **Phase 5 (Integración WhatsApp)**: la mecánica específica de la Graph API de Meta cambia con frecuencia (formas exactas del payload de webhook, flujo de intercambio de tokens de embedded signup, códigos de error exactos de la ventana de 24h) — confianza MEDIA en STACK.md/PITFALLS.md, se recomienda una pasada de documentación final al momento de implementar.
- **Phase 6 (Agente conversacional)**: las primitivas más nuevas del Vercel AI SDK v7 (`ToolLoopAgent`, patrones `stopWhen` multi-step) son recientes y ameritan verificación práctica contra la versión instalada; también es donde deben verificarse en firme los límites de rate del tier gratuito de Gemini antes de planificar capacidad.
- **Phase 7 (Hardening)**: el enfoque de encriptación de tokens (Supabase Vault vs. AES-GCM a nivel de aplicación) debe finalizarse contra la documentación vigente de Supabase Vault al momento de implementar.

Fases con patrones estándar bien documentados (research-phase probablemente innecesario): Phase 1, Phase 2, Phase 3, Phase 4 — CRUD estándar, RLS/tenant_id y GiST exclusion constraints son patrones de alta confianza y bien documentados.
