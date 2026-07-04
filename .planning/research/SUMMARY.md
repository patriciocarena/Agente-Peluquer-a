# Project Research Summary

**Project:** TurnosBot — SaaS multitenant de agentes de WhatsApp para peluquerías (Argentina)
**Domain:** Multitenant WhatsApp AI appointment-booking SaaS (B2B, conversational agent + admin dashboard)
**Researched:** 2026-07-03
**Confidence:** MEDIUM-HIGH

## Executive Summary

TurnosBot is a B2B multitenant SaaS where barbershops in Argentina get an LLM-powered WhatsApp agent that books real appointments through natural conversation, plus a web dashboard for owners to manage staff, services, schedules, and turnos. This is a well-understood category — appointment-booking SaaS and Meta Cloud API integration both have mature, documented patterns — but the *combination* of true conversational LLM booking (as opposed to link/widget-based booking, which is what every Argentine incumbent actually ships) is the product's real differentiator and its biggest execution risk simultaneously. The research across all four files converges on one central architectural truth: **the LLM must never be the source of truth for availability, price, or booking confirmation** — it only orchestrates calls to a deterministic availability engine and Postgres, and every "confirmado" message must be hard-linked to a real `turno_id` returned by a tool call, not generated freely by the model.

The recommended approach is a TypeScript monorepo with two independently deployed services — a Fastify-based bot webhook service and a Next.js dashboard — sharing a pure, framework-free `availability-engine` package so the bot and dashboard can never disagree about what's free. Data lives in Supabase Postgres, secured by RLS for the human-facing dashboard and by disciplined application-level `tenant_id` scoping for the bot service (which must use the `service_role` key and therefore gets zero protection from RLS). WhatsApp integration is exclusively the official Cloud API, tenant-routed by the stable `phone_number_id` (never the display number), which is both a Meta Tech Provider requirement and a genuine trust differentiator versus competitors running on unofficial Baileys/QR gateways. Gemini 2.5 Flash-Lite via the Vercel AI SDK handles natural-language understanding and tool-calling; all Spanish rioplatense/date disambiguation must be grounded in server-injected context (today's date, the tenant's actual service list), never left to model inference.

The dominant risks are concurrency (double-booking, closed at the database layer with a Postgres GiST exclusion constraint — not application logic), hallucinated confirmations, tenant-isolation bugs in the bot's privileged DB connection, and WhatsApp-platform mechanics (raw-body signature verification, webhook idempotency, the 24-hour free-form messaging window). None of these are exotic — they are well-documented failure modes with well-documented fixes — but every one of them is a "looks done but isn't" trap that must be verified with an explicit test (concurrent load test, forged-signature test, cross-tenant fetch test), not just code review. Feature scope research validates that the PROJECT.md v1 scope (no payments, no reminders, no self-service onboarding, no analytics) is coherent and complete for validating the core value proposition, and identifies the availability engine as the single most load-bearing component in the entire feature dependency graph.

## Key Findings

### Recommended Stack

The stack is TypeScript end-to-end, split into two deployables on a single Oracle ARM VPS, backed by managed Supabase Postgres (off-VPS). Core libraries are current, actively maintained, and confirmed ARM-compatible — the main stack risk is not the primary dependencies (all pure JS/TS) but peripheral native-binding packages added later without checking `linux-arm64` support first.

**Core technologies:**
- **Node.js 24.x LTS** — runtime for both services; official `linux-arm64` builds, required for the Oracle ARM VPS; Node 22 goes EOL Apr 2026 so this is the only sane choice for a greenfield project.
- **Vercel AI SDK (`ai` ^7.0.14) + `@ai-sdk/google` ^4.0.8** — LLM orchestration and multi-step tool-calling loop against Gemini 2.5 Flash-Lite; replaces the originally-considered OpenClaw, which is incompatible with Cloud API/multitenant requirements (Baileys-based, single-operator gateway).
- **Fastify ^5.9.0** — bot webhook service; purpose-built for JSON APIs with raw-body access (required for HMAC signature verification) and schema validation; framework overhead is irrelevant at this scale (bottleneck is Postgres/Gemini, not HTTP throughput).
- **Next.js 16.2.x (App Router)** — dashboard, locked by user constraint; pairs naturally with `@supabase/ssr` cookie-based auth.
- **Supabase (Postgres) + `@supabase/supabase-js` + `@supabase/ssr`** — multitenant DB, Auth, RLS; locked by user constraint, user already has experience with it.
- **pg-boss ^12.25.0** — Postgres-backed job queue for reliable webhook processing; deliberately avoids adding Redis as a second stateful service on a 12GB box at this project's realistic volume.
- **Supabase Vault (or app-level AES-GCM)** — required for encrypting per-tenant WhatsApp long-lived access tokens at rest; plaintext storage is a full-portfolio credential leak risk flagged independently by both STACK and PITFALLS research.

