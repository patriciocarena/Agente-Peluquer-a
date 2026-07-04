# Feature Research

**Domain:** Multitenant WhatsApp AI appointment-booking SaaS for men's barbershops (Argentina)
**Researched:** 2026-07-03
**Confidence:** MEDIUM-HIGH (booking/scheduling mechanics are well-established industry patterns verified across multiple sources; WhatsApp-bot-specific UX patterns are MEDIUM confidence, drawn from vendor blogs rather than formal specs; Argentine competitor landscape is HIGH confidence, directly observed)

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete or the bot feels "broken."

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Natural-language service identification | Client says "quiero cortarme el pelo" not a menu code; a WhatsApp bot that requires rigid commands feels like a form, not a conversation — defeats the core value prop | MEDIUM | LLM tool-calling against the tenant's service catalog (name + synonyms); must handle ambiguity ("corte" could map to 2 services) by asking a clarifying question, not guessing |
| Professional selection (explicit or "no preference") | Barbershop clients often have a preferred barber; product must support both "con Juan" and "cualquiera disponible" | LOW-MEDIUM | "No preference" requires the availability engine to pick the professional with an open slot matching the requested time — an allocation decision, not just a lookup |
| Real-time availability check before offering slots | Offering a slot that's actually taken destroys trust immediately (confirmed pattern across booking-bot vendors) | MEDIUM-HIGH | Must query live state (working hours − manual blocks − confirmed appointments) at the moment of the conversation, not a cached/stale view |
| Concrete slot proposals ("tengo 15, 15:30 o 16hs") | Open-ended "¿qué día y hora te queda bien?" causes back-and-forth loops and abandonment; concrete options close faster | LOW-MEDIUM | Prompt/tool design concern — the LLM must be instructed to always ground offers in real computed slots, never invent times |
| Explicit confirmation step with summary | Client must see service + professional + day/time + price before it's final, to avoid "I didn't agree to that" disputes | LOW | Single message recap ("Corte de pelo con Juan, martes 15hs, $8000. ¿Confirmo?") before writing to DB |
| Double-booking prevention | Two clients booking the same professional/slot concurrently is an unrecoverable trust failure for a booking product | MEDIUM-HIGH | Requires a locking/transactional check at write time (not just read-time availability calc) — race condition between "slot shown as free" and "slot booked" must be closed at the DB layer |
| FAQ: prices | Clients ask "¿cuánto sale el corte?" before or instead of booking — extremely common intent in every barbershop bot studied | LOW | Simple RAG-free lookup against service table; no booking side-effect |
| FAQ: professional working hours | "¿A qué hora atiende Juan los sábados?" — needed to set expectations before negotiating a slot | LOW | Read from professional's weekly schedule table |
| FAQ: real-time availability inquiry | "¿Tenés lugar hoy a la tarde?" without necessarily booking yet — distinct intent from active booking flow | MEDIUM | Same availability engine as booking flow, but read-only / exploratory mode, must not accidentally hold or reserve anything |
| FAQ: existing appointment status | "¿Tengo turno mañana?" / "¿a qué hora era mi turno?" — clients forget details and want confirmation without calling | LOW-MEDIUM | Lookup by phone number (WhatsApp sender ID) against confirmed appointments for that tenant |
| Client-initiated cancel via WhatsApp | Explicitly in v1 scope; also near-universal expectation once a bot exists — "no puedo ir" must be actionable in-chat | MEDIUM | Requires identifying which appointment (if client has >1 upcoming) and freeing the slot atomically |
| Client-initiated reschedule via WhatsApp | Explicitly in v1 scope; reschedule = cancel + new booking, but done as one perceived action ("¿movemos el turno para el jueves?") | MEDIUM-HIGH | Conversationally must not release the old slot until the new one is confirmed (avoid client losing their spot if reschedule fails mid-flow) |
| Multi-service appointments (duration summing) | "Corte y barba" is a normal single-visit request in a barbershop; treating it as two separate bookings is unnatural and can create overlapping/conflicting slots | MEDIUM-HIGH | Availability engine must sum selected services' durations and find one contiguous block; price is sum of line items |
| Slot/price/duration freezing at booking time | If the owner changes a service's price or duration next week, past and pending appointments must not silently change value — standard invariant in every booking/e-commerce system (order line-item snapshotting) | LOW-MEDIUM | Appointment record stores a copy of price + duration at booking time, not a live foreign-key-only reference to the service |
| Dashboard: professional CRUD | Owner must be able to add/edit/deactivate barbers as staff changes — basic administrative table stakes for any multi-staff booking tool | LOW | Standard CRUD; deactivation (not hard delete) needed to preserve historical appointment integrity |
| Dashboard: professional weekly schedule | Working hours per professional per day-of-week is the base input to the availability engine; without it the bot has nothing to compute against | MEDIUM | Needs to support different hours per day (e.g., closed Sundays, half-day Saturdays), and ideally exceptions later (holidays) — but v1 can be pure weekly recurring pattern |
| Dashboard: service CRUD (name, price, duration) | Owner must self-manage the catalog without asking a developer — non-negotiable for a SaaS product | LOW | Straightforward CRUD |
| Dashboard: per-professional custom price override | Junior vs senior barber commonly charge differently for the same service — standard salon-industry pricing model | MEDIUM | Requires a price-resolution rule: professional-specific price if set, else service default; affects both dashboard UI and the bot's price-quoting logic |
| Dashboard: appointment grid per professional/day | The owner's primary daily operating view — "what does today look like" — equivalent to walking up to a physical appointment book | MEDIUM-HIGH | Visual calendar/grid component; must reflect same availability truth as the bot (single source of computed availability, not two divergent implementations) |
| Dashboard: manual slot blocking | Owner needs to block time for lunch, personal appointments, holidays, no-shows follow-up, etc. — universal need in every salon software surveyed | LOW-MEDIUM | Blocks must be treated identically to confirmed appointments by the availability engine — a block is just an "occupied" interval with no client |
| Dashboard: view/cancel/reschedule confirmed appointments (owner side) | Explicitly in v1 scope; owner needs a manual override for phone calls, client requests via other channels, no-shows, etc. | LOW-MEDIUM | Reuses the same cancel/reschedule domain logic as the WhatsApp flow — should not be a separate code path |
| Dashboard: business profile (name, address, hours, linked WhatsApp number) | Baseline settings every tenant needs to configure their own instance — also the general fallback hours shown when no specific professional is asked about | LOW | Simple settings form |
| Superadmin: tenant CRUD | Explicitly in v1 scope (manual onboarding); minimum required to operate a multitenant SaaS with more than one customer | LOW-MEDIUM | Needs to also link/configure the tenant's WhatsApp Business number for routing — this is the critical field, not just a name/address record |
| Multitenant data isolation | Not user-facing per se, but a silent table stake — a barbershop's data leaking to another tenant is a fatal trust/legal failure | MEDIUM-HIGH | Enforced via `tenant_id` + RLS at the DB layer per PROJECT.md; must be verified, not assumed, for every table and every query path (bot and dashboard both) |
| Bot identifies tenant by WhatsApp number | Foundational routing mechanism — without this a single shared bot cannot serve multiple barbershops | MEDIUM | Webhook payload includes the business phone number ID; must map to tenant before any other logic runs |

