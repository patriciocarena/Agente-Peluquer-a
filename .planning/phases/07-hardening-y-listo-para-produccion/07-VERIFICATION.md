---
phase: 07-hardening-y-listo-para-produccion
verified: 2026-07-10T01:48:29Z
status: passed
score: 3/3 must-haves verified
behavior_unverified: 0
overrides_applied: 0
warnings:
  - id: W-01
    severity: warning
    status: RESOLVED_2026-07-09
    summary: "apps/bot/src/db/negocioScoped.test.ts (SEC-03 isolation proof) has a `.test.ts` name but is a standalone script (top-level main() + process.exit), explicitly EXCLUDED in apps/bot/vitest.config.ts. It does NOT run under `pnpm test` — a green suite proves nothing about cross-negocio isolation. Isolation is only re-proven when a human runs the script manually. Regression risk: an isolation bug could ship undetected by CI. Recommend renaming to negocioScoped.verify.ts (or moving to scripts/)."
    resolution: "Renombrado a apps/bot/src/db/negocioScoped.verify.ts. El sufijo .verify.ts no matchea el include `src/**/*.test.ts`, así que la entrada en `exclude` de vitest.config.ts se eliminó (ya no hace falta ocultarlo: no se parece a un test). Re-verificado: vitest sigue en 223/223 sobre 24 archivos, el script corre en vivo con exit 0, y `tsc --noEmit` da 0 errores. El nombre ya no miente."
    blocks_goal: false
  - id: W-02
    severity: info
    summary: "Orphan secrets accumulate in vault.secrets: each run of verify-vault-no-plaintext.ts creates a `whatsapp-token-verify-<ts>` row and its cleanup only nulls the FK, never deletes the secret. A UAT probe also left `uat-probe-nonexistent`. The vault schema is not exposed over REST, so cleanup must be done manually in the Supabase SQL Editor. Non-blocking hygiene."
    blocks_goal: false
  - id: W-03
    severity: info
    summary: "No end-to-end conversational re-test against real Gemini was performed this phase; apps/bot unit tests mock generateText. Outside Phase 07's three success criteria, but noted for milestone-level awareness before first real tenant."
    blocks_goal: false
---

# Phase 7: Hardening y listo para producción — Verification Report

**Phase Goal:** El sistema está blindado en los puntos de mayor riesgo (concurrencia, aislamiento cross-tenant, credenciales) antes de que el primer tenant real entre en producción.
**Verified:** 2026-07-10T01:48:29Z
**Status:** passed
**Re-verification:** No — initial verification

## Method Note

