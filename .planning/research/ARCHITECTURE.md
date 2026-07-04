# Architecture Research

**Domain:** Multitenant WhatsApp appointment-booking SaaS (TurnosBot)
**Researched:** 2026-07-03
**Confidence:** HIGH (component boundaries, tenant routing, RLS/service-role separation — verified against official Supabase docs and Vercel AI SDK docs/patterns) / MEDIUM (specific conversation-state jsonb design, VPS process layout — synthesized from standard practice, no single authoritative source)

## Standard Architecture

### System Overview

```
┌───────────────────────────────────────────────────────────────────────────┐
│                            EXTERNAL EDGE                                   │
│  ┌────────────────────┐              ┌──────────────────────────────┐    │
│  │  WhatsApp Cloud API │              │  Browser (tenant owner /     │    │
│  │  (Meta)             │              │  superadmin)                 │    │
│  └──────────┬──────────┘              └───────────────┬──────────────┘    │
└─────────────┼──────────────────────────────────────────┼──────────────────┘
              │ POST webhook (all tenants,                │ HTTPS
              │ one URL, phone_number_id in body)          │
┌─────────────▼──────────────────────────┐   ┌────────────▼──────────────────┐
│      BOT SERVICE (Node/TS, VPS)         │   │   DASHBOARD (Next.js, VPS)    │
│      always-on process, its own port    │   │   App Router, its own process │
│ ┌──────────────────────────────────┐   │   │ ┌───────────────────────────┐│
│ │ 1. Webhook receiver + signature   │   │   │ │ Server Components / RSC   ││
│ │    verify (X-Hub-Signature-256)   │   │   │ │  - reads via Supabase     ││
│ │ 2. Tenant Resolver                │   │   │ │    client bound to logged-││
│ │    phone_number_id → tenant_id    │   │   │ │    in user session (RLS)  ││
│ │ 3. Conversation loader/updater    │   │   │ │ Server Actions            ││
│ │    (CONVERSATION.context jsonb)   │   │   │ │  - CRUD profesionales,    ││
│ │ 4. Agent Orchestrator             │   │   │ │    servicios, horarios,   ││
│ │    Vercel AI SDK generateText +   │   │   │ │    bloqueos, turnos       ││
│ │    tools, Gemini 2.5 Flash-Lite   │   │   │ │  - same RLS as reads      ││
│ │ 5. WhatsApp sender (outbound)     │   │   │ │ Superadmin routes         ││
│ └───────────────┬────────────────────┘   │   │ │  - service-role client,   ││
│                 │ calls tool functions     │   │ │    cross-tenant, gated by ││
│                 ▼                         │   │ │    superadmin role check  ││
│ ┌──────────────────────────────────┐   │   │ └───────────────────────────┘│
│ │  AVAILABILITY ENGINE (shared      │   │   └───────────────────────────────┘
│ │  TS package, imported by both     │   │                 │
│ │  bot tools AND dashboard grid)    │   │                 │
│ │  - pure functions, no I/O side    │   │                 │
│ │    effects beyond DB reads        │   │                 │
│ │  - computes: horario − bloqueos   │   │                 │
│ │    − turnos confirmados = slots   │   │                 │
│ └───────────────┬────────────────────┘   │                 │
└─────────────────┼──────────────────────────┘                 │
                  │ SQL (service role, bot)   │ SQL (anon+JWT, RLS, dashboard)
                  ▼                           ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                     SUPABASE (Postgres + Auth)                             │
│  16-table schema, tenant_id on every tenant-scoped row                     │
│  RLS policies: tenant_id = current tenant claim (dashboard path)           │
│  Bot path uses service_role key → RLS bypassed, tenant_id enforced in code │
└───────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| **Webhook Receiver** | Verify Meta signature, ack fast (<5s), enqueue/parse inbound message | Fastify/Express route, `X-Hub-Signature-256` HMAC check, immediate 200 OK before heavy work |
| **Tenant Resolver** | Map inbound `phone_number_id` → `tenant_id` + tenant config | In-memory cache (Map) populated from `TENANT` table, refreshed on TTL or webhook-driven invalidation |
| **Conversation Manager** | Load/create `CONVERSATION` row for the customer phone, persist `context` jsonb after each turn | Upsert by `(tenant_id, customer_phone)`, jsonb merge, short TTL-based "session" concept |
| **Agent Orchestrator** | Run the LLM loop (Vercel AI SDK `generateText`/`ToolLoopAgent` with `stopWhen: stepCountIs(N)`), bind tools scoped to the resolved tenant | One Gemini call per turn (or multi-step tool loop), tools closed over `tenant_id` |
| **Tool Layer** | Typed functions the LLM can call: `getAvailability`, `getServices`, `getPrices`, `getProfessionalSchedule`, `createAppointment`, `cancelAppointment`, `rescheduleAppointment` | Zod-schema-defined tools per Vercel AI SDK convention; each tool internally calls the Availability Engine or Supabase — never returns freeform LLM-authored data |
| **Availability Engine** | Deterministic computation of valid slots: work hours − blocks − confirmed appointments, ± service duration | Pure TS module/package, no LLM involvement, unit-testable in isolation, imported by both bot tools and dashboard's appointment grid |
| **WhatsApp Sender** | Format and send outbound messages via Cloud API (text, and later template messages) | Thin wrapper over Graph API `POST /{phone-number-id}/messages` |
| **Dashboard (Next.js)** | Tenant-scoped CRUD UI, auth via Supabase Auth, RLS-protected reads/writes | App Router, Server Components for reads, Server Actions for writes, Supabase client created per-request bound to user JWT |
| **Superadmin Panel** | Cross-tenant tenant management (create/edit/deactivate tenants, assign WhatsApp number) | Route group gated by role check, uses service-role client explicitly (never exposed client-side) |
| **Supabase (Postgres)** | System of record, RLS as defense-in-depth for dashboard, Auth for dashboard users | Standard Supabase project, `tenant_id` column + RLS policy on every tenant table |

## Recommended Project Structure

Given the locked decision that the bot is a separate Node/TS service from the Next.js dashboard, and that the Availability Engine must be callable by both, a **monorepo with a shared package** is the right structure — even though it's two deployables.

```
turnosbot/
├── apps/
│   ├── bot/                        # Node/TS webhook service (Fastify-style)
│   │   ├── src/
│   │   │   ├── server.ts           # Fastify app, health check, webhook route
│   │   │   ├── webhook/
│   │   │   │   ├── verify.ts       # Meta signature + verify-token handshake
│   │   │   │   └── receiver.ts     # Parses WhatsApp payload, ack fast
│   │   │   ├── tenant/
│   │   │   │   └── resolver.ts     # phone_number_id → tenant_id (cached)
│   │   │   ├── conversation/
│   │   │   │   ├── store.ts        # load/save CONVERSATION.context
│   │   │   │   └── types.ts        # ConversationContext shape
│   │   │   ├── agent/
│   │   │   │   ├── orchestrator.ts # Vercel AI SDK generateText loop
│   │   │   │   ├── prompt.ts       # system prompt (tenant-injected)
│   │   │   │   └── tools/
│   │   │   │       ├── getAvailability.ts
│   │   │   │       ├── getServices.ts
│   │   │   │       ├── getPrices.ts
│   │   │   │       ├── createAppointment.ts
│   │   │   │       ├── cancelAppointment.ts
│   │   │   │       └── rescheduleAppointment.ts
│   │   │   ├── whatsapp/
│   │   │   │   └── sender.ts       # outbound Graph API calls
│   │   │   └── db/
│   │   │       └── client.ts       # Supabase client w/ service_role key
│   │   └── package.json
│   │
│   └── dashboard/                  # Next.js App Router
│       ├── app/
│       │   ├── (tenant)/           # tenant-owner routes, RLS-scoped
│       │   │   ├── profesionales/
│       │   │   ├── servicios/
│       │   │   ├── turnos/         # grid, reuses availability-engine
│       │   │   └── negocio/
│       │   └── (superadmin)/       # cross-tenant routes, service-role
│       │       └── tenants/
│       ├── lib/
│       │   └── supabase/
│       │       ├── server.ts       # per-request client bound to user JWT
│       │       └── admin.ts        # service-role client (superadmin only)
│       └── package.json
│
├── packages/
│   ├── availability-engine/        # SHARED — pure TS, no framework deps
│   │   ├── src/
│   │   │   ├── computeSlots.ts     # horario − bloqueos − turnos = slots
│   │   │   ├── types.ts
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── db-types/                   # SHARED — generated Supabase types + zod schemas
│   │   └── src/
│   │       ├── database.types.ts   # `supabase gen types typescript`
│   │       └── schemas.ts          # zod schemas mirroring tool inputs/outputs
│   │
│   └── shared/                     # SHARED — constants, tenant config shape, i18n strings (es-AR)
│       └── src/
│
├── supabase/
│   ├── migrations/                 # SQL migrations (16-table schema + RLS policies)
│   └── config.toml
│
├── pnpm-workspace.yaml              # or turbo.json if using Turborepo
└── package.json
```

### Structure Rationale

- **`apps/bot` and `apps/dashboard` as separate apps, one monorepo:** matches the locked decision (separate deployables) while avoiding duplicated business logic. Two independent processes on the VPS, one codebase to reason about.
- **`packages/availability-engine` as a standalone package with zero framework dependencies:** this is the piece the quality gate specifically calls out — it must be importable by a Fastify route (bot tool) and a Next.js Server Component (dashboard grid) without pulling in Express-specific or Next-specific code. Pure functions in, pure data out; trivially unit-testable.
- **`packages/db-types`:** generated Supabase types shared across both apps prevents drift between the bot's raw SQL/Supabase-js calls and the dashboard's queries — both talk to the exact same schema shape.
- **Tools live inside `apps/bot`, not in the shared package:** tools are Vercel-AI-SDK-specific (zod tool definitions, `execute` functions) and tenant-context-bound at request time; they call into `availability-engine` and `db-types`-typed Supabase queries, but the tool wrapper itself is bot-only.

## Architectural Patterns

### Pattern 1: Tools as thin deterministic wrappers, never data generators

**What:** The LLM (Gemini 2.5 Flash-Lite via Vercel AI SDK) never invents a slot, price, or appointment ID. Every fact the bot states to the customer must have passed through a tool call that queried Postgres or the Availability Engine. The system prompt explicitly instructs the model to always call `getAvailability` before proposing a time, and to never state availability from memory/context.

**When to use:** Any conversational agent operating over ground-truth business data (bookings, prices, inventory) where a wrong answer has real-world consequences (double-booking, wrong price quoted).

**Trade-offs:** Slightly higher latency per turn (tool round-trip + second model call to summarize results) and more tokens, but eliminates hallucinated availability — non-negotiable for this domain. Verified via Vercel AI SDK guidance: "gather input, perform deterministic computation where possible, and replace model calls with plain deterministic functions wherever you can" — this is the documented, recommended pattern, not a workaround. (MEDIUM confidence — general AI SDK guidance, not appointment-booking-specific, but directly applicable.)

**Example:**
```typescript
// apps/bot/src/agent/tools/getAvailability.ts
import { tool } from 'ai';
import { z } from 'zod';
import { computeSlots } from '@turnosbot/availability-engine';