### Differentiators (Competitive Advantage)

Features that set the product apart from Argentine incumbents (Turnito, Gendu, TurnoSmart, ReservaSimple) and from generic n8n/Voiceflow chatbot templates. Not required for MVP validation, but this is where the product's edge over "another turnos app with a chat widget" comes from.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| True natural-language conversation (no menus/buttons) | Every Argentine competitor found (Turnito, Gendu, TurnoSmart) is fundamentally a link-based booking widget with WhatsApp notifications bolted on — none do full LLM-driven conversational booking. This is the actual moat, not a nice-to-have. | HIGH | Already the core of the roadmap; the risk is reliability (LLM must never invent availability or double-book) not just NLU quality |
| Handling ambiguous/incomplete requests gracefully | "Quiero cortarme mañana a la tarde" (no professional named, no exact time) — bot should narrow down conversationally instead of failing or forcing a rigid form | MEDIUM-HIGH | Differentiates from rule-based chatbots (Voiceflow/Botpress flows) which typically require fixed slot-filling order |
| Multi-service natural bundling in one conversational turn | Client says "corte y barba" once and bot books both as one combined appointment without the client manually adding two separate items (as most booking widgets require) | MEDIUM | Builds on the multi-service table-stakes engine; the differentiator is doing it via one natural sentence instead of a UI with checkboxes |
| Official WhatsApp Cloud API (Meta Tech Provider) | Most Argentine "WhatsApp bots" in this space actually run on unofficial gateways (Baileys/WhatsApp Web/QR) which are fragile and ban-prone; being an official Tech Provider is a trust and reliability differentiator with barbershop owners who've been burned by bans | MEDIUM (mostly a Meta approval/process cost, not engineering) | Already locked in PROJECT.md constraints; worth surfacing explicitly as a sales differentiator, not just a compliance box |
| Consistent single-source-of-truth availability (bot + dashboard) | Many competitors' WhatsApp "integration" is a notification bolt-on to a separate booking calendar — leads to state drift. A shared availability engine used by both the bot and the dashboard grid guarantees they never disagree. | MEDIUM-HIGH (architecture discipline, not new feature) | This is an architecture decision more than a feature, but it directly produces a user-visible differentiator: no "the bot said it was free but the dashboard shows busy" bugs |
| Spanish (Rioplatense) natural tone tuned to barbershop vocabulary | Generic bot templates (Voiceflow/Robofy/Crowdy templates found in research) are generic multi-vertical scripts translated, not built for AR Spanish/barbershop slang | LOW-MEDIUM | Prompt engineering effort, not infrastructure; cheap differentiator relative to value |