Full detail: `.planning/research/STACK.md`

### Expected Features

**Must have (table stakes) — matches PROJECT.md Active scope exactly:**
- Natural-language service + professional identification, with graceful handling of "no preference"
- Real-time availability check grounded in live DB state (never cached/stale) before offering slots
- Concrete slot proposals + explicit confirmation-with-summary before writing to DB
- Double-booking prevention enforced at the database layer
- Multi-service bookings ("corte y barba") with duration summing and price freezing at booking time
- FAQ intents: prices, professional hours, real-time availability, existing appointment status
- Client-initiated cancel/reschedule via WhatsApp, sharing one domain implementation with the dashboard's owner-side cancel/reschedule
- Full dashboard CRUD (professionals + schedules, services + per-professional price overrides, appointment grid + manual blocking, business profile)
- Superadmin manual tenant CRUD with WhatsApp number linkage
- Multitenant data isolation (tenant_id + RLS) as invisible-but-fatal-if-missing infrastructure

**Should have (competitive differentiators):**
- True LLM conversational booking with no menus/buttons — every Argentine incumbent (Turnito, Gendu, TurnoSmart, ReservaSimple) is fundamentally a link/widget booking form with WhatsApp notifications bolted on, not real conversational AI
- Graceful handling of ambiguous/incomplete requests via conversational narrowing, not rigid slot-filling
- Official Meta Cloud API as a trust differentiator against unofficial/ban-prone WhatsApp gateways used by much of the local market
- Single shared availability engine guaranteeing bot and dashboard never disagree about what's free

**Defer (v1.x / v2+):**
- Automated reminders (needs Meta-approved HSM templates + scheduling worker; `REMINDER` table stays dormant in schema)
- Deposit/payment via MercadoPago (needs payment state machine; will require new tables, unlike reminders which are schema-ready)
- Self-service tenant onboarding, analytics/reporting, loyalty/marketing broadcasts, waitlists, holiday/exception calendars, walk-in queues, multi-location support

Full detail: `.planning/research/FEATURES.md`

### Architecture Approach

Two independent deployables in one monorepo — a Fastify bot service and a Next.js dashboard — that never call each other directly and converge only at shared Postgres and a shared, framework-free `availability-engine` TS package. The bot uses a privileged `service_role` Supabase connection (no RLS protection — tenant scoping must be enforced in application code via a disciplined query-helper layer) while the dashboard authenticates real users via Supabase Auth and relies on RLS as its actual security boundary. Every fact the LLM states to a customer must originate from a tool call into the availability engine or Postgres; the model never invents a slot, price, or appointment ID, and the booking tool re-validates against real availability server-side even if the model "thinks" it already checked.

**Major components:**
1. **Webhook Receiver** — verifies `X-Hub-Signature-256` on raw bytes, acks fast (<5s, ideally near-immediate 200), enqueues heavy work
2. **Tenant Resolver** — maps `phone_number_id` (never the display number) to `tenant_id`, cached in-memory with short TTL
3. **Conversation Manager** — persists per-customer `CONVERSATION.context` jsonb across turns, stateless-resumable, never caches computed availability as trustworthy
4. **Agent Orchestrator + Tool Layer** — Vercel AI SDK multi-step tool loop against Gemini; tools are thin, deterministic, Zod-typed wrappers around the availability engine and Supabase — never data generators
5. **Availability Engine** — pure TS package (no I/O side effects beyond DB reads), imported by both the bot's tools and the dashboard's appointment grid, the single load-bearing component of the entire system
6. **Dashboard (Next.js)** — RLS-protected CRUD for tenant owners; separate superadmin route group using an explicitly isolated service-role client