export const makeGetAvailabilityTool = (tenantId: string) => tool({
  description: 'Devuelve los horarios REALMENTE disponibles para un servicio y profesional en una fecha dada. Nunca asumas disponibilidad sin llamar esta función.',
  parameters: z.object({
    serviceId: z.string(),
    professionalId: z.string().optional(),
    date: z.string(), // YYYY-MM-DD, America/Argentina/Buenos_Aires
  }),
  execute: async ({ serviceId, professionalId, date }) => {
    // Pure computation — no LLM involved past this point.
    return computeSlots({ tenantId, serviceId, professionalId, date });
  },
});
```

### Pattern 2: Single shared webhook endpoint + tenant-resolver cache

**What:** One public webhook URL registered with Meta receives traffic for every tenant's WhatsApp number. The payload's `entry[].changes[].value.metadata.phone_number_id` is the only signal needed to resolve which tenant is being addressed. The resolver looks up `TENANT` (indexed on `whatsapp_phone_number_id`) and caches the mapping in memory (small table, changes rarely) to avoid a DB round-trip on every message.

**When to use:** Any B2B multitenant WhatsApp/Cloud-API integration where each tenant has a distinct business phone number but shares platform infrastructure — this is the standard, Meta-endorsed pattern (one app, many phone numbers, one webhook).

**Trade-offs:** Cache invalidation needed when a superadmin reassigns/adds a `phone_number_id` to a tenant (webhook-driven bust or short TTL, e.g. 60s, is sufficient — tenant onboarding is a rare, manual, superadmin-driven event in v1). Verified via WhatsApp SaaS architecture pattern research: "your gateway must act as a multiplexer... inspects the instance_id or destination number, queries the database to identify the corresponding tenant_id" (MEDIUM confidence — consistent across multiple SaaS-gateway sources, not an official Meta doc, but matches how `phone_number_id` is documented to work in Cloud API payloads).

**Example:**
```typescript
// apps/bot/src/tenant/resolver.ts
const tenantCache = new Map<string, TenantContext>(); // phone_number_id -> tenant
let lastRefresh = 0;
const TTL_MS = 60_000;

