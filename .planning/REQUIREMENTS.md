# Requirements: TurnosBot

**Defined:** 2026-07-03
**Core Value:** Un cliente puede agendar un turno real, en un horario realmente disponible, conversando por WhatsApp en lenguaje natural — sin intervención humana de la peluquería.

## v1 Requirements

Requisitos para el release inicial. Cada uno mapea a una fase del roadmap.

### Fundación multitenant y auth (CORE)

- [x] **CORE-01**: Toda tabla de negocio está aislada por `tenant_id` y ninguna consulta puede leer datos de otro tenant
- [x] **CORE-02**: El dashboard aplica RLS por usuario de Supabase Auth (aislamiento enforced por la base)
- [x] **CORE-03**: El servicio del bot (service_role) enforcea `tenant_id` en una capa de queries obligatoria, verificada con tests cross-tenant
- [x] **CORE-04**: Los turnos usan `TIMESTAMPTZ` y timezone del tenant (`America/Argentina/*`) de forma consistente
- [x] **CORE-05**: La base impide doble-reserva de un profesional en el mismo rango horario mediante constraint a nivel Postgres (EXCLUDE/GiST)

### Autenticación del dashboard (AUTH)

- [x] **AUTH-01**: Un dueño de peluquería puede iniciar sesión en el dashboard con email y contraseña
- [ ] **AUTH-02**: La sesión persiste entre refrescos del navegador
- [ ] **AUTH-03**: Un usuario autenticado solo ve y opera datos de su propio tenant
- [ ] **AUTH-04**: El usuario puede cerrar sesión desde cualquier página

### Gestión de profesionales (PRO)

- [ ] **PRO-01**: El dueño puede crear, editar, activar/desactivar (soft delete) y listar profesionales
- [ ] **PRO-02**: El dueño puede definir el horario semanal recurrente de cada profesional (múltiples bloques por día)
- [ ] **PRO-03**: El dueño puede asignar a cada profesional los servicios que realiza (no todos hacen todo)
- [ ] **PRO-04**: El dueño puede fijar un precio custom de un servicio para un profesional (pisa el precio base)

### Servicios y precios (SVC)

- [ ] **SVC-01**: El dueño puede crear, editar, activar/desactivar y listar servicios con nombre, descripción, precio y duración estimada
- [ ] **SVC-02**: El dueño puede definir el orden de visualización de los servicios

### Perfil del negocio (BIZ)

- [ ] **BIZ-01**: El dueño puede editar nombre, dirección, teléfono, horario general y timezone del negocio
- [ ] **BIZ-02**: El dueño puede ver el número de WhatsApp vinculado al negocio
- [ ] **BIZ-03**: El dueño puede configurar la granularidad de la grilla (slot de 15 o 30 min)

### Motor de disponibilidad (AVAIL)

- [ ] **AVAIL-01**: El sistema calcula slots libres cruzando horario de trabajo − bloqueos manuales − turnos confirmados/pendientes
- [ ] **AVAIL-02**: El cálculo soporta turnos multi-servicio sumando las duraciones en un solo bloque contiguo
- [ ] **AVAIL-03**: Al agendar, el sistema congela nombre, precio y duración de cada servicio en ese momento
- [ ] **AVAIL-04**: El motor es un módulo único compartido: el bot y la grilla del dashboard nunca discrepan sobre qué está libre
- [ ] **AVAIL-05**: Cuando el cliente no tiene preferencia de profesional, el sistema auto-asigna el primer profesional disponible para el horario pedido

### Grilla y administración de turnos (APPT)

- [ ] **APPT-01**: El dueño ve una grilla de turnos por profesional y por día
- [ ] **APPT-02**: El dueño puede bloquear manualmente slots de un profesional (ej: se va temprano, turno médico)
- [ ] **APPT-03**: El dueño puede ver el detalle de un turno confirmado (cliente, servicios, precio, horario)
- [ ] **APPT-04**: El dueño puede cancelar un turno desde el dashboard
- [ ] **APPT-05**: El dueño puede reagendar un turno desde el dashboard
- [ ] **APPT-06**: El dueño puede crear un turno manualmente desde el dashboard (cliente que llama/viene)

### Integración WhatsApp Cloud API (WA)

- [ ] **WA-01**: El sistema recibe webhooks de la WhatsApp Cloud API oficial y verifica la firma `X-Hub-Signature-256` sobre el body crudo
- [ ] **WA-02**: El sistema resuelve el tenant a partir del `phone_number_id` del mensaje entrante
- [ ] **WA-03**: El sistema procesa los mensajes de forma asíncrona y responde 200 rápido, con deduplicación por `messages[].id`
- [ ] **WA-04**: El sistema envía mensajes salientes al cliente por la Cloud API dentro de la ventana de servicio de 24h
- [ ] **WA-05**: El sistema persiste conversaciones y mensajes (auditoría/debugging) con el estado del bot en `context` (jsonb)

### Agente conversacional de agendamiento (BOT)

- [ ] **BOT-01**: El bot identifica en lenguaje natural qué servicio(s) quiere el cliente
- [ ] **BOT-02**: El bot pregunta y registra con qué profesional lo quiere (o gestiona "sin preferencia")
- [ ] **BOT-03**: El bot negocia día y horario proponiendo slots reales del motor de disponibilidad
- [ ] **BOT-04**: El bot confirma el turno con un resumen y lo agenda, con el mensaje de confirmación atado a un `turno_id` real (nunca inventado)
- [ ] **BOT-05**: El bot responde consultas de precios de cada servicio
- [ ] **BOT-06**: El bot responde los horarios de trabajo de cada profesional
- [ ] **BOT-07**: El bot responde la disponibilidad en tiempo real de un profesional
- [ ] **BOT-08**: El bot responde el estado/confirmación de un turno existente del cliente
- [ ] **BOT-09**: El cliente puede cancelar un turno por WhatsApp (misma lógica de dominio que el dashboard)
- [ ] **BOT-10**: El cliente puede reagendar un turno por WhatsApp (misma lógica de dominio que el dashboard)
- [ ] **BOT-11**: El bot resiste intentos de prompt-injection y no expone datos de otros clientes/tenants

