# Phase 5: Integración WhatsApp Cloud API - Context

**Gathered:** 2026-07-06
**Status:** Ready for planning

<domain>
## Phase Boundary

El servicio de bot (`apps/bot`, Fastify) recibe y envía mensajes de WhatsApp de forma **segura** y **enrutada al tenant correcto**, y persiste la conversación. Cinco requisitos: WA-01 (webhook + verificación de firma sobre body crudo), WA-02 (resolver tenant por `phone_number_id`), WA-03 (procesamiento async + respuesta 200 rápida + dedup por `messages[].id`), WA-04 (envío saliente por Cloud API dentro de la ventana de 24h), WA-05 (persistir `conversacion`/`mensaje` con estado del bot en `context` jsonb).

**Es infraestructura de mensajería, NO el agente.** La lógica de IA que decide *qué* responder (interpretar intención, proponer horarios, confirmar turnos) es la **Fase 6**. En la Fase 5 el "cerebro" es un stub determinista.

**Fuera de alcance (fronteras ya asignadas en REQUIREMENTS.md):**
- **SADMIN-02** (UI del superadmin para cargar `phone_number_id`/`waba_id`/token del tenant) → **Fase 2**. En la Fase 5 la config se siembra por script/env, no por UI.
- **SEC-01** (encriptar tokens en reposo, Vault/AES-GCM) → **Fase 7**. Ver D-04.
- **BIZ-02** (el dueño ve el número vinculado) → Fase 2.
- **REMIND-01** (recordatorios con plantilla HSM aprobada) → backlog. La Fase 5 NO manda plantillas fuera de la ventana de 24h.
- Embedded Signup / auto-registro (ONB-01) → backlog. La vinculación WABA es manual/superadmin.
</domain>

<decisions>
## Implementation Decisions

Todas las decisiones de esta fase fueron **delegadas a Claude** ("hacé todo vos"). Se tomaron con criterio técnico alineado al stack ya fijado en CLAUDE.md. El usuario puede vetar cualquiera antes de planificar.

### Estrategia de testing / dependencia de Meta
- **D-01 (Código-primero, live-testing diferido):** Se construye toda la Fase 5 contra el spec de la Cloud API y se **verifica localmente con payloads de webhook firmados** (curl con HMAC-SHA256 usando un app-secret de dev), simulando a Meta — sin depender de una cuenta de Meta Developer verificada. Razón: la verificación de Meta Business/Tech Provider tarda 2-7+ días hábiles (blocker ya trackeado en STATE.md) y no hay cuenta/WABA confirmada; no debe bloquear el desarrollo. El cliente de envío saliente (WA-04) se implementa detrás de un **gate por env** (`WHATSAPP_LIVE=false` en dev → no pega a Graph API real, loguea/mockea el POST; `true` → pega a `graph.facebook.com`). Cuando el usuario tenga la cuenta Meta + WABA + número de prueba, se hace una **pasada de verificación en vivo** (túnel HTTPS tipo ngrok/cloudflared apuntando al webhook, registro del número, un mensaje real ida y vuelta) — anotado como ítem de seguimiento, NO parte del código de esta fase.

### Qué responde el bot en la Fase 5 (sin IA aún)
- **D-02 (Stub de eco/recepción, cableado end-to-end):** Se implementa la **capacidad de envío completa (WA-04)** y se la cablea a una respuesta **determinista mínima** (ej: "¡Hola! Recibimos tu mensaje 🙌 En breve te ayudamos a reservar tu turno.") para que el loop entrante→procesar→saliente sea verificable de punta a punta y WA-04 tenga un ejercicio real. El stub es claramente un placeholder que la **Fase 6 reemplaza** por el agente (Vercel AI SDK + Gemini). Debe vivir detrás de una función tipo `responder(conversacion, mensajeEntrante)` con un único punto de reemplazo, para que Fase 6 lo swapee sin tocar el webhook/worker.

### Procesamiento asíncrono
- **D-03 (pg-boss, como fija el stack):** El handler del webhook solo verifica firma + encola el evento crudo y responde `200` a Meta de inmediato; un **worker pg-boss** (mismo proceso u otro loop) hace el trabajo real (resolver tenant, persistir, responder). Razón: es la decisión ya fijada en CLAUDE.md (no agrega infra — corre sobre el Postgres de Supabase), y Meta reintenta hasta 7 días ante no-200, así que hay que desacoplar el ACK del procesamiento. **Conexión pg-boss:** directa/session-mode (puerto 5432), **nunca** el pooler transaction-mode (6543) — ver CLAUDE.md "What NOT to Use". **Dedup (WA-03):** llave de idempotencia por `messages[].id` (singletonKey de pg-boss al encolar + `mensaje.wa_message_id` con unicidad por negocio en el handler) → reintentos de Meta y reprocesos no duplican ni el guardado ni el envío.