export async function resolveTenant(phoneNumberId: string): Promise<TenantContext> {
  if (Date.now() - lastRefresh > TTL_MS) await refreshCache();
  const tenant = tenantCache.get(phoneNumberId);
  if (!tenant) throw new UnknownTenantError(phoneNumberId);
  return tenant;
}
```

### Pattern 3: Service-role backend, RLS-protected dashboard — dual security boundary

**What:** The bot service, running unattended with no end-user session, connects to Supabase using the `service_role` key (bypasses RLS entirely) and enforces `tenant_id` scoping **in application code** — every query is explicitly filtered `.eq('tenant_id', resolvedTenantId)`. The dashboard, in contrast, authenticates real humans via Supabase Auth and relies on RLS policies (`tenant_id = auth.jwt() ->> 'tenant_id'` or via a custom claim/membership table) as the actual security boundary — Server Components/Actions use a client bound to the logged-in user's JWT, never the service-role key, except in the explicitly-gated superadmin routes.

**When to use:** Any system with both a trusted, tenant-agnostic backend service and an untrusted, multi-tenant human-facing UI over the same database.

**Trade-offs:** The bot path has zero DB-level protection against a coding bug that forgets a `tenant_id` filter — this is a real risk that must be mitigated with disciplined query helpers (e.g. a single `tenantScopedClient(tenantId)` wrapper used everywhere, code review, and integration tests that assert cross-tenant isolation). The dashboard path is safer by default because RLS is enforced at the database layer regardless of application bugs. Confirmed via Supabase official docs: "service role key... ALWAYS bypass RLS... intended for backend processes... never safe to expose... only use on the backend" and "for multi-tenant applications, add a tenant_id column to every table... create policies that match the column against the JWT claim." (HIGH confidence — official Supabase documentation.)

**Example:**
```typescript
// apps/bot/src/db/client.ts — service-role, backend-only, never shipped to a browser
import { createClient } from '@supabase/supabase-js';