Full detail: `.planning/research/ARCHITECTURE.md`

### Critical Pitfalls

1. **LLM hallucinates a booking confirmation without a real tool result backing it** — the highest-impact failure mode for this product. Fix: confirmation text must be templated from a tool's actual return value (a real `turno_id`), never freely generated by the model in the same breath as the decision; enforce with a code-level guard, not just a prompt instruction.
2. **Double-booking via race condition (TOCTOU)** — two concurrent WhatsApp conversations both see a slot as free and both write. Fix: a Postgres GiST **EXCLUDE constraint** on the `turno` table (non-overlap by professional + time range), making double-booking structurally impossible — not an application-level "check then insert."
3. **`service_role` bypasses RLS entirely in the bot service** — since the bot has no per-request end-user JWT, it runs privileged and RLS provides zero protection; a single missing `tenant_id` filter leaks or corrupts another tenant's data. Fix: mandatory `tenant_id` parameter on every query function, ideally via a shared scoped-query layer, verified with an explicit cross-tenant integration test — RLS policy tests alone won't catch this.
4. **Tenant routing by `display_phone_number` instead of `phone_number_id`** — the display number has inconsistent formatting and isn't a stable lookup key; using it breaks or cross-leaks multitenant routing, the very foundation of the product. Fix: store and route exclusively by `phone_number_id`.
5. **Webhook signature verification computed on parsed JSON instead of raw bytes** — silently never matches, tempting teams to disable verification "because it doesn't work," leaving a spoofable public endpoint. Fix: capture raw body specifically for the webhook route before any JSON parsing, verify with `crypto.timingSafeEqual`, test with a deliberately forged signature expecting 403.

Six more pitfalls (multi-service price/duration drift, Argentina timezone handling, 24h window expiry, webhook retry duplication, prompt injection, ARM native-dependency failures, plaintext WhatsApp token storage) are documented in full with prevention strategies in `.planning/research/PITFALLS.md`.

## Implications for Roadmap

Based on combined research, the dependency graph is unusually clear: **nothing the bot does works without dashboard-managed data existing first**, and **the availability engine is the single component everything else depends on**, directly or indirectly. This strongly suggests a roadmap that builds foundation → data-entry → deterministic engine → conversational layer → polish, rather than a feature-by-feature or user-story-by-user-story cut.

### Phase 1: Foundation — multitenancy, schema, infra skeleton
**Rationale:** Multitenant isolation and WhatsApp-number-based tenant routing are prerequisites for every other feature, not a parallel workstream (FEATURES.md dependency notes are explicit on this). Timezone correctness (`TIMESTAMPTZ`, IANA zone handling) and the double-booking exclusion constraint must be in the schema from the first migration — retrofitting either later means data migrations and possible manual conflict resolution.
**Delivers:** Supabase project with the 16-table reference schema, `tenant_id` + RLS on every tenant table, `TIMESTAMPTZ` columns throughout, GiST exclusion constraint on `turno`, monorepo skeleton (bot service + dashboard + shared `availability-engine`/`db-types` packages), Docker/Caddy deployment on the ARM VPS verified with a `linux/arm64` build.
**Addresses:** Multitenant data isolation, tenant routing infrastructure (from FEATURES.md table stakes)
**Avoids:** Pitfall 2 (double-booking race), Pitfall 4 (timezone bugs), Pitfall 12 (ARM native-dependency failures) — all cheapest to get right on day one

### Phase 2: Dashboard core — data owners need before the bot has anything to reason about
**Rationale:** The bot has no independent data entry; professionals, schedules, services, and pricing must exist before any conversational logic can be tested meaningfully. This is also where the RLS-vs-service-role security boundary pattern gets established and tested early, before a second (bot) code path exists to duplicate/diverge from it.
**Delivers:** Auth (Supabase Auth, tenant-owner + superadmin roles), professional CRUD + weekly schedules, service CRUD + per-professional price overrides, business profile, superadmin tenant CRUD with WhatsApp number linkage.
**Addresses:** Dashboard table-stakes features from FEATURES.md (professional/service CRUD, business profile, superadmin tenant management)
**Avoids:** Pitfall 7 (service_role/RLS confusion) — establish the two-distinct-client-factory pattern here before the bot service exists to get it wrong independently