### Manejo interino del token de WhatsApp (encriptación = Fase 7)
- **D-04 (Lectura del token vía un accessor único, plano por ahora, TODO explícito a Fase 7):** El token vive hoy en `negocio.whatsapp_token` (columna de texto plano). SEC-01 (encriptar en reposo) es **Fase 7**, así que en la Fase 5 **no** se monta Vault. Para respetar la frontera sin dispersar el riesgo, se introduce un **único choke point** `getWhatsappToken(negocioId)` que hoy lee la columna (o una env var de dev para el número de prueba) y que la Fase 7 reemplaza internamente por Vault/descifrado **sin tocar los call sites**. El riesgo de plano-en-reposo se documenta con un TODO que referencia SEC-01. En dev se prefiere una **env var** con el token de prueba antes que persistirlo.

### Decisiones de dominio ya resueltas (criterio de Claude, para no re-preguntar)
- **D-05 (Verificación GET del webhook):** handshake `hub.mode`/`hub.verify_token`/`hub.challenge` de Meta; `verify_token` desde env.
- **D-06 (Firma):** capturar el **body crudo** (Fastify `addContentTypeParser`/rawBody) ANTES de parsear JSON; HMAC-SHA256 con el App Secret; comparar con `crypto.timingSafeEqual` (nunca `===`). Ver CLAUDE.md pitfalls.
- **D-07 (Resolución de tenant, WA-02):** query a `negocio` por `whatsapp_phone_number_id`; si no matchea ningún tenant, se descarta el evento (log + 200, sin crear nada) — nunca adivinar tenant.
- **D-08 (Identidad del cliente):** del `from` (wa_id) del mensaje entrante se resuelve/crea el `cliente` de ESE negocio (reusando el patrón de alta que ya existe), para poder setear `conversacion.cliente_id` (NOT NULL).
- **D-09 (Ventana de 24h, WA-04):** al entrar un mensaje se setea/refresca `conversacion.ventana_expira_at = now()+24h`; el envío saliente solo se permite dentro de la ventana; fuera de ella (requeriría plantilla HSM) queda **fuera de alcance** (REMIND-01).
- **D-10 (Persistencia, WA-05):** find-or-create `conversacion` por `(negocio_id, cliente_id)`; guardar cada `mensaje` (entrante y saliente) con `contenido` jsonb, `direccion`, `wa_message_id`; el estado del bot va en `conversacion.context` jsonb (forma mínima ahora; la define la Fase 6).
- **D-11 (Aislamiento):** todo acceso a DB del worker pasa por el patrón `negocioScoped` que ya existe en `apps/bot/src/db/` — el tenant_id/negocio_id nunca se confía del payload sin validar contra el `phone_number_id` resuelto.
- **D-12 (Hardening del endpoint público):** `@fastify/helmet` + `@fastify/rate-limit` sobre el webhook (defensa barata en un VPS chico), como sugiere el stack.

### Claude's Discretion
Toda la fase quedó a discreción de Claude por pedido del usuario. Los detalles finos de implementación (estructura de módulos, nombres, forma exacta del `context` jsonb mínimo, tests) los resuelven investigación/planificación siguiendo estas decisiones y el stack de CLAUDE.md.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Stack, pitfalls y patrones de WhatsApp (AUTORITATIVO)
- `CLAUDE.md` — sección "Technology Stack" / "Stack Patterns by Variant" / "What NOT to Use": decide Fastify + raw-body para firma, pg-boss (session-mode 5432, NO 6543), `X-Hub-Signature-256` HMAC-SHA256 con `timingSafeEqual`, ventana de servicio 24h, Embedded Signup (diferido), cap de números 2→20 por Business Verification, y la prohibición de tokens en texto plano (contexto para D-04/SEC-01).