export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, // server env only, never NEXT_PUBLIC_*
);

// Discipline: every bot query goes through this helper, never raw supabaseAdmin.from()
export function tenantScoped(tenantId: string) {
  return {
    appointments: () => supabaseAdmin.from('appointment').select('*').eq('tenant_id', tenantId),
    // ...one helper per table, tenant_id filter baked in, impossible to forget
  };
}
```

```typescript
// apps/dashboard/lib/supabase/server.ts — RLS-protected, per-request user session
import { createServerClient } from '@supabase/ssr';

export function createClient(cookieStore) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, // publishable key — RLS enforced
    { cookies: { /* ... */ } },
  );
  // Every query automatically scoped by RLS policy tied to the logged-in user's tenant
}
```

## Data Flow

### Inbound WhatsApp Message — End to End

```
1. Customer sends WhatsApp message to Peluquería X's business number
        ↓
2. Meta POSTs to the single shared webhook URL (all tenants share this URL)
   payload includes: entry[].changes[].value.metadata.phone_number_id,
                      messages[].from (customer phone), messages[].text.body
        ↓
3. Webhook Receiver verifies X-Hub-Signature-256, responds 200 OK immediately
   (Meta requires fast ack; heavy work happens after/async)
        ↓
4. Tenant Resolver: phone_number_id → tenant_id (cache lookup, DB on miss)
   → loads TenantContext { tenant_id, business_name, timezone, active_services, ... }
        ↓
5. Conversation Manager: upsert CONVERSATION by (tenant_id, customer_phone)
   → loads existing `context` jsonb (prior turns, in-progress booking state)
   → appends the new inbound message to history
        ↓
6. Agent Orchestrator (Vercel AI SDK):
   generateText({
     model: gemini-2.5-flash-lite,
     system: tenantSystemPrompt(tenantContext),   // tenant name, tone, business rules
     messages: conversationHistory,
     tools: bindToolsToTenant(tenant_id),          // getAvailability, createAppointment, etc.
     stopWhen: stepCountIs(N),
   })
        ↓
7. Model decides: does it need data? → calls a tool (e.g. getAvailability)
        ↓
