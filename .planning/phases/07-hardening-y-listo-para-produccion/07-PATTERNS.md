# Phase 7: Hardening y listo para producción - Pattern Map

**Mapped:** 2026-07-09
**Files analyzed:** 8
**Analogs found:** 8 / 8

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|---------------|
| `supabase/migrations/0005_whatsapp_token_vault.sql` | migration | CRUD (DDL + SECURITY DEFINER RPCs) | `supabase/migrations/0003_tenant_negocio_split.sql` | exact (same SECURITY DEFINER hardening pattern) |
| `apps/bot/src/whatsapp/getWhatsappToken.ts` (modify) | service (token resolver) | request-response | itself (in-place edit) — RPC-call shape from `graphClient.test.ts`'s mocked deps | role-match |
| `apps/bot/src/whatsapp/getWhatsappToken.test.ts` (new) | test (unit, mocked) | request-response | `apps/bot/src/whatsapp/graphClient.test.ts` | exact (mocks the exact same module boundary) |
| `apps/dashboard/app/actions/admin-tenants.ts` (modify) | controller (Server Action) | CRUD | itself (in-place edit) — same file's `createTenantWithNegocio`/`updateNegocio` CRUD idiom | exact |
| `scripts/verify-vault-no-plaintext.ts` (new) | utility (gated live-DB script) | request-response / batch | `scripts/verify-reschedule.ts` (skeleton) + `apps/bot/src/db/negocioScoped.test.ts` (isolation guard style) | exact |
| `scripts/verify-concurrent-booking.ts` (new) | utility (gated live-DB script) | event-driven / concurrency | `scripts/verify-reschedule.ts` (shared stale `freshData` technique) | exact |
| `apps/bot/src/db/negocioScoped.test.ts` (modify/extend) | test (functional smoke, live DB) | CRUD / batch | itself (extend existing `turnos()` block to all accessors) + `consultarNegocio.ts` (tool-level check target) | exact |
| `apps/dashboard/app/actions/admin-tenants.test.ts` (new — no prior test exists) | test (unit, mocked Server Action) | request-response | `apps/dashboard/lib/schemas/admin.test.ts` (closest existing dashboard unit-test style) — no direct Server-Action-mocking analog exists yet in this repo | no analog (see "No Analog Found") |

## Pattern Assignments

### `supabase/migrations/0005_whatsapp_token_vault.sql` (migration)

**Analog:** `supabase/migrations/0003_tenant_negocio_split.sql` (lines 20-26, 350-361)

**Header/threat-model comment convention** (lines 20-26):
```sql
--
--- Threat model (T-02-01..T-02-03): T-02-01 mitigado por el hardening
--- idéntico a auth_tenant_id() en el nuevo helper auth_negocio_ids()
-- (SECURITY DEFINER, STABLE, search_path vacío, REVOKE ALL + GRANT solo a
--- authenticated — previene search_path hijacking). T-02-02 mitigado
--- ejecutando todo backfill de negocio_id ANTES de SET NOT NULL y antes de
--- recrear las policies, dentro de una única transacción con service_role
```
Every migration in this repo opens with a comment block naming the threats mitigated and the transaction-scoping rationale — replicate this for `0005`, naming SEC-01's threat (plaintext token exposure via dump/backup/service_role SELECT).

**SECURITY DEFINER function shape** (lines 350-361, `auth_negocio_ids()`):
```sql
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT id FROM public.negocio WHERE tenant_id = public.auth_tenant_id();
$$;

REVOKE ALL ON FUNCTION auth_negocio_ids() FROM public;
GRANT EXECUTE ON FUNCTION auth_negocio_ids() TO authenticated;
```
For the two new wrapper functions (`set_whatsapp_token_secret`, `get_whatsapp_token`): same `SECURITY DEFINER` + `SET search_path = ''` + explicit `REVOKE ALL ... FROM PUBLIC` + `GRANT EXECUTE ... TO service_role` (NOT `authenticated` — these are service_role-only per Pitfall 2 in 07-RESEARCH.md). Use `LANGUAGE plpgsql` (not `sql`) since they need a `DECLARE`/`BEGIN` block, per 07-RESEARCH.md's Pattern 1 exact code (already fully drafted there — copy verbatim, adjusting only naming if needed).

