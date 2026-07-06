# Phase 5: Integración WhatsApp Cloud API - Research

**Researched:** 2026-07-06
**Domain:** WhatsApp Business Cloud API webhook ingestion/egress infrastructure (Fastify + pg-boss + Supabase Postgres) — messaging plumbing only, no conversational AI
**Confidence:** MEDIUM-HIGH (stack/patterns HIGH; exact live Meta payload/version churn MEDIUM — see Open Questions)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Estrategia de testing / dependencia de Meta**
- **D-01 (Código-primero, live-testing diferido):** Se construye toda la Fase 5 contra el spec de la Cloud API y se verifica localmente con payloads de webhook firmados (curl con HMAC-SHA256 usando un app-secret de dev), simulando a Meta — sin depender de una cuenta de Meta Developer verificada. El cliente de envío saliente (WA-04) se implementa detrás de un gate por env (`WHATSAPP_LIVE=false` en dev → no pega a Graph API real, loguea/mockea el POST; `true` → pega a `graph.facebook.com`). Pasada de verificación en vivo cuando el usuario tenga cuenta Meta + WABA — anotado como seguimiento, NO parte del código de esta fase.

**Qué responde el bot en la Fase 5 (sin IA aún)**
- **D-02 (Stub de eco/recepción, cableado end-to-end):** Se implementa la capacidad de envío completa (WA-04) cableada a una respuesta determinista mínima (ej: "¡Hola! Recibimos tu mensaje 🙌 En breve te ayudamos a reservar tu turno."). Debe vivir detrás de una función tipo `responder(conversacion, mensajeEntrante)` con un único punto de reemplazo para que Fase 6 lo swapee sin tocar el webhook/worker.

**Procesamiento asíncrono**
- **D-03 (pg-boss, como fija el stack):** El handler del webhook solo verifica firma + encola el evento crudo y responde `200` a Meta de inmediato; un worker pg-boss (mismo proceso u otro loop) hace el trabajo real. Conexión pg-boss: directa/session-mode (puerto 5432), nunca el pooler transaction-mode (6543). Dedup (WA-03): llave de idempotencia por `messages[].id` (singletonKey de pg-boss al encolar + `mensaje.wa_message_id` con unicidad por negocio en el handler) → reintentos de Meta y reprocesos no duplican ni el guardado ni el envío.

**Manejo interino del token de WhatsApp (encriptación = Fase 7)**
- **D-04 (Lectura del token vía un accessor único, plano por ahora, TODO explícito a Fase 7):** El token vive hoy en `negocio.whatsapp_token` (columna de texto plano). SEC-01 es Fase 7. Se introduce un único choke point `getWhatsappToken(negocioId)` que hoy lee la columna (o una env var de dev para el número de prueba) y que la Fase 7 reemplaza internamente sin tocar los call sites. En dev se prefiere una env var con el token de prueba antes que persistirlo.

**Decisiones de dominio ya resueltas (criterio de Claude, para no re-preguntar)**
- **D-05 (Verificación GET del webhook):** handshake `hub.mode`/`hub.verify_token`/`hub.challenge` de Meta; `verify_token` desde env.
- **D-06 (Firma):** capturar el body crudo (Fastify `addContentTypeParser`/rawBody) ANTES de parsear JSON; HMAC-SHA256 con el App Secret; comparar con `crypto.timingSafeEqual` (nunca `===`).
- **D-07 (Resolución de tenant, WA-02):** query a `negocio` por `whatsapp_phone_number_id`; si no matchea ningún tenant, se descarta el evento (log + 200, sin crear nada) — nunca adivinar tenant.
- **D-08 (Identidad del cliente):** del `from` (wa_id) del mensaje entrante se resuelve/crea el `cliente` de ESE negocio (reusando el patrón de alta que ya existe), para poder setear `conversacion.cliente_id` (NOT NULL).
- **D-09 (Ventana de 24h, WA-04):** al entrar un mensaje se setea/refresca `conversacion.ventana_expira_at = now()+24h`; el envío saliente solo se permite dentro de la ventana; fuera de ella (requeriría plantilla HSM) queda fuera de alcance (REMIND-01).
- **D-10 (Persistencia, WA-05):** find-or-create `conversacion` por `(negocio_id, cliente_id)`; guardar cada `mensaje` (entrante y saliente) con `contenido` jsonb, `direccion`, `wa_message_id`; el estado del bot va en `conversacion.context` jsonb (forma mínima ahora; la define la Fase 6).
- **D-11 (Aislamiento):** todo acceso a DB del worker pasa por el patrón `negocioScoped` que ya existe en `apps/bot/src/db/` — el tenant_id/negocio_id nunca se confía del payload sin validar contra el `phone_number_id` resuelto.
- **D-12 (Hardening del endpoint público):** `@fastify/helmet` + `@fastify/rate-limit` sobre el webhook.

### Claude's Discretion
Toda la fase quedó a discreción de Claude. Los detalles finos de implementación (estructura de módulos, nombres, forma exacta del `context` jsonb mínimo, tests) los resuelve esta investigación y la planificación siguiendo estas decisiones y el stack de CLAUDE.md.

### Deferred Ideas (OUT OF SCOPE)
- Test en vivo contra Meta real (túnel HTTPS + WABA + número de prueba + mensaje ida-y-vuelta) — pasada de verificación posterior, no código de esta fase (D-01).
- Encriptación del token en reposo (Vault/AES-GCM) → Fase 7 (SEC-01).
- UI del superadmin para vincular WhatsApp al tenant → Fase 2 (SADMIN-02).
- Embedded Signup / auto-onboarding → backlog (ONB-01).
- Recordatorios 24h antes con plantilla HSM → backlog (REMIND-01); envío fuera de la ventana de 24h explícitamente fuera de alcance.
- El agente conversacional (intención, horarios, confirmación real, cancelar/reagendar por WhatsApp, resistencia a prompt injection) → Fase 6 (BOT-01..10).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| WA-01 | El sistema recibe webhooks de la WhatsApp Cloud API oficial y verifica la firma `X-Hub-Signature-256` sobre el body crudo | Architecture Patterns (Pattern 1, 2), Code Examples §1-2, Common Pitfalls #1, #2 |
| WA-02 | El sistema resuelve el tenant a partir del `phone_number_id` del mensaje entrante | Architecture Patterns (Pattern 3), Code Examples §3, Common Pitfalls #3 |
| WA-03 | El sistema procesa los mensajes de forma asíncrona y responde 200 rápido, con deduplicación por `messages[].id` | Architecture Patterns (Pattern 4), Code Examples §4-5, Common Pitfalls #4, #5, Don't Hand-Roll |
| WA-04 | El sistema envía mensajes salientes al cliente por la Cloud API dentro de la ventana de servicio de 24h | Architecture Patterns (Pattern 5), Code Examples §6, Common Pitfalls #6, #7 |
| WA-05 | El sistema persiste conversaciones y mensajes con el estado del bot en `context` (jsonb) | Architecture Patterns (Pattern 6), Code Examples §7, Common Pitfalls #8 |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

These are AUTHORITATIVE and non-negotiable for this phase's plan:

1. **WhatsApp integration MUST use the official Cloud API** (`graph.facebook.com`) — never Baileys/unofficial libraries.
2. **pg-boss connection MUST use port 5432 (direct/session-mode)**, never the Supavisor transaction-mode pooler (port 6543) — pg-boss relies on session-level Postgres behavior (advisory locks, prepared statements) that transaction pooling breaks.
3. **`X-Hub-Signature-256` MUST be verified over the raw, unparsed request body** — capture bytes via Fastify `addContentTypeParser` before JSON parsing. Comparing after `JSON.stringify` re-serialization silently breaks verification.
4. **Signature comparison MUST use `crypto.timingSafeEqual`**, never `===` (timing-attack surface).
5. **The WhatsApp access token MUST NOT be stored in plaintext long-term** — SEC-01 (Vault/AES-GCM) is Phase 7; Phase 5 introduces the `getWhatsappToken(negocioId)` choke point (D-04) so Phase 7 can swap the implementation without touching call sites, and prefers a dev-only env var over persisting a plaintext test token.
6. **Bot service is a separate Fastify process** from the Next.js dashboard, sharing only Postgres and the `availability-engine` package — this phase does not touch `apps/dashboard`.
7. **`negocioScoped(negocioId)`** (`apps/bot/src/db/negocioScoped.ts`) is the only sanctioned service_role query path for the bot — every DB access this phase adds (or extends) must go through it or extend the same pattern (D-11).
8. **Do not add Redis/BullMQ** — pg-boss on the existing Supabase Postgres is the fixed choice at this scale.
9. **This project's only database is `bdgufnitakelyialjoqg`** — never point any script, migration, or test at the restaurant project's Supabase ref.