8. Tool executes: calls Availability Engine (pure computation) and/or
   Supabase (service-role, tenant_id-scoped query) → returns structured JSON
        ↓
9. Tool result appended to conversation, sent back to the model
   (steps 7-9 repeat until model has enough info — multi-step tool loop)
        ↓
10. Model produces final natural-language reply grounded in tool outputs only
        ↓
11. Conversation Manager persists updated `context` jsonb
    (new turn, any structured booking-in-progress state)
        ↓
12. WhatsApp Sender: POST to Graph API /{phone_number_id}/messages
    → reply delivered to customer
        ↓
13. If tool call was createAppointment/cancelAppointment/rescheduleAppointment:
    row written/updated in APPOINTMENT table (tenant_id-scoped, service-role)
    → same row is what the dashboard's turnos grid reads (via RLS, different path)
```

### Dashboard Data Flow (parallel, independent path)

```
Tenant owner logs in → Supabase Auth session (JWT with tenant claim/membership)
        ↓
Next.js Server Component renders /turnos
        ↓
Supabase client bound to user's JWT queries appointment/professional/service tables
        ↓
RLS policy auto-filters: only rows where tenant_id matches the user's tenant
        ↓
Turnos grid ALSO calls packages/availability-engine directly (same pure function
the bot's getAvailability tool uses) to render open/blocked slots visually
        ↓
Owner blocks a slot manually / edits a turno → Server Action → same RLS-scoped write
```

### Superadmin Data Flow (separate, elevated path)

```
Superadmin logs in → role check (e.g. profile.role = 'superadmin')
        ↓
Superadmin routes use an explicit service-role client (lib/supabase/admin.ts)
        ↓
Can read/write across ALL tenants — CRUD on TENANT table itself,
assign/change whatsapp_phone_number_id, activate/deactivate tenants
        ↓
This is the ONLY place in the dashboard app where service_role is used;
gated by application-level role check, never exposed to non-superadmin routes
```

### Conversation State (`CONVERSATION.context` jsonb) — Recommended Shape

The jsonb column should hold enough state to make each turn stateless-resumable (survive bot restarts) without re-deriving intent from scratch, but should NOT duplicate anything the Availability Engine/DB already owns as source of truth.

```typescript
// packages/db-types/src/schemas.ts (illustrative shape, refine during schema phase)
type ConversationContext = {
  stage: 'greeting' | 'selecting_service' | 'selecting_professional'
       | 'selecting_time' | 'confirming' | 'idle' | 'modifying_appointment';
  pendingBooking?: {
    serviceId?: string;
    professionalId?: string;
    proposedDate?: string;      // ISO date, only ever set AFTER a getAvailability call
    proposedTime?: string;      // only ever set AFTER a getAvailability call — never invented
  };
  lastToolCallAt?: string;      // for staleness checks (re-verify availability if >2min old)
  turnCount: number;            // simple runaway-loop / abuse guard
};
```

**Key design rule:** `proposedDate`/`proposedTime` are only ever populated from a tool result, never written directly by the model's free text. This is what operationalizes the "LLM must not invent slots" requirement at the state-persistence layer, not just the prompt layer — even if the model hallucinates in its reply text, the actual `createAppointment` tool call re-validates against the Availability Engine before writing to Postgres, so a hallucinated claim can never become a real double-booked row.

### Key Data Flows

1. **Inbound message → reply:** WhatsApp → Bot Service → (Tenant Resolver, Conversation Manager, Agent Orchestrator, Tools, Availability Engine, Supabase) → WhatsApp. Fully described above.
2. **Dashboard CRUD:** Browser → Next.js Server Action/Component → Supabase (RLS-scoped) → Postgres. Independent of the bot process; both processes converge only at the shared Postgres database and the shared `availability-engine` package (imported at build time by each app, not a runtime dependency between them).
3. **Cross-cutting consistency:** The bot's `createAppointment` tool and the dashboard's turno grid both ultimately call the same `computeSlots()` function from `packages/availability-engine`, guaranteeing the bot never offers a slot the dashboard would show as blocked, and vice versa.

## Scaling Considerations

Given the stated scope (single Oracle VPS, 2 vCPU / 12 GB RAM, B2B SaaS for barbershops in Argentina, no analytics/no self-service in v1), realistic tenant counts are dozens-to-low-hundreds, not consumer-app scale.

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 1-20 tenants (v1 launch) | Single VPS runs both processes (bot + dashboard) directly under a process manager (pm2/systemd), one shared Postgres via Supabase (managed, off-VPS). In-memory tenant cache is trivially correct at this size. |
| 20-100 tenants | Still fits comfortably on the same VPS — WhatsApp message volume per tenant is naturally bursty/low (a barbershop gets tens of conversations/day, not thousands). Watch Gemini Flash-Lite free-tier rate limits before Postgres/VPS becomes the bottleneck. |
| 100+ tenants / high message volume | First real bottleneck is likely the bot service being single-process/single-instance: introduce a lightweight queue (e.g. BullMQ + Redis, or Postgres-backed job table) between webhook receipt and agent processing so bursts don't block the fast-ack requirement. Second bottleneck: Gemini API rate/cost limits — consider per-tenant request queuing or upgrading off the free tier. |

### Scaling Priorities

1. **First bottleneck:** Bot service processing messages synchronously in the webhook handler risks missing Meta's fast-ack window under burst load (e.g. many tenants' customers messaging simultaneously). Mitigation: acknowledge the webhook immediately (200 OK), process the agent turn asynchronously (in-process async is fine at this scale; a real queue only needed well beyond v1 volumes).
2. **Second bottleneck:** Gemini 2.5 Flash-Lite free tier rate limits (RPM/TPM caps) become the ceiling before the VPS's 2 vCPU/12GB does, at current traffic assumptions. Mitigation: monitor usage from day 1, have a paid-tier upgrade path ready, and keep prompts/tool-result payloads lean to control token usage per turn.

## Anti-Patterns

### Anti-Pattern 1: Letting the LLM compute or state availability directly

**What people do:** Prompt the model with "here are today's appointments, tell the customer what's free" and let it reason about the schedule in natural language, or worse, let the model's `createAppointment` tool call accept a `date`/`time` argument the model chose without a prior `getAvailability` call in the same turn.

**Why it's wrong:** LLMs are not reliable at date/time arithmetic across timezones, don't reliably respect exclusion rules (blocks, existing bookings, buffer time between appointments), and can hallucinate a plausible-looking but wrong slot — directly causing double-bookings, the single most damaging failure mode for this product's core value proposition.

**Do this instead:** Availability is ALWAYS computed by the deterministic `availability-engine` package. The `createAppointment` tool itself re-validates the requested slot against `computeSlots()` server-side before writing to Postgres (defense in depth — never trust that the model actually called `getAvailability` first in the same turn). If the requested slot is no longer valid, the tool returns an error the model must relay, not a silent auto-correction.

### Anti-Pattern 2: Sharing one Supabase client/connection pattern across bot and dashboard

**What people do:** Reuse the same `service_role` Supabase client in the Next.js dashboard "for convenience" (e.g. inside a Server Action) instead of maintaining two distinct client configurations.

**Why it's wrong:** It silently defeats RLS for the dashboard, meaning a bug in a Server Action's manual `tenant_id` filter (forgotten `.eq()`) becomes a full cross-tenant data leak with no database-level backstop — exactly the class of bug RLS exists to prevent for human-facing surfaces.

**Do this instead:** Two explicitly distinct client factories: `lib/supabase/server.ts` (anon key + user JWT, RLS-enforced, used everywhere in tenant-owner routes) and `lib/supabase/admin.ts` (service-role, used only in the small, explicitly-audited superadmin route group). Never let the two mix in the same request path.

### Anti-Pattern 3: Storing derived/computed availability in `CONVERSATION.context`

**What people do:** Cache the full list of "available slots I told the customer about" inside the jsonb context to avoid recomputation, then let a later turn (e.g. "yes, the second one") resolve against that stale cached list without re-verifying.

**Why it's wrong:** Between the time slots were computed and the time the customer confirms, another customer (or the dashboard owner manually blocking a slot) may have taken that slot — the cached list goes stale, and blindly trusting it reintroduces the double-booking risk the Availability Engine was supposed to eliminate.

**Do this instead:** It's fine to store *what was shown* for conversational continuity (so the bot can say "the second option" correctly), but `createAppointment` must always re-run `computeSlots()` immediately before writing, and reject/re-negotiate if the slot is no longer free.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| WhatsApp Cloud API (Meta) | Single webhook URL for inbound (all tenants); outbound via `POST /{phone_number_id}/messages` per tenant | Requires `X-Hub-Signature-256` verification; webhook verify-token handshake on setup; each tenant's `phone_number_id` + WABA must be provisioned as Tech Provider |
| Gemini 2.5 Flash-Lite (Google) | Via Vercel AI SDK's Google provider, `generateText`/tool-loop | Free tier rate limits are the likely first external bottleneck; keep an eye on RPM/TPM |
| Supabase (Postgres + Auth) | `@supabase/supabase-js` (bot, service-role) and `@supabase/ssr` (dashboard, user-JWT) | Managed off-VPS — reduces VPS resource pressure; single source of truth for both apps |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Bot Service ↔ Dashboard | No direct runtime communication — both are independent processes that only converge at shared Postgres and the shared `availability-engine`/`db-types` packages (build-time imports) | Confirms the locked decision: two deployables, not one. No HTTP calls needed between them for v1. |
| Agent Orchestrator ↔ Tools | In-process function calls via Vercel AI SDK's `tool()` definitions, bound/closed over the resolved `tenant_id` per request | Tools are the only path from LLM output to a DB write — enforces the "LLM proposes, tool disposes" boundary |
| Tools ↔ Availability Engine | Direct TS function import (`computeSlots()`), no network hop | Keeps availability computation testable and reusable without an internal API |
| Tools/Bot ↔ Supabase | Service-role client, tenant_id filter enforced in a thin query-helper layer (`tenantScoped(tenantId)`) | No RLS backstop on this path — discipline + tests are the mitigation, documented as an explicit residual risk |
| Dashboard ↔ Supabase | User-JWT client, RLS-enforced | Primary security boundary for human-facing surface |
| Superadmin routes ↔ Supabase | Service-role client, explicitly isolated route group + role check | The one deliberate, audited exception to "dashboard always uses RLS" |

## Sources

- [Vercel AI SDK — Tool Use (Vercel Academy)](https://vercel.com/academy/ai-sdk/tool-use) — MEDIUM confidence, general tool-calling patterns
- [Vercel AI SDK — Multi-Step & Generative UI (Vercel Academy)](https://vercel.com/academy/ai-sdk/multi-step-and-generative-ui) — MEDIUM confidence, `stopWhen`/`stepCountIs` multi-step loop pattern
- [The no-nonsense approach to AI agent development — Vercel](https://vercel.com/blog/the-no-nonsense-approach-to-ai-agent-development) — MEDIUM confidence, source of "replace model calls with deterministic functions wherever you can"
- [AI SDK 6 — Vercel](https://vercel.com/blog/ai-sdk-6) — MEDIUM confidence, `ToolLoopAgent` production pattern
- [WASenderApi — Multi-Tenant WhatsApp API Architecture Guide for SaaS](https://wasenderapi.com/blog/how-to-build-a-white-label-whatsapp-marketing-platform-infrastructure-architecture-guide) — MEDIUM confidence, single-webhook-multiplexer pattern (multiple SaaS-gateway sources agree)
- [WASenderApi — Building a WhatsApp API Gateway for SaaS](https://wasenderapi.com/blog/building-a-whatsapp-api-gateway-for-saas-centralizing-customer-communication-infrastructure) — MEDIUM confidence
- [dev.to — Whatsapp Chatbot Multitenant, WhatsApp Cloud API](https://dev.to/juanjefry23/whatsapp-chatbot-multitenant-whatsapp-cloud-api-nfp) — MEDIUM confidence, corroborates phone_number_id-based routing
- [Supabase Docs — Why is my service role key client getting RLS errors or not returning data?](https://supabase.com/docs/guides/troubleshooting/why-is-my-service-role-key-client-getting-rls-errors-or-not-returning-data-7_1K9z) — HIGH confidence, official docs, confirms service_role always bypasses RLS
- [Supabase Docs — Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security) — HIGH confidence, official docs
- [Supabase Docs — Securing your data](https://supabase.com/docs/guides/database/secure-data) — HIGH confidence, official docs, "never use service_role key on the frontend"
- [makerkit.dev — Supabase RLS Best Practices: Production Patterns for Secure Multi-Tenant Apps](https://makerkit.dev/blog/tutorials/supabase-rls-best-practices) — MEDIUM confidence, tenant_id + JWT claim pattern (consistent with official docs)
- `.planning/PROJECT.md` — project-internal source for locked stack decisions and 16-table reference schema context

---
*Architecture research for: Multitenant WhatsApp appointment-booking SaaS*
*Researched: 2026-07-03*
