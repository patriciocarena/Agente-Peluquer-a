---
phase: 7
slug: hardening-y-listo-para-produccion
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-09
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `07-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.9 (unit, mocked) + gated `tsx`-run `verify-*.ts` scripts (live DB, per D-05) |
| **Config file** | `apps/bot/vitest.config.ts`, `apps/dashboard/vitest.config.ts`, `packages/availability-engine/vitest.config.ts` (all exist — no new config) |
| **Quick run command** | `pnpm --filter @turnosbot/bot test` / `pnpm --filter @turnosbot/dashboard test` |
| **Full suite command** | `pnpm -r test` (mocked suites only — the gated live scripts are NOT part of this) |
| **Estimated runtime** | ~60 seconds (mocked full suite) |

---

## Sampling Rate

- **After every task commit:** Run the relevant package's quick command (`pnpm --filter @turnosbot/bot test` or `... /dashboard test`)
- **After every plan wave:** Run `pnpm -r test`
- **Before `/gsd-verify-work`:** Full mocked suite green, AND the three gated live scripts run once against `bdgufnitakelyialjoqg`
- **Max feedback latency:** 60 seconds

**Note (D-05):** The three ROADMAP Success Criteria are all *live-DB* assertions, not unit-test assertions. The mocked suite verifies call-site wiring; only the gated scripts prove the phase goal.

---

## Per-Task Verification Map

> Task IDs are assigned by the planner. This map is filled in during planning; the rows
> below are the requirement→proof commitments the plans must satisfy.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | SEC-01 | T-07-01 | `admin-tenants.ts` writes the token via `.rpc('set_whatsapp_token_secret', …)`, never a plain column write | unit (mocked `.rpc`) | `pnpm --filter @turnosbot/dashboard test -- admin-tenants` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | SEC-01 | T-07-01 | `getWhatsappToken.ts` reads via `.rpc('get_whatsapp_token', …)` when `WHATSAPP_DEV_TOKEN` is unset | unit (mocked `.rpc`) | `pnpm --filter @turnosbot/bot test -- getWhatsappToken` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | SEC-01 | T-07-02 | A direct `SELECT * FROM negocio` returns no plaintext token — only `whatsapp_token_secret_id` | live (gated) | `pnpm exec tsx scripts/verify-vault-no-plaintext.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | SEC-02 | T-07-03 | Exactly 1 of N concurrent `bookAppointment` calls at the same slot succeeds; the rest return `slot_taken` | live (gated) | `pnpm exec tsx scripts/verify-concurrent-booking.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | SEC-03 | T-07-04 | `negocioScoped(A).<every accessor>()` never returns negocio-B rows | live (gated, extends existing) | `pnpm exec tsx apps/bot/src/db/negocioScoped.test.ts` | ✅ (extend) | ⬜ pending |
| TBD | TBD | TBD | SEC-03 | T-07-04 | A bot read tool invoked with negocio A's context never surfaces negocio B ids/data | live (gated) | same script, extended assertion block | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `scripts/verify-vault-no-plaintext.ts` — new gated script, Success Criterion #1
- [ ] `scripts/verify-concurrent-booking.ts` — new gated script, Success Criterion #2 (MUST share a single pre-fetched `freshData` across all N concurrent calls — otherwise the in-memory freshness check short-circuits the race before it reaches the Postgres GiST constraint, and the test proves nothing)
- [ ] `apps/bot/src/db/negocioScoped.test.ts` — extend from the single `turnos()` accessor to all 11 accessors, plus a bot-tool-level assertion, Success Criterion #3
- [ ] `apps/bot/src/whatsapp/getWhatsappToken.test.ts` — new mocked unit test for the RPC read path (happy + error branches)
- [ ] Verify at plan time whether an `admin-tenants` unit test file exists; extend it, or create it, with the mocked `.rpc('set_whatsapp_token_secret', …)` assertion

Every gated script MUST carry the project isolation guard: abort unless `SUPABASE_URL` points at `bdgufnitakelyialjoqg`.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Token encrypted at rest | SEC-01 | Needs the live Vault extension + real `.env` credentials; cannot be proven by a mocked test | Run `pnpm exec tsx scripts/verify-vault-no-plaintext.ts` against `bdgufnitakelyialjoqg` |
| Concurrent double-booking rejected | SEC-02 | The GiST `23P01` exclusion only fires inside real Postgres under real concurrency | Run `pnpm exec tsx scripts/verify-concurrent-booking.ts` |
| Cross-tenant isolation under service_role | SEC-03 | service_role bypasses RLS, so isolation lives in app code — a mocked test would mock the very layer under test | Run the extended `negocioScoped.test.ts` against the 2 seed tenants |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
