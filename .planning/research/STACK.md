# Stack Research

**Domain:** Multitenant WhatsApp appointment-booking SaaS (bot + dashboard) for barbershops in Argentina
**Researched:** 2026-07-03
**Confidence:** HIGH (core libraries verified via Context7/official docs + npm registry); MEDIUM on a few fast-moving specifics (Gemini free-tier numeric rate limits, Graph API version cadence) — flagged inline.

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Node.js | **24.x (LTS "Krypton")** | JS runtime for both bot service and Next.js | Node 24 entered LTS in Oct 2025, supported to Apr 2028. Node 22 goes EOL Apr 30 2026 — do not start a new project on it. Node 24 has official `linux-arm64` builds, required for the Oracle ARM VPS. HIGH confidence. |
| `ai` (Vercel AI SDK) | **^7.0.14** (dist-tag `latest`) | LLM orchestration, tool calling, streaming, agent loop | v7 is the current stable line as of June 2026 (v5/v6 are legacy — v6 still receives patches under the `ai-v6` tag but v7 is where new agent primitives like `ToolLoopAgent` and `contextSchema` for tools live). Starting greenfield on v5 would mean an immediate migration. HIGH confidence. |
| `@ai-sdk/google` | **^4.0.8** | Gemini provider for AI SDK | Peer-compatible with `ai@7` (both require `zod ^3.25.76 \|\| ^4.1.8`). Maps `generateText`/`streamText`/tool-calling to Gemini's native function-calling API. HIGH confidence. |
| `zod` | **^4.4.3** (or `^3.25.76` if preferred) | Schema validation for AI SDK tool parameters + Fastify request bodies | AI SDK v7 and `@ai-sdk/google` both accept Zod 3 or 4 — pick v4 for a new project (smaller, faster parsing) unless another dependency pins v3. HIGH confidence. |
| Fastify | **^5.9.0** | Bot webhook HTTP server (separate long-running service) | Purpose-built for exactly this: low overhead JSON APIs with schema validation, mature plugin ecosystem (`@fastify/rate-limit`, `@fastify/helmet`, raw-body access for signature verification), first-class Node.js (not edge-first like Hono). On a 2 vCPU box, the Fastify-vs-Hono raw-throughput gap (~62K vs ~78K req/s in synthetic JSON benchmarks) is irrelevant — a webhook server bottlenecked by Postgres/Gemini calls, not framework overhead. HIGH confidence. |
| Next.js | **16.2.x (App Router)** | Dashboard web app | Locked by user constraint. App Router + Server Components pairs naturally with `@supabase/ssr` cookie-based auth. HIGH confidence. |
| Supabase (Postgres) | Managed — Postgres 15/17 depending on project creation date | Multitenant DB, Auth, RLS | Locked by user constraint. HIGH confidence. |
| `@supabase/supabase-js` | **^2.110.0** | Supabase client (browser, server, backend service) | Current major line; used both in dashboard (anon key + user JWT) and bot service (service role key). HIGH confidence. |
| `@supabase/ssr` | **^0.12.0** | Cookie-based SSR auth adapter for Next.js | Official replacement for the deprecated `@supabase/auth-helpers-nextjs`. Handles cookie get/set across Server Components, Route Handlers, and Middleware. HIGH confidence. |
| pg-boss | **^12.25.0** | Reliable job queue for inbound webhook processing, built on Postgres | No Redis needed — you already run Postgres (Supabase). At this scale (a few hundred bookings/day per tenant, realistically low thousands of webhook events/day across all tenants) Postgres-backed queueing has more than enough throughput, and it removes an entire service (Redis) from a 12GB/2vCPU box. HIGH confidence. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `pg` | **^8.13.x** | Direct Postgres driver for pg-boss's dedicated connection | pg-boss needs a **direct** (non-pooled or session-mode) connection — see Pitfall below. Use Supabase's direct connection string (port 5432) or session-mode Supavisor (port 5432 pooler variant), never the transaction-mode pooler (port 6543). |
| `@fastify/rate-limit` | latest (5.x) | Per-IP / per-route rate limiting on the webhook endpoint | Defense against replay/flood even though Meta signs requests — cheap insurance on a small VPS. |
| `@fastify/helmet` | latest | Security headers | Standard hardening for any public HTTP endpoint. |
| `raw-body` (or Fastify's built-in `rawBody` via `addContentTypeParser`) | — | Capture the exact raw bytes of the POST body | **Required** for WhatsApp webhook signature verification (`X-Hub-Signature-256` is computed over the raw, unparsed body — JSON.stringify after parsing will not reproduce the same bytes and verification will silently fail). |
| `node:crypto` (built-in) | Node 24 | HMAC-SHA256 signature verification | Use `crypto.timingSafeEqual` to compare signatures — do not use `===` (timing attack surface). |
| `pino` | ^9.x (bundled with Fastify) | Structured logging | Fastify's default logger; keep it — cheap, fast, and gives you queryable JSON logs on the VPS without a logging service. |
| `dotenv` / Next.js built-in env | — | Environment/secrets loading | Next.js has built-in `.env` support; the bot service (plain Node/Fastify) needs `dotenv` or `node --env-file`. |
| `date-fns-tz` or `Temporal` polyfill (or native `Intl`) | latest | Timezone-safe date math for `America/Argentina/*` slots | Availability engine must do interval math in the tenant's timezone, not UTC-naive — a classic scheduling-app bug. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Docker + Docker Compose | Local dev parity + production deployment | One `docker-compose.yml` on the VPS runs: bot service, Next.js dashboard, (optionally) an nginx/Caddy reverse proxy with TLS. Supabase itself stays hosted (not self-hosted on the VPS) — simplifies ops significantly. |
| Caddy | Reverse proxy + automatic HTTPS (Let's Encrypt) | Simpler than nginx for a single small VPS — automatic cert renewal with near-zero config, ARM builds available. Meta requires HTTPS with a valid (non-self-signed) cert for the webhook URL. |
| TypeScript | ^5.7+ | Both services (bot + dashboard) share the language; enables sharing Zod schemas/types for the DB row shapes between the two codebases. |
| `ngrok` or Meta's built-in webhook test tool | Local webhook testing during development | Needed because Meta requires a publicly reachable HTTPS URL even in dev/test mode. |

## Installation

```bash
# Bot service (Fastify + AI SDK + Supabase + pg-boss)
npm install ai @ai-sdk/google zod fastify @fastify/rate-limit @fastify/helmet pg-boss pg pino

# Dashboard (Next.js + Supabase SSR)
npm install next react react-dom @supabase/supabase-js @supabase/ssr zod

# Dev dependencies (both)
npm install -D typescript @types/node tsx
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|--------------------------|
| Fastify | Hono | If you ever move the bot webhook to an edge runtime (Cloudflare Workers, Vercel Edge) instead of a persistent VPS process — not applicable here since long-running Postgres connections (pg-boss) and a stateful process are required. |
| pg-boss | BullMQ + Redis | If job volume grows into tens of thousands/day with sub-second latency requirements, or you need advanced features (rate-limited queues, complex flows/DAGs) that pg-boss's simpler model doesn't cover. At this project's scale, adding Redis is pure operational overhead on a 12GB box already running Postgres-adjacent workloads. |
| Docker Compose | PM2 (bare-metal) | If you want to avoid Docker entirely and run Node processes directly on Ubuntu with PM2 as the process manager. Valid, slightly less overhead, but loses reproducible builds/isolation and makes "what exact Node/OS deps are running" fuzzier over time. Do not mix PM2 *inside* Docker containers — pick one supervisor. |
| Gemini 2.5 Flash-Lite (free tier) | Gemini 2.5 Flash / paid tier | Once volume exceeds free-tier RPM/RPD limits, or if you need a data-processing/no-training guarantee (see Pitfall below) for customer PII — upgrade to a paid tier key with the same model. |
| Supabase Vault | Manual `pgcrypto` / `pgsodium` calls | Never — Supabase explicitly recommends against direct `pgsodium`/Transparent Column Encryption due to misconfiguration risk. Vault wraps this safely. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|--------------|
| Baileys / any unofficial WhatsApp Web/QR library | Explicitly incompatible with Meta Tech Provider status; Meta prohibits it for providers and it will get numbers banned. Already excluded by user constraint — noted here as a hard guardrail. | WhatsApp Business Cloud API (official). |
| BullMQ + Redis (for this project's current scale) | Adds a second stateful service to operate/back up on a 2 vCPU/12GB box for no throughput benefit at this volume. | pg-boss on the existing Supabase Postgres. |
| Storing the WhatsApp long-lived access token in plaintext in a normal table column | Any DB dump/backup/replica leak exposes every tenant's WhatsApp API credential — with Cloud API this token can send messages and rack up Meta charges as that business. | Supabase Vault (`vault.create_secret` / `vault.decrypted_secrets` view), or app-level envelope encryption with a KMS-held key if you outgrow Vault. |
| Using Supabase's transaction-mode pooler (port 6543 / Supavisor transaction mode) for pg-boss's connection | pg-boss relies on session-level behavior (advisory locks, `LISTEN/NOTIFY`, prepared statements in places) that transaction-mode pooling breaks or silently degrades. | Direct connection (port 5432) or Supavisor **session mode** for the bot service's pg-boss connection specifically; dashboard queries can still use the transaction pooler. |
| Parsing the webhook JSON body before computing the HMAC signature | `X-Hub-Signature-256` is computed over the exact raw bytes Meta sent; re-serializing parsed JSON changes whitespace/key order/escaping and breaks verification, leading teams to disable verification "because it doesn't work." | Capture raw body via Fastify's `addContentTypeParser` (or a raw-body plugin) before JSON parsing, verify HMAC, then parse. |
| Treating Gemini's "free tier" as consequence-free for production customer data | Google's standard terms for the *free* Gemini API tier allow using inputs/outputs to improve their models — this project processes real customer names/phone numbers/appointment data (PII) for a paying B2B customer base. MEDIUM confidence — verify current ToS language before going to production with real tenant data. | Confirm the exact current terms in Google AI Studio / Gemini API ToS before launch; budget for switching to a paid-tier key (same model, same code) if a no-training guarantee is required for commercial trust with barbershop owners. |
| `password_hash` columns managed by hand (from the reference schema) | Reinvents credential storage/rotation/reset flows Supabase Auth already solves, and bypasses RLS's `auth.uid()` integration. | Supabase Auth (`auth.users`) + a `profiles`/`admin_user` table keyed by `auth.uid()`. (Already decided in PROJECT.md.) |

## Stack Patterns by Variant

**If the bot needs to call multiple tools per turn (check availability → book → confirm):**
- Use AI SDK v7's multi-step tool loop: `generateText({ model: google('gemini-2.5-flash-lite'), tools: {...}, stopWhen: isStepCount(5), ... })`, or the newer `ToolLoopAgent` class for a more structured agent definition.
- Because Gemini's native function-calling can return multiple tool calls per turn and the AI SDK's step loop handles the "call tool → feed result back → let model continue" cycle automatically — don't hand-roll this.

**If a webhook event needs guaranteed processing even if the bot process crashes mid-request:**
- Use pg-boss: the Fastify webhook handler's only job is to verify the signature and enqueue the raw event, returning `200` to Meta within its timeout; a separate pg-boss worker (same process, different loop, or a second process) does the actual Gemini call + DB writes.
- Because Meta retries webhook delivery on non-200 responses for up to 7 days, but you still want at-least-once *processing* semantics decoupled from Meta's retry timing, and you never want a slow Gemini call to make you miss Meta's response-time expectations on the webhook itself.

**If a tenant's WhatsApp Business number needs onboarding without a developer touching Meta's dashboard manually:**
- Use Embedded Signup (part of the Tech Provider flow) to let the superadmin (not the barbershop owner, per v1 scope) complete WABA/phone-number registration and get back the WABA ID, phone number ID, and exchangeable token programmatically.
- Because manual per-tenant setup in Meta Business Manager doesn't scale even at "superadmin does everything manually" — Embedded Signup is still the right integration mechanism even though self-service onboarding is out of scope for v1; it collapses what would otherwise be a multi-step manual Meta console flow into one API-driven step the superadmin runs.

**If tenant count grows past Meta's initial phone-number cap:**
- New Business Portfolios start capped at **2** registered phone numbers; this rises to **20** automatically once Business Verification is complete or you cross 2,000 messages. Plan Business Verification early — it's a Meta-side process with its own lead time, not something solved by code.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|------------------|-------|
| `ai@7.0.14` | `@ai-sdk/google@4.0.8` | Both declare identical peer dep on `zod` (`^3.25.76 \|\| ^4.1.8`) — install one Zod version project-wide to avoid duplicate-schema-library issues. |
| `next@16.2.x` | `@supabase/ssr@0.12.x` | `@supabase/ssr`'s `createServerClient`/`createBrowserClient` cookie adapters are written against the Next.js App Router `cookies()` API (async in Next 15+) — confirmed pattern in official Supabase SSR docs. |
| `pg-boss@12.x` | PostgreSQL (Supabase-hosted) | Requires a direct/session-mode connection, not Supavisor transaction-mode pooling (port 6543) — see "What NOT to Use." Also creates its own schema (`pgboss` by default) in the same database; fine to share with the app schema on a single Supabase project. |
| `fastify@5.x` | Node.js `>=20` | Node 24 LTS satisfies this comfortably; Fastify 5 dropped Node 18 support. |
| Node 24 (`linux-arm64`) | Oracle Cloud ARM Ubuntu VPS | Official Node.js binaries ship `linux-arm64` tarballs; Docker's official `node:24` images also publish `arm64` variants — confirm `--platform linux/arm64` is used (default when building/pulling on an ARM host, but pin explicitly in Compose/CI if you ever build off-VPS). |

## Sources

- `/vercel/ai` (Context7) — `generateText`/`streamText` with Google provider, multi-step tool calls, `stopWhen`/`isStepCount`.
- `/websites/ai-sdk_dev` (Context7) — `ToolLoopAgent`, structured output via Zod, Google provider `structuredOutputs` option.
- `/supabase/ssr` (Context7) — `createServerClient`/`createBrowserClient` cookie handling for Next.js middleware and SSR, `SetAllCookies` caching-header requirement.
- `/timgit/pg-boss` (Context7) — `work()`/`fetch()` API, queue creation, worker concurrency options.
- npm registry (`npm view`) — confirmed current published versions: `ai@7.0.14`, `@ai-sdk/google@4.0.8`, `@supabase/supabase-js@2.110.0`, `@supabase/ssr@0.12.0`, `next@16.2.10`, `fastify@5.9.0`, `pg-boss@12.25.0`, `zod@4.4.3`, peer-dependency alignment between `ai` and `@ai-sdk/google`.
- [AI SDK 7 is now available (Vercel changelog)](https://vercel.com/changelog/ai-sdk-7) — MEDIUM confidence (WebSearch-sourced summary, not directly fetched).
- [Node.js endoflife.date](https://endoflife.date/nodejs) — Node 24 LTS window (Oct 2025 → Apr 2028), Node 22 EOL Apr 30 2026. MEDIUM confidence (WebSearch synthesis).
- Meta Graph API changelog (WebFetch) — current version `v25.0` (Feb 2026); versions supported roughly 2–3 years post-release. MEDIUM confidence (single WebFetch pass, not cross-verified with a second source).
- [Webhooks - WhatsApp Cloud API - Meta for Developers](https://developers.facebook.com/docs/whatsapp/cloud-api/guides/set-up-webhooks/) — webhook GET verification handshake (`hub.mode`/`hub.verify_token`/`hub.challenge`), 7-day retry-on-failure policy. HIGH confidence (official docs, WebFetch).
- WebSearch (multiple queries, cross-referenced) — `X-Hub-Signature-256` HMAC-SHA256 verification against raw body using App Secret; 24-hour customer service window / Free Entry Point (72h) / template-required-outside-window rules; Embedded Signup token/WABA exchange; phone-number cap (2 → 20) tied to Business Verification. MEDIUM confidence — recommend a final pass against `developers.facebook.com/docs/whatsapp/cloud-api` at implementation time since Meta's messaging/pricing docs churn frequently.
- [Supabase Vault docs](https://supabase.com/docs/guides/database/vault) — recommended pattern for encrypting per-tenant WhatsApp tokens at rest; explicit guidance against direct pgsodium/TCE usage. MEDIUM confidence (WebSearch synthesis of official docs, not directly fetched in full).
- WebSearch — pg-boss vs BullMQ tradeoffs at small-VPS scale; Fastify vs Hono production tradeoffs; Docker Compose vs PM2 vs systemd for single-VPS multi-service Node+Postgres deployments. MEDIUM confidence (community sources, directionally consistent across multiple results).
- WebSearch — Gemini 2.5 Flash-Lite free tier: 1M token context, function calling included, ~30 RPM / 1,500 RPD figures cited by secondary sources. **LOW-MEDIUM confidence** — official `ai.google.dev/gemini-api/docs/rate-limits` page did not surface exact numbers via WebFetch; verify directly in Google AI Studio (`aistudio.google.com/rate-limit`) before finalizing capacity planning.

---
*Stack research for: Multitenant WhatsApp appointment-booking SaaS (TurnosBot)*
*Researched: 2026-07-03*