### Anti-Features (Commonly Requested, Often Problematic)

Features that competitors treat as standard and that a prospective tenant will likely ask for, but that are explicitly out of scope for v1 per PROJECT.md. Documented here so the team can say "no, deliberately" instead of re-litigating scope during requirements/roadmap work.

| Feature | Why Requested | Why Problematic (for v1) | Alternative |
|---------|---------------|------------------|-------------|
| Deposit / payment to reserve (MercadoPago) | Every major Argentine competitor (ReservaSimple, TurnoSmart Plus) offers this as their headline no-show-reduction feature; owners will ask "¿y la seña?" | Adds MercadoPago integration, payment-state machine, refund/partial-refund logic, and reconciliation — large complexity increase for a feature not needed to validate the core conversational-booking value prop | Defer to a post-v1 phase once core booking flow is proven; PROJECT.md already flags this explicitly |
| Automated reminders (24h/2h before) | Universal feature across every competitor studied (Turnito, ReservaSimple, generic chatbot vendors all cite ~45% no-show reduction); owners will consider its absence a regression vs. what they use today | Requires Meta-approved HSM message templates (approval lag, ongoing template governance) + a reliable cron/scheduling worker — real infra and Meta-compliance surface, not just a toggle | `REMINDER` table stays in schema unused (per PROJECT.md) so it can be wired up later without a data-model migration |
| Self-service tenant signup/onboarding | Growth-oriented instinct ("let barbershops sign themselves up") | Self-service onboarding needs billing/plan selection, WhatsApp Business number provisioning flow, and abuse/spam controls — all unnecessary complexity while the superadmin is manually vetting and onboarding a handful of pilot tenants | Superadmin manually creates each tenant and configures their WhatsApp number; revisit once there's onboarding volume to justify automation |
| Metrics/analytics/reporting dashboards | Every competitor and generic salon-software vendor pitches "insights into bookings, revenue, top services" as a core differentiator | Analytics requires additional aggregation queries/views, potentially a reporting-oriented read model, and UI investment — none of it changes whether the core booking loop works | Raw data already lives in Postgres; ad-hoc SQL/Supabase Studio queries can answer specific owner questions manually during v1 without building a reporting UI |
| Waitlists / "notify me when a slot opens" | Common in general salon software (mentioned across research) as a no-show/cancellation recovery feature | Requires an additional notification trigger system layered on top of the availability engine and (per the reminders anti-feature) HSM-template messaging infra that doesn't exist yet in v1 | Owner can manually track requests or client can simply re-ask the bot later; revisit once reminders infra exists |
| Loyalty programs / birthday messages / marketing broadcasts | Cited by several barbershop-chatbot vendors (inbox-ia, Rybo) as an engagement differentiator | Broadcast/marketing messages to WhatsApp require Meta's marketing-template category (different approval and pricing tier than utility templates) and a segmentation/campaign UI — orthogonal to the booking core value | Not needed to validate "can a client book a real appointment via natural conversation" |
| Walk-in queue management / estimated wait time | Some barbershop bots (inbox-ia) support walk-in queue tracking alongside bookings | Walk-ins are a fundamentally different data model (a live queue, not a scheduled slot) — conflating it with the appointment-slot engine adds a second state machine for a use case not in the described v1 booking flow | Out of scope entirely; not even flagged for later unless a future milestone explicitly targets walk-in-heavy shops |
| Multi-location / franchise management | General salon-software category feature (multi-location dashboards) | Adds a location dimension to every table and permission check; the described product is one dashboard per tenant/barbershop, not multi-branch chains | If a tenant has multiple physical locations, model as separate tenants in v1 rather than building location hierarchy |
| Client accounts / login / booking history portal | Some booking platforms give end clients a web login to see their history | The client's entire interface in this product is WhatsApp itself (by design — "sin intervención humana... conversando por WhatsApp"); a separate web portal duplicates the "FAQ: existing appointment status" bot capability with no added value | The bot answering "¿tengo turno?" via WhatsApp already satisfies this need |
| Holiday/exception calendar (per-professional date overrides) | Natural extension people expect once weekly schedules exist ("but what about Christmas?") | Adds another schedule-override layer (weekly pattern + exceptions) to the availability engine on day one, increasing engine complexity before the base weekly-schedule + manual-block model is even validated | Manual slot blocking (already table stakes) covers ad-hoc closures for v1; owner blocks the whole day manually for holidays instead of a dedicated exceptions feature |