The three Success Criteria are live-DB assertions (D-05). This verification independently confirmed at the **code level** that every artifact exists, is substantive, and is wired to the sanctioned path (not a stub). The **live exit-0 runtime results** were executed by the phase against Supabase `bdgufnitakelyialjoqg` on 2026-07-09 (ref confirmed before running) and are cited here — DDL and `.env`/`vault.secrets` access are outside the verifier's reach, so live results are cited, not re-run. Where the runtime evidence is the load-bearing proof, it is attributed to that run.

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria — the contract)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| SEC-01 | Los tokens de acceso de WhatsApp están encriptados en la base (no legibles en un SELECT directo) | ✓ VERIFIED | Migration `0005` drops the plaintext `negocio.whatsapp_token` and adds `whatsapp_token_secret_id uuid REFERENCES vault.secrets`. `db-types` confirms the plaintext column is gone (only `whatsapp_token_secret_id` + the two RPCs remain). `getWhatsappToken.ts` reads via `.rpc("get_whatsapp_token")` (no column read); `admin-tenants.ts` writes via `.rpc("set_whatsapp_token_secret")`. Wrappers are `SECURITY DEFINER`, `SET search_path=''`, `REVOKE ALL FROM PUBLIC`, `GRANT EXECUTE TO service_role`. Migrations `0006`/`0007` close the anon-execute hole the security audit found. Live: `verify-vault-no-plaintext.ts`, `verify-vault-wrappers-anon-denied.ts`, `verify-0005-applied.ts` all exit 0 (2026-07-09). |
| SEC-02 | Reservas concurrentes sobre el mismo slot: solo una tiene éxito, el resto recibe rechazo controlado | ✓ VERIFIED | `verify-concurrent-booking.ts` fetches `freshData` ONCE, shares it by reference across N calls to the real `bookAppointment` domain fn via `Promise.allSettled`, asserts exactly 1 `{ok:true}` + N-1 `{ok:false, reason:"slot_taken"}`, with an isolation guard on `bdgufnitakelyialjoqg`. The winner is decided by the GiST EXCLUDE (Postgres `23P01`), not the in-memory check. Live: 10 concurrent → 1 success, 9 `slot_taken`, exit 0 (2026-07-09), deterministic across 3 runs, leaves 0 turnos. |
| SEC-03 | Consultas del bot (service_role) con contexto del tenant A nunca devuelven filas del tenant B | ✓ VERIFIED (see W-01) | `negocioScoped.test.ts` loops all 12 read accessors in both directions (A→B and B→A) asserting zero cross-negocio rows, plus a tool-level check on `consultarNegocioTool(A)` proving it never surfaces a negocio-B servicio id. `verify-isolation.ts` covers the complementary RLS/owner path (cross-tenant SELECT 0 rows, UPDATE 0 rows, INSERT rejected by RLS policy). Live: both exit 0 (2026-07-09), 0 leaks. **Caveat W-01:** the SEC-03 test is excluded from the vitest runner — see Anti-Patterns / Warnings. |

