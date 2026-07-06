# Phase 5: Integración WhatsApp Cloud API - Pattern Map

**Mapped:** 2026-07-06
**Files analyzed:** 21 (18 new + 3 modified)
**Analogs found:** 21 / 21 (all have a role-match or exact analog in-repo; no external-only patterns needed)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `apps/bot/src/server.ts` (MODIFY) | route/config | request-response | itself (existing) + `apps/dashboard` plugin registration style | exact (extend in place) |
| `apps/bot/src/config/env.ts` (MODIFY) | config | transform | itself (existing `loadEnv()`) | exact (extend in place) |
| `apps/bot/vitest.config.ts` (NEW) | config | — | `packages/availability-engine/vitest.config.ts` | exact |
| `apps/bot/package.json` (MODIFY) | config | — | `packages/availability-engine/package.json` (`test` script + vitest devDep) | exact |
| `apps/bot/src/whatsapp/signature.ts` | utility | transform | none in-repo (first HMAC utility) — pattern from RESEARCH.md Pattern 2, `node:crypto` built-in | no analog (research-sourced) |
| `apps/bot/src/whatsapp/signature.test.ts` | test | transform | `packages/availability-engine/src/constants.test.ts` (pure-function vitest style) | role-match |
| `apps/bot/src/whatsapp/webhook.ts` | route | request-response | `apps/bot/src/server.ts` (existing `/health` route registration) | role-match |
| `apps/bot/src/whatsapp/webhook.test.ts` | test | request-response | `packages/availability-engine/src/booking.test.ts` (structure only; needs Fastify `inject()`, no direct in-repo Fastify-test analog) | partial match |
| `apps/bot/src/whatsapp/payload.ts` | utility | transform | `packages/availability-engine/src/booking.ts` (`bookAppointmentInputSchema` zod pattern) | role-match |
| `apps/bot/src/whatsapp/graphClient.ts` | service | request-response | `packages/availability-engine/src/booking.ts` (`BookAppointmentDeps` injected-client style, minus the DB) — new external-HTTP call, no direct in-repo analog | partial match |
| `apps/bot/src/whatsapp/getWhatsappToken.ts` | utility | CRUD (read) | `apps/bot/src/db/negocioScoped.ts` (`negocio()` accessor — reads the same table/columns) | role-match |
| `apps/bot/src/conversation/findOrCreateCliente.ts` | service | CRUD | `apps/dashboard/app/actions/clientes.ts` (`crearClienteInline`) + `apps/bot/src/db/negocioScoped.ts` (`clientes()`) | exact (adapted: exact match, not `.ilike`) |
| `apps/bot/src/conversation/findOrCreateConversacion.ts` | service | CRUD | `apps/bot/src/db/negocioScoped.ts` (`conversaciones()`) + RESEARCH.md Code Examples §5 (find-or-create shape already spelled out) | exact |
| `apps/bot/src/conversation/responder.ts` | service | transform | RESEARCH.md Code Examples §7 (already gives the exact stub) | exact (research-sourced, no in-repo analog needed) |
| `apps/bot/src/conversation/responder.test.ts` | test | transform | `packages/availability-engine/src/constants.test.ts` | role-match |
| `apps/bot/src/queue/boss.ts` | config/service | event-driven | `apps/bot/src/db/client.ts` (singleton client construction + guard-on-missing-env style) | role-match |
| `apps/bot/src/queue/inboundWorker.ts` | service | event-driven | `packages/availability-engine/src/booking.ts` (`bookAppointment` — orchestration + error branching pattern) + `apps/bot/src/db/negocioScoped.ts` (D-11 scoping) | role-match |
| `apps/bot/src/queue/inboundWorker.test.ts` | test | event-driven | `packages/availability-engine/src/booking.test.ts` | role-match |
| `scripts/verify-whatsapp-webhook.ts` | test (live-gated script) | request-response | `scripts/verify-availability-engine.ts` (isolation guard + seed/cleanup + assert-and-exit style) | exact |
| `supabase/migrations/0004_mensaje_wa_message_id_unique.sql` | migration | transform | `supabase/migrations/0003_tenant_negocio_split.sql` (header/comment conventions, isolation banner) | exact |
| `.env.example` (MODIFY) | config | — | itself (existing) | exact (extend in place) |

## Pattern Assignments

### `apps/bot/src/server.ts` (MODIFY — route registration, request-response)

**Analog:** itself (`apps/bot/src/server.ts`, current full contents, 26 lines)

**Current file in full:**
```typescript
import Fastify from "fastify";
import { loadEnv } from "./config/env.js";

const env = loadEnv();

const app = Fastify({
  logger: true,
});

// T-02-01 (Information Disclosure): health returns a minimal static body only —
// no env vars, versions, or DB state leaked.
app.get("/health", async () => {
  return { status: "ok" };
});

async function start() {
  try {
    await app.listen({ port: env.PORT, host: "0.0.0.0" });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
```