## Feature Dependencies

```
Tenant identified by WhatsApp number (routing)
    └──requires──> Superadmin: tenant CRUD + WhatsApp number linkage
                       └──requires──> Multitenant data isolation (tenant_id/RLS)

Bot: natural-language service identification
    └──requires──> Dashboard: service CRUD (name, price, duration)

Bot: professional selection ("no preference" included)
    └──requires──> Dashboard: professional CRUD
    └──requires──> Dashboard: professional weekly schedule

Bot: negotiate day/time against real availability
    └──requires──> Availability engine (working hours − manual blocks − confirmed appointments)
                       └──requires──> Dashboard: professional weekly schedule
                       └──requires──> Dashboard: manual slot blocking
                       └──requires──> Double-booking prevention (transactional write)

Bot: multi-service appointments (duration summing)
    └──requires──> Availability engine (must accept a summed-duration request, not just single-service)
    └──requires──> Dashboard: per-professional custom price override (to compute correct summed price)

Bot: confirm the turno
    └──requires──> Availability engine
    └──requires──> Slot/price/duration freezing at booking time
                       └──requires──> Dashboard: service CRUD + per-professional price override (source of the value to freeze)

Bot: FAQ prices / professional hours / availability / appointment status
    └──requires──> Dashboard: service CRUD, professional schedule, availability engine, confirmed-appointment records
       (all read-only consumers of data structures built for the booking flow — no new data model needed)

Bot: cancel/reschedule via WhatsApp
    └──requires──> Confirmed appointment lookup by phone number
    └──requires──> Same cancel/reschedule domain logic as Dashboard: owner-side cancel/reschedule
                       (shared, not duplicated — conflicts if implemented as two divergent code paths)

Dashboard: appointment grid per professional/day
    └──requires──> Availability engine (must render the SAME computed truth the bot uses)
    └──enhances──> Dashboard: manual slot blocking (grid is the UI surface for creating blocks)

Dashboard: owner cancel/reschedule confirmed appointments
    └──requires──> Availability engine (freeing/re-checking slots on change)

Deposit/payment (anti-feature) ──conflicts──> v1 "no payment" scope
    (would require MercadoPago integration + payment state machine — deliberately deferred)

Automated reminders (anti-feature) ──requires (if built later)──> Meta-approved HSM templates + scheduling worker
    (REMINDER table kept dormant in schema specifically to unlock this later without migration)
```

### Dependency Notes