### Requisitos y roadmap
- `.planning/REQUIREMENTS.md` §"Integración WhatsApp Cloud API (WA)" — WA-01..WA-05 (texto normativo de cada requisito) + fronteras SADMIN-02 (Fase 2), SEC-01 (Fase 7), BIZ-02 (Fase 2), REMIND-01/ONB-01 (backlog).
- `.planning/ROADMAP.md` §"Phase 5: Integración WhatsApp Cloud API" — goal de la fase.

### Modelo de datos ya existente (no crear tablas nuevas)
- `packages/db-types/src/database.types.ts` — tablas `conversacion` (`context` jsonb, `ventana_expira_at`), `mensaje` (`wa_message_id`, `direccion`, `contenido` jsonb, `programado_en`), y columnas `negocio.whatsapp_phone_number_id`/`waba_id`/`whatsapp_token`/`display_phone_number`.

### Docs oficiales de Meta a consultar en investigación
- https://developers.facebook.com/docs/whatsapp/cloud-api — webhooks (handshake GET, retry 7 días), envío de mensajes, ventana de 24h. Verificar contra la versión actual de Graph API al implementar (la doc de Meta cambia seguido).
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `apps/bot/src/server.ts`: Fastify app con `/health` — se extiende con el webhook GET (verificación) y POST (recepción).
- `apps/bot/src/config/env.ts`: `loadEnv()` — se agregan las env vars nuevas (App Secret, verify token, `WHATSAPP_LIVE`, token de dev, DB URL directa para pg-boss).
- `apps/bot/src/db/negocioScoped.ts` (+ test) y `apps/bot/src/db/client.ts`: patrón de acceso a DB scopeado por negocio — el worker lo reutiliza (D-11).
- `packages/availability-engine`: exporta `bookAppointment`/`rescheduleAppointment`/`computeSlots` — NO se usa en la Fase 5 (es Fase 6), pero confirma que el dominio de agendamiento ya está compartido para cuando el agente lo consuma.

### Established Patterns
- Aislamiento por tenant estructural (mismo espíritu que `lib/auth/require-role.ts` y `getNegocioActivo()` del dashboard): el scoping se deriva server-side, nunca del cliente/payload. Acá el "cliente" es Meta y el scoping se deriva del `phone_number_id` verificado.
- Scripts gated por credenciales reales (patrón de `scripts/verify-*.ts`) para las verificaciones que necesitan la Cloud API real.

### Integration Points
- Webhook (Fastify) → cola (pg-boss sobre Postgres Supabase) → worker → `negocioScoped` DB (persistir `conversacion`/`mensaje`) → cliente de envío Cloud API (gated por `WHATSAPP_LIVE`).
- `conversacion.context` jsonb es el punto de contacto con la Fase 6 (ahí vivirá el estado del agente).
- `responder(conversacion, mensajeEntrante)` = el único punto que la Fase 6 reemplaza (stub → agente IA).
</code_context>

<specifics>
## Specific Ideas

- Respuesta stub sugerida (placeholder de Fase 6): algo tipo "¡Hola! Recibimos tu mensaje 🙌 En breve te ayudamos a reservar tu turno." — el texto exacto es libre; lo importante es que sea determinista y obviamente temporal.
- Verificación local: un script que arma un POST de webhook de ejemplo (mensaje de texto entrante), lo firma con el App Secret de dev, y lo dispara contra el endpoint local para probar firma→dedup→persistencia→envío-mockeado sin Meta.
</specifics>

<deferred>
## Deferred Ideas

- **Test en vivo contra Meta real** (túnel HTTPS + WABA + número de prueba + un mensaje ida-y-vuelta): se hace cuando el usuario tenga cuenta de Meta Developer y Meta lo verifique. Es una pasada de verificación, no código de esta fase (D-01).
- **Encriptación del token en reposo** (Vault/AES-GCM) → Fase 7 (SEC-01). La Fase 5 deja el choke point `getWhatsappToken` listo para el swap (D-04).
- **UI del superadmin para vincular WhatsApp al tenant** → Fase 2 (SADMIN-02).
- **Embedded Signup / auto-onboarding de peluquerías** → backlog (ONB-01).
- **Recordatorios 24h antes con plantilla HSM** → backlog (REMIND-01); requiere envío fuera de la ventana de 24h, explícitamente fuera de alcance acá.
- **El agente conversacional** (intención, propuesta de horarios, confirmación de turno real, cancelar/reagendar por WhatsApp, resistencia a prompt injection) → Fase 6 (BOT-01..10).
</deferred>

---

*Phase: 5-Integración WhatsApp Cloud API*
*Context gathered: 2026-07-06*