## Summary

Phase 5 builds pure messaging plumbing on top of `apps/bot` (currently just a Fastify health server). The webhook route has two jobs and must do nothing else: (1) a `GET` handler that answers Meta's one-time subscription handshake (`hub.mode`/`hub.verify_token`/`hub.challenge`), and (2) a `POST` handler that captures the exact raw body bytes, verifies `X-Hub-Signature-256` (HMAC-SHA256 with the app secret, `timingSafeEqual` comparison), and — only after verification passes — enqueues the raw payload into a pg-boss queue and returns `200` immediately. All real work (tenant resolution, client resolution, persistence, stub response, outbound send) happens in a pg-boss worker, decoupled from Meta's response-time expectations and its up-to-7-day retry behavior on non-200 responses.

Deduplication is two-layered by design (D-03): pg-boss's `singletonKey` (set to the WhatsApp `messages[].id`) prevents a second job for the same message from being *queued* while the first is still active, and a `UNIQUE` constraint on `mensaje` keyed by `(negocio_id, wa_message_id)` is the durable backstop that prevents a double-*persist* (and by extension a double-*send*, since sending is gated on that insert succeeding) even across process restarts or singleton-window expiry. Both layers matter — pg-boss's window-based dedup is not permanent, but the database constraint is.

Everything else in scope is CRUD-shaped against tables that already exist (`negocio`, `cliente`, `conversacion`, `mensaje`) — no new tables. The single reusable extension point for Phase 6 is `responder(conversacion, mensajeEntrante): Promise<string>`, a deterministic stub in Phase 5 that Phase 6 replaces with the Vercel AI SDK agent.

The area needing the most implementation-time vigilance is Meta's own docs: Graph API versions, webhook payload shapes, and 24h-window error codes all shift over 2-3 year windows and different searches surfaced different current version numbers (v23.0 vs v25.0) during this research session — treat the API version as a one-line env var, not a hardcoded literal, so a Meta version bump is a config change, not a code change.