**DDL swap (no backfill needed — column always null today):**
```sql
CREATE EXTENSION IF NOT EXISTS supabase_vault;
ALTER TABLE negocio ADD COLUMN whatsapp_token_secret_id uuid REFERENCES vault.secrets (id);
ALTER TABLE negocio DROP COLUMN whatsapp_token;
```
Wrap the whole migration in `BEGIN; ... COMMIT;` — matches `0001`/`0003`'s transaction-scoping convention.

---

### `apps/bot/src/whatsapp/getWhatsappToken.ts` (modify)

**Current shape to replace** (full file, 34 lines, already read):
```typescript
export async function getWhatsappToken(negocioId: string): Promise<string> {
  const env = loadEnv();
  if (env.WHATSAPP_DEV_TOKEN) return env.WHATSAPP_DEV_TOKEN;

  const { data, error } = await supabaseAdmin
    .from("negocio")
    .select("whatsapp_token")
    .eq("id", negocioId)
    .single();

  if (error || !data?.whatsapp_token) {
    throw new Error(`No whatsapp_token found for negocioId=${negocioId}`);
  }
  return data.whatsapp_token;
}
```

**New body** (only the `.from(...)` call changes to `.rpc(...)`; signature/dev-token short-circuit/error message unchanged — per 07-RESEARCH.md Code Examples, already drafted):
```typescript
const { data, error } = await supabaseAdmin.rpc("get_whatsapp_token", {
  p_negocio_id: negocioId,
});
if (error || !data) {
  throw new Error(`No whatsapp_token found for negocioId=${negocioId}`);
}
return data;
```
Keep the file's existing header-comment convention (JSDoc-style block explaining the D-04/SEC-01 choke point) — update it to say the Vault RPC is now live instead of "Phase 7 replaces the body."

---

### `apps/bot/src/whatsapp/getWhatsappToken.test.ts` (new)

**Analog:** `apps/bot/src/whatsapp/graphClient.test.ts` (full file pattern, lines 1-25)