### Superadmin (SADMIN)

- [ ] **SADMIN-01**: El superadmin puede crear, editar y desactivar tenants (peluquerías)
- [ ] **SADMIN-02**: El superadmin puede vincular a cada tenant su config de WhatsApp (phone_number_id, waba_id, token encriptado, número visible)
- [ ] **SADMIN-03**: El superadmin puede listar y acceder a todos los tenants; su panel está aislado del acceso RLS de los dueños

### Hardening / launch readiness (SEC)

- [ ] **SEC-01**: Los tokens de acceso de WhatsApp por tenant se almacenan encriptados en reposo (Supabase Vault o AES-GCM)
- [ ] **SEC-02**: Existe un test de carga concurrente que prueba que la constraint anti-doble-reserva se sostiene
- [ ] **SEC-03**: Existe un test de aislamiento cross-tenant sobre las queries service_role del bot

## v2 Requirements

Diferido a futuro. Registrado pero fuera del roadmap actual.

### Recordatorios (REMIND)

- **REMIND-01**: Recordatorio automático de turno 24h antes por WhatsApp (requiere plantilla HSM aprobada por Meta + worker de scheduling; tabla `REMINDER` ya reservada en el schema)

### Pagos (PAY)

- **PAY-01**: Cobro de seña vía link de pago (MercadoPago) para confirmar el turno (requiere máquina de estados de pago + tablas nuevas)

### Onboarding self-service (ONB)

- **ONB-01**: Auto-registro de peluquerías con embedded signup de Meta (alta del número de WhatsApp por la propia peluquería)

## Out of Scope

Excluido explícitamente. Documentado para evitar scope creep.

| Feature | Reason |
|---------|--------|
| Métricas, gráficos, analytics, reportes | Diferido explícitamente por el usuario; no es core del valor v1 |
| Soluciones de WhatsApp no oficiales (Baileys/QR) | Incompatible con Meta Tech Provider; prohibido |
| Multi-sucursal por tenant | No requerido para peluquerías individuales en v1 |
| Loyalty / marketing / broadcasts | Fuera del alcance del core de agendamiento |
| Lista de espera / walk-in queue | Complejidad no justificada para v1 |
| Buffer/tiempo entre turnos | Decidido sin buffer en v1; turnos consecutivos |

## Traceability

Qué fases cubren qué requisitos.

| Requirement | Phase | Status |
|-------------|-------|--------|
| CORE-01 | Phase 1 | Complete |
| CORE-02 | Phase 1 | Complete |
| CORE-03 | Phase 1 | Complete |
| CORE-04 | Phase 1 | Complete |
| CORE-05 | Phase 1 | Complete |
| AUTH-01 | Phase 2 | Complete |
| AUTH-02 | Phase 2 | Pending |
| AUTH-03 | Phase 2 | Pending |
| AUTH-04 | Phase 2 | Pending |
| PRO-01 | Phase 2 | Pending |
| PRO-02 | Phase 2 | Pending |
| PRO-03 | Phase 2 | Pending |
| PRO-04 | Phase 2 | Pending |
| SVC-01 | Phase 2 | Pending |
| SVC-02 | Phase 2 | Pending |
| BIZ-01 | Phase 2 | Pending |
| BIZ-02 | Phase 2 | Pending |
| BIZ-03 | Phase 2 | Pending |
| SADMIN-01 | Phase 2 | Pending |
| SADMIN-02 | Phase 2 | Pending |
| SADMIN-03 | Phase 2 | Pending |
| AVAIL-01 | Phase 3 | Pending |
| AVAIL-02 | Phase 3 | Pending |
| AVAIL-03 | Phase 3 | Pending |
| AVAIL-04 | Phase 3 | Pending |
| AVAIL-05 | Phase 3 | Pending |
| APPT-01 | Phase 4 | Pending |
| APPT-02 | Phase 4 | Pending |
| APPT-03 | Phase 4 | Pending |
| APPT-04 | Phase 4 | Pending |
| APPT-05 | Phase 4 | Pending |
| APPT-06 | Phase 4 | Pending |
| WA-01 | Phase 5 | Pending |
| WA-02 | Phase 5 | Pending |
| WA-03 | Phase 5 | Pending |
| WA-04 | Phase 5 | Pending |
| WA-05 | Phase 5 | Pending |
| BOT-01 | Phase 6 | Pending |
| BOT-02 | Phase 6 | Pending |
| BOT-03 | Phase 6 | Pending |
| BOT-04 | Phase 6 | Pending |
| BOT-05 | Phase 6 | Pending |
| BOT-06 | Phase 6 | Pending |
| BOT-07 | Phase 6 | Pending |
| BOT-08 | Phase 6 | Pending |
| BOT-09 | Phase 6 | Pending |
| BOT-10 | Phase 6 | Pending |
| BOT-11 | Phase 6 | Pending |
| SEC-01 | Phase 7 | Pending |
| SEC-02 | Phase 7 | Pending |
| SEC-03 | Phase 7 | Pending |

**Coverage:**
- v1 requirements: 51 total (nota: el conteo previo de "43" en este documento era incorrecto/desactualizado; el conteo real de REQ-IDs listados arriba es 51)
- Mapped to phases: 51/51 ✓
- Unmapped: 0 ✓

---
*Requirements defined: 2026-07-03*
*Last updated: 2026-07-03 after roadmap creation (traceability completed)*