- **Everything the bot does requires the dashboard-managed data to exist first.** The bot has no independent data entry — the roadmap must sequence dashboard CRUD (professionals, services, schedules) before or alongside the bot's conversational logic, since the bot has nothing to reason about otherwise.
- **The availability engine is the single most load-bearing component.** Booking, multi-service summing, price/duration freezing, the appointment grid, manual blocking, and both cancel/reschedule paths (WhatsApp and dashboard) all depend on it directly or indirectly. Recommend building and validating it in isolation before wiring the conversational layer on top — a bug here (e.g., a race condition in double-booking prevention) corrupts trust in the entire product.
- **Bot cancel/reschedule and dashboard cancel/reschedule must share one implementation.** If built as two separate code paths (one triggered by WhatsApp intent, one by dashboard button), they will drift — e.g., one path might forget to re-validate availability on reschedule while the other doesn't. Roadmap should treat this as one domain capability with two entry points, not two features.
- **Slot/price/duration freezing depends on service CRUD + per-professional pricing existing first**, because there's nothing to snapshot until those data points exist. This is a small but easy-to-forget dependency: if appointments are built to reference services live (via foreign key only) before freezing is designed in, retrofitting the snapshot later requires a migration and behavior change.
- **Multitenant isolation and WhatsApp-number-based tenant routing are prerequisites for everything else**, not a feature alongside them — no other feature can be correctly scoped/tested without tenant context existing first. This should be phase 1, not a parallel workstream.
- **Deposit/payment and automated reminders (anti-features) both conflict with, or are irrelevant to, v1 scope** but were deliberately designed to not require schema rework later (REMINDER table already reserved per PROJECT.md). No equivalent reservation was mentioned for payment/MercadoPago — worth flagging to the roadmap that adding payment later will likely require new tables (transactions/payments) not just wiring, unlike reminders.

## MVP Definition

### Launch With (v1)

Minimum viable product — matches the Active requirements already locked in PROJECT.md. Nothing here should be relitigated; this section simply confirms research supports the existing scope as coherent and complete for validating core value.

- [ ] Bot: natural-language service identification — core conversational value prop
- [ ] Bot: professional selection (explicit or no-preference) — required for a real barbershop booking (multi-barber is the norm, not the exception)
- [ ] Availability engine (working hours − blocks − confirmed appointments) — nothing else works without this
- [ ] Bot: negotiate day/time against real availability + confirm — the actual "can a client book a real turno" validation
- [ ] Bot: multi-service appointments with duration summing — "corte y barba" is too common a request to defer
- [ ] Slot/price/duration freezing at booking time — prevents silent data corruption when services are edited later; cheap to build correctly now, expensive to retrofit
- [ ] Bot FAQ: prices, professional hours, real-time availability, appointment status — low complexity, high perceived intelligence, reduces "the bot doesn't understand me" abandonment
- [ ] Bot: cancel/reschedule via WhatsApp — explicitly required; also the main way client-side scheduling errors get corrected without human intervention
- [ ] WhatsApp Cloud API integration + tenant routing by number — foundational infrastructure
- [ ] Dashboard: professional CRUD + weekly schedules — the owner's minimum staff/hours setup
- [ ] Dashboard: service CRUD + per-professional custom price — the owner's minimum catalog setup
- [ ] Dashboard: appointment grid per professional/day + manual slot blocking — daily operating view + real-world exception handling (lunch, personal time, holidays)
- [ ] Dashboard: confirmed-appointment admin (view/cancel/reschedule) — owner-side parity with the WhatsApp flow, needed for phone-in requests and correction of bot mistakes
- [ ] Dashboard: business profile — baseline tenant configuration
- [ ] Superadmin: manual tenant CRUD + WhatsApp number linkage — the only onboarding mechanism in v1
- [ ] Multitenant data isolation (tenant_id + RLS) — non-negotiable infrastructure, not optional

### Add After Validation (v1.x)

Features to add once the core conversational booking loop is proven reliable with real barbershops.

- [ ] Automated reminders (24h/2h) — add once Meta HSM templates are approved and a scheduling worker exists; highest-requested feature from real Argentine competitors, likely the first thing pilot tenants ask for
- [ ] Deposit/payment via MercadoPago — add once no-show rate from pilot tenants justifies the integration complexity
- [ ] Holiday/exception calendar per professional — add if manual full-day blocking proves too tedious for owners in practice
- [ ] Waitlist / "notify me when a slot frees up" — natural extension once reminders infrastructure (Meta templates + worker) already exists

### Future Consideration (v2+)

Features to defer until product-market fit is established across multiple tenants.