**Primary recommendation:** Fastify `POST /webhooks/whatsapp` route that does signature-verify-then-enqueue only (raw body via `addContentTypeParser`, HMAC via `node:crypto`, enqueue via `pg-boss` `send()` with `singletonKey: messageId`); a same-process `pg-boss` `work()` handler that resolves tenant → resolves/creates cliente → finds-or-creates `conversacion` → inserts `mensaje` (guarded by a `(negocio_id, wa_message_id)` unique constraint) → calls the swappable `responder()` stub → sends the reply via the Cloud API (gated by `WHATSAPP_LIVE`) → persists the outbound `mensaje`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Webhook GET handshake (`hub.challenge`) | API/Backend (Fastify) | — | Stateless HTTP verification, no DB/queue involvement |
| `X-Hub-Signature-256` verification over raw body | API/Backend (Fastify, pre-routing) | — | Must happen before JSON parsing and before any queue write; belongs to the HTTP edge, not the worker |
| Tenant resolution by `phone_number_id` | API/Backend (pg-boss worker) | Database/Storage (`negocio` lookup) | Requires a DB read against `negocio`; deliberately deferred out of the fast-ACK webhook handler so a slow/contended DB doesn't jeopardize the 200 response |
| Async dedup/queueing | API/Backend (Fastify enqueue + pg-boss internals) | Database/Storage (pg-boss's own `pgboss` schema + `mensaje` unique constraint) | pg-boss persists queue state in Postgres; the durable dedup guarantee lives in the DB constraint, not in-memory |
| Client (cliente) resolution/creation | API/Backend (pg-boss worker) | Database/Storage (`cliente` table) | Same `negocioScoped` pattern as the dashboard's server actions, but the bot's is keyed by exact `wa_id`, not partial ilike search |
| Conversation/message persistence | Database/Storage (`conversacion`/`mensaje`) | API/Backend (writes via `negocioScoped`) | Source of truth for audit/debugging and Phase 6's `context` jsonb |
| Bot stub response generation | API/Backend (`responder()` function) | — | Isolated single-function swap point; Phase 6 replaces the implementation, not the call site |
| Outbound send (Cloud API) | API/Backend (pg-boss worker → external service) | External Service boundary (`graph.facebook.com`) | Gated by `WHATSAPP_LIVE`; the 24h-window check is app logic, not a Meta-side guarantee the app can skip |
| Rate limiting / security headers | API/Backend (Fastify plugins, edge of the process) | — | `@fastify/rate-limit` + `@fastify/helmet` wrap the whole app, not just the webhook route |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `pg-boss` | `^12.25.1` `[VERIFIED: npm registry]` | Postgres-backed job queue for decoupling webhook ACK from processing | Already the fixed stack choice (CLAUDE.md). No Redis needed at this volume; `send()`+`work()` API and `singletonKey` cover the dedup requirement natively. |
| `fastify` | `^5.10.0` `[VERIFIED: npm registry]` | HTTP server for the webhook (extends the existing `apps/bot/src/server.ts`) | Already running in `apps/bot`; `addContentTypeParser` gives first-class raw-body capture for signature verification. |
| `@fastify/rate-limit` | `^11.1.0` `[VERIFIED: npm registry]` | Per-IP rate limiting on the public webhook route | Cheap defense-in-depth on a small VPS even though Meta signs requests (D-12). |
| `@fastify/helmet` | `^13.0.2` `[VERIFIED: npm registry]` | Security headers on the public webhook | Standard hardening for any internet-facing endpoint (D-12). |
| `zod` | `^4.4.3` `[VERIFIED: npm registry]` | Validating the parsed webhook body shape after signature check, and env var validation | Already the project-wide schema library (dashboard + availability-engine); reuse rather than introduce a second validator. |
| `node:crypto` (built-in) | Node 24 | HMAC-SHA256 signature computation + `timingSafeEqual` comparison | No external dependency needed; this is the correct, non-hand-rolled way to do constant-time comparison. |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `pg` | `^8.22.0` `[VERIFIED: npm registry]` | Direct Postgres driver | **Only needed if the app opens its own direct connection outside pg-boss** (e.g. raw `LISTEN/NOTIFY`, ad-hoc queries). `pg-boss` already bundles `pg@^8.22.0` as an internal dependency and manages its own connection pool from the connection string passed to `new PgBoss(...)` — do not add a redundant top-level `pg` dependency unless a concrete non-pg-boss use case appears in planning. |
| `@fastify/formbody` / none needed | — | — | Not needed — Meta sends `application/json`, not form-encoded bodies. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| pg-boss `singletonKey` + DB unique constraint (two-layer dedup) | DB unique constraint alone | Simpler, but every Meta retry within the singleton window still creates and immediately discards a duplicate queue row — marginally more Postgres churn on a busy day. Two-layer is worth the small complexity given Meta's up-to-7-day retry window. |
| Fastify `addContentTypeParser` (manual raw capture) | `fastify-raw-body` / `@fastify/raw-body` plugin | The plugin is a reasonable alternative if more routes later need raw-body access (route-level `config: { rawBody: true }`); for a single webhook route, the built-in `addContentTypeParser` with `parseAs: 'buffer'` is simpler and adds no new dependency. |
| Same-process pg-boss worker | Separate worker process (second container) | CONTEXT.md/CLAUDE.md explicitly allow either ("mismo proceso u otro loop"). Same-process is simpler to deploy on the 2-vCPU VPS for this phase's volume; revisit if the worker's Gemini calls (Phase 6) start starving the HTTP event loop. |

**Installation:**
```bash
pnpm --filter @turnosbot/bot add pg-boss @fastify/rate-limit @fastify/helmet
# zod and @supabase/supabase-js are already dependencies of apps/bot
```

**Version verification:** confirmed live against the npm registry on 2026-07-06:
```
pg-boss@12.25.1        (published as part of the 12.x line; CLAUDE.md pinned ^12.25.0)
fastify@5.10.0          (apps/bot already depends on ^5.9.0 — compatible, bump on install)
@fastify/rate-limit@11.1.0
@fastify/helmet@13.0.2
zod@4.4.3               (already installed)
pg@8.22.0               (transitively bundled by pg-boss; do not add explicitly unless needed)
```

## Package Legitimacy Audit

| Package | Registry | Age | Downloads (last week) | Source Repo | slopcheck | Disposition |
|---------|----------|-----|------------------------|--------------|-----------|-------------|
| `pg-boss` | npm | ~10 yrs (created 2016-03-18) | 834,733 | github.com/timgit/pg-boss | OK | Approved |
| `fastify` | npm | ~10 yrs (created 2016-10-07) | 8,692,877 | github.com/fastify/fastify | OK | Approved (already a dependency) |
| `@fastify/rate-limit` | npm | ~4 yrs (created 2022-04-27) | 1,598,500 | github.com/fastify/fastify-rate-limit | OK | Approved |
| `@fastify/helmet` | npm | ~4 yrs (created 2022-04-27) | 1,301,064 | github.com/fastify/fastify-helmet | OK | Approved |
| `zod` | npm | ~6 yrs (created 2020-03-07) | 211,601,986 | github.com/colinhacks/zod | OK | Approved (already a dependency) |
| `pg` | npm | ~16 yrs (created 2010-12-19) | 33,540,623 | github.com/brianc/node-postgres | OK | Approved (transitively bundled via pg-boss; do not add as an explicit top-level dependency unless a direct-connection use case emerges) |

slopcheck (`slopcheck` 0.6.1, installed via `pip3 install slopcheck --break-system-packages`) ran against all six packages via `slopcheck scan --pkg npm <name> --json` — all returned `"status": "OK"`, `"flags": []`. `npm view <pkg> scripts.postinstall` returned empty for `pg-boss`, `pg`, `@fastify/rate-limit`, and `@fastify/helmet` — no suspicious postinstall scripts detected.

**Packages removed due to slopcheck [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** none.

All package names above were sourced from CLAUDE.md's already-established Standard Stack (itself derived from official npm registry lookups in an earlier research pass), not freshly discovered via WebSearch in this session — combined with the clean slopcheck/registry-age/downloads/repo evidence gathered here, these are tagged `[VERIFIED: npm registry]` rather than `[ASSUMED]`.

## Architecture Patterns

### System Architecture Diagram

```
Meta WhatsApp Cloud API
        │
        │ GET  (webhook subscription handshake: hub.mode/hub.verify_token/hub.challenge)
        │ POST (event notification, JSON body, X-Hub-Signature-256 header)
        ▼
┌───────────────────────────── apps/bot (Fastify) ─────────────────────────────┐
│                                                                                │
│  [@fastify/helmet] → [@fastify/rate-limit] → route match                      │
│                                                                                │
│  GET /webhooks/whatsapp                                                       │
│   └─ verify_token === env.WHATSAPP_VERIFY_TOKEN? → 200 hub.challenge : 403    │
│                                                                                │
│  POST /webhooks/whatsapp                                                      │
│   ├─ addContentTypeParser captures RAW body bytes (Buffer) before JSON.parse  │
│   ├─ HMAC-SHA256(rawBody, APP_SECRET) vs X-Hub-Signature-256 (timingSafeEqual)│
│   │     │ mismatch → 403, log, DO NOT enqueue, DO NOT parse further          │
│   ├─ JSON.parse(rawBody) → zod-validate shape                                 │
│   └─ boss.send('whatsapp-inbound', rawEvent, { singletonKey: messageId })     │
│        → respond 200 to Meta IMMEDIATELY (before any DB/queue work resolves) │
│                                                                                │
└───────────────────────────────────┬───────────────────────────────────────────┘
                                     │ enqueued job (Postgres, pgboss schema)
                                     ▼
┌───────────────────────── pg-boss worker (same process) ─────────────────────┐
│                                                                                │
│  boss.work('whatsapp-inbound', async ([job]) => {                            │
│    1. Extract phone_number_id from job.data.entry[].changes[].value.metadata  │
│    2. negocioScoped-style lookup: negocio WHERE whatsapp_phone_number_id = ?  │
│       └─ no match → log + ack job (discard silently, per D-07)               │
│    3. findOrCreateCliente(negocioId, waId)  [exact match on telefono]        │
│    4. findOrCreateConversacion(negocioId, clienteId)                         │
│       └─ refresh conversacion.ventana_expira_at = now() + 24h                │
│    5. INSERT mensaje (direccion='in', wa_message_id, contenido)              │
│       └─ UNIQUE(negocio_id, wa_message_id) violation → already processed,    │
│          ack job and stop (durable dedup backstop)                          │
│    6. reply = await responder(conversacion, mensajeEntrante)  ◄── Phase 6    │
│                                                                    swaps this │
│    7. if now() < conversacion.ventana_expira_at:                             │
│         sendWhatsappMessage(negocioId, waId, reply)  [gated by WHATSAPP_LIVE]│
│         INSERT mensaje (direccion='out', wa_message_id, contenido)           │
│       else: log window-closed, do not attempt send (REMIND-01 out of scope) │
│  })                                                                           │
│                                                                                │
└───────────────────────────────────┬───────────────────────────────────────────┘
                                     │ Bearer token (getWhatsappToken(negocioId))
                                     ▼
                    graph.facebook.com/{version}/{phone_number_id}/messages
                    (real call if WHATSAPP_LIVE=true, else logged/mocked)
```

A reader can trace the primary use case (inbound text → stub reply) start to finish by following the arrows: Meta → signature-verified enqueue → fast 200 → worker resolves tenant/client/conversation → persists inbound → generates stub reply → checks window → sends outbound (or skips) → persists outbound.

### Recommended Project Structure

```
apps/bot/src/
├── server.ts                     # extended: registers helmet/rate-limit, webhook routes, starts pg-boss
├── config/
│   └── env.ts                    # extended: WHATSAPP_APP_SECRET, WHATSAPP_VERIFY_TOKEN, WHATSAPP_LIVE,
│                                  #   WHATSAPP_GRAPH_API_VERSION, WHATSAPP_DEV_TOKEN, SUPABASE_DB_URL (pg-boss)
├── db/
│   ├── client.ts                 # existing — unchanged
│   └── negocioScoped.ts          # existing — extended if new accessors needed (conversaciones/mensajes already present)
├── whatsapp/
│   ├── webhook.ts                 # GET handshake + POST route registration (Fastify plugin)
│   ├── signature.ts                # verifyWhatsappSignature(rawBody, header, appSecret): boolean
│   ├── payload.ts                  # zod schemas for the webhook body shape (WA-01 validation)
│   ├── graphClient.ts               # sendWhatsappMessage(negocioId, to, text) — WHATSAPP_LIVE gate lives here
│   └── getWhatsappToken.ts          # D-04 choke point — env override in dev, negocio.whatsapp_token otherwise
├── conversation/
│   ├── findOrCreateCliente.ts        # D-08 — exact wa_id → cliente.telefono match, create if absent
│   ├── findOrCreateConversacion.ts   # D-10 — (negocio_id, cliente_id) lookup/create, refresh ventana_expira_at
│   └── responder.ts                   # D-02 — single swap point; Phase 5 stub, Phase 6 replaces internals
├── queue/
│   ├── boss.ts                        # PgBoss instance (SUPABASE_DB_URL, port 5432), start()/stop() lifecycle
│   └── inboundWorker.ts               # boss.work('whatsapp-inbound', ...) — the orchestration in the diagram above
└── (test files colocated as *.test.ts, matching existing negocioScoped.test.ts convention)

scripts/
└── verify-whatsapp-webhook.ts    # D-01 — builds + signs a sample inbound payload, POSTs it at the local
                                    #   server, asserts sign→dedup→persist→mock-send end to end without Meta
```

### Pattern 1: Raw-body capture before JSON parsing

**What:** Register a custom `addContentTypeParser` for `application/json` on the Fastify instance (or scoped to the webhook route) that collects the body as a `Buffer`, stashes it for signature verification, then parses it into `request.body`.
**When to use:** Any route needing HMAC signature verification against the exact bytes Meta sent (WA-01).
**Example:**
```typescript
// Source: https://fastify.dev/docs/latest/Reference/ContentTypeParser/ (official docs)
app.addContentTypeParser(
  "application/json",
  { parseAs: "buffer" },
  (req, body, done) => {
    (req as { rawBody?: Buffer }).rawBody = body as Buffer; // stash raw bytes for signature check
    try {
      const json = JSON.parse(body.toString("utf8"));
      done(null, json);
    } catch (err) {
      (err as { statusCode?: number }).statusCode = 400;
      done(err as Error, undefined);
    }
  },
);
```

### Pattern 2: HMAC-SHA256 signature verification with timing-safe comparison

**What:** Compute `HMAC-SHA256(rawBody, APP_SECRET)`, prefix with `sha256=`, compare against the `X-Hub-Signature-256` header using `crypto.timingSafeEqual`.
**When to use:** Every `POST /webhooks/whatsapp` request, before touching the parsed body or the queue (WA-01).
**Example:**
```typescript
// Source: Meta developer docs (X-Hub-Signature-256 spec) + Node.js crypto docs — pattern cross-verified
// across multiple sources (community + official Node.js API), CITED confidence.
import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyWhatsappSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  appSecret: string,
): boolean {
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const expectedBuf = Buffer.from(expected, "utf8");
  const receivedBuf = Buffer.from(signatureHeader.slice("sha256=".length), "utf8");
  // timingSafeEqual throws if buffers differ in length — guard first
  if (expectedBuf.length !== receivedBuf.length) return false;
  return timingSafeEqual(expectedBuf, receivedBuf);
}
```

### Pattern 3: Tenant resolution — never guess

**What:** Look up `negocio` by `whatsapp_phone_number_id` extracted from `entry[].changes[].value.metadata.phone_number_id`. If no row matches, log and acknowledge the job without creating any records (D-07).
**When to use:** First step inside the pg-boss worker, before any cliente/conversacion/mensaje writes (WA-02).
**Example:**
```typescript
// Pattern — no official source needed, straightforward query against existing schema
const { data: negocio } = await supabaseAdmin
  .from("negocio")
  .select("id, whatsapp_token, timezone")
  .eq("whatsapp_phone_number_id", phoneNumberId)
  .maybeSingle();

if (!negocio) {
  app.log.warn({ phoneNumberId }, "No negocio matches this phone_number_id — discarding event");
  return; // ack the pg-boss job; do not retry, do not create records
}
```

### Pattern 4: Two-layer idempotency (pg-boss `singletonKey` + DB unique constraint)

**What:** Set `singletonKey: messageId` on `boss.send()` so a duplicate webhook delivery within the singleton window doesn't even get queued twice; separately, enforce a `UNIQUE (negocio_id, wa_message_id)` constraint on `mensaje` so that even if two jobs for the same message DO run (window expired, process restarted mid-flight, etc.), the second insert fails cleanly and the worker treats that as "already processed."
**When to use:** Enqueue time (webhook handler) and persist time (worker), respectively (WA-03).
**Example:**
```typescript
// pg-boss send() — Source: github.com/timgit/pg-boss (README, cross-verified via WebFetch this session)
const messageId = event.entry[0].changes[0].value.messages?.[0]?.id;
await boss.send("whatsapp-inbound", event, {
  singletonKey: messageId, // dedupes while a job for this message ID is queued/active
});

// Worker-side durable backstop — ordinary Postgres unique-violation handling
const { error } = await supabaseAdmin.from("mensaje").insert({
  negocio_id: negocio.id,
  conversacion_id: conversacion.id,
  direccion: "in",
  wa_message_id: messageId,
  contenido: incomingMessage,
});
if (error?.code === "23505") {
  // unique_violation on (negocio_id, wa_message_id) — this message was already processed
  app.log.info({ messageId }, "Duplicate wa_message_id — already processed, skipping");
  return;
}
```

### Pattern 5: 24h window check gates outbound send

**What:** Before sending any outbound message, compare `now()` against `conversacion.ventana_expira_at` (refreshed to `now() + 24h` every time an inbound message arrives, D-09). Only send within the window; log-and-skip outside it.
**When to use:** Immediately before the Graph API call in the worker (WA-04).
**Example:**
```typescript
const nowMs = Date.now();
const ventanaExpiraMs = new Date(conversacion.ventana_expira_at).getTime();
if (nowMs >= ventanaExpiraMs) {
  app.log.warn(
    { conversacionId: conversacion.id },
    "24h service window closed — skipping free-form send (would require an approved template, REMIND-01 out of scope)",
  );
  return;
}
await sendWhatsappMessage(negocio.id, waId, replyText);
```

### Pattern 6: `WHATSAPP_LIVE` gate for outbound send

**What:** A single function wraps the Graph API POST; when `WHATSAPP_LIVE=false` it logs the would-be request and returns a synthetic success instead of calling `graph.facebook.com` (D-01).
**When to use:** Every outbound send call site, so dev/test never depends on a verified Meta account (WA-04).
**Example:**
```typescript
// Pattern — request shape per Meta docs (developers.facebook.com/docs/whatsapp/cloud-api/guides/send-messages),
// gate behavior per D-01/D-04. [CITED: developers.facebook.com] for the request shape.
export async function sendWhatsappMessage(negocioId: string, to: string, body: string) {
  const url = `https://graph.facebook.com/${env.WHATSAPP_GRAPH_API_VERSION}/${await getPhoneNumberId(negocioId)}/messages`;
  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "text",
    text: { preview_url: false, body },
  };

  if (!env.WHATSAPP_LIVE) {
    app.log.info({ negocioId, to, payload }, "[WHATSAPP_LIVE=false] mock send — not calling Graph API");
    return { messages: [{ id: `mock.${Date.now()}` }] };
  }

  const token = await getWhatsappToken(negocioId);
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`WhatsApp send failed: ${res.status} ${await res.text()}`);
  return res.json();
}
```

### Anti-Patterns to Avoid

- **Parsing JSON before verifying the signature:** breaks verification silently (re-serialized JSON ≠ original bytes) and is the single most common WhatsApp webhook bug reported in the wild.
- **Doing the DB/Gemini/send work inside the webhook POST handler itself:** defeats the entire purpose of decoupling from Meta's response-time expectations and its 7-day retry window; always enqueue-then-return-200.
- **Trusting `phone_number_id` or any tenant identifier from the payload without a DB lookup:** the payload is attacker-controlled data once signature verification passes on *a* valid Meta payload for *a* negocio — never let a client-supplied ID select which tenant's data gets written (D-11).
- **Relying on pg-boss `singletonKey` alone for dedup:** it is a time-windowed in-queue guarantee, not a permanent one; always back it with a DB-level unique constraint for the truly durable guarantee.
- **Hardcoding the Graph API version string in multiple call sites:** Meta's docs showed different "current" versions across sources in this same research session (see Open Questions) — put it in one env var.
- **Sending outside the 24h window without a template:** Meta rejects this with error 131047 ("re-engagement message required") — check the window in app code rather than relying on Meta to gracefully degrade.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Constant-time signature comparison | A manual byte-by-byte `===` loop | `crypto.timingSafeEqual` (Node built-in) | Manual comparisons are a well-known timing-attack surface; `timingSafeEqual` is purpose-built and requires equal-length buffers (guard for that first). |
| Reliable async job processing with retries | A custom `setInterval` polling loop against a homemade `jobs` table | `pg-boss` (`send()`/`work()`) | pg-boss already solves retries, `SKIP LOCKED` polling, singleton dedup windows, and job state transitions on top of the same Postgres instance — reinventing this is pure risk for zero benefit at this scale. |
| Idempotent webhook processing under at-least-once delivery | Application-level "have I seen this ID before" cache (in-memory Set, Redis) | Postgres `UNIQUE` constraint on `mensaje(negocio_id, wa_message_id)` | An in-memory cache doesn't survive a process restart; the DB constraint is durable and free (it's just an index) and doubles as the audit trail (WA-05). |
| Raw-body capture for signature verification | Manually intercepting the Node.js `IncomingMessage` stream before Fastify's own body parsing kicks in | Fastify's built-in `addContentTypeParser` with `parseAs: 'buffer'` | Fastify already exposes exactly the hook needed; bypassing the framework's parser lifecycle risks double-consuming the stream or missing Fastify's body-size-limit protection. |

**Key insight:** Every "hand-roll" temptation in this phase (custom queue, custom dedup cache, custom stream interception) already has a solved, in-stack answer. The only genuinely custom code this phase should write is the *business* glue (tenant/cliente/conversacion resolution) — everything mechanical (queueing, retries, idempotency, raw-body capture, timing-safe comparison) is a library or a database constraint.

## Common Pitfalls

### Pitfall 1: Signature verification silently breaks due to re-serialization
**What goes wrong:** The webhook accepts the parsed JSON `request.body`, re-serializes it (`JSON.stringify`) to compute the HMAC, and the signature never matches — leading teams to "temporarily" disable verification to unblock development, and then never re-enable it.
**Why it happens:** JSON key order, whitespace, and Unicode escaping are not guaranteed to round-trip identically through `JSON.parse` → `JSON.stringify`.
**How to avoid:** Capture the raw `Buffer` via `addContentTypeParser` (Pattern 1) and compute the HMAC over those exact bytes — never over a re-serialized object.
**Warning signs:** Signature verification fails on every request in dev, including ones sent by your own verified test script.

### Pitfall 2: `timingSafeEqual` throws on length mismatch
**What goes wrong:** `crypto.timingSafeEqual(a, b)` throws a `RangeError` if `a.length !== b.length` — an attacker sending a malformed/short signature header crashes the request handler (potential DoS) instead of cleanly returning 403.
**Why it happens:** The API is intentionally strict about equal-length inputs (part of what makes it timing-safe).
**How to avoid:** Compare buffer lengths first and return `false` (→ 403) before calling `timingSafeEqual` (see Pattern 2's example).
**Warning signs:** Unhandled exception / 500 response on requests with a truncated or missing signature header.

### Pitfall 3: Guessing the tenant instead of rejecting unmatched `phone_number_id`
**What goes wrong:** A default/fallback tenant gets used when `phone_number_id` doesn't match any `negocio` row, silently attributing one tenant's customer message to another tenant (or to a placeholder negocio that pollutes data).
**Why it happens:** Developers want the pipeline to "always produce a result" rather than branch on the no-match case.
**How to avoid:** D-07 is explicit: no match → log + ack (200-equivalent from pg-boss's perspective, i.e. the job completes) + discard. Never write any row when tenant resolution fails.
**Warning signs:** `cliente`/`conversacion` rows appearing under an unexpected or seed/test negocio in production data.

### Pitfall 4: Confusing pg-boss's time-windowed dedup with permanent dedup
**What goes wrong:** Relying solely on `singletonKey` and assuming "this message ID can never be processed twice," when in fact `singletonKey` (without an explicit `singletonSeconds`/retention window) only prevents duplicate *queued/active* jobs for the same key — once the first job completes, a second `send()` with the same key is accepted as a brand-new job.
**Why it happens:** The pg-boss docs describe `singletonKey` dedup behavior in terms of "queued or active," which is easy to misread as "ever processed."
**How to avoid:** Always pair `singletonKey` at enqueue time with the DB-level `UNIQUE(negocio_id, wa_message_id)` constraint as the actual source of truth for "have I already fully processed this message" (Pattern 4).
**Warning signs:** A duplicate outbound reply sent to a customer for a single inbound message, especially around Meta's retry windows (minutes to hours after the original delivery).

### Pitfall 5: `mensaje.wa_message_id` has no enforced uniqueness yet
**What goes wrong:** The currently-generated `packages/db-types/src/database.types.ts` shows `mensaje.wa_message_id` as a plain nullable `string` column with no visible unique constraint. This research session attempted to confirm live via the Supabase Management API whether a `UNIQUE(negocio_id, wa_message_id)` constraint already exists on `bdgufnitakelyialjoqg`, but the available Personal Access Token in `.env` could not be used to query `pg_constraint` (JWT decode error) — **this is unresolved and MUST be verified at planning/implementation time**, not assumed either way.
**Why it happens:** `database.types.ts` (Supabase's generated types) encodes columns, not constraints — a constraint could exist without appearing here, or could be entirely absent.
**How to avoid:** Before writing the worker's insert logic, run a live check (`SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'public.mensaje'::regclass;` against `bdgufnitakelyialjoqg`) or simply add a migration that creates `UNIQUE (negocio_id, wa_message_id)` idempotently (`CREATE UNIQUE INDEX IF NOT EXISTS ...`) as part of this phase's Wave 0 — safe whether or not it already exists.
**Warning signs:** Duplicate `mensaje` rows for the same `wa_message_id` appearing after a Meta retry.

### Pitfall 6: 24h window error (131047) surfaces as a runtime failure, not a compile-time one
**What goes wrong:** The Graph API returns HTTP 200 with an error object (not necessarily an HTTP error status) or a 4xx with `error.code === 131047` when a free-form message is sent outside the window — if the send function only checks `res.ok`, this can be missed or mis-logged.
**Why it happens:** Some Graph API error responses use non-2xx HTTP codes, but teams have reported inconsistent handling across error types; always inspect the response body's `error` object, not just the status code.
**How to avoid:** The app-side window check (Pattern 5) should make this error essentially unreachable in normal operation, but the send function should still parse and log `error.code`/`error.message` from any non-`ok` Graph API response for observability.
**Warning signs:** Logs show WhatsApp API calls "succeeding" (200) with no message actually delivered, or silent send failures around the 24h boundary.

### Pitfall 7: Phone number format mismatch between bot-created and dashboard-created `cliente` rows
**What goes wrong:** WhatsApp's `contacts[].wa_id` / `messages[].from` is typically the full international number with no `+` and no separators (e.g. `5491122334455` for Argentina). The dashboard's `crearClienteInline`/`buscarClientePorTelefono` (apps/dashboard/app/actions/clientes.ts) stores/searches `cliente.telefono` with an `.ilike` partial match and no documented canonical format. If the bot inserts `wa_id` verbatim and a human dashboard user later manually enters the "same" customer's phone with different formatting (e.g. with a leading `+` or without the Argentina mobile `9` digit), two `cliente` rows are silently created for one real person.
**Why it happens:** No single normalization function currently exists for phone numbers across the bot and dashboard codepaths; `cliente.telefono` has no format constraint in the schema.
**How to avoid:** D-08 says "reusing the existing alta pattern," but the bot's cliente lookup should be an **exact match** on a normalized `telefono` (not the dashboard's partial `.ilike` — that's a live-search UX feature, not appropriate for the bot's exact wa_id lookup). Document the normalization rule (e.g. strip non-digits, always store with country code, no `+`) explicitly in the plan so both codepaths agree — this is flagged as an Open Question below since CONTEXT.md doesn't lock an exact format.
**Warning signs:** Duplicate `cliente` rows with visually-similar phone numbers for what should be one customer.

### Pitfall 8: `conversacion.context` jsonb schema drift into Phase 6
**What goes wrong:** Phase 5 needs *some* minimal shape in `context` (even if just `{}` or a `{ estado: 'nuevo' }` placeholder) to prove the round-trip works, but if that shape is under-documented, Phase 6's agent either has to reverse-engineer it or silently overwrites it with an incompatible shape.
**Why it happens:** `context` is intentionally schema-less (jsonb) so Phase 6 owns its final shape — but "minimal now, defined later" (per CONTEXT.md D-10) needs a documented contract, not just a fact that the column is unconstrained.
**How to avoid:** Phase 5's plan should explicitly state the minimal `context` shape it writes (e.g. `{}` on creation) and document that Phase 6 owns extending it — put this in the plan's design notes, not left implicit.
**Warning signs:** Phase 6 planning has to grep Phase 5's code to reverse-engineer what `context` currently contains.

## Code Examples

### Webhook GET handshake (WA-01, D-05)
```typescript
// Source: Meta developer docs — GET verification handshake (hub.mode/hub.verify_token/hub.challenge)
// [CITED: developers.facebook.com/docs/graph-api/webhooks/getting-started]
app.get("/webhooks/whatsapp", async (request, reply) => {
  const query = request.query as Record<string, string>;
  const mode = query["hub.mode"];
  const token = query["hub.verify_token"];
  const challenge = query["hub.challenge"];

  if (mode === "subscribe" && token === env.WHATSAPP_VERIFY_TOKEN) {
    return reply.status(200).send(challenge);
  }
  return reply.status(403).send();
});
```

### Enqueue-then-200 webhook POST handler (WA-01, WA-03)
```typescript
app.post("/webhooks/whatsapp", async (request, reply) => {
  const rawBody = (request as { rawBody?: Buffer }).rawBody;
  const signature = request.headers["x-hub-signature-256"] as string | undefined;

  if (!rawBody || !verifyWhatsappSignature(rawBody, signature, env.WHATSAPP_APP_SECRET)) {
    app.log.warn({ signature }, "Invalid or missing X-Hub-Signature-256 — rejecting");
    return reply.status(403).send();
  }

  const event = request.body as WhatsappWebhookEvent; // zod-validated shape
  const messageId = event.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.id;

  if (messageId) {
    await boss.send("whatsapp-inbound", event, { singletonKey: messageId });
  } else {
    // Status update / read receipt / non-message change — ack silently, nothing to process yet.
    app.log.debug({ event }, "Non-message webhook event — ignored");
  }

  return reply.status(200).send(); // ALWAYS 200 quickly, regardless of downstream processing state
});
```

### pg-boss instance lifecycle (WA-03)
```typescript
// Source: github.com/timgit/pg-boss README (WebFetch, cross-verified). [CITED: github.com/timgit/pg-boss]
import PgBoss from "pg-boss";