**How Phase 5 extends it:**
- Register `@fastify/helmet` and `@fastify/rate-limit` (D-12) right after `Fastify({ logger: true })`, before any route — mirrors how `/health` is registered directly on `app` today (no plugin indirection exists yet in this file, so this phase introduces the project's first `app.register(...)` calls).
- Add `app.addContentTypeParser("application/json", { parseAs: "buffer" }, ...)` (Pattern 1, RESEARCH.md) BEFORE registering the webhook routes — this must apply only where raw-body capture is needed; scope it either app-wide (simplest, matches this file's flat style) or via a `Fastify.register(webhookPlugin, { prefix: "/webhooks/whatsapp" })` sub-context if isolation from other future routes becomes necessary.
- Register the webhook routes (`GET`/`POST /webhooks/whatsapp`) from the new `apps/bot/src/whatsapp/webhook.ts` module — same flat `app.get(...)`/`app.post(...)` style already used for `/health`, just moved into an importable Fastify plugin function `registerWhatsappWebhook(app: FastifyInstance, deps): void` so it stays testable via `app.inject()` without booting the real HTTP listener.
- Add `await startQueue()` (from `apps/bot/src/queue/boss.ts`) inside `start()`, before `app.listen(...)` — same try/catch/`process.exit(1)` error style already used for `app.listen`.
- Keep the same "one flat `start()` function, `logger: true`, port from `env.PORT`" shape — nothing about the existing structure needs to change, only additions.

---

### `apps/bot/src/config/env.ts` (MODIFY — config, transform)

**Analog:** itself (`apps/bot/src/config/env.ts`, full 27 lines read above)

**Exact current pattern to keep:**
```typescript
export interface BotEnv {
  PORT: number;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SUPABASE_DB_URL?: string;
  GOOGLE_GENERATIVE_AI_API_KEY?: string;
}

export function loadEnv(): BotEnv {
  return {
    PORT: Number(process.env.PORT ?? 3001),
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_DB_URL: process.env.SUPABASE_DB_URL,
    GOOGLE_GENERATIVE_AI_API_KEY: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  };
}
```

**New fields to add to `BotEnv` + `loadEnv()`, same optional-field style** (the file's own comment says "none required at boot ... real validation wired in later phases" — Phase 5 is one of those later phases, so consider whether `WHATSAPP_APP_SECRET`/`WHATSAPP_VERIFY_TOKEN`/`SUPABASE_DB_URL` should become hard-required-at-boot now, throwing like `apps/bot/src/db/client.ts` does, since the webhook cannot function without them):
- `WHATSAPP_APP_SECRET: string` — HMAC signing secret (D-06)
- `WHATSAPP_VERIFY_TOKEN: string` — GET handshake token (D-05)
- `WHATSAPP_LIVE: boolean` (parse `process.env.WHATSAPP_LIVE === "true"`, default `false`) — D-01 gate
- `WHATSAPP_GRAPH_API_VERSION: string` (default `"v23.0"` per Open Question 1 — treat as overridable, not hardcoded elsewhere)
- `WHATSAPP_DEV_TOKEN?: string` — D-04 dev-only token override, consumed only by `getWhatsappToken.ts`
- `SUPABASE_DB_URL` already exists in the interface as optional — Phase 5's `queue/boss.ts` is the first real consumer; consider making it required-at-boot the same way `client.ts` throws on missing `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` (see Shared Patterns below), since pg-boss cannot start without it (must be port 5432, never 6543 — CLAUDE.md hard rule).

---

### `apps/bot/vitest.config.ts` (NEW — config)

**Analog:** `packages/availability-engine/vitest.config.ts` (full 18 lines, read above)

**Copy near-verbatim** (adjust the doc-comment, no path-alias block needed — `apps/bot` also uses relative imports, not `@/*`):
```typescript
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    globals: true,
  },
})
```

---

### `apps/bot/package.json` (MODIFY — config)

**Analog:** `packages/availability-engine/package.json` (full contents, read above)

**Pattern to copy:**
```json
"scripts": {
  "test": "vitest run"
},
"devDependencies": {
  "vitest": "4.1.9"
}
```
Merge into the existing `apps/bot/package.json` scripts/devDependencies blocks (currently: `dev`, `build`, `start`, `typecheck` scripts; `@types/node`, `tsx`, `typescript` devDeps) — pin `vitest` to the exact `4.1.9` used everywhere else in the monorepo (dashboard, availability-engine), do not let it float to a different version. Also add production deps per RESEARCH.md Standard Stack: `pg-boss@^12.25.1`, `@fastify/rate-limit@^11.1.0`, `@fastify/helmet@^13.0.2` (zod is not yet a dep of `apps/bot` — add `zod@^4.4.3` too, matching the version already pinned in `packages/availability-engine/package.json` and the dashboard).

---

### `apps/bot/src/whatsapp/signature.ts` (NEW — utility, transform)

**Analog:** No in-repo precedent (first HMAC/crypto utility in the codebase). Use RESEARCH.md Pattern 2 verbatim — it is already a complete, correct implementation cross-verified against Node.js `crypto` docs and Meta's spec:

```typescript
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
  // timingSafeEqual throws if buffers differ in length — guard first (Pitfall 2)
  if (expectedBuf.length !== receivedBuf.length) return false;
  return timingSafeEqual(expectedBuf, receivedBuf);
}
```

**Style conventions to match from the rest of the codebase** (`packages/availability-engine/src/booking.ts` header-comment style): lead with a doc-comment explaining WHY (raw-body-only, timing-safe, length-guard-before-compare), citing the pitfall it prevents, same as `booking.ts`'s extensive rationale comments.

---

### `apps/bot/src/whatsapp/signature.test.ts` (NEW — test, transform)

**Analog:** `packages/availability-engine/src/constants.test.ts` (full 18 lines, read above) — simplest pure-function vitest pattern in the repo.

**Pattern to copy:**
```typescript
import { describe, expect, it } from "vitest";
import { verifyWhatsappSignature } from "./signature.js";

describe("verifyWhatsappSignature", () => {
  it("returns true for a correctly-signed body", () => { /* HMAC a known body with a known secret, assert true */ });
  it("returns false when the signature header is missing", () => { /* undefined header → false, no throw */ });
  it("returns false when the header doesn't start with sha256=", () => { /* malformed prefix → false */ });
  it("returns false (not a throw) on length-mismatched signature (Pitfall 2)", () => { /* short/garbage header → false, never RangeError */ });
  it("returns false for a tampered body", () => { /* same signature, different body → false */ });
});
```
Same `describe`/`it`/`expect` shape as `constants.test.ts` — no mocking framework needed, this module is pure.

---

### `apps/bot/src/whatsapp/webhook.ts` (NEW — route, request-response)

**Analog:** `apps/bot/src/server.ts` (existing `/health` route, read above) for registration style; RESEARCH.md Code Examples ("Webhook GET handshake", "Enqueue-then-200 webhook POST handler") for the actual route bodies.

**Registration style to match** (same flat `app.get(path, async (request, reply) => {...})` shape already used for `/health`):
```typescript
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

app.post("/webhooks/whatsapp", async (request, reply) => {
  const rawBody = (request as { rawBody?: Buffer }).rawBody;
  const signature = request.headers["x-hub-signature-256"] as string | undefined;
  if (!rawBody || !verifyWhatsappSignature(rawBody, signature, env.WHATSAPP_APP_SECRET)) {
    app.log.warn({ signature }, "Invalid or missing X-Hub-Signature-256 — rejecting");
    return reply.status(403).send();
  }
  const event = request.body as WhatsappWebhookEvent; // zod-validated via payload.ts
  const messageId = event.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.id;
  if (messageId) {
    await boss.send("whatsapp-inbound", event, { singletonKey: messageId });
  } else {
    app.log.debug({ event }, "Non-message webhook event — ignored");
  }
  return reply.status(200).send();
});
```
Export a `registerWhatsappWebhook(app, { env, boss })` function so `server.ts` calls it, and so `webhook.test.ts` can build a scratch Fastify instance and call it directly with `app.inject()` without starting the real listener.

---

### `apps/bot/src/whatsapp/webhook.test.ts` (NEW — test, request-response)

**Analog:** No direct Fastify-inject test exists yet in-repo; closest structural analog is `packages/availability-engine/src/booking.test.ts` for "arrange fixture → call → assert result shape" organization, adapted to Fastify's own documented `app.inject()` API (official pattern, not project-specific — see Fastify docs already cited in RESEARCH.md).

**Pattern:**
```typescript
import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { registerWhatsappWebhook } from "./webhook.js";

function buildApp(/* fake env, fake boss.send spy */) { /* new Fastify(), addContentTypeParser, registerWhatsappWebhook */ }

describe("POST /webhooks/whatsapp", () => {
  it("returns 403 when signature is invalid", async () => { /* inject with wrong signature header */ });
  it("returns 200 and enqueues when signature is valid", async () => { /* inject with correctly-HMAC-signed body, assert boss.send called with singletonKey */ });
  it("returns 200 without enqueuing for non-message events (status updates)", async () => { /* event with no messages[] */ });
});

describe("GET /webhooks/whatsapp", () => {
  it("echoes hub.challenge when verify_token matches", async () => { /* ... */ });
  it("returns 403 when verify_token doesn't match", async () => { /* ... */ });
});
```

---

### `apps/bot/src/whatsapp/payload.ts` (NEW — utility, transform)

**Analog:** `packages/availability-engine/src/booking.ts` lines 61-98 (`bookAppointmentInputSchema`/`rescheduleAppointmentInputSchema` zod patterns, read above) — same "validate at the boundary with zod, `satisfies z.ZodType<T, unknown>`" convention.

**Pattern to copy** (the project's established zod-boundary-validation style):
```typescript
export const uuidLike = z.string().regex(/^[0-9a-fA-F]{8}-.../, "UUID inválido"); // if reusable, or import from availability-engine if exported
export const whatsappWebhookEventSchema = z.object({
  entry: z.array(z.object({
    changes: z.array(z.object({
      value: z.object({
        metadata: z.object({ phone_number_id: z.string() }),
        messages: z.array(z.object({
          id: z.string(),
          from: z.string(),
          type: z.string(),
          text: z.object({ body: z.string() }).optional(),
        })).optional(),
      }),
    })),
  })),
});
export type WhatsappWebhookEvent = z.infer<typeof whatsappWebhookEventSchema>;
```
Match `booking.ts`'s doc-comment-first style explaining WHY validation happens at this boundary (fail closed on malformed Meta payloads, WA-01/V5).

---

### `apps/bot/src/whatsapp/graphClient.ts` (NEW — service, request-response)

**Analog:** `packages/availability-engine/src/booking.ts` (`BookAppointmentDeps` dependency-injection style for testability, lines 176-190) adapted to an outbound HTTP call instead of a DB call; concrete request/response shape and the `WHATSAPP_LIVE` gate from RESEARCH.md Code Examples §6/Pattern 6.

**Pattern to copy verbatim (already fully specified in RESEARCH.md):**
```typescript
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
**Error-handling addition per Pitfall 6:** even on `res.ok`, inspect the parsed body for an `error` object (Meta sometimes returns 200 with an embedded error) before treating the send as successful.

---

### `apps/bot/src/whatsapp/getWhatsappToken.ts` (NEW — utility, CRUD read)

**Analog:** `apps/bot/src/db/negocioScoped.ts` lines 40-42 (the `negocio()` accessor, which already reads `whatsapp_token`/`whatsapp_phone_number_id` columns via `.eq("tenant_id", negocioId)` — note the accessor's own doc-comment warns `negocio()` intentionally filters by `tenant_id`, not `negocio_id`, since `negocio`'s own PK is `id` and its FK is `tenant_id`).

**Pattern (D-04 choke point):**
```typescript
import { negocioScoped } from "../db/negocioScoped.js";
import { loadEnv } from "../config/env.js";

/**
 * D-04 choke point: today reads the plaintext negocio.whatsapp_token column
 * (or WHATSAPP_DEV_TOKEN env override in dev). Phase 7 (SEC-01) replaces the
 * BODY of this function with a Vault/AES-GCM decrypt — no call site changes.
 * TODO(SEC-01, Phase 7): plaintext-in-DB is a documented, ticketed interim risk.
 */
export async function getWhatsappToken(negocioId: string): Promise<string> {
  const env = loadEnv();
  if (env.WHATSAPP_DEV_TOKEN) return env.WHATSAPP_DEV_TOKEN;
  const { data, error } = await negocioScoped(negocioId).negocio().select("whatsapp_token").single();
  if (error || !data?.whatsapp_token) {
    throw new Error(`No whatsapp_token found for negocioId=${negocioId}`);
  }
  return data.whatsapp_token;
}
```
Note: `negocioScoped(negocioId).negocio()` — per the doc-comment in `negocioScoped.ts` — filters by `tenant_id = negocioId`, which is semantically wrong for this call site (you want the row WHERE `negocio.id = negocioId`, not where `negocio.tenant_id = negocioId`). **Flag for planner:** this accessor's existing shape does not directly support "read this negocio's own row by its own id" — either add a new accessor or query `supabaseAdmin.from("negocio").select(...).eq("id", negocioId)` directly here (still service_role, still a single-tenant-safe read since `negocioId` here is always the DB-resolved tenant from Pattern 3, never client input).

---

### `apps/bot/src/conversation/findOrCreateCliente.ts` (NEW — service, CRUD)

**Analog:** `apps/dashboard/app/actions/clientes.ts` (`crearClienteInline`, lines 60-86, read in full above) for the insert shape; deliberately NOT `buscarClientePorTelefono`'s `.ilike` partial-match (Pitfall 7 explicitly warns against reusing that for the bot's exact `wa_id` lookup).

**Insert pattern to adapt (same shape, exact match instead of ilike, negocio-scoped via `negocioScoped`):**
```typescript
// apps/dashboard/app/actions/clientes.ts:71-79 pattern, adapted:
const { data, error } = await negocioScoped(negocioId).clientes().insert({
  negocio_id: negocioId,
  telefono: waId, // digits-only, no "+", verbatim from WhatsApp's wa_id (Open Question 3 resolution)
  nombre: null,
}).select("id").single();
```
**Find-first pattern (exact match, NOT `.ilike`):**
```typescript
const { data: existing } = await negocioScoped(negocioId).clientes().select("id").eq("telefono", waId).maybeSingle();
if (existing) return existing.id;
// else insert as above
```
**Phone normalization contract to document inline** (Open Question 3, resolved per RESEARCH.md recommendation): store `telefono` as digits-only exactly as WhatsApp's `wa_id` arrives, no `+` prefix — a strict superset-compatible format with the dashboard's `.ilike` partial search.

---

### `apps/bot/src/conversation/findOrCreateConversacion.ts` (NEW — service, CRUD)

**Analog:** `apps/bot/src/db/negocioScoped.ts` line 54-55 (`conversaciones()` accessor) + RESEARCH.md Code Examples §5 (already a complete find-or-create implementation).

**Pattern to copy (adapted to go through `negocioScoped`, per D-11):**
```typescript
const ventanaExpiraIso = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

let { data: conversacion } = await negocioScoped(negocioId)
  .conversaciones()
  .select("*")
  .eq("cliente_id", clienteId)
  .maybeSingle();

if (!conversacion) {
  const { data: created } = await negocioScoped(negocioId)
    .conversaciones()
    .insert({ negocio_id: negocioId, cliente_id: clienteId, context: {}, ventana_expira_at: ventanaExpiraIso })
    .select("*")
    .single();
  conversacion = created;
} else {
  await negocioScoped(negocioId)
    .conversaciones()
    .update({ ventana_expira_at: ventanaExpiraIso })
    .eq("id", conversacion.id);
}
```
**Note on `.insert()`/`.update()` through `negocioScoped`:** `negocioScoped(negocioId).conversaciones()` returns a `.select("*")`-chained query builder (per its current implementation) — verify at implementation time whether `.insert()`/`.update()` can chain off that same returned builder or whether `negocioScoped.ts` needs a small extension to expose a writable builder per table (the existing accessors are read-oriented `select` chains; Phase 5 is likely the first writer through this layer, per RESEARCH.md's Architectural Responsibility Map, so check this pattern compiles before assuming it works as-is).

---

### `apps/bot/src/conversation/responder.ts` (NEW — service, transform)

**Analog:** RESEARCH.md Code Examples ("responder() swap point", D-02) — this is already the complete, exact intended implementation, no adaptation needed:

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

---

### `apps/bot/src/conversation/responder.test.ts` (NEW — test, transform)

**Analog:** `packages/availability-engine/src/constants.test.ts` (same trivial pure-function assertion style).

```typescript
import { describe, expect, it } from "vitest";
import { responder } from "./responder.js";

describe("responder (D-02 stub)", () => {
  it("returns the deterministic placeholder reply regardless of input", async () => {
    const reply = await responder({} as any, "cualquier mensaje");
    expect(reply).toContain("Recibimos tu mensaje");
  });
});
```

---

### `apps/bot/src/queue/boss.ts` (NEW — service/config, event-driven)

**Analog:** `apps/bot/src/db/client.ts` (full 38 lines, read above) for the "single module-level singleton, guard on missing required env, throw with a Spanish error message naming the exact file" convention.

**Pattern to adapt (same guard-then-construct-singleton style as `client.ts`):**
```typescript
import PgBoss from "pg-boss";
import { loadEnv } from "../config/env.js";

const env = loadEnv();

if (!env.SUPABASE_DB_URL) {
  throw new Error(
    "SUPABASE_DB_URL es obligatoria para pg-boss (apps/bot/src/queue/boss.ts) — usar la conexión directa/session-mode (puerto 5432), NUNCA el pooler transaction-mode (6543).",
  );
}

export const boss = new PgBoss(env.SUPABASE_DB_URL);
boss.on("error", (err) => console.error(err)); // or app.log.error if app instance is threaded through

export async function startQueue(): Promise<void> {
  await boss.start();
  await boss.createQueue("whatsapp-inbound");
  await boss.work("whatsapp-inbound", { batchSize: 1 }, async ([job]) => {
    await processInboundWhatsappEvent(job.data as WhatsappWebhookEvent);
  });
}

export async function stopQueue(): Promise<void> {
  await boss.stop();
}
```
Same doc-comment-first convention as `client.ts` (explain WHY: port 5432 not 6543, singleton lifecycle tied to `server.ts`'s `start()`/shutdown).

---

### `apps/bot/src/queue/inboundWorker.ts` (NEW — service, event-driven)

**Analog:** `packages/availability-engine/src/booking.ts` (`bookAppointment`, full function, lines 233-313, read above) for the "validate → re-check → branch on error code → return a discriminated-union result, never throw for expected failure modes" orchestration shape; `apps/bot/src/db/negocioScoped.ts` for the mandatory D-11 scoping on every DB call.

**Orchestration pattern to mirror** (same "step 1 fails → return early with a logged reason" style as `bookAppointment`'s `validation_error`/`slot_taken`/`insert_error` branches):
```typescript
export async function processInboundWhatsappEvent(event: WhatsappWebhookEvent): Promise<void> {
  const phoneNumberId = event.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id;
  const message = event.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!phoneNumberId || !message) return; // non-message event, nothing to do

  // Pattern 3 (D-07) — never guess the tenant.
  const { data: negocio } = await supabaseAdmin.from("negocio").select("id, timezone").eq("whatsapp_phone_number_id", phoneNumberId).maybeSingle();
  if (!negocio) { console.warn("No negocio matches phone_number_id — discarding", phoneNumberId); return; }

  const clienteId = await findOrCreateCliente(negocio.id, message.from);
  const conversacion = await findOrCreateConversacion(negocio.id, clienteId);

  // Pattern 4 (D-03) — durable dedup backstop.
  const { error: insertError } = await negocioScoped(negocio.id).mensajes().insert({
    negocio_id: negocio.id,
    conversacion_id: conversacion.id,
    direccion: "entrante", // NOTE: schema CHECK constraint is 'entrante'/'saliente', NOT 'in'/'out' — see Shared Patterns
    wa_message_id: message.id,
    contenido: message,
  });
  if (insertError?.code === "23505") { console.info("Duplicate wa_message_id — already processed", message.id); return; }

  const reply = await responder(conversacion, message.text?.body ?? "");

  // Pattern 5 (D-09) — 24h window gate.
  if (Date.now() < new Date(conversacion.ventana_expira_at).getTime()) {
    await sendWhatsappMessage(negocio.id, message.from, reply);
    await negocioScoped(negocio.id).mensajes().insert({
      negocio_id: negocio.id,
      conversacion_id: conversacion.id,
      direccion: "saliente",
      contenido: { text: { body: reply } },
    });
  } else {
    console.warn("24h window closed — skipping outbound send", conversacion.id);
  }
}
```

---

### `apps/bot/src/queue/inboundWorker.test.ts` (NEW — test, event-driven)

**Analog:** `packages/availability-engine/src/booking.test.ts` — check its mocking approach for `SupabaseClient`-shaped dependencies before writing this; the worker's dependencies (findOrCreateCliente/Conversacion, responder, sendWhatsappMessage) should be injectable/mockable the same way `bookAppointment` takes `deps: BookAppointmentDeps` rather than importing a module-level singleton — refactor `processInboundWhatsappEvent` to accept an optional `deps` param for testability if it currently imports singletons directly.

---

### `scripts/verify-whatsapp-webhook.ts` (NEW — live-gated verification script)

**Analog:** `scripts/verify-availability-engine.ts` (full 332 lines, read above) — copy its structure wholesale:

1. **Isolation guard** (lines 44-57 of the analog) — copy verbatim, same `bdgufnitakelyialjoqg` check:
```typescript
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) { console.error("FALTAN SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en .env — abortando."); process.exit(1); }
if (!SUPABASE_URL.includes("bdgufnitakelyialjoqg")) { console.error(`SUPABASE_URL no apunta al proyecto TurnosBot. Abortando.`); process.exit(1); }
```
2. **Test-row IDs pattern** (lines 69-74) — use clearly-fake UUIDs for the fixture `wa_message_id`/test conversation, reuse `TENANT_A` from `scripts/seed-fixtures.ts` for the negocio/cliente FKs where possible, or seed a throwaway `negocio` row with a test `whatsapp_phone_number_id`.
3. **Cleanup-before-and-after, idempotent reruns** (lines 120-136, `cleanup()` function) — same pattern: delete test `mensaje`/`conversacion` rows scoped to the test negocio at both start and end.
4. **Assert-and-exit-on-failure style** (throughout, e.g. lines 223-227) — `console.error("FAIL: ...")` + `process.exit(1)` on any mismatch, `console.log("OK: ...")` on each passing assertion, final `"\n<script>: PASSED"` line.
5. **What this script specifically does** (per D-01/CONTEXT.md "Specific Ideas" + RESEARCH.md Wave 0 gaps): build a sample inbound text-message webhook JSON body, HMAC-sign it with a dev `WHATSAPP_APP_SECRET`, `fetch()` POST it against the locally-running server's `/webhooks/whatsapp` (server must be started separately, e.g. `pnpm --filter @turnosbot/bot dev`, or the script spins up its own `Fastify` instance via `app.inject()` instead of a real network call — prefer `inject()` to avoid a manual "start the server first" step, matching how `webhook.test.ts` already exercises the route), then poll/select the resulting `mensaje ` row to confirm persistence, then POST the exact same signed payload again and assert no second `mensaje` row was created (WA-03 dedup), then assert the outbound reply was "sent" (mocked, `WHATSAPP_LIVE=false`) end-to-end.

---

### `supabase/migrations/0004_mensaje_wa_message_id_unique.sql` (NEW — migration)

**Analog:** `supabase/migrations/0003_tenant_negocio_split.sql` (header/footer banner comments, isolation notice, read in full above) for house style.

**IMPORTANT FINDING — Open Question 2 / Assumption A2 from RESEARCH.md is RESOLVED by direct migration-file inspection, not just live introspection:** `supabase/migrations/0001_schema_core.sql` line 308 already defines:
```sql
CREATE TABLE mensaje (
  ...
  wa_message_id text UNIQUE,
  direccion text NOT NULL CHECK (direccion IN ('entrante', 'saliente')),
  ...
);
```
Migration `0003_tenant_negocio_split.sql` did **not** touch `mensaje.wa_message_id` or its constraint (only added `negocio_id`, dropped `tenant_id`). So a **plain global `UNIQUE(wa_message_id)` constraint already exists** in the applied schema — NOT scoped by `(negocio_id, wa_message_id)` as RESEARCH.md's Pattern 4/Code Examples assumed. This is actually **stronger** than the composite the research proposed (WhatsApp message IDs are globally unique across all of Meta's Cloud API, not just per-tenant), so:
- **Recommendation for planner:** the existing plain `UNIQUE (wa_message_id)` is sufficient for WA-03's dedup backstop — no new migration is strictly required for the constraint itself. If the plan still wants a defensive `CREATE UNIQUE INDEX IF NOT EXISTS` (e.g. to be self-documenting or to add a partial `WHERE wa_message_id IS NOT NULL` if it isn't already effectively partial via nullable-unique semantics — Postgres `UNIQUE` already allows multiple `NULL`s, so this is moot), keep it idempotent:
```sql
-- Idempotent no-op if the plain UNIQUE from 0001 already covers this — documents
-- intent and is safe to run regardless (CREATE UNIQUE INDEX IF NOT EXISTS).
-- Verify live against bdgufnitakelyialjoqg before writing this file (Management
-- API query against pg_constraint, same technique as scripts/verify-migration-0003.ts).
```
- **Also verify at implementation time** (per RESEARCH.md's own caveat that the live DB couldn't be introspected this session): confirm `0001_schema_core.sql` and `0003_...sql` were actually both applied to `bdgufnitakelyialjoqg` in that exact form — use the same Management API technique as `scripts/verify-migration-0003.ts` (lines 79+, read above) to `SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'public.mensaje'::regclass;` before deciding whether Wave 0 needs this migration file at all.
- **`direccion` values are Spanish**: `'entrante'`/`'saliente'`, NOT `'in'`/`'out'` as RESEARCH.md's Code Examples §4/§5 use as shorthand — planner/executor must use `'entrante'`/`'saliente'` in all `mensaje` inserts or the `CHECK` constraint rejects the row.

---

### `.env.example` (MODIFY — config)

**Analog:** itself (full current contents, read above — 16 lines, Spanish comments, one blank-line-separated block per concern).

**Pattern to extend, same block style:**
```bash
# WhatsApp Cloud API — webhook + envío saliente (Fase 5)
WHATSAPP_APP_SECRET=<Meta App Secret — HMAC-SHA256 sobre el body crudo del webhook>
WHATSAPP_VERIFY_TOKEN=<token propio para el handshake GET hub.verify_token>
WHATSAPP_LIVE=false
WHATSAPP_GRAPH_API_VERSION=v23.0
WHATSAPP_DEV_TOKEN=<token de WhatsApp de prueba, SOLO dev — ver getWhatsappToken.ts D-04>
```
Same "SÍ se commitea; sin valores reales" convention already stated at the top of the file.

## Shared Patterns

### Negocio-scoped DB access (D-11)
**Source:** `apps/bot/src/db/negocioScoped.ts` (full file, read above)
**Apply to:** `findOrCreateCliente.ts`, `findOrCreateConversacion.ts`, `inboundWorker.ts`, `getWhatsappToken.ts` — every DB read/write the worker performs.
```typescript
export function negocioScoped(negocioId: string) {
  return {
    clientes: () => supabaseAdmin.from("cliente").select("*").eq("negocio_id", negocioId),
    conversaciones: () => supabaseAdmin.from("conversacion").select("*").eq("negocio_id", negocioId),
    mensajes: () => supabaseAdmin.from("mensaje").select("*").eq("negocio_id", negocioId),
    // ... (negocio() is the one exception — filters by tenant_id, see getWhatsappToken.ts notes above)
  } as const;
}
```
**Caveat to flag in the plan:** the existing accessors return `.select("*")`-terminated builders; Phase 5 is likely the first caller needing `.insert()`/`.update()` through this layer. Verify at implementation time whether the current return type supports chaining `.insert()` off of it, or whether `negocioScoped.ts` needs a small refactor (e.g. return the un-terminated `.from(...).eq(...)` builder instead) — this is a design question for the plan's Wave 0/Task 1, not an assumption to bake in silently.

### Singleton client / fail-fast on missing env (mirrors `client.ts`)
**Source:** `apps/bot/src/db/client.ts` (full file, read above)
**Apply to:** `apps/bot/src/queue/boss.ts` (pg-boss instance construction) — same "throw a descriptive Spanish error naming the exact file/var if required env is missing" convention:
```typescript
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY son obligatorias para el cliente service_role del bot (apps/bot/src/db/client.ts).",
  );
}
```

### Isolation guard (bdgufnitakelyialjoqg only) — CLAUDE.md hard rule
**Source:** `apps/bot/src/db/negocioScoped.test.ts` lines 48-55, `scripts/verify-availability-engine.ts` lines 51-57, `scripts/verify-migration-0003.ts` lines 41-50 (all three, read above, near-identical)
**Apply to:** `scripts/verify-whatsapp-webhook.ts` (any script that touches the live DB) — copy verbatim:
```typescript
if (!SUPABASE_URL.includes("bdgufnitakelyialjoqg")) {
  console.error(`SUPABASE_URL no apunta al proyecto TurnosBot (bdgufnitakelyialjoqg). Abortando: ${SUPABASE_URL}`);
  process.exit(1);
}
```

### Zod boundary validation
**Source:** `packages/availability-engine/src/booking.ts` lines 72-98 (`uuidLike`, `bookAppointmentInputSchema`, `satisfies z.ZodType<T, unknown>`)
**Apply to:** `apps/bot/src/whatsapp/payload.ts` (webhook body shape validation, WA-01/V5) — same "validate at the module boundary, return a discriminated result rather than throwing where the caller needs to branch" philosophy (though the webhook route itself can reject-with-403/discard-silently rather than surface a `validation_error` union, since there's no UI consuming the result).

### Vitest pure-function test style
**Source:** `packages/availability-engine/src/constants.test.ts` (full file, read above)
**Apply to:** `signature.test.ts`, `responder.test.ts`, any other pure-logic test — `describe`/`it`/`expect` from `"vitest"`, no mocking, `.js` extension on relative imports (NodeNext module resolution, confirmed in `apps/bot/tsconfig.json`: `"module": "NodeNext"`).

### Doc-comment-first module header style
**Source:** every file read in this pass (`booking.ts`, `negocioScoped.ts`, `client.ts`, `clientes.ts`, `0003_tenant_negocio_split.sql`) — this is a strong, consistent project-wide convention: every substantial module opens with a multi-paragraph comment explaining WHY (which decision ID it implements, which pitfall it avoids, what NOT to do and why), not just WHAT.
**Apply to:** every new file in this phase — reference the specific D-xx/WA-xx/Pitfall-N identifiers from CONTEXT.md/RESEARCH.md in each new file's header comment, exactly as `negocioScoped.ts` references "Fase 03 Pitfall 7" and `booking.ts` references "T-03-11..T-03-15".

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `apps/bot/src/whatsapp/signature.ts` | utility | transform | First HMAC/crypto utility in the codebase — fully specified by RESEARCH.md Pattern 2 instead (official Node.js `crypto` API, not project-specific) |
| `apps/bot/src/whatsapp/graphClient.ts` | service | request-response | First outbound-HTTP-to-a-third-party-API call in the codebase (everything else talks only to Supabase) — fully specified by RESEARCH.md Pattern 6/Code Examples §6 instead |
| `apps/bot/src/queue/boss.ts` | service | event-driven | First pg-boss/job-queue usage in the codebase — fully specified by RESEARCH.md Code Examples ("pg-boss instance lifecycle") instead, styled after `client.ts`'s singleton-construction convention |

None of these are true gaps — RESEARCH.md already supplies complete, concrete, cross-verified code for all three (official docs/GitHub README sourced), so the planner has everything needed without further codebase archaeology.

## Metadata

**Analog search scope:** `apps/bot/src/**`, `apps/dashboard/app/actions/**`, `apps/dashboard/lib/**`, `packages/availability-engine/src/**`, `packages/db-types/src/database.types.ts`, `scripts/verify-*.ts`, `scripts/seed-fixtures.ts`, `supabase/migrations/*.sql`, root/package-level `package.json`/`tsconfig.json`/`vitest.config.ts` files.
**Files scanned:** `apps/bot/src/server.ts`, `apps/bot/src/config/env.ts`, `apps/bot/src/db/client.ts`, `apps/bot/src/db/negocioScoped.ts`, `apps/bot/src/db/negocioScoped.test.ts`, `apps/bot/tsconfig.json`, `apps/bot/package.json`, `apps/dashboard/app/actions/clientes.ts`, `packages/availability-engine/src/booking.ts`, `packages/availability-engine/src/constants.test.ts`, `packages/availability-engine/vitest.config.ts`, `packages/availability-engine/package.json`, `packages/db-types/src/database.types.ts` (conversacion/mensaje/negocio Row/Insert/Update shapes), `scripts/verify-availability-engine.ts`, `scripts/verify-migration-0003.ts`, `supabase/migrations/0001_schema_core.sql` (conversacion/mensaje CREATE TABLE), `supabase/migrations/0003_tenant_negocio_split.sql` (full file), `.env.example`, root `package.json`.
**Pattern extraction date:** 2026-07-06

**Key correction to carry into planning (not in RESEARCH.md as stated):** `mensaje.wa_message_id` already has a plain global `UNIQUE` constraint from `0001_schema_core.sql` (not a `(negocio_id, wa_message_id)` composite) — RESEARCH.md's Open Question 2/Assumption A2 treated this as unresolved; direct migration-file inspection resolves it. Also, `mensaje.direccion` is CHECK-constrained to Spanish values `'entrante'`/`'saliente'`, not the `'in'`/`'out'` shorthand RESEARCH.md's code examples used.