### Phase 3: Availability engine — the load-bearing core, built and tested in isolation
**Rationale:** FEATURES.md explicitly recommends validating this in isolation before wiring the conversational layer on top, since a bug here corrupts trust in the entire product. It's a pure, framework-free package with no LLM involvement — fully unit- and load-testable on its own.
**Delivers:** `computeSlots()` (work hours − blocks − confirmed appointments, service-duration-aware, multi-service duration summing), manual slot blocking, price/duration freezing at booking time, concurrent-load test proving the exclusion constraint holds under simultaneous booking attempts.
**Uses:** `packages/availability-engine` (STACK.md/ARCHITECTURE.md), GiST exclusion constraint from Phase 1
**Avoids:** Pitfall 2 (double-booking) verification, Pitfall 3 (multi-service price/duration drift)

### Phase 4: Dashboard appointment operations
**Rationale:** Builds directly on Phase 3's engine; the appointment grid and manual blocking are the UI surface for the availability engine and must render the exact same computed truth the bot will later use — sequencing this before the bot avoids building two divergent "what's free" implementations.
**Delivers:** Appointment grid per professional/day, owner-side view/cancel/reschedule (the same domain logic the WhatsApp flow will later reuse, not a separate code path).
**Addresses:** Dashboard appointment-grid and owner cancel/reschedule table-stakes features
**Implements:** The "single source of computed availability" architectural pattern from ARCHITECTURE.md

### Phase 5: WhatsApp integration — webhook plumbing, before any agent logic
**Rationale:** Webhook signature verification, tenant routing by `phone_number_id`, idempotent async processing, and 24h-window error handling are all foundational platform-mechanics concerns independent of the LLM — PITFALLS.md flags all of these as pre-launch security/correctness gates, not later hardening. Getting this right in isolation (echo-bot level) before adding agent complexity makes each concern independently testable.
**Delivers:** Verified webhook receiver (raw-body HMAC verification + forged-signature test), `phone_number_id`-based tenant resolver with cache, async processing returning fast 200s, `messages[].id` deduplication, outbound send error-code handling (131047 detection/logging).
**Uses:** Fastify, pg-boss (STACK.md)
**Avoids:** Pitfall 5 (phone_number_id routing), Pitfall 6 (24h window), Pitfall 8 (signature verification), Pitfall 9 (webhook duplication)

### Phase 6: Conversational booking agent
**Rationale:** This is the actual core value proposition and the highest-complexity phase — it should come last among "must exist for v1" phases specifically because it depends on everything before it (data to reason about, a tested availability engine, working webhook plumbing) and because its own internal risks (hallucination, prompt injection, Rioplatense NLU) are best isolated from infrastructure risk during debugging.
**Delivers:** Vercel AI SDK tool-calling agent (service/professional identification, availability negotiation, multi-service bundling, confirm/cancel/reschedule tools), tenant-injected system prompt with server-computed current date and the tenant's actual service list, hard-linked confirmation-to-`turno_id` guard, adversarial prompt-injection test pass.
**Uses:** `ai` + `@ai-sdk/google` (STACK.md), tools-as-thin-wrappers pattern (ARCHITECTURE.md)
**Avoids:** Pitfall 1 (hallucinated confirmation), Pitfall 10 (prompt injection), Pitfall 11 (Rioplatense NLU edge cases)

### Phase 7: Hardening and launch readiness
**Rationale:** Cross-cutting security/ops concerns that are cheap to build correctly from the start per-component but need an explicit end-to-end pass before the first real tenant goes live: token encryption, integration tests proving cross-tenant isolation on the bot's privileged connection, and the full "looks done but isn't" checklist from PITFALLS.md.
**Delivers:** WhatsApp token encryption at rest (Supabase Vault or app-level AES-GCM), cross-tenant integration test suite for the bot's service-role queries, full pitfall checklist verification (concurrent load test, forged-signature test, replayed-webhook test, timezone round-trip test).
**Addresses:** Security Mistakes and "Looks Done But Isn't" checklist items from PITFALLS.md

### Phase Ordering Rationale