export const boss = new PgBoss(env.SUPABASE_DB_URL); // MUST be the port-5432 direct/session-mode URL, never 6543
boss.on("error", (err) => app.log.error(err, "pg-boss error"));

export async function startQueue() {
  await boss.start();
  await boss.createQueue("whatsapp-inbound");
  await boss.work("whatsapp-inbound", { batchSize: 1 }, async ([job]) => {
    await processInboundWhatsappEvent(job.data as WhatsappWebhookEvent);
  });
}

export async function stopQueue() {
  await boss.stop();
}
```

### Find-or-create conversacion + refresh window (WA-04, WA-05, D-09, D-10)
```typescript
const nowIso = new Date().toISOString();
const ventanaExpiraIso = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

let { data: conversacion } = await supabaseAdmin
  .from("conversacion")
  .select("*")
  .eq("negocio_id", negocioId)
  .eq("cliente_id", clienteId)
  .maybeSingle();

if (!conversacion) {
  const { data: created } = await supabaseAdmin
    .from("conversacion")
    .insert({ negocio_id: negocioId, cliente_id: clienteId, context: {}, ventana_expira_at: ventanaExpiraIso })
    .select("*")
    .single();
  conversacion = created;
} else {
  await supabaseAdmin
    .from("conversacion")
    .update({ ventana_expira_at: ventanaExpiraIso, updated_at: nowIso })
    .eq("id", conversacion.id);
}
```

### `responder()` swap point (D-02)
```typescript
// apps/bot/src/conversation/responder.ts
// Phase 5: deterministic stub. Phase 6 replaces the BODY of this function
// (Vercel AI SDK + Gemini agent) without changing this signature or any call site.
export async function responder(
  conversacion: Tables<"conversacion">,
  mensajeEntrante: string,
): Promise<string> {
  return "¡Hola! Recibimos tu mensaje 🙌 En breve te ayudamos a reservar tu turno.";
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Business API on-premise/hosted BSP-only access | Cloud API (hosted by Meta directly) as the primary integration surface for new Tech Providers | Cloud API has been Meta's recommended path for several years now; on-premise API was deprecated by Meta in 2025 | This project already targets Cloud API exclusively — no migration concern, just confirms the choice is current. |
| pg-boss CommonJS, default export | pg-boss v10+ is ESM-only with named exports (`import PgBoss from 'pg-boss'`) | pg-boss v10 (per WebSearch synthesis) | Confirm the exact import style against the installed `12.25.1` at implementation time — `import PgBoss from "pg-boss"` (default export) is the pattern shown in the current README example fetched this session. |
| Manual body-parsing middleware for raw bytes | Fastify's built-in `addContentTypeParser({ parseAs: 'buffer' })` | Long-standing Fastify feature, not a recent change | No hand-rolled stream interception needed. |

**Deprecated/outdated:**
- WhatsApp Business On-Premise API: fully deprecated by Meta; irrelevant here since the project was never on it.
- Older pg-boss CommonJS require-style imports: not compatible with the pinned `^12.25.x` line; use ESM imports throughout (already the project convention — `apps/bot` is `"type": "module"`).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Current Graph API version is `v23.0`–`v25.0` (sources disagreed within this session: a WebSearch-surfaced doc example showed `v23.0`; an earlier project research pass — see CLAUDE.md STACK.md — recorded `v25.0` from a Feb 2026 WebFetch) | Standard Stack, Code Examples §6, State of the Art | If the wrong version is hardcoded and Meta has sunset it, all outbound sends fail with a version-deprecated error. Mitigated by making it an env var (`WHATSAPP_GRAPH_API_VERSION`), not a literal — a config change fixes it, no redeploy of logic needed. |
| A2 | `mensaje.wa_message_id` does NOT currently have a `UNIQUE(negocio_id, wa_message_id)` constraint in the live `bdgufnitakelyialjoqg` database | Common Pitfalls #5 | If a constraint already exists, the migration attempt is a harmless no-op (`IF NOT EXISTS`). If it does NOT exist and the plan skips adding it, the durable dedup backstop (Pattern 4) is missing and duplicate-send risk rises significantly under Meta retries. This is the single highest-risk unverified claim in this research — planner should treat "add the migration" as a required task regardless, since it is safe either way. |
| A3 | No canonical phone-number normalization format is enforced today for `cliente.telefono` across bot vs. dashboard write paths | Common Pitfalls #7 | If wrong (i.e. a format IS already enforced somewhere not found in this research), the bot might mis-normalize and still create duplicates. Low risk either way since the fix (pick and document one format) is the same action. |
| A4 | pg-boss `12.25.1`'s `send()`/`work()`/`createQueue()` API signatures match the patterns shown in Code Examples (based on the fetched README + WebSearch synthesis, not a full API reference read) | Code Examples §3, Architecture Patterns Pattern 4 | If minor option names differ (e.g. `batchSize` location, exact `createQueue` options), a quick check against `node_modules/pg-boss/README.md` or TypeScript types after `pnpm add` resolves this in minutes — low risk, high recoverability. |

**If this table is empty:** N/A — see rows above; all four should be spot-checked at plan/implementation time but none block starting the plan.

## Open Questions

1. **Which Graph API version string should `WHATSAPP_GRAPH_API_VERSION` default to?**
   - What we know: Meta versions are supported for roughly 2-3 years; multiple recent-looking sources disagree (v23.0 vs v25.0) within the same research session, confirming CLAUDE.md's own note that "Meta churns this."
   - What's unclear: The exact current default without a live, dated fetch of `developers.facebook.com/docs/graph-api/changelog` at plan/implementation time.
   - Recommendation: Default to `v23.0` (the version explicitly shown in a live-fetched example this session) but treat it as a one-line env var default, not a hardcoded assumption, and note in the plan that the executor should do one fresh check against Meta's changelog before finalizing.

2. **Does `mensaje` already have a `UNIQUE(negocio_id, wa_message_id)` constraint on the live `bdgufnitakelyialjoqg` database?**
   - What we know: `database.types.ts` (generated types) shows only the column, not constraints; this research's attempt to query `pg_constraint` via the Supabase Management API failed ("JWT could not be decoded" using the PAT found in `.env`).
   - What's unclear: Whether the constraint exists from an earlier migration this research didn't surface, or whether it needs to be added fresh.
   - Recommendation: Have the plan include an idempotent migration (`CREATE UNIQUE INDEX IF NOT EXISTS mensaje_negocio_wa_message_id_key ON mensaje (negocio_id, wa_message_id) WHERE wa_message_id IS NOT NULL;`) as a Wave 0 task — safe whether or not it already exists, and directly closes the dedup backstop requirement (WA-03).

3. **What exact canonical phone-number format should `cliente.telefono` use for wa_id-sourced rows?**
   - What we know: WhatsApp sends `wa_id`/`from` as digits-only international format (no `+`); the dashboard's existing cliente search uses partial `.ilike` with no documented canonical stored format.
   - What's unclear: Whether any existing seed/fixture data already encodes an implicit convention (e.g. with or without a leading `+`) that the bot's writes need to match.
   - Recommendation: Planner should pick one explicit convention (recommend: store digits-only, no `+`, matching `wa_id` verbatim, since that's what the bot receives and it's a strict superset-compatible normalization for the dashboard's `.ilike` partial search) and document it inline in the `findOrCreateCliente` implementation.

4. **Same-process vs. separate-process pg-boss worker — any Phase-6-anticipation reason to split now?**
   - What we know: CONTEXT.md/CLAUDE.md permit either. Phase 6 will add a Gemini call inside the worker, which is I/O-bound (not CPU-bound), so it shouldn't block the Fastify event loop under Node's async model even in the same process.
   - What's unclear: Whether operational needs (e.g., independently restarting the worker without dropping in-flight webhook connections) will matter enough to justify a second process/container before Phase 6.
   - Recommendation: Start same-process for Phase 5 (simpler, matches "mismo proceso u otro loop" wording in CONTEXT.md); revisit only if Phase 6's Gemini latency or worker restart cadence becomes an operational pain point.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Bot service runtime | ✓ | v24.15.0 | — |
| npm | Package resolution checks (`npm view`) | ✓ | 11.12.1 | — |
| pnpm | Monorepo package manager (via corepack/npx) | ✓ | 9.15.0 (resolved via `corepack`/`npx pnpm`) | Direct `pnpm` binary not on PATH in this research session's shell — `npx pnpm@9.15.0` or `corepack enable` resolves it; not a blocker for implementation (the repo already runs on pnpm workspaces). |
| Docker | Local container parity (per CLAUDE.md, not required for this phase's dev loop) | ✓ | Docker Engine 29.6.1 (via colima) | — |
| Supabase Postgres (`bdgufnitakelyialjoqg`) | pg-boss connection, all persistence | Assumed ✓ (existing project DB, used by Phases 1-4) | — | — |
| `slopcheck` (Python) | Package legitimacy audit (this research session) | ✓ (installed fresh via `pip3 install slopcheck --break-system-packages`) | 0.6.1 | — |
| ngrok / cloudflared | Live tunnel for real Meta webhook testing | ✗ | — | **Fallback used and correct per D-01**: local signed-payload script (`scripts/verify-whatsapp-webhook.ts`) replaces the need for a live tunnel in this phase; live tunnel testing is explicitly deferred (see Deferred Ideas). |
| A verified Meta Developer account + WABA + test number | Real end-to-end Meta verification | ✗ | — | Deferred per D-01 — not required for this phase's plan or code. |

**Missing dependencies with no fallback:** none — the two "✗" rows above have an explicit, already-decided fallback (D-01's local signed-payload testing strategy).

**Missing dependencies with fallback:** ngrok/cloudflared and a live Meta account (both deferred to a later verification pass, not this phase's code).

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | None configured yet in `apps/bot` — Wave 0 gap. Sibling packages (`@turnosbot/availability-engine`, `apps/dashboard`) use **Vitest 4.1.9**, matching the project-wide convention. |
| Config file | none — see Wave 0 |
| Quick run command | `pnpm --filter @turnosbot/bot exec vitest run` (after Wave 0 adds `vitest.config.ts` + the `test` script, mirroring `packages/availability-engine/vitest.config.ts`) |
| Full suite command | Same as quick run for this phase's scope (no slow/e2e split needed yet) — plus the live-gated `scripts/verify-whatsapp-webhook.ts` script (analogous to `scripts/verify-availability-engine.ts`), run manually against a real `.env`/DB, not part of the automated Vitest suite. |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| WA-01 | Valid signature → 200; invalid/missing signature → 403; correct GET handshake response | unit | `pnpm --filter @turnosbot/bot exec vitest run src/whatsapp/signature.test.ts` | ❌ Wave 0 |
| WA-01 | Raw body captured unchanged through `addContentTypeParser` (no corruption from parsing) | unit/integration (Fastify `inject()`) | `pnpm --filter @turnosbot/bot exec vitest run src/whatsapp/webhook.test.ts` | ❌ Wave 0 |
| WA-02 | Known `phone_number_id` resolves to the correct `negocio`; unknown one is discarded (no rows written) | integration (live-gated, mirrors `negocioScoped.test.ts` pattern) | `pnpm exec tsx apps/bot/src/whatsapp/resolveTenant.test.ts` (or Vitest with a seeded fixture) | ❌ Wave 0 |
| WA-03 | Duplicate `messages[].id` (simulated Meta retry) does not create a second `mensaje` row nor send a second reply | integration (live-gated, requires DB + queue) | Extend `scripts/verify-whatsapp-webhook.ts` to POST the same signed payload twice and assert a single `mensaje` row | ❌ Wave 0 |
| WA-04 | Reply sent within window (mocked send when `WHATSAPP_LIVE=false`); reply skipped and logged outside window | unit (window check) + integration (mock send assertion) | `pnpm --filter @turnosbot/bot exec vitest run src/whatsapp/window.test.ts` | ❌ Wave 0 |
| WA-05 | `conversacion`/`mensaje` rows persist with expected `direccion`, `contenido`, `wa_message_id`; `context` starts as documented minimal shape | integration (live-gated) | Part of `scripts/verify-whatsapp-webhook.ts` end-to-end assertions | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm --filter @turnosbot/bot exec vitest run` (fast unit tests: signature verification, window-check logic, payload zod-parsing)
- **Per wave merge:** Full Vitest suite + the live-gated `scripts/verify-whatsapp-webhook.ts` run manually against `.env`/`bdgufnitakelyialjoqg` (mirrors the existing `verify-availability-engine.ts`/`negocioScoped.test.ts` checkpoint pattern from Phases 1-4)
- **Phase gate:** Full suite green + the signed-payload verify script passing end-to-end (sign → dedup → persist → mock-send) before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `apps/bot/vitest.config.ts` — mirror `packages/availability-engine/vitest.config.ts` (`environment: "node"`, `include: ["src/**/*.test.ts"]`, `globals: true`)
- [ ] `apps/bot/package.json` — add `"test": "vitest run"` script + `vitest` devDependency (pin to `4.1.9` to match the rest of the monorepo)
- [ ] `src/whatsapp/signature.test.ts` — covers WA-01 (valid/invalid/missing signature, length-mismatch guard per Pitfall 2)
- [ ] `scripts/verify-whatsapp-webhook.ts` — the D-01/D-01-mandated local signed-payload script; also doubles as the WA-02/03/05 integration check (live-gated, requires `.env`)
- [ ] Migration: `UNIQUE INDEX IF NOT EXISTS` on `mensaje(negocio_id, wa_message_id)` — required Wave 0 task regardless of Open Question #2's outcome (safe no-op if already present)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No (bot service has no end-user auth; only Meta-signed webhook and service-role DB access) | N/A — see V5/V6 below for the actual controls that apply |
| V3 Session Management | No | N/A |
| V4 Access Control | Yes | `negocioScoped(negocioId)` (D-11) enforces tenant isolation on every DB access; tenant identity is derived server-side from a DB lookup keyed on `phone_number_id`, never trusted from payload fields |
| V5 Input Validation | Yes | `zod` schema validates the parsed webhook body shape after signature verification (fail closed: unrecognized shapes are logged and discarded, not partially processed) |
| V6 Cryptography | Yes | `node:crypto` `createHmac('sha256', ...)` + `timingSafeEqual` for signature verification — never a hand-rolled comparison; the WhatsApp access token itself is read only through the `getWhatsappToken(negocioId)` choke point (plaintext accepted as a documented, ticketed interim state per D-04/SEC-01, not a silent gap) |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Forged webhook payload (attacker POSTs a fake WhatsApp event) | Spoofing | `X-Hub-Signature-256` HMAC-SHA256 verification over raw body with `timingSafeEqual`, reject with 403 on any mismatch or missing header (Pattern 2) |
| Timing attack against signature comparison | Information Disclosure | `crypto.timingSafeEqual` (constant-time), with an explicit length-check guard before calling it (Pitfall 2) |
| Cross-tenant data leakage via a manipulated/unverified `phone_number_id` | Elevation of Privilege / Info Disclosure | Tenant is resolved via a DB lookup (`negocio.whatsapp_phone_number_id`) that only proceeds after signature verification passes; unmatched IDs are discarded, never defaulted (D-07, Pitfall 3) |
| Webhook flood / replay (even though Meta signs requests, a leaked payload+signature pair — before secret rotation — could be replayed) | Denial of Service | `@fastify/rate-limit` on the webhook route (D-12); pg-boss's `singletonKey` + DB unique constraint additionally prevent a replay from causing duplicate side effects even if it passes signature verification (defense in depth) |
| Duplicate outbound sends from Meta's own retry mechanism (up to 7 days) causing customer-visible double-messaging | Tampering (data integrity) / reputational | Two-layer dedup (Pattern 4): `singletonKey` at enqueue, `UNIQUE(negocio_id, wa_message_id)` at persist — outbound send is conditioned on the inbound insert succeeding, so a duplicate insert failure short-circuits before any duplicate send |
| Plaintext WhatsApp access token exposure via DB dump/backup/replica leak | Information Disclosure | Explicitly a documented, ticketed interim risk (D-04) — mitigated structurally by routing every read through `getWhatsappToken(negocioId)` so Phase 7's Vault swap requires zero call-site changes; NOT mitigated within Phase 5 itself (SEC-01 is out of scope here by design) |

## Sources

### Primary (HIGH confidence)
- npm registry (`npm view <pkg> version/repository.url/time.created/scripts.postinstall`, `api.npmjs.org/downloads/point/last-week/<pkg>`) — confirmed current versions, package ages, weekly download counts, and absence of postinstall scripts for `pg-boss`, `fastify`, `@fastify/rate-limit`, `@fastify/helmet`, `zod`, `pg`. Checked live 2026-07-06.
- `slopcheck` 0.6.1 (`slopcheck scan --pkg npm <name> --json`) — all six candidate packages returned `OK` with no flags. Checked live 2026-07-06.
- Existing codebase: `packages/db-types/src/database.types.ts`, `apps/bot/src/server.ts`, `apps/bot/src/config/env.ts`, `apps/bot/src/db/negocioScoped.ts`, `apps/bot/src/db/client.ts`, `apps/bot/src/db/negocioScoped.test.ts`, `apps/dashboard/app/actions/clientes.ts`, `packages/availability-engine/vitest.config.ts`, `packages/availability-engine/package.json` — read directly.
- [Fastify ContentTypeParser reference](https://fastify.dev/docs/latest/Reference/ContentTypeParser/) — `addContentTypeParser` with `parseAs: 'buffer'` API and example (WebFetch, official docs).
- [Meta Graph API Webhooks getting-started guide](https://developers.facebook.com/docs/graph-api/webhooks/getting-started) — GET handshake params (`hub.mode`/`hub.challenge`/`hub.verify_token`) and `X-Hub-Signature-256` spec (WebFetch, official docs).
- [WhatsApp Cloud API webhook setup guide](https://developers.facebook.com/docs/whatsapp/cloud-api/guides/set-up-webhooks/) — 7-day retry-on-non-200 policy, example inbound message JSON shape including `metadata.phone_number_id` and `contacts[].wa_id` (WebFetch, official docs).

### Secondary (MEDIUM confidence)
- WebSearch (multiple queries, cross-referenced) — X-Hub-Signature-256 HMAC-SHA256 computation pattern (raw body, App Secret, `timingSafeEqual`), consistent across GitHub Docs' own webhook-signature-verification guidance and multiple independent WhatsApp integration blog posts.
- WebSearch — Graph API send-messages endpoint shape (`POST /{phone_number_id}/messages`, `messaging_product`/`recipient_type`/`type`/`text.body` fields) and current version string `v23.0` shown in a live doc example; conflicts with `v25.0` recorded in an earlier project research pass (CLAUDE.md STACK.md, Feb 2026 WebFetch) — see Assumptions Log A1.
- WebSearch — 24-hour customer service window semantics (opens/refreshes on customer message, template required outside it) and error code 131047 ("re-engagement message required"), cross-referenced across multiple independent sources (WANotifier, Heltar, Chatwoot community discussion).
- [pg-boss GitHub repository](https://github.com/timgit/pg-boss) (WebFetch) — `new PgBoss(connectionString)`, `createQueue()`, `send()`, `work()` basic API shape and current version `12.25.1`; combined with WebSearch synthesis for `singletonKey` and `batchSize` option semantics (full API reference page did not yield complete option-by-option detail via WebFetch this session).

### Tertiary (LOW confidence)
- WebSearch synthesis on pg-boss v10+ ESM-only/named-exports transition — not independently verified against a changelog in this session; flagged in State of the Art for a quick spot-check against the installed package's actual export style.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every package version, age, download count, and postinstall-script check was confirmed live against the npm registry and slopcheck in this session, and all package names originate from CLAUDE.md's already-established stack (itself npm-registry-verified in an earlier pass), not fresh WebSearch discovery.
- Architecture: HIGH — the enqueue-then-200, two-layer dedup, raw-body-before-parse, and 24h-window-gate patterns are all directly supported by CONTEXT.md's locked decisions (D-01 through D-12) plus official Fastify/Meta documentation fetched live this session.
- Pitfalls: MEDIUM-HIGH — most pitfalls are grounded in official docs or direct codebase inspection; two items (Pitfall 5's constraint-existence question and Pitfall 7's phone-format question) are explicitly flagged as unresolved and carried into Open Questions/Assumptions Log rather than asserted as fact.

**Research date:** 2026-07-06
**Valid until:** 2026-08-05 (30 days) — but re-verify the Graph API version string (Assumption A1) and the `mensaje` unique-constraint question (Assumption A2) at implementation time regardless of this window, since both are explicitly flagged as unresolved rather than time-decayed.