**Score:** 3/3 truths verified (0 present, behavior-unverified). SEC-02 (concurrency race) and SEC-03 (isolation) are behavior-dependent invariants; each has a cited passing live behavioral test, satisfying the Step 7b upgrade to VERIFIED.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/0005_whatsapp_token_vault.sql` | Vault extension + 2 SECURITY DEFINER wrappers + column swap | ✓ VERIFIED | 127 lines; enables `supabase_vault`, both wrappers hardened, `ADD whatsapp_token_secret_id` + `DROP whatsapp_token` in one BEGIN/COMMIT. |
| `supabase/migrations/0006_revoke_vault_wrappers_from_anon.sql` | Revoke wrappers from anon/authenticated | ✓ VERIFIED | Present (security-audit fix). |
| `supabase/migrations/0007_restore_auth_helper_grants.sql` | Fix 0006 over-revocation of RLS helpers | ✓ VERIFIED | Present (regression fix). |
| `packages/db-types/src/database.types.ts` | Regenerated from live schema | ✓ VERIFIED | `whatsapp_token` plaintext absent; only `whatsapp_token_secret_id` (Row/Insert/Update) + `get_whatsapp_token`/`set_whatsapp_token_secret` in Functions. |
| `apps/bot/src/whatsapp/getWhatsappToken.ts` | Read via Vault RPC, keep DEV_TOKEN short-circuit | ✓ VERIFIED | `.rpc("get_whatsapp_token", { p_negocio_id })`; `WHATSAPP_DEV_TOKEN` short-circuit intact; no column read. |
| `apps/bot/src/whatsapp/getWhatsappToken.test.ts` | Unit coverage (mocked) | ✓ VERIFIED | 71 lines; part of the 223/223 bot suite. |
| `apps/dashboard/app/actions/admin-tenants.ts` | Write/rotate via Vault RPC, no plaintext column | ✓ VERIFIED | `setWhatsappTokenSecret()` calls `.rpc("set_whatsapp_token_secret")`; insert path no longer references dropped column. |
| `apps/dashboard/app/actions/admin-tenants.test.ts` | Unit coverage (mocked) | ✓ VERIFIED | 75 lines. |
| `scripts/verify-vault-no-plaintext.ts` | Live SEC-01 SC#1 proof | ✓ VERIFIED | 124 lines; deletes `WHATSAPP_DEV_TOKEN`, resolves via Vault, isolation guard present. |
| `scripts/verify-vault-wrappers-anon-denied.ts` | Anon rejected on both wrappers | ✓ VERIFIED | 59 lines. |
| `scripts/verify-0005-applied.ts` | Confirms 0005 applied live | ✓ VERIFIED | 66 lines. |
| `scripts/verify-concurrent-booking.ts` | Live SEC-02 proof | ✓ VERIFIED | 297 lines; shared `freshData`, `Promise.allSettled`, real `bookAppointment`, guard. |
| `scripts/verify-isolation.ts` | Live RLS isolation proof | ✓ VERIFIED | 153 lines. |
| `apps/bot/src/db/negocioScoped.test.ts` | Live SEC-03 proof, 12 accessors + tool | ✓ VERIFIED (⚠ W-01) | 230 lines; 12 accessors both directions + `consultarNegocioTool` check. Excluded from vitest — see W-01. |

### Key Link Verification

| From | To | Via | Status |
|------|----|----|--------|
| `getWhatsappToken.ts` | `vault.decrypted_secrets` | `.rpc("get_whatsapp_token")` → SECURITY DEFINER wrapper (only sanctioned vault access) | ✓ WIRED |
| `admin-tenants.ts` | `vault.create_secret` | `.rpc("set_whatsapp_token_secret")` → SECURITY DEFINER wrapper | ✓ WIRED |
| `negocioInsertPayload` (admin-tenants) | dropped column | No longer references `whatsapp_token` (hardcoded null path removed) | ✓ WIRED |
| `verify-concurrent-booking.ts` | Postgres GiST EXCLUDE `turno_no_overlap` | shared `freshData` by reference → race reaches DB → `23P01` → `slot_taken` | ✓ WIRED |
| `negocioScoped.test.ts` | `negocioScoped()` `.eq('negocio_id', …)` (and `.eq('id',…)` for `negocio()`) | 12 accessors + `consultarNegocioTool` | ✓ WIRED |
| Vault wrappers | app-code only | `REVOKE ALL FROM PUBLIC` + `GRANT EXECUTE TO service_role`; anon revoked by 0006 | ✓ WIRED |

### Behavioral Spot-Checks (cited — executed by phase 2026-07-09, not re-run)

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| SEC-01 token encrypted at rest | `node --env-file=.env --import tsx scripts/verify-vault-no-plaintext.ts` | exit 0 PASSED | ✓ PASS (cited) |
| SEC-01 anon rejected on both wrappers | `node --env-file=.env --import tsx scripts/verify-vault-wrappers-anon-denied.ts` | exit 0 PASSED | ✓ PASS (cited) |
| SEC-01 migration 0005 applied | `node --env-file=.env --import tsx scripts/verify-0005-applied.ts` | exit 0 PASSED | ✓ PASS (cited) |
| SEC-02 concurrency 1 winner | `node --env-file=.env --import tsx scripts/verify-concurrent-booking.ts` | 10→1 success / 9 slot_taken (23P01), exit 0 | ✓ PASS (cited) |
| SEC-03 isolation 12 accessors + tool | `node --env-file=.env --import tsx apps/bot/src/db/negocioScoped.test.ts` | exit 0 PASSED, 0 leaks | ✓ PASS (cited) |
| SEC-03 RLS isolation (owner path) | `node --env-file=.env --import tsx scripts/verify-isolation.ts` | exit 0 PASSED | ✓ PASS (cited) |
| Bot unit suite | `pnpm --filter @turnosbot/bot test -- --run` | 223/223, 24 files | ✓ PASS (cited) |
| availability-engine suite | `pnpm --filter @turnosbot/availability-engine test -- --run` | 61/61, 7 files | ✓ PASS (cited) |
| Typecheck | `npx tsc --noEmit` (apps/bot, after engine rebuild) | 0 errors | ✓ PASS (cited) |

### Requirements Coverage

| Requirement | Source Plans | Status | Evidence |
|-------------|--------------|--------|----------|
| SEC-01 | 07-01, 07-02, 07-03 | ✓ SATISFIED | Migration 0005 + Vault RPC wiring + live no-plaintext proof + anon-denied fix (0006/0007). |
| SEC-02 | 07-04 | ✓ SATISFIED | Live concurrent-booking proof: 1 winner via GiST 23P01. |
| SEC-03 | 07-05 | ✓ SATISFIED | Live cross-negocio isolation over 12 accessors + tool, both directions (W-01 caveat on CI coverage). |

No orphaned requirements: REQUIREMENTS.md maps only SEC-01/02/03 to Phase 7, all claimed by plans.

### Anti-Patterns / Warnings

| ID | File | Severity | Impact |
|----|------|----------|--------|
| W-01 | `apps/bot/src/db/negocioScoped.test.ts` + `apps/bot/vitest.config.ts` | ⚠️ Warning | The SEC-03 isolation proof is named `.test.ts` but is a standalone `main()`/`process.exit` script, and `vitest.config.ts` **explicitly lists it in `exclude`**. It does NOT run under `pnpm test`, is not among the 24 suite files, and never shows as "skipped". Consequence: a green CI suite gives **zero** signal about cross-negocio isolation — the guarantee only holds when a human runs the script by hand. A future isolation regression would pass CI undetected. The goal is met **today** (live exit 0), but the ongoing guarantee is not automated. Recommend renaming to `negocioScoped.verify.ts` or moving to `scripts/` so the name stops implying CI coverage. |
| W-02 | `vault.secrets` (Supabase) | ℹ️ Info | Orphan secrets accumulate: every `verify-vault-no-plaintext.ts` run leaves a `whatsapp-token-verify-<ts>` secret (cleanup only nulls the FK), plus a `uat-probe-nonexistent` secret from a UAT probe. `vault` is not exposed over REST → manual cleanup in SQL Editor required. Non-blocking. |
| W-03 | apps/bot conversation tests | ℹ️ Info | No E2E re-test against real Gemini; `generateText` is mocked. Outside Phase 07 scope; noted for milestone awareness. |

No debt markers (`TBD`/`FIXME`/`XXX`) found in any file modified by this phase.

### Human Verification Required

None that block the phase goal. The three success criteria were proven live (exit 0) by the phase and are cited above. The items in the Warnings table are maintainability/hygiene recommendations, not unmet criteria:

- **W-01 (recommended follow-up):** rename/relocate `negocioScoped.test.ts` so its isolation check either runs in CI as a proper suite or stops masquerading as one. This is the most important honesty item — it does not fail SEC-03 (proven live today) but it means CI will not catch a future isolation regression.
- **W-02 (manual cleanup):** run the Vault orphan-secret cleanup in the Supabase SQL Editor (`HANDOFF-milestone-v1.md` §2.6).

### Gaps Summary

No gaps. All three ROADMAP Success Criteria (SEC-01, SEC-02, SEC-03) are achieved: the code artifacts are real, substantive, and wired to the sanctioned Vault / GiST / negocioScoped paths (not stubs), and each criterion has a cited live exit-0 proof against `bdgufnitakelyialjoqg` from 2026-07-09. The plaintext WhatsApp token column is dropped and replaced by a Vault reference with service_role-only wrappers (anon hole closed by 0006/0007); concurrent bookings resolve to exactly one winner via the DB-level GiST EXCLUDE; and the service_role bot codepath shows zero cross-negocio leakage across all 12 read accessors and the `consultarNegocio` tool in both directions.

The phase goal — the system is hardened at its highest-risk points (concurrency, cross-tenant isolation, credentials) before the first real tenant — is met. Three non-blocking warnings are recorded, the most significant being that the SEC-03 isolation test is excluded from CI and therefore proves nothing on a green suite alone (W-01).

---

_Verified: 2026-07-10T01:48:29Z_
_Verifier: Claude (gsd-verifier)_