- **Data before logic, logic before conversation:** FEATURES.md's dependency graph is unambiguous — dashboard CRUD must exist before the bot has anything to reason about, and the availability engine must be correct before either the bot or the appointment grid consumes it.
- **Infrastructure risk isolated from AI risk:** WhatsApp webhook plumbing (signature verification, idempotency, tenant routing) is well-documented, deterministic engineering that should be fully solved and tested before adding the non-deterministic complexity of LLM tool-calling on top — debugging is much harder if both layers are unproven simultaneously.
- **Security boundaries established early, not retrofitted:** The RLS-vs-service-role split (Pitfall 7) is a foundational pattern choice, not a hardening pass — PITFALLS.md explicitly warns against retrofitting this "after tenants 3 and 4 are onboarded."
- **Concurrency safety is a schema decision, not a code review item:** The double-booking exclusion constraint (Pitfall 2) must exist in the very first migration that creates the `turno` table — this shaped Phase 1's scope.

### Research Flags

Phases likely needing deeper research during planning (`/gsd-research-phase`):
- **Phase 5 (WhatsApp integration):** Meta Graph API specifics churn frequently (webhook payload shape edge cases, embedded signup token exchange flow, exact 24h-window error codes) — STACK.md and PITFALLS.md both flag MEDIUM confidence here and recommend a final doc pass at implementation time.
- **Phase 6 (Conversational agent):** Vercel AI SDK v7's newer primitives (`ToolLoopAgent`, multi-step `stopWhen` patterns) are recent enough that hands-on verification against the actual installed version is warranted; also where Gemini free-tier rate limits (LOW-MEDIUM confidence in STACK.md) need concrete verification in Google AI Studio before capacity planning.
- **Phase 7 (Hardening):** Token encryption approach (Supabase Vault vs. app-level AES-GCM) should be finalized against current Supabase Vault docs at implementation time.