- [ ] Self-service tenant onboarding — defer until manual onboarding volume becomes the bottleneck, not before
- [ ] Metrics/analytics/reporting — defer until owners are actually asking operational questions the raw dashboard can't answer
- [ ] Loyalty programs / marketing broadcasts — defer; requires Meta marketing-template tier, a different compliance and cost surface than utility messaging
- [ ] Walk-in queue management — only revisit if future tenants are walk-in-heavy shops, not a general v2 default
- [ ] Multi-location/franchise support — only if a specific tenant with multiple branches is acquired; model as separate tenants until then

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Availability engine (core) | HIGH | HIGH | P1 |
| Bot: service + professional identification | HIGH | MEDIUM | P1 |
| Bot: negotiate + confirm booking | HIGH | MEDIUM | P1 |
| Multi-service duration summing | HIGH | MEDIUM | P1 |
| Double-booking prevention | HIGH | MEDIUM | P1 |
| Price/duration freezing | MEDIUM | LOW | P1 |
| Bot FAQ (prices/hours/availability/status) | HIGH | LOW | P1 |
| Bot cancel/reschedule | HIGH | MEDIUM | P1 |
| Dashboard professional CRUD + schedules | HIGH | LOW-MEDIUM | P1 |
| Dashboard service CRUD + custom pricing | HIGH | LOW-MEDIUM | P1 |
| Dashboard appointment grid + manual blocking | HIGH | MEDIUM-HIGH | P1 |
| Dashboard owner cancel/reschedule | MEDIUM | LOW | P1 |
| Dashboard business profile | LOW | LOW | P1 |
| Superadmin tenant CRUD | HIGH | LOW-MEDIUM | P1 |
| Multitenant isolation (RLS) | HIGH (invisible but fatal if missing) | MEDIUM | P1 |
| Automated reminders | HIGH | HIGH (Meta templates + cron) | P2 |
| Deposit/payment (MercadoPago) | MEDIUM-HIGH | HIGH | P2 |
| Holiday/exception calendar | LOW-MEDIUM | MEDIUM | P2 |
| Waitlist | LOW-MEDIUM | MEDIUM | P3 |
| Self-service onboarding | LOW (at current scale) | HIGH | P3 |
| Metrics/analytics | LOW (explicitly deferred by user) | MEDIUM-HIGH | P3 |
| Loyalty/marketing broadcasts | LOW | HIGH (Meta marketing tier) | P3 |
| Walk-in queue | LOW | MEDIUM-HIGH | P3 |
| Multi-location support | LOW | HIGH | P3 |

**Priority key:**
- P1: Must have for launch (matches PROJECT.md Active requirements exactly)
- P2: Should have, add when possible (matches PROJECT.md Out of Scope, deferred not rejected)
- P3: Nice to have, future consideration

## Competitor Feature Analysis

| Feature | Argentine incumbents (Turnito, Gendu, TurnoSmart, ReservaSimple) | Generic AI chatbot templates (n8n/Voiceflow/Botpress/Robofy) | Our Approach |
|---------|--------------|--------------|--------------|
| Booking interface | Link/widget-based self-service form shared via WhatsApp; not conversational | Scripted flow with buttons/quick-replies, slot-filling in fixed order | True LLM conversational booking — the differentiator vs. both categories |
| WhatsApp integration | Reminders/notifications bolted onto a separate calendar backend, often via unofficial APIs | Built on official or semi-official WhatsApp Cloud API integrations (varies by vendor) | Official Meta Cloud API only, tenant-routed, integrated directly with our own availability engine (single source of truth) |
| Payments | MercadoPago deposit integration is a headline feature (TurnoSmart Plus, ReservaSimple Premium) | Rarely built-in; treated as a separate integration | Explicitly deferred to v1.x — not a v1 blocker |
| Reminders | Universal, automatic, cited as primary no-show-reduction lever | Common via scheduled workflow triggers (n8n cron nodes) | Deferred to v1.x pending Meta HSM template approval; schema reserved (`REMINDER` table) |
| Multi-service booking | Typically supported via multi-select checkboxes in the widget UI, not natural language | Rarely handled gracefully — most templates assume one intent per session | Natural-language bundling ("corte y barba") with automatic duration summing — a real differentiator |
| Multitenant / multi-barbershop platform | Each is itself a multitenant SaaS (this is a mature, competitive local category) | Not multitenant — typically single-business chatbot deployments | Multitenant from day 1 with RLS isolation, shared bot contextualized per tenant — matches the local incumbents' business model but adds conversational AI on top |
| Analytics/reporting | Present in most paid tiers (revenue, appointment volume) | Rarely present | Explicitly deferred — not needed to validate core value |