**Mocking convention to copy** — this repo mocks `../db/client.ts`'s `supabaseAdmin` (not the whole Supabase SDK) because that module throws at import time without real env vars:
```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/client.js", () => ({
  supabaseAdmin: { rpc: vi.fn() },
}));

const { getWhatsappToken } = await import("./getWhatsappToken.js");
```
Then per-test: `vi.mocked(supabaseAdmin.rpc).mockResolvedValue({ data: "token-value", error: null })` for the happy path, and `{ data: null, error: { message: "..." } }` for the throw path. Also cover the `WHATSAPP_DEV_TOKEN` short-circuit branch (env var set → `.rpc` never called — mirrors `graphClient.test.ts`'s `WHATSAPP_LIVE=false` "never calls fetch" assertion at line 42-51) and restore `process.env` in `afterEach` exactly like `graphClient.test.ts` lines 35-40.

---

### `apps/dashboard/app/actions/admin-tenants.ts` (modify)

**Current insert shape to replace** (`negocioInsertPayload`, lines 50-65 — already read):
```typescript
function negocioInsertPayload(tenantId: string, input: NegocioAdminInput) {
  return {
    tenant_id: tenantId,
    nombre: input.nombre,
    ...
    // NUNCA se escribe un token real acá — la carga/encriptación del token
    // de acceso queda diferida a Fase 7 / SEC-01 (D-04).
    whatsapp_token: null,
  };
}
```
This function stops referencing `whatsapp_token` entirely (column dropped). If/when the panel gains a "set WhatsApp token" action, it must call:
```typescript
const { data: secretId, error } = await admin.rpc("set_whatsapp_token_secret", {
  p_negocio_id: negocioId,
  p_token: token,
  p_name: `whatsapp-token-${negocioId}`,
});
```
following the exact `AdminActionResult<T>` success/error shape already used by every other action in this file (see `createNegocio`/`updateNegocio`, lines 226-248 and 250-284): `parsed = schema.safeParse(input)` → early-return `{ error: "..." }` on validation failure → `admin.rpc(...)` → `if (error) return { error: GENERIC_ERROR }` → `revalidatePath(...)` → `return { data: ... }`.

---

### `scripts/verify-vault-no-plaintext.ts` (new)

**Analog:** `scripts/verify-reschedule.ts` (env/guard skeleton, lines 39-63) + `apps/bot/src/db/negocioScoped.test.ts` (isolation guard style, lines 40-56)

**Env loading + isolation guard skeleton** (copy verbatim, adjust script name in error messages):
```typescript
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@turnosbot/db-types";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("FALTAN SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en .env — abortando.");
  process.exit(1);
}
if (!SUPABASE_URL.includes("bdgufnitakelyialjoqg")) {
  console.error(`SUPABASE_URL no apunta al proyecto TurnosBot. Abortando.`);
  process.exit(1);
}

const supabaseAdmin = createClient<Database>(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
```

**Exit 0/1 reporting shape** (mirrors `verify-reschedule.ts` lines 149-293 and `negocioScoped.test.ts`'s `assert()` helper, lines 33-38):
```typescript
function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

async function main() {
  // 1. SELECT * FROM negocio (or select('whatsapp_token_secret_id') plus
  //    confirm the column 'whatsapp_token' no longer exists / is never
  //    returned) — assert no plaintext token surfaces.
  // 2. delete process.env.WHATSAPP_DEV_TOKEN (Pitfall 5, 07-RESEARCH.md) so
  //    the dev-token short-circuit in getWhatsappToken.ts doesn't mask a
  //    broken Vault read path.
  // 3. Call getWhatsappToken(negocioId) for a seeded negocio that HAS a
  //    secret set via set_whatsapp_token_secret, confirm it resolves the
  //    real decrypted value via the RPC path.
  console.log("\nverify-vault-no-plaintext.ts: PASSED");
}

main().catch((err) => {
  console.error("ERROR inesperado en verify-vault-no-plaintext.ts:", err);
  process.exit(1);
});
```
Use `TENANT_A`/`TENANT_B` fixtures from `scripts/seed-fixtures.ts` (`TENANT_A.negocioId = "21111111-1111-1111-1111-111111111111"`) as the negocio under test, same as `verify-reschedule.ts` line 44/66.

---

### `scripts/verify-concurrent-booking.ts` (new)

**Analog:** `scripts/verify-reschedule.ts` (shared stale `freshData` technique, lines 191-219 and 206-219)

**Exact technique to copy — fetch `freshData` ONCE, share across all concurrent calls:**
```typescript
const [{ data: horarios }, { data: bloqueos }, { data: turnos }, { data: servicios }] = await Promise.all([
  supabaseAdmin.from("horario_trabajo").select("*").eq("negocio_id", NEGOCIO_ID),
  supabaseAdmin.from("bloqueo").select("*").eq("negocio_id", NEGOCIO_ID),
  supabaseAdmin.from("turno").select("*").eq("negocio_id", NEGOCIO_ID),
  supabaseAdmin.from("servicio").select("*").eq("negocio_id", NEGOCIO_ID),
]);

const freshData: AvailabilityData = {
  horarios: horarios ?? [], bloqueos: bloqueos ?? [], turnos: turnos ?? [],
  servicios: servicios ?? [], negocio: negocioRow,
};
```
Then per 07-RESEARCH.md's already-drafted Pattern 2 (Code Examples section, reproduced verbatim there): `Promise.allSettled` over N `bookAppointment(input, { supabase: supabaseAdmin, freshData })` calls with the SAME `freshData` object reference, asserting `oks.length === 1` and `slotTaken.length === N - 1` (exactly, not "at least"). Reuse `verify-reschedule.ts`'s `arWallClockToUtcIso`/`findTargetMonday`/`dateStrFromUtcNoon` date-math helpers (lines 76-107) and its `cleanup()`/test-servicio-seeding idiom (lines 113-183) verbatim — same test-servicio/horario seeding + teardown pattern applies.

**Error-mapping already proven** in `packages/availability-engine/src/booking.ts` (lines 173-184, 296-299) — `isSlotTakenConcurrently(error)` checks `error?.code === "23P01"`; `bookAppointment`'s insert-error branch returns `{ok:false, reason:"slot_taken"}` on that path. The script asserts against `result.reason === "slot_taken"`, same shape `verify-reschedule.ts` already asserts (line 243).

---

### `apps/bot/src/db/negocioScoped.test.ts` (modify/extend)

**Analog:** itself (extend existing pattern) — accessor list from `apps/bot/src/db/negocioScoped.ts` (lines 64-111)

**All 11 read accessors to enumerate** (from `negocioScoped.ts`): `negocio, profesionales, horariosTrabajo, servicios, profesionalServicios, clientes, turnos, turnoServicios, bloqueos, conversaciones, mensajes, recordatorios`. Note `negocio()` filters by `.eq("id", negocioId)` (own PK, not `negocio_id`) — needs a special-cased assertion (`row.id === negocioId`, not `row.negocio_id === negocioId`).

**Existing per-accessor block to replicate for every accessor** (currently only `turnos`, lines 57-83):
```typescript
const { data: turnosA, error: errA } = await negocioScoped(NEGOCIO_A_ID).turnos().select("*");
assert(!errA, `negocioScoped(A).turnos() no debería fallar: ${errA?.message}`);
assert(
  (turnosA ?? []).every((t) => (t as { negocio_id: string }).negocio_id === NEGOCIO_A_ID),
  "negocioScoped(A).turnos() devolvió una fila que NO pertenece al negocio A.",
);
assert(
  (turnosA ?? []).every((t) => (t as { negocio_id: string }).negocio_id !== NEGOCIO_B_ID),
  "negocioScoped(A).turnos() devolvió filas del negocio B -- FUGA CROSS-NEGOCIO.",
);
```
Loop this over the `ACCESSORS` array shape 07-RESEARCH.md's Code Examples section already drafts (reproduced there verbatim) — one shared loop rather than 11 hand-copied blocks is acceptable and cleaner, but must preserve the same assert-message convention (`"negocioScoped(A).${accessor}() devolvió una fila que NO pertenece al negocio A."`).

**Bot tool-level check (new) — analog:** `apps/bot/src/conversation/tools/consultarNegocio.ts` (full file, lines 117-195) for the tool's call shape:
```typescript
const tool = consultarNegocioTool(NEGOCIO_A_ID, CLIENTE_A_ID);
const preciosA = await tool.execute(
  { tipo: "precios" },
  { toolCallId: "t1", messages: [] },
);
```
`consultarNegocioTool(negocioId, clienteId, deps?)` closes over both ids (never model-controlled, per that file's own header comment) and reads exclusively via `negocioScoped(negocioId)` — this IS the correct live surface for SEC-03's "at least one bot read tool" requirement (D-04/07-CONTEXT.md). Use `TENANT_A`/`TENANT_B` seeded servicio ids (`scripts/seed-fixtures.ts`) to build a `KNOWN_NEGOCIO_B_SERVICIO_IDS` set and assert zero overlap with `preciosA.servicios.map(s => s.id)`.

**Isolation guard** (already present in this file, lines 48-55) — do not duplicate, it's already correct; keep as-is when extending.

## Shared Patterns

### SECURITY DEFINER / RPC hardening (SEC-01)
**Source:** `supabase/migrations/0003_tenant_negocio_split.sql` lines 350-361 (`auth_negocio_ids()`)
**Apply to:** `0005_whatsapp_token_vault.sql`'s two new wrapper functions
```sql
SECURITY DEFINER
SET search_path = ''
...
REVOKE ALL ON FUNCTION <fn> FROM PUBLIC;
GRANT EXECUTE ON FUNCTION <fn> TO service_role;  -- NOT authenticated (Pitfall 2)
```

### Gated live-DB verify script skeleton (SEC-02, SEC-03, SEC-01(d))
**Source:** `scripts/verify-reschedule.ts` lines 39-63 (env+guard) and 149-293 (main/cleanup/exit shape); `apps/bot/src/db/negocioScoped.test.ts` lines 40-56 (guard variant)
**Apply to:** `scripts/verify-vault-no-plaintext.ts`, `scripts/verify-concurrent-booking.ts`
```typescript
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) { console.error("FALTAN ..."); process.exit(1); }
if (!SUPABASE_URL.includes("bdgufnitakelyialjoqg")) { console.error("SUPABASE_URL no apunta..."); process.exit(1); }
```
Every gated script in this repo repeats this guard verbatim — never refactor into a shared import (established convention: each script is self-contained/copy-pasted, per all 6+ existing `verify-*.ts` files).

### Shared stale `freshData` to force a real DB-level race
**Source:** `scripts/verify-reschedule.ts` lines 191-219
**Apply to:** `scripts/verify-concurrent-booking.ts` — fetch `AvailabilityData` exactly once, pass the same object reference into every concurrent `bookAppointment`/`rescheduleAppointment` call; never re-fetch per call (Pitfall 4, 07-RESEARCH.md).

### Mocked-module test boundary (unit tests around Supabase calls)
**Source:** `apps/bot/src/whatsapp/graphClient.test.ts` lines 1-25
**Apply to:** `apps/bot/src/whatsapp/getWhatsappToken.test.ts`
```typescript
vi.mock("../db/client.js", () => ({ supabaseAdmin: { rpc: vi.fn(), from: vi.fn() } }));
const { getWhatsappToken } = await import("./getWhatsappToken.js");
```
Mock the local `db/client.js` module boundary (not the whole `@supabase/supabase-js` package) — this repo's established convention because `client.ts` throws at import time without real env vars.

### `AdminActionResult<T>` Server Action shape
**Source:** `apps/dashboard/app/actions/admin-tenants.ts` lines 46-48, 226-248
**Apply to:** any new/modified action in `admin-tenants.ts` touching the Vault RPC
```typescript
export type AdminActionResult<T = undefined> =
  | { data: T; error?: undefined }
  | { data?: undefined; error: string };
```
`parsed = schema.safeParse(input)` → early-return on failure → `admin.rpc(...)`/`.from(...)` → `if (error) return { error: GENERIC_ERROR }` → `revalidatePath(...)` → `return { data: ... }`.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `apps/dashboard/app/actions/admin-tenants.test.ts` (if planner chooses to create one) | test (mocked Server Action) | request-response | No existing test in `apps/dashboard` mocks a Server Action's `createAdminClient()`/`.rpc()` call — the closest analogs (`lib/schemas/admin.test.ts`, `lib/reorder.test.ts`) test pure schema/utility functions, not Server Actions with a mocked Supabase admin client. If the plan requires this test, it should follow `apps/bot/src/whatsapp/getWhatsappToken.test.ts`'s `vi.mock` module-boundary convention (mock `@/lib/supabase/admin`'s `createAdminClient` instead of `../db/client.js`) rather than any existing dashboard test file. Research (07-RESEARCH.md, Wave 0 Gaps) flags this as unconfirmed/optional — verify at plan time whether SEC-01 truly requires it or whether the existing `admin.test.ts` schema coverage plus the mocked `getWhatsappToken.test.ts` is sufficient. |

## Metadata

**Analog search scope:** `supabase/migrations/`, `apps/bot/src/whatsapp/`, `apps/bot/src/db/`, `apps/bot/src/conversation/tools/`, `apps/dashboard/app/actions/`, `apps/dashboard/lib/`, `scripts/`, `packages/availability-engine/src/`
**Files scanned:** 15 (read in full or targeted ranges)
**Pattern extraction date:** 2026-07-09