Phases with standard, well-documented patterns (research-phase likely unnecessary):
- **Phase 1 (Foundation):** Postgres GiST exclusion constraints, RLS + tenant_id patterns, and TIMESTAMPTZ handling are all HIGH-confidence, officially documented patterns.
- **Phase 2 (Dashboard core) & Phase 4 (Appointment operations):** Standard Next.js App Router + Supabase Auth/RLS CRUD — extensively documented, low novelty.
- **Phase 3 (Availability engine):** Pure TS computation logic; the hard part is business-rule correctness (verified via the phase's own test suite), not unfamiliar technology.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Core libraries (ai SDK, Fastify, Next.js, Supabase clients, pg-boss) verified via Context7/official docs and npm registry with confirmed version compatibility. A few fast-moving specifics (Gemini free-tier numeric rate limits, exact Graph API version cadence) are MEDIUM/LOW and explicitly flagged for pre-launch verification. |
| Features | MEDIUM-HIGH | Booking/scheduling mechanics (double-booking prevention, slot/price freezing, multi-service summing) are well-established patterns verified across multiple vendor sources. Argentine competitor landscape (Turnito, Gendu, TurnoSmart, ReservaSimple) is HIGH confidence, directly observed. WhatsApp-bot-specific UX patterns (concrete slot proposals, confirmation formats) are MEDIUM, drawn from vendor blogs rather than formal specs. |
| Architecture | HIGH (component boundaries, RLS/service-role separation) / MEDIUM (conversation-state jsonb shape, VPS process layout) | Tenant routing and security-boundary patterns verified against official Supabase docs and Vercel AI SDK guidance. The specific `CONVERSATION.context` shape and exact VPS process supervision approach are synthesized from standard practice, no single authoritative source for this exact combination. |
| Pitfalls | MEDIUM-HIGH | Meta platform mechanics (signature verification, 24h window, phone_number_id routing) and Postgres concurrency patterns (GiST exclusion constraints) are HIGH confidence from official docs and well-established engineering patterns. LLM-hallucination-specific mitigations are MEDIUM — a fast-moving area with limited long-term post-mortem literature. ARM-specific pitfalls are MEDIUM, based on general node-gyp/ARM issues rather than TurnosBot's exact dependency tree. |

**Overall confidence:** MEDIUM-HIGH

### Gaps to Address

- **Gemini free-tier rate limits (RPM/RPD)** are cited only from secondary sources (LOW-MEDIUM confidence per STACK.md) — verify directly in Google AI Studio (`aistudio.google.com/rate-limit`) before finalizing capacity planning for Phase 6/7, and before committing to free-tier-only for the pilot tenant cohort.
- **Gemini free-tier data-usage ToS** (whether inputs/outputs may be used to improve Google's models) is flagged MEDIUM confidence and directly relevant to processing real customer PII for paying B2B tenants — confirm current terms before production launch with real tenant data; budget for a paid-tier key switch if a no-training guarantee is required for commercial trust.
- **Exact Meta Business Verification timeline** (2-7+ business days cited, MEDIUM confidence) should be tracked as an explicit external dependency in project planning — do not gate unrelated development phases on its completion, per PITFALLS.md's Meta approval-delay pitfall.
- **Conversation-state (`CONVERSATION.context` jsonb) exact shape** is a MEDIUM-confidence synthesized recommendation, not sourced from a single authoritative pattern — should be refined and validated during Phase 1's schema design, informed by the illustrative shape in ARCHITECTURE.md.
- **VPS process supervision** (Docker Compose vs. PM2 vs. systemd, recommended: Docker Compose) is a MEDIUM-confidence community-sourced tradeoff — low risk either way, but should be settled once during Phase 1 infra setup rather than revisited per-phase.

## Sources

### Primary (HIGH confidence)
- `/vercel/ai`, `/websites/ai-sdk_dev`, `/supabase/ssr`, `/timgit/pg-boss` (Context7) — API patterns, tool-calling, cookie-based SSR auth, queue mechanics
- npm registry (`npm view`) — confirmed current published versions across the full stack
- [Supabase Docs — Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security), [Securing your data](https://supabase.com/docs/guides/database/secure-data), [service role key RLS troubleshooting](https://supabase.com/docs/guides/troubleshooting/why-is-my-service-role-key-client-getting-rls-errors-or-not-returning-data-7_1K9z) — official docs confirming service_role bypasses RLS
- [Webhooks - WhatsApp Cloud API - Meta for Developers](https://developers.facebook.com/docs/whatsapp/cloud-api/guides/set-up-webhooks/) — webhook verification handshake, retry policy
- [PostgreSQL GiST Exclusion Constraint articles](https://amitavroy.com/articles/postgresql-gist-exclusion-constraintthe-database-evel-answer-to-double-bookings) and multiple corroborating sources — the double-booking prevention pattern
- Direct competitor sites: [ReservaSimple](https://www.reservasimple.com/app-turnos-peluqueria-argentina), [Gendu](https://www.gendu.com.ar/), [TurnoSmart](https://turnosmart.ar/), [Turnito](https://turnito.app/app-turnos-peluqueria/) — directly observed Argentine market

### Secondary (MEDIUM confidence)
- [AI SDK 7 changelog](https://vercel.com/changelog/ai-sdk-7), [Node.js endoflife.date](https://endoflife.date/nodejs), Meta Graph API changelog — version/lifecycle claims via WebFetch/WebSearch, not cross-verified with a second independent source
- [Supabase Vault docs](https://supabase.com/docs/guides/database/vault) — token encryption recommendation, WebSearch synthesis
- WASenderApi multi-tenant WhatsApp architecture guides, dev.to multitenant Cloud API article — single-webhook-multiplexer/phone_number_id routing pattern, consistent across multiple independent SaaS-gateway sources
- Vendor blogs (inbox-ia, Blyssbook, Voiceflow, Salon360, Zenoti, BarbNow, Mangomint, YourGPT, QuantumByte, Uptail) — feature-landscape and UX-pattern sourcing for FEATURES.md
- [OWASP LLM01: Prompt Injection](https://genai.owasp.org/llmrisk/llm01-prompt-injection/) — prompt injection as the #1 LLM risk category, applied to the booking-agent tool-schema design

### Tertiary (LOW confidence)
- Gemini 2.5 Flash-Lite free-tier RPM/RPD figures (~30 RPM / 1,500 RPD cited by secondary sources) — official rate-limits page did not surface exact numbers via WebFetch; needs direct verification in Google AI Studio before capacity planning
- node-gyp/ARM compatibility issue reports (GitHub issues, Lightrun) — general pattern evidence, not TurnosBot's exact dependency tree

---
*Research completed: 2026-07-03*
*Ready for roadmap: yes*