## Sources

- [Ai-powered salon appointment booking system with WhatsApp and Google Sheets — n8n](https://n8n.io/workflows/8698-ai-powered-salon-appointment-booking-system-with-whatsapp-and-google-sheets/) — MEDIUM confidence (vendor workflow template, illustrates common architecture pattern)
- [Barbershop chatbot: automate appointments, queue management and loyalty via WhatsApp — inbox-ia](https://inbox-ia.com/en/blog/chatbot-for-barbershops) — MEDIUM confidence (vendor blog, used for anti-feature identification: loyalty, queue management)
- [AI Salon Booking Software 2026: What's Real vs. What's Hype — Blyssbook](https://blyssbook.com/blog/ai-salon-booking-software-2026) — MEDIUM confidence
- [AI Agent for Barbers — Voiceflow](https://www.voiceflow.com/industries/barbers) — MEDIUM confidence (vendor template pattern reference)
- [Top 7 Features Every Salon Software Must Have in 2026 — Salon360](https://salon360app.com/business-management/7-features-every-salon-software-must-have-in-2026/) — MEDIUM confidence
- [Salon Booking Software: Top Features to Look For — Zenoti](https://www.zenoti.com/thecheckin/salon-booking-software-guide) — MEDIUM confidence
- [10 Must-Have Salon Software Features for 2026 — BarbNow](https://www.barbnow.com/blog/10-must-have-salon-software-features-for-2026) — MEDIUM confidence
- [10 Must-Have Salon Software Features for 2026 — Mangomint](https://www.mangomint.com/blog/salon-software-features/) — MEDIUM confidence
- [How to Build a WhatsApp Appointment Booking AI — YourGPT](https://yourgpt.ai/blog/general/whatsapp-appointment-booking-ai) — MEDIUM confidence (concrete-slot-proposal pattern, confirmation pattern)
- [How to Build a Booking Chatbot — QuantumByte](https://quantumbyte.ai/articles/how-to-build-booking-chatbot) — MEDIUM confidence
- [WhatsApp Appointment Booking Automation — Uptail](https://www.uptail.ai/blog/whatsapp-appointment-booking-automation-how-to-let-customers-schedule-instantly) — MEDIUM confidence (real-time availability, reschedule flow pattern)
- [How to Avoid Double-Booking Appointments — Acuity Scheduling](https://acuityscheduling.com/learn/avoid-double-booking-appointments) — MEDIUM-HIGH confidence (established SaaS vendor documentation on slot-locking mechanics)
- [App Turnos Peluquerías Argentina Gratis 2026 — ReservaSimple](https://www.reservasimple.com/app-turnos-peluqueria-argentina) — HIGH confidence (direct competitor, pricing/feature set observed)
- [Gendu — Sistema de turnos para negocios y profesionales](https://www.gendu.com.ar/) — HIGH confidence (direct Argentine competitor)
- [TurnoSmart — Agenda online, WhatsApp y Mercado Pago](https://turnosmart.ar/) — HIGH confidence (direct Argentine competitor)
- [Chatbot WhatsApp para Peluquerías y Salones de Belleza — Tecca](https://www.soytecca.com/chatbot-whatsapp/peluquerias) — MEDIUM confidence (closest direct AR competitor to this product's concept)
- [App de Turnos para Peluquerías y Barberías — Turnito](https://turnito.app/app-turnos-peluqueria/) — HIGH confidence (direct Argentine competitor, most-cited by market)
- [The developer's guide to SaaS multi-tenant architecture — WorkOS](https://workos.com/blog/developers-guide-saas-multi-tenant-architecture) — MEDIUM-HIGH confidence (established vendor engineering content)
- [Practical Multi-Tenant SaaS Provisioning and Automated Onboarding — Medium/KodeKX](https://kodekx-solutions.medium.com/practical-multi-tenant-saas-provisioning-and-automated-onboarding-3bb6fdd3e84f) — MEDIUM confidence
- Project context: `.planning/PROJECT.md` — HIGH confidence (authoritative source for locked v1 scope)

---
*Feature research for: Multitenant WhatsApp AI appointment-booking SaaS for men's barbershops (Argentina)*
*Researched: 2026-07-03*
