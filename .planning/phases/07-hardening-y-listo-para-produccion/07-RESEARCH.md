# Phase 7: Hardening y listo para producción - Research

**Researched:** 2026-07-09
**Domain:** Postgres/Supabase secret management (Vault), Postgres concurrency (GiST EXCLUDE under load), multitenant service_role isolation testing
**Confidence:** MEDIUM-HIGH (Vault mechanics verified against multiple independent sources incl. official docs/GitHub; exact PostgREST schema-exposure behavior corroborated by community sources, not a single canonical doc page — flagged below)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** El mecanismo es **Supabase Vault** (`vault.create_secret` / `vault.decrypted_secrets`), NO AES-GCM a nivel app. Decisión LOCKED — ver `07-SEC-01-DECISION.md` para rationale.
- **D-02:** Implementar el **flujo Vault completo ahora** (no solo el mecanismo + test). Como hoy no hay tokens reales (todos `null`/placeholder), no hay datos que migrar → bajo riesgo y deja el sistema production-ready. Incluye:
  (a) migración: `negocio` deja de tener el token en claro; se guarda un `whatsapp_token_secret_id` (uuid) que referencia el secreto en Vault; deprecar/dropear la columna plana `whatsapp_token`;
  (b) escritura: el panel superadmin (`admin-tenants.ts`) crea el secreto vía `vault.create_secret` y guarda el `secret_id`;
  (c) lectura: el bot (`getWhatsappToken.ts`) resuelve el token vía `vault.decrypted_secrets` con el service_role;
  (d) verificación: test que confirme que un `SELECT` directo a `negocio` NO devuelve el token en claro (solo el `secret_id`).
- **D-03:** Script **Node/TS con `Promise.all`** que dispara N reservas concurrentes al MISMO slot contra `bookAppointment` real (DB live), asertando **exactamente 1 éxito** y el resto `slot_taken` (camino `23P01` → `isSlotTakenConcurrently`). Ejercita directo la GiST existente; sin tooling externo (no k6/pgbench).
- **D-04:** Test de **integración contra la DB live** con los 2 negocios/tenants seed: ejercita `negocioScoped` + las tools de lectura del bot con el contexto del negocio A y asserta **cero filas** del negocio B. Un unit mockeado NO sirve.
- **D-05:** SEC-02 y SEC-03 corren como **scripts `verify-*.ts` gated, a mano** (mismo patrón que fases previas), contra la DB live usando las credenciales del `.env`, FUERA de la suite vitest mockeada. Cada script lleva el guard de aislamiento que aborta si `SUPABASE_URL` no apunta a `bdgufnitakelyialjoqg`. No se crea CI en esta fase.

### Claude's Discretion

- Nombres exactos de archivos/columnas, forma de la migración SQL, y detalles de cómo se parametriza N en el test de concurrencia — a criterio del planner/executor, respetando los patrones existentes.
- Si Vault requiere habilitar la extensión `supabase_vault` en `bdgufnitakelyialjoqg`, incluir ese paso (gated, ver 07-SEC-01-DECISION.md nota).

### Deferred Ideas (OUT OF SCOPE)

- Montar CI (`.github/workflows`) para correr los 220+ unit tests y los verify-*.ts automáticamente.
- Rotación automatizada de secretos de WhatsApp — Vault soporta rotación (nuevo secreto + update del id), pero automatizarla es post-v1.
- Rate-limiting adicional / hardening del webhook más allá de lo ya hecho en la fase 5.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SEC-01 | Tokens de WhatsApp por tenant almacenados encriptados en reposo (Supabase Vault) | Vault API surface (`vault.create_secret`/`vault.decrypted_secrets`), the "wrapper RPC required" pitfall, migration shape, and the no-plaintext verification pattern are all documented below under Architecture Patterns / Code Examples. |
| SEC-02 | Test de carga concurrente que prueba que la constraint anti-doble-reserva se sostiene | Documented Promise.all + shared-stale-freshData pattern (reusing the proven `verify-double-booking.ts`/`verify-reschedule.ts` techniques) that forces the race down to the real DB-level `23P01`, asserting exactly 1 success through `bookAppointment` itself (not raw inserts). |
| SEC-03 | Test de aislamiento cross-tenant sobre las queries service_role del bot | Documented distinction between the RLS-path isolation script (`verify-isolation.ts`, dashboard/anon+JWT) and the service_role-path isolation test (`negocioScoped.test.ts`, apps/bot) — clarifies which file SEC-03 must actually extend, plus the tool-level test design. |
</phase_requirements>

## Summary

Phase 7 is a hardening phase with **zero new runtime dependencies** — no new npm packages, no new external services. All three requirements extend existing, already-proven patterns in this codebase rather than introducing new tooling:

1. **SEC-01 (Vault):** Supabase Vault is a thin, well-documented Postgres extension (`supabase_vault`) that stores secrets authenticated-encrypted in `vault.secrets` and exposes a decrypting view `vault.decrypted_secrets`. The mechanism itself (`vault.create_secret`/`vault.update_secret`/`vault.decrypted_secrets`) is simple and confirmed via official docs and the `supabase/vault` GitHub repo. The **one non-obvious pitfall that changes the plan's shape**: the `vault` schema is **not exposed via PostgREST by default** (and Supabase explicitly recommends never adding it to "Exposed schemas"). This means `apps/dashboard`'s `createAdminClient()` and `apps/bot`'s `supabaseAdmin` — both PostgREST-based `@supabase/supabase-js` clients using the service_role key — **cannot** call `.schema('vault').from('decrypted_secrets')` or `.rpc()` a `vault.*` function directly. The plan must create two `SECURITY DEFINER` wrapper functions in `public` (one to create/update a secret, one to read a decrypted secret by id), granted `EXECUTE` only to `service_role` (revoked from `anon`/`authenticated`), invoked via `.rpc()` — the exact same hardening pattern this codebase already applies to `auth_negocio_ids()` in migration `0003` (`SECURITY DEFINER`, `STABLE`/`VOLATILE` as appropriate, `SET search_path = ''`, explicit `REVOKE`/`GRANT`).
2. **SEC-02 (concurrency):** The GiST EXCLUDE constraint (`turno_no_overlap`) and its `23P01` → `slot_taken` translation in `bookAppointment` already exist and are already proven to work under raw concurrent inserts (`scripts/verify-double-booking.ts` Step 5, `N=8`, exactly 1 success — already passing live). SEC-02's job is to prove the same guarantee holds when going through the **full domain function** `bookAppointment`, which does an in-memory `computeSlots` freshness check *before* inserting. The key design point (and pitfall) is that `bookAppointment` calls are only a real race if every concurrent call sees the slot as available in its freshness check — which requires **fetching `freshData` once and sharing it** across all N concurrent calls (mirroring the deliberately-stale-freshData technique `verify-reschedule.ts` already uses to force a real `23P01` at the DB layer instead of being short-circuited by the in-memory check).
3. **SEC-03 (cross-tenant isolation):** This codebase already has **two different** isolation-verification scripts that are easy to conflate: `scripts/verify-isolation.ts` proves RLS isolation on the **dashboard's anon-key + user-JWT path** (owner logs in, RLS enforces `auth_negocio_ids()`), while `apps/bot/src/db/negocioScoped.test.ts` proves isolation on the **bot's service_role path** (RLS bypassed, `negocioScoped()` is the only guard). SEC-03 is explicitly about the service_role path ("las queries `service_role` del bot... nunca devuelven filas del tenant B"), so the correct file to extend is `negocioScoped.test.ts` (currently only tests the `turnos()` accessor) — not `verify-isolation.ts`, despite CONTEXT.md's wording pointing at the latter as "the pattern." The plan should extend `negocioScoped.test.ts`'s accessor coverage (today: only `turnos()`) and add at least one bot **tool**-level check (`consultarNegocioTool`/`buscarHorariosTool` called with negocio A's context, asserting zero negocio-B ids/prices/professionals ever appear in the result) using the two already-seeded tenants (`TENANT_A`/`TENANT_B` in `scripts/seed-fixtures.ts`).

**Primary recommendation:** Implement SEC-01 as two `SECURITY DEFINER` RPC wrapper functions in `public` (never expose `vault` schema via PostgREST/API), migrate `negocio.whatsapp_token` → `negocio.whatsapp_token_secret_id uuid`, and update `admin-tenants.ts`/`getWhatsappToken.ts` to call the wrappers via `.rpc()`. Implement SEC-02 as a gated `scripts/verify-concurrent-booking.ts` that shares one `freshData` fetch across N parallel `bookAppointment()` calls. Implement SEC-03 by extending `apps/bot/src/db/negocioScoped.test.ts` (all accessors, not just `turnos()`) plus a new assertion block exercising a bot tool with the wrong negocio's context.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Secret encryption at rest (WhatsApp token) | Database / Storage (Postgres `supabase_vault` extension) | API/Backend (dashboard write path, bot read path via RPC wrappers) | Vault's authenticated encryption and key management live entirely in Postgres; the app tiers only ever see a `secret_id` (uuid) or, transiently, a decrypted value returned from an RPC call — never a persisted plaintext column. |
| Concurrency-safe booking (anti-double-booking) | Database / Storage (GiST EXCLUDE constraint) | API/Backend (`bookAppointment`'s `23P01`→`slot_taken` translation) | The actual correctness guarantee is enforced by Postgres itself (already CORE-05, Phase 1); SEC-02 is a **verification** capability, not a new mechanism — it belongs in a backend-tier test script that drives the existing domain function under real concurrency. |
| Cross-tenant read isolation (service_role bypass) | API/Backend (`negocioScoped` query layer + bot tools) | — | RLS provides zero protection for the bot's service_role client (documented, intentional design since Phase 1/3). Isolation is 100% an application-code responsibility — there is no DB-tier or client-tier component that can substitute for this. |
| Verification tooling (gated `verify-*.ts` scripts) | API/Backend (Node/TS scripts, run manually) | — | Consistent with all five prior phases' pattern; explicitly NOT CI/DB tier (D-05: no CI created this phase). |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `supabase_vault` (Postgres extension) | Bundled with all hosted Supabase projects (not an npm package) | Authenticated-encryption secret storage inside Postgres | Official Supabase-recommended mechanism for exactly this use case (long-lived third-party API tokens); explicitly the alternative CLAUDE.md/STACK.md already names over hand-rolled AES-GCM or `pgsodium`/TCE. `[CITED: supabase.com/docs/guides/database/vault]` |
| `@supabase/supabase-js` | `^2.110.0` (already installed) | RPC calls to the wrapper functions (`.rpc('create_whatsapp_token_secret', …)`, `.rpc('get_whatsapp_token', …)`) | Already the sole DB client in both `apps/bot` and `apps/dashboard` — no new client needed. `[VERIFIED: package.json]` |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `tsx` | `^4.19.0` (already installed) | Run the new/updated gated `verify-*.ts` scripts | Same runner already used for every `verify-*.ts`/`.test.ts` smoke script in this repo. |
| `vitest` | `4.1.9` (already installed) | Unit-level coverage for the migration's TypeScript call sites (mocked `.rpc()`), NOT for the three live SEC verifications themselves (those are gated per D-05) | Existing framework; no new dependency. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Supabase Vault | App-level AES-256-GCM | Rejected — LOCKED decision (07-SEC-01-DECISION.md): requires custody of a master key, manual IV/nonce/AAD handling, higher bug surface; STACK.md explicitly steers away from rolling custom crypto. |
| Supabase Vault | `pgcrypto`/Transparent Column Encryption (TCE) directly | Rejected — Supabase explicitly deprecated/removed TCE from the dashboard UI and does not recommend any new usage of `pgsodium`-based direct column encryption due to misconfiguration risk. `[CITED: supabase.com/docs/guides/database/extensions/pgsodium]` |
| Promise.all Node/TS concurrency script | k6 / pgbench | Rejected per D-03 — the goal is correctness-under-concurrency (exactly 1 winner), not throughput; external load tools add setup cost for no benefit here. |
| Extending `negocioScoped.test.ts` (service_role path) | Extending `verify-isolation.ts` (RLS/anon+JWT path) | `verify-isolation.ts` tests a **different** codepath (dashboard, RLS-protected) than what SEC-03 requires (bot, service_role, RLS-bypassed). Both are valid isolation tests but only `negocioScoped.test.ts`'s pattern actually proves what SEC-03 asks for. See Common Pitfalls. |

**Installation:** None. No new packages for this phase — `supabase_vault` is a Postgres extension enabled via SQL migration (`CREATE EXTENSION IF NOT EXISTS supabase_vault;`), not an npm install.

**Version verification:** N/A (no new npm/pip/cargo packages). `@supabase/supabase-js@2.110.0` already verified in Phase 1/2 research; no version change needed for this phase's RPC-based Vault calls (any 2.x client version supports `.rpc()`).

## Package Legitimacy Audit

**Not applicable this phase.** No new external packages are introduced by SEC-01/02/03 — Vault is a Postgres extension bundled with the hosted Supabase project (verified/enabled via SQL, not npm), and the concurrency script uses only native `Promise.all` plus the already-installed `@supabase/supabase-js`.

**Packages removed due to [SLOP] verdict:** none (n/a — no packages evaluated)
**Packages flagged as suspicious [SUS]:** none (n/a — no packages evaluated)

## Architecture Patterns

### System Architecture Diagram

```
                    ┌─────────────────────────────┐
                    │   apps/dashboard (superadmin)│
                    │   admin-tenants.ts (Server   │
                    │   Action, service_role client)│
                    └───────────────┬─────────────┘
                                    │ 1. owner sets/rotates WA token
                                    │    supabaseAdmin.rpc(
                                    │      'set_whatsapp_token_secret',
                                    │      { negocio_id, token, name })
                                    ▼
                    ┌─────────────────────────────┐
                    │ public.set_whatsapp_token_   │  SECURITY DEFINER
                    │ secret(negocio_id, token,name)│  search_path=''
                    │  -> vault.create_secret(...) │  GRANT EXECUTE
                    │  -> UPDATE negocio SET       │    TO service_role only
                    │     whatsapp_token_secret_id │  REVOKE FROM anon/
                    └───────────────┬─────────────┘    authenticated
                                    │ writes
                                    ▼
                    ┌─────────────────────────────┐
                    │  negocio                     │
                    │  whatsapp_token_secret_id uuid│ <- ONLY this column,
                    │  (whatsapp_token DROPPED)     │    no plaintext ever
                    └───────────────┬─────────────┘
                                    │ read
                                    ▼
                    ┌─────────────────────────────┐
                    │ public.get_whatsapp_token(   │  SECURITY DEFINER
                    │   negocio_id)                │  search_path=''
                    │  -> SELECT negocio_id's       │  GRANT EXECUTE
                    │     secret_id                │    TO service_role only
                    │  -> SELECT decrypted_secret   │
                    │     FROM vault.decrypted_     │
                    │     secrets WHERE id=secret_id│
                    └───────────────┬─────────────┘
                                    │ 2. bot resolves token to send message
                                    ▼
                    ┌─────────────────────────────┐
                    │  apps/bot                    │
                    │  getWhatsappToken.ts          │
                    │  supabaseAdmin.rpc(           │
                    │    'get_whatsapp_token',       │
                    │    { negocio_id })            │
                    └─────────────────────────────┘


              SEC-02 concurrency race (scripts/verify-concurrent-booking.ts)

  1 fetch freshData (negocio A) ──► shared across all N calls (no re-fetch)
                                            │
              ┌─────────────────────────────┼─────────────────────────────┐
              ▼                             ▼                             ▼
      bookAppointment(slot,          bookAppointment(slot,        bookAppointment(slot,
        freshData) call #1             freshData) call #2   ...    freshData) call #N
              │                             │                             │
              └──────────────┬──────────────┴──────────────┬──────────────┘
                              ▼ (all pass in-memory check — same freshData)
                    INSERT INTO turno (...) x N, fired via Promise.all
                              │
                              ▼
              Postgres GiST EXCLUDE (turno_no_overlap) — single winner
                              │
              ┌───────────────┴────────────────┐
              ▼                                 ▼
      1x { ok: true, turnoId }          (N-1)x { ok:false, reason:"slot_taken" }
                                          (23P01 → isSlotTakenConcurrently)


         SEC-03 cross-tenant isolation (negocioScoped.test.ts, extended)

    negocioScoped(NEGOCIO_A_ID).<accessor>()  for EVERY accessor
                              │
                              ▼
              assert 100% of returned rows have negocio_id === NEGOCIO_A_ID
              assert 0% of returned rows have negocio_id === NEGOCIO_B_ID
                              │
                              ▼
    consultarNegocioTool(NEGOCIO_A_ID, clienteId).execute({tipo:'precios'})
                              │
                              ▼
              assert 0 of the returned servicio ids match NEGOCIO_B's
              known seeded servicio ids
```

### Recommended Project Structure

```
supabase/migrations/
└── 0005_whatsapp_token_vault.sql   # extension + wrapper functions + column swap

apps/dashboard/app/actions/
└── admin-tenants.ts                # updated: .rpc('set_whatsapp_token_secret', …)

apps/bot/src/whatsapp/
└── getWhatsappToken.ts             # updated: .rpc('get_whatsapp_token', …)

apps/bot/src/db/
└── negocioScoped.test.ts           # extended: every accessor, not just turnos()

scripts/
└── verify-concurrent-booking.ts    # NEW — SEC-02, gated, live DB
└── verify-vault-no-plaintext.ts    # NEW — SEC-01 (d) verification, gated, live DB
```

### Pattern 1: SECURITY DEFINER wrapper for Vault (never expose `vault` via PostgREST)

**What:** Two `public`-schema functions, `SECURITY DEFINER`, `SET search_path = ''`, with `REVOKE ALL ... FROM PUBLIC` + `GRANT EXECUTE ... TO service_role` — mirroring `auth_negocio_ids()` from migration `0003` exactly.
**When to use:** Any time app code (dashboard or bot) needs to create or read a Vault secret. Never call `vault.create_secret`/`vault.decrypted_secrets` directly from `@supabase/supabase-js` — the `vault` schema is not in PostgREST's exposed-schemas list by default, and Supabase's own guidance is to never add it there.
**Example:**
```sql
-- Source: Supabase Vault docs (supabase.com/docs/guides/database/vault) +
-- this repo's own auth_negocio_ids() hardening pattern (0003_tenant_negocio_split.sql)
CREATE EXTENSION IF NOT EXISTS supabase_vault;

CREATE OR REPLACE FUNCTION public.set_whatsapp_token_secret(
  p_negocio_id uuid,
  p_token text,
  p_name text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_secret_id uuid;
BEGIN
  v_secret_id := vault.create_secret(p_token, p_name, 'WhatsApp Cloud API token');
  UPDATE public.negocio
  SET whatsapp_token_secret_id = v_secret_id
  WHERE id = p_negocio_id;
  RETURN v_secret_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_whatsapp_token_secret(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_whatsapp_token_secret(uuid, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.get_whatsapp_token(p_negocio_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_token text;
BEGIN
  SELECT decrypted_secret INTO v_token
  FROM vault.decrypted_secrets ds
  JOIN public.negocio n ON n.whatsapp_token_secret_id = ds.id
  WHERE n.id = p_negocio_id;
  RETURN v_token;
END;
$$;

REVOKE ALL ON FUNCTION public.get_whatsapp_token(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_whatsapp_token(uuid) TO service_role;
```

Call sites become `.rpc()` calls, not `.from()`:
```typescript
// apps/bot/src/whatsapp/getWhatsappToken.ts (updated body, same signature)
const { data, error } = await supabaseAdmin.rpc("get_whatsapp_token", {
  p_negocio_id: negocioId,
});
if (error || !data) {
  throw new Error(`No whatsapp_token found for negocioId=${negocioId}`);
}
return data;
```

### Pattern 2: Shared stale `freshData` to force a real DB-level race (SEC-02)

**What:** Fetch `AvailabilityData` (the same shape `bookAppointment`'s `deps.freshData` expects) **exactly once**, then invoke `bookAppointment` N times concurrently via `Promise.all`, passing the SAME `freshData` object to every call.
**When to use:** Whenever a test needs to force N concurrent domain-level booking attempts to all pass the in-memory `computeSlots` freshness check and reach the real `INSERT`, so the assertion is actually exercising the Postgres GiST EXCLUDE constraint (not the in-memory anti-cache check, which would otherwise let call #1 "win" in memory before any DB round-trip and cause calls #2..N to be rejected by `computeSlots` itself — a false-positive pass that never touches concurrency at all).
**Example:**
```typescript
// Source: pattern already proven in scripts/verify-reschedule.ts (deliberately
// stale freshData fetched BEFORE creating the colliding turno) and
// scripts/verify-double-booking.ts Step 5 (Promise.allSettled, exactly 1 success)
const freshData = await fetchAvailabilityData(NEGOCIO_ID); // ONE fetch, shared
const N = 10;
const results = await Promise.allSettled(
  Array.from({ length: N }, () =>
    bookAppointment(
      { negocioId: NEGOCIO_ID, profesionalId: PROFESIONAL_ID, clienteId: CLIENTE_ID,
        serviceIds: [SERVICIO_ID], inicio, fin },
      { supabase: supabaseAdmin, freshData }, // SAME object, not re-fetched per call
    ),
  ),
);
const oks = results.filter(
  (r) => r.status === "fulfilled" && r.value.ok === true,
);
const slotTaken = results.filter(
  (r) => r.status === "fulfilled" && r.value.ok === false && r.value.reason === "slot_taken",
);
if (oks.length !== 1 || slotTaken.length !== N - 1) {
  throw new Error(
    `Esperado exactamente 1 éxito y ${N - 1} slot_taken; obtenido ${oks.length} éxitos, ${slotTaken.length} slot_taken de ${N}.`,
  );
}
```

### Pattern 3: Distinguishing "RLS isolation" from "service_role isolation" test targets (SEC-03)

**What:** This repo already has two isolation tests that look similar but prove different things.
**When to use:** Know which one SEC-03 must extend.

| Script | Client | What it proves | Extend for SEC-03? |
|--------|--------|-----------------|---------------------|
| `scripts/verify-isolation.ts` | anon key + owner JWT (RLS-enforced) | Dashboard owners cannot read/write another tenant's rows — RLS (`auth_negocio_ids()`) does the work | **No** — this is CORE-01/02, already complete (Phase 1) |
| `apps/bot/src/db/negocioScoped.test.ts` | service_role (RLS bypassed) | The bot's `negocioScoped()` query layer is the ONLY thing preventing cross-negocio leakage; today only asserts on the `turnos()` accessor | **Yes** — this is the actual SEC-03 target; extend to cover every accessor + at least one bot tool |

### Anti-Patterns to Avoid

- **Exposing the `vault` schema in PostgREST's "Exposed schemas" setting:** would make `vault.secrets`/`vault.decrypted_secrets` directly queryable by any client holding a valid role key, defeating the purpose of routing access through audited wrapper functions. Never add `vault` there — access only via `SECURITY DEFINER` RPC wrappers in `public`.
- **Testing SEC-02 with raw `INSERT`s instead of `bookAppointment`:** `scripts/verify-double-booking.ts` already proves the constraint holds for raw inserts — repeating that would not satisfy SEC-02, whose point is proving the constraint holds when exercised through the actual application code path (`bookAppointment`), including its freshness-check/error-mapping logic.
- **Re-fetching `freshData` per concurrent call in the SEC-02 script:** if each of the N calls independently fetches `freshData` right before its own `bookAppointment` invocation, whichever call's insert lands first will make subsequent (slower-to-fire) fetches see the slot as already taken — turning the test into an assertion about JS microtask/network timing jitter instead of the Postgres constraint. Fetch once, share the object.
- **Confusing `verify-isolation.ts` (RLS/dashboard) with the service_role isolation target for SEC-03** — see Pattern 3 above; extending the wrong file leaves the actual service_role attack surface (BOT-11's stated threat model, T-06-05/08/14/17) unverified.
- **Leaving `WHATSAPP_DEV_TOKEN` set while validating SEC-01 (d)'s "no plaintext" check:** `getWhatsappToken.ts` checks `env.WHATSAPP_DEV_TOKEN` FIRST and short-circuits before ever touching the DB/Vault path — a live verification of "the bot can resolve the token via Vault" must run with that env var unset, or it silently proves nothing about the new code path.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Encrypting the WhatsApp token at rest | Custom AES-GCM/key-management code | `supabase_vault` extension (`vault.create_secret`/`vault.decrypted_secrets`) | LOCKED decision; Vault handles authenticated encryption, key storage/rotation-support and decrypt-on-read via a view that never persists plaintext to disk. Hand-rolled crypto adds a master-key custody problem this project has nowhere safe to put (STACK.md explicitly warns against this). |
| Proving the anti-double-booking constraint holds under concurrency | A hand-written retry/locking layer in app code | The existing Postgres GiST `EXCLUDE USING gist` constraint (`turno_no_overlap`, already live since Phase 1/CORE-05) | The constraint is already the correct mechanism (atomic, DB-enforced, race-condition-proof by construction); SEC-02 only needs to **verify** it, never to add application-level locking on top. |
| Verifying cross-tenant isolation | A new mocking framework / fake Postgres | Live queries against the two already-seeded tenants (`TENANT_A`/`TENANT_B`) | Per D-04/CONTEXT.md: since service_role bypasses RLS, only a live test against real seeded data can prove the app-code filter (`negocioScoped`) actually holds — a mock would test the mock, not the guard. |

**Key insight:** Every one of the three SEC requirements is a **verification** task over an **already-implemented** mechanism (Vault is new wiring, but the constraint/isolation-layer mechanisms already exist from Phases 1, 3, and 6). The temptation to "improve" the underlying mechanisms (e.g., add app-level locking, add a new mocking layer) should be resisted — it is out of scope and risks masking whether the *existing* mechanisms actually hold under real conditions.

## Runtime State Inventory

> Rename/refactor trigger: this phase renames/replaces `negocio.whatsapp_token` (plaintext column) with `negocio.whatsapp_token_secret_id` (Vault reference) and drops the old column.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `negocio.whatsapp_token` is `NULL` for every row in `bdgufnitakelyialjoqg` today (confirmed by `admin-tenants.ts`'s `negocioInsertPayload` — it hardcodes `whatsapp_token: null` and comments "NUNCA se escribe un token real acá"). **No real token data exists to migrate.** | Code edit only — `DROP COLUMN whatsapp_token` is safe with zero data-loss risk; no backfill needed (unlike migration `0003`'s WhatsApp-column backfill, which DID have to preserve real values). |
| Live service config | None — no negocio has a real Meta WABA/token configured yet (onboarding via Embedded Signup is out of v1 scope per PROJECT.md); nothing external references the plaintext column. | None. |
| OS-registered state | None — no cron/scheduler/task references this column. | None. |
| Secrets/env vars | `.env` has no `whatsapp_token`-shaped variable (the token lives in the DB, not env); `WHATSAPP_DEV_TOKEN` (dev-only override) is unaffected by this migration — it short-circuits before the DB read entirely. | None — but see the SEC-01 (d) verification pitfall above: unset `WHATSAPP_DEV_TOKEN` when running that specific live check. |
| Build artifacts / installed packages | `packages/db-types` (generated Supabase types) will be stale after the column swap — `negocio.Row.whatsapp_token` needs to become `negocio.Row.whatsapp_token_secret_id` in the generated types. | Code edit — regenerate `packages/db-types` from the live schema after applying migration `0005` (same step Phase 1/migration `0003` already required and performed). |

**Nothing found in category:** stated explicitly above for "Live service config" and "OS-registered state."

## Common Pitfalls

### Pitfall 1: Calling Vault functions directly from `@supabase/supabase-js` fails silently or with a confusing PostgREST error

**What goes wrong:** `supabaseAdmin.schema('vault').from('decrypted_secrets').select(...)` or `.rpc('vault.create_secret', ...)` returns a PostgREST "relation not found in schema cache" / 404-style error, because `vault` is not in PostgREST's exposed-schemas config.
**Why it happens:** Supabase's API layer (PostgREST) only serves schemas explicitly listed in project settings (default: `public`, plus a couple of Supabase-managed ones); `vault` is intentionally excluded, and Supabase's own docs recommend never adding it.
**How to avoid:** Always go through a `SECURITY DEFINER` wrapper function created in `public` (see Pattern 1), called via `.rpc('function_name', {...})`.
**Warning signs:** Any error mentioning "schema cache", "not found", or 404 when the SQL you're calling looks syntactically correct in the SQL editor but fails from `supabase-js`.

### Pitfall 2: `vault.create_secret` bypasses authorization checks if called from an unprotected context

**What goes wrong:** If the wrapper function granting access to `vault.create_secret` is over-permissioned (e.g. granted to `authenticated` instead of only `service_role`), any logged-in dashboard user (even a non-superadmin owner) could create/overwrite Vault secrets.
**Why it happens:** `SECURITY DEFINER` functions run with the *definer's* privileges regardless of caller — the function itself becomes the only gate, so a loose `GRANT` defeats the whole point.
**How to avoid:** `REVOKE ALL ... FROM PUBLIC` then `GRANT EXECUTE ... TO service_role` only (mirrors `auth_negocio_ids()`'s existing hardening in `0003_tenant_negocio_split.sql`) — never grant to `anon`/`authenticated`.
**Warning signs:** A wrapper function migration that doesn't include an explicit `REVOKE`/`GRANT` pair.

### Pitfall 3: Statement logging can leak the plaintext secret at INSERT time

**What goes wrong:** Postgres statement logging (if enabled) can capture the plaintext argument passed to `vault.create_secret(plaintext, ...)` in server logs, defeating "encrypted at rest."
**Why it happens:** Encryption happens inside the function/extension, but the SQL statement itself (with the plaintext argument) may be logged before/independent of that.
**How to avoid:** Confirm Postgres statement logging is off (or at minimum, that Supabase's log settings don't capture full statement text with parameters) for the project before writing real tokens; note this as an operational check, not something fixable in application code. `[CITED: community sources — verify current default in Supabase project settings before writing a real token]`
**Warning signs:** Any log-viewing/observability tool in the Supabase dashboard showing raw INSERT statement text with bound parameter values.

### Pitfall 4: SEC-02's race is invisible if the test re-validates freshness per call instead of sharing one snapshot

**What goes wrong:** Test looks correct (N concurrent `bookAppointment` calls) but always reports "N successes, 0 failures" or "0 successes" depending on timing, because each call independently re-fetches `freshData`.
**Why it happens:** `bookAppointment`'s in-memory `computeSlots(freshData)` check runs BEFORE the DB insert; if `freshData` is fetched fresh per call, whichever call's DB insert commits first makes the NEXT call's fresh fetch see the slot as taken and reject it in-memory (never reaching the DB, never producing a `23P01`) — the assertion "exactly 1 succeeds, rest are `slot_taken`" can pass for the wrong reason (in-memory rejection, not GiST rejection) if fetches happen to interleave unluckily, or it can be flaky.
**How to avoid:** Fetch `freshData` exactly once, share the same object reference across all N `Promise.all`-driven calls (see Pattern 2). This guarantees ALL N calls pass the in-memory check and the real winner is decided by the DB constraint — which is the actual thing SEC-02 must prove.
**Warning signs:** Test passes when run with `N=2` but the log shows 0 DB round-trips actually competed (or the script doesn't log which reason path — `insert_error` vs `slot_taken` vs never reaching the insert — each call took).

### Pitfall 5: `getWhatsappToken.ts`'s `WHATSAPP_DEV_TOKEN` short-circuit masks a broken Vault read path

**What goes wrong:** SEC-01 (d)'s live verification ("the bot can resolve the token via Vault") passes even though the Vault RPC call is broken, because `WHATSAPP_DEV_TOKEN` is set in `.env` and the function returns before ever calling the DB.
**Why it happens:** `getWhatsappToken.ts` line 22: `if (env.WHATSAPP_DEV_TOKEN) return env.WHATSAPP_DEV_TOKEN;` — this is a documented, intentional dev override, but it means any live-DB verification of the Vault path specifically must run with that variable unset (or the test must call the underlying Vault-resolving function directly, bypassing the dev-token short-circuit).
**How to avoid:** The gated verify script for SEC-01(d) should either `delete process.env.WHATSAPP_DEV_TOKEN` at the top of the script, or test the Vault-resolving logic as an isolated function separate from the dev-token gate.
**Warning signs:** A "passing" SEC-01 verify script that never actually issues an RPC call (check via a log line or a spy/counter) to `get_whatsapp_token`.

### Pitfall 6: Extending the wrong isolation script leaves SEC-03 unproven

**What goes wrong:** Planner/executor extends `scripts/verify-isolation.ts` (per CONTEXT.md's literal wording) and calls SEC-03 done — but that script signs in as an owner via anon-key+JWT, which is RLS-protected and was never the surface at risk. The bot's service_role bypass (the actual SEC-03 concern) remains unverified beyond the single `turnos()` accessor already covered in `negocioScoped.test.ts`.
**Why it happens:** CONTEXT.md's "Extiende el patrón de `scripts/verify-isolation.ts`" language refers to the *style* of gated live-DB isolation testing, not literally that file — the actual service_role-path precedent already lives at `apps/bot/src/db/negocioScoped.test.ts` (see Pattern 3 above and Architecture Patterns' System Diagram).
**How to avoid:** Plan explicitly extends `apps/bot/src/db/negocioScoped.test.ts` (all 11 accessors, not just `turnos()`) plus a new bot-tool-level assertion, and treats `verify-isolation.ts` as prior art for *style* only.
**Warning signs:** A SEC-03 plan whose only file diff touches `scripts/verify-isolation.ts` and never touches anything under `apps/bot/src/`.

## Code Examples

### SEC-01: negocio migration shape (0005_whatsapp_token_vault.sql)

```sql
-- Source: this repo's own migration conventions (0001/0003), Supabase Vault docs
BEGIN;

CREATE EXTENSION IF NOT EXISTS supabase_vault;

ALTER TABLE negocio ADD COLUMN whatsapp_token_secret_id uuid REFERENCES vault.secrets (id);

-- No backfill needed: every negocio.whatsapp_token is NULL today (verified via
-- admin-tenants.ts's negocioInsertPayload, which always writes null — see
-- Runtime State Inventory). Safe to drop directly.
ALTER TABLE negocio DROP COLUMN whatsapp_token;

-- Wrapper functions (Pattern 1) go here — see full example above.

COMMIT;
```

### SEC-03: extending negocioScoped.test.ts to all accessors

```typescript
// Source: pattern already established in this file for turnos(); extend to
// EVERY accessor negocioScoped() exposes (profesionales, servicios,
// clientes, bloqueos, conversaciones, mensajes, horariosTrabajo,
// profesionalServicios, turnoServicios, recordatorios, negocio).
const ACCESSORS = [
  "profesionales", "horariosTrabajo", "servicios", "profesionalServicios",
  "clientes", "turnos", "turnoServicios", "bloqueos", "conversaciones",
  "mensajes", "recordatorios",
] as const;

for (const accessor of ACCESSORS) {
  const { data } = await negocioScoped(NEGOCIO_A_ID)[accessor]().select("*");
  assert(
    (data ?? []).every((row) => (row as { negocio_id: string }).negocio_id === NEGOCIO_A_ID),
    `negocioScoped(A).${accessor}() devolvió una fila que NO pertenece al negocio A.`,
  );
}

// Bot tool-level check (D-04's "at least one bot read tool" requirement):
const tool = consultarNegocioTool(NEGOCIO_A_ID, CLIENTE_A_ID);
const preciosA = await tool.execute({ tipo: "precios" }, { toolCallId: "t1", messages: [] });
const idsFilteredToB = preciosA.servicios.filter((s) => KNOWN_NEGOCIO_B_SERVICIO_IDS.has(s.id));
assert(idsFilteredToB.length === 0, "consultarNegocio devolvió un servicio del negocio B.");
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `pgsodium`-based Transparent Column Encryption (TCE) via dashboard Table Editor | SQL-only column encryption / Vault for secret storage | Documented via Supabase changelog "Column Encryption is SQL-only now" | Confirms Vault (not TCE/pgsodium) is the currently-recommended path for this project's use case — consistent with the LOCKED decision. |
| `pgsodium` as the vault's internal crypto implementation | Vault interface/API stays stable; internal implementation is shifting away from `pgsodium` per Supabase's own migration notice | Ongoing (Supabase-managed; no project action required) | No action needed for this phase — Vault's public interface (`vault.create_secret`/`vault.decrypted_secrets`) is explicitly unaffected by this internal transition. |

**Deprecated/outdated:**
- `pgsodium`/TCE for new secret-encryption work: Supabase does not recommend any new usage; use Vault instead (already the LOCKED decision here).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `vault.create_secret`'s exact parameter order is `(secret text, name text DEFAULT NULL, description text DEFAULT NULL)` returning a `uuid` | Architecture Patterns / Code Examples | If the real signature differs slightly (e.g. named-vs-positional defaults), the wrapper function's call site needs a one-line adjustment — low risk, caught immediately at migration-apply time (function won't compile / apply will error). |
| A2 | The `vault` schema is not in `bdgufnitakelyialjoqg`'s PostgREST "Exposed schemas" list (the Supabase-wide default) | Common Pitfalls #1, Architecture Patterns Pattern 1 | If this specific project happens to have `vault` exposed (non-default, unlikely), the wrapper-function requirement is still harmless (best practice either way) but technically optional — low risk either way. |
| A3 | Postgres statement logging is off/limited by default on this Supabase project tier, so `vault.create_secret`'s plaintext argument isn't captured in logs | Common Pitfalls #3 | If statement logging IS capturing full parameter values, the plaintext token could leak into Supabase's log viewer even after Vault encryption — this should be explicitly checked in the project's dashboard Settings > Database > Logs before writing the first real token (post-v1, when real WABA tokens arrive) but does not block this phase's greenfield migration since no real tokens exist yet. |
| A4 | No negocio in `bdgufnitakelyialjoqg` currently has a non-null `whatsapp_token` | Runtime State Inventory | Directly grounded in reading `admin-tenants.ts` (hardcodes `null`) and CONTEXT.md D-02's own stated rationale ("hoy no hay tokens reales") — LOW risk, but planner should still run a one-line `SELECT count(*) FROM negocio WHERE whatsapp_token IS NOT NULL` as a pre-migration sanity check before dropping the column, since this is a destructive `DROP COLUMN`. |

## Open Questions

1. **Exact `vault.create_secret` return type / whether it can raise on duplicate `name`**
   - What we know: `name` is documented as intended to be unique (used for later lookup by name); `id` (uuid) is the return value used for direct FK reference.
   - What's unclear: whether passing a duplicate `name` raises a constraint violation or silently succeeds with a warning — not confirmed via the sources available in this research pass.
   - Recommendation: Since this design's `whatsapp_token_secret_id` FK references the secret by `id` (not `name`), a safe choice is to always pass a unique `name` (e.g. `whatsapp-token-{negocio_id}`) or omit `name` entirely (it's optional) — sidesteps the ambiguity. Verify behavior empirically against `bdgufnitakelyialjoqg` (harmless, non-production data) during Wave 0/plan execution if the plan wants a human-readable name.

2. **Whether `service_role` has an implicit `USAGE` grant on the `vault` schema that would let the wrapper functions work without an explicit `GRANT USAGE ON SCHEMA vault TO service_role`**
   - What we know: `SECURITY DEFINER` functions execute with the definer's (migration-applying, typically `postgres`/`supabase_admin`) privileges for schema access, so the wrapper function itself doesn't need `service_role` to have `vault` schema access — only `EXECUTE` on the wrapper function needs to be granted to `service_role`.
   - What's unclear: whether any additional `GRANT USAGE ON SCHEMA vault` is needed for the migration to apply cleanly, depending on how `supabase_vault` sets up its default schema permissions.
   - Recommendation: If migration application errors with a permissions issue, add `GRANT USAGE ON SCHEMA vault TO postgres;` (or whichever role applies the migration) as a one-line fix — low risk, immediately surfaced by a failed `CREATE EXTENSION`/function-apply step.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `supabase_vault` Postgres extension | SEC-01 | Not directly verified this session (requires a live SQL check against `bdgufnitakelyialjoqg`, e.g. `SELECT * FROM pg_extension WHERE extname='supabase_vault';` via the Management API/PAT, per CLAUDE.md's isolation rules) — documented as "enabled by default on hosted Supabase projects" per community sources | — | `CREATE EXTENSION IF NOT EXISTS supabase_vault;` is idempotent and safe to include in the migration regardless — if already enabled, it's a no-op. |
| `.env` `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | SEC-02, SEC-03 gated scripts | Confirmed present (file exists; used by every prior gated `verify-*.ts` in this repo, all of which already ran successfully against `bdgufnitakelyialjoqg` per STATE.md) | — | none needed |
| Two seeded tenants (`TENANT_A`/`TENANT_B`) | SEC-03 | Confirmed present in `scripts/seed-fixtures.ts`, actively used by `negocioScoped.test.ts` and `verify-isolation.ts` | — | none needed |

**Missing dependencies with no fallback:** none identified — the one unverified item (`supabase_vault` extension enabled) has a safe idempotent fallback (re-run `CREATE EXTENSION IF NOT EXISTS`).

**Missing dependencies with fallback:** `supabase_vault` extension enablement (see above).

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.9 (unit-level, mocked) + gated `tsx`-run `verify-*.ts` scripts (live-DB, D-05) |
| Config file | `apps/bot/vitest.config.ts`, `apps/dashboard/vitest.config.ts`, `packages/availability-engine/vitest.config.ts` (existing — no new config needed) |
| Quick run command | `pnpm --filter @turnosbot/bot test` / `pnpm --filter @turnosbot/dashboard test` (mocked unit coverage of the new RPC call sites) |
| Full suite command | `pnpm -r test` (all vitest suites) — the three gated live scripts are run manually per D-05, NOT part of this command |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SEC-01 | `admin-tenants.ts` calls `.rpc('set_whatsapp_token_secret', …)` on token set | unit (mocked `.rpc`) | `pnpm --filter @turnosbot/dashboard test -- admin-tenants` | ❌ Wave 0 (extend existing `admin-tenants` test file if present, else new) |
| SEC-01 | `getWhatsappToken.ts` calls `.rpc('get_whatsapp_token', …)` when `WHATSAPP_DEV_TOKEN` unset | unit (mocked `.rpc`) | `pnpm --filter @turnosbot/bot test -- getWhatsappToken` | ❌ Wave 0 — no `getWhatsappToken.test.ts` exists yet |
| SEC-01 (d) | Direct `SELECT * FROM negocio` never returns a plaintext token; bot resolves real value via Vault live | manual-only (gated, live DB) | `pnpm exec tsx scripts/verify-vault-no-plaintext.ts` | ❌ Wave 0 — new gated script |
| SEC-02 | Exactly 1 of N concurrent `bookAppointment` calls at the same slot succeeds, rest are `slot_taken` | manual-only (gated, live DB) | `pnpm exec tsx scripts/verify-concurrent-booking.ts` | ❌ Wave 0 — new gated script |
| SEC-03 | `negocioScoped(A).<every accessor>()` never returns negocio-B rows | manual-only (gated, live DB, extends existing) | `pnpm exec tsx apps/bot/src/db/negocioScoped.test.ts` | ✅ exists (extend coverage) |
| SEC-03 | A bot read tool called with negocio A's context never surfaces negocio B ids/data | manual-only (gated, live DB) | same script as above, extended | ❌ Wave 0 — new assertion block in existing file |

### Sampling Rate

- **Per task commit:** `pnpm --filter @turnosbot/bot test` / `pnpm --filter @turnosbot/dashboard test` (fast, mocked — covers the RPC call-site wiring, not live Vault/DB behavior)
- **Per wave merge:** `pnpm -r test` (full mocked suite)
- **Phase gate:** All three gated live scripts (`verify-vault-no-plaintext.ts`, `verify-concurrent-booking.ts`, extended `negocioScoped.test.ts`) run manually, once, against `bdgufnitakelyialjoqg` before the phase is marked complete — matches the ROADMAP's three literal Success Criteria, which are all live-DB assertions, not unit-test assertions.

### Wave 0 Gaps

- [ ] `scripts/verify-vault-no-plaintext.ts` — new gated script covering SEC-01 Success Criterion #1
- [ ] `scripts/verify-concurrent-booking.ts` — new gated script covering SEC-02 Success Criterion #2
- [ ] `apps/bot/src/db/negocioScoped.test.ts` extension (all accessors + tool-level check) — covers SEC-03 Success Criterion #3
- [ ] `getWhatsappToken.test.ts` (new, mocked unit test) — covers the RPC-based read path's error/happy branches without hitting live Vault
- [ ] Possibly extend an existing `admin-tenants` unit test file (if one exists — not confirmed in this research pass; verify at plan time) with a mocked assertion that `createTenantWithNegocio`/`updateNegocio`'s WhatsApp-token-setting path calls `.rpc('set_whatsapp_token_secret', …)` rather than a plain `.insert()`/`.update()` on `whatsapp_token`

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | No | Not touched this phase (AUTH already complete, Phase 2) |
| V3 Session Management | No | Not touched this phase |
| V4 Access Control | Yes | `negocioScoped()` mandatory-filter pattern (already established, CORE-03) — SEC-03 verifies this holds; RPC wrapper `GRANT EXECUTE ... TO service_role` only (SEC-01) is itself a V4 control |
| V5 Input Validation | Yes (indirectly) | `bookAppointmentInputSchema`/`uuidLike` (already established, `booking.ts`) — SEC-02's concurrency script must pass validated input, same as production call sites |
| V6 Cryptography | Yes | Supabase Vault (`supabase_vault` extension) — authenticated encryption, key management handled entirely by the extension; app code never implements crypto primitives directly (SEC-01's core concern) |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| Plaintext secret exposure via DB dump/backup/replica or direct `SELECT` | Information Disclosure | Supabase Vault: secret stored authenticated-encrypted in `vault.secrets`; `negocio` table only ever holds a `secret_id` uuid reference (SEC-01) |
| Plaintext secret exposure via overly-permissive PostgREST schema exposure | Information Disclosure / Elevation of Privilege | Never add `vault` to "Exposed schemas"; access only via `SECURITY DEFINER` wrapper functions granted to `service_role` alone (Pitfall 1/2) |
| Double-booking / lost-update race under concurrent WhatsApp+dashboard booking attempts | Tampering (data integrity) | Postgres GiST `EXCLUDE USING gist` constraint (already CORE-05); SEC-02 verifies the guarantee holds under real concurrency through the actual domain function |
| Cross-tenant data leakage via the bot's RLS-bypassing service_role client | Information Disclosure | `negocioScoped()` mandatory-filter query layer (already CORE-03); SEC-03 extends live verification coverage to every accessor + at least one bot tool |

## Sources

### Primary (HIGH confidence)
- `supabase.com/docs/guides/database/vault` — `vault.create_secret`/`vault.update_secret` example calls, `vault.secrets`/`vault.decrypted_secrets` column shapes. Fetched via WebFetch.
- `supabase.com/docs/guides/database/extensions/pgsodium` / `supabase.com/changelog/18849-column-encryption-is-sql-only-now` — pgsodium deprecation trajectory, Vault interface stability guarantee, TCE removal from dashboard UI.
- This repo: `supabase/migrations/0001_schema_core.sql`, `0003_tenant_negocio_split.sql` — `auth_negocio_ids()` SECURITY DEFINER hardening pattern (directly reused for the Vault wrapper functions), current `negocio`/`tenant` column shapes, confirmation `whatsapp_token` is currently plaintext-nullable.
- This repo: `apps/bot/src/whatsapp/getWhatsappToken.ts`, `apps/dashboard/app/actions/admin-tenants.ts`, `packages/availability-engine/src/booking.ts`, `apps/bot/src/db/negocioScoped.ts`/`client.ts`, `scripts/verify-isolation.ts`, `verify-reschedule.ts`, `verify-double-booking.ts`, `apps/bot/src/db/negocioScoped.test.ts`, `scripts/seed-fixtures.ts` — all read directly this session, ground every code example and pitfall above.

### Secondary (MEDIUM confidence)
- WebSearch (multiple queries, cross-referenced across `github.com/supabase/vault`, `github.com/orgs/supabase/discussions/35217`, `github.com/orgs/supabase/discussions/9022`) — vault schema not exposed via PostgREST by default; recommended `SECURITY DEFINER` wrapper pattern; enabling the extension via SQL (`CREATE SCHEMA vault; CREATE EXTENSION supabase_vault WITH SCHEMA vault;`) or dashboard Extensions tab; statement-logging caveat when inserting secrets.
- WebSearch — Postgres `23P01` exclusion_violation semantics, general Node.js concurrent-request/connection-pool caveats (informed Pitfall 4, though this project uses PostgREST/HTTP via `supabase-js`, not raw `pg` pooled connections, for the booking path — so classic pool-exhaustion concerns are lower-risk here than for a raw-`pg`-based service).

### Tertiary (LOW confidence)
- None used as load-bearing claims — all `[ASSUMED]`-tagged items are captured explicitly in the Assumptions Log above with stated risk.

## Metadata

**Confidence breakdown:**
- Standard stack (Vault mechanism, no new packages): HIGH — mechanism confirmed via official docs + repo's own existing hardening precedent (`auth_negocio_ids()`); zero new dependencies to verify.
- Architecture (RPC-wrapper requirement, migration shape): MEDIUM-HIGH — the "vault not exposed via PostgREST" finding is corroborated across multiple independent community sources and is consistent with Supabase's documented security guidance, but no single canonical doc page states it as plainly as this research synthesizes it; flagged in Open Questions/Assumptions for a cheap empirical check during Wave 0.
- Pitfalls (SEC-02 shared-freshData race design, SEC-03 file-target clarification): HIGH — both derived directly from reading this repo's own existing code (`verify-reschedule.ts`'s proven stale-fetch technique; `negocioScoped.test.ts`'s actual scope vs `verify-isolation.ts`'s actual scope), not external sources.

**Research date:** 2026-07-09
**Valid until:** 30 days (stable domain — Postgres/Vault/GiST mechanics change slowly; re-verify the PostgREST schema-exposure behavior empirically at plan/execution time regardless, since it is the one MEDIUM-confidence architectural claim this research rests on)
