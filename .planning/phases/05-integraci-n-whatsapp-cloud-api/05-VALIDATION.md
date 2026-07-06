---
phase: 05
slug: integraci-n-whatsapp-cloud-api
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-06
---

# Phase 05 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | none — Wave 0 installs `apps/bot/vitest.config.ts` (mirror `packages/availability-engine`) |
| **Quick run command** | `pnpm --filter @turnosbot/bot test` |
| **Full suite command** | `pnpm --filter @turnosbot/bot test` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick run command
- **After every plan wave:** Run full suite command
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 05-01-01 | 01 | 0 | infra | — | vitest runs in apps/bot | infra | `pnpm --filter @turnosbot/bot test` | ❌ W0 | ⬜ pending |
| 05-02-01 | 02 | 1 | WA-01 | T-05-01 | Invalid `X-Hub-Signature-256` → 403, valid → 200 | unit | `pnpm --filter @turnosbot/bot test` | ❌ W0 | ⬜ pending |
| 05-03-01 | 03 | 1 | WA-02 | T-05-02 | Unknown `phone_number_id` → discard (log+200), no tenant guessed | unit | `pnpm --filter @turnosbot/bot test` | ❌ W0 | ⬜ pending |
| 05-04-01 | 04 | 2 | WA-03 | T-05-03 | Duplicate `messages[].id` processed once (no double persist/send) | unit | `pnpm --filter @turnosbot/bot test` | ❌ W0 | ⬜ pending |
| 05-05-01 | 05 | 2 | WA-05 | — | conversacion/mensaje persisted, `context` jsonb set | unit | `pnpm --filter @turnosbot/bot test` | ❌ W0 | ⬜ pending |
| 05-06-01 | 06 | 2 | WA-04 | T-05-04 | Outbound send within 24h window; `WHATSAPP_LIVE=false` mocks POST | unit | `pnpm --filter @turnosbot/bot test` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky. Task IDs are indicative — the planner owns the final plan/wave breakdown.*

---

## Wave 0 Requirements

- [ ] `apps/bot/vitest.config.ts` — vitest config (no watch mode) + `test` script in `apps/bot/package.json`
- [ ] Signed-webhook test helper — builds an HMAC-SHA256-signed POST body with a dev app-secret (fixture for WA-01/03/05 tests, per D-01)
- [ ] `CREATE UNIQUE INDEX IF NOT EXISTS` migration on `mensaje(negocio_id, wa_message_id)` — idempotent, safe even if it already exists (dedup durability, WA-03)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live round-trip against real Meta (tunnel + WABA + test number) | WA-01..05 | Requires verified Meta Developer account + WABA (blocker in STATE.md); deferred per D-01 | Deferred follow-up: expose local webhook via HTTPS tunnel, register number, send one real message in/out. NOT part of this phase's code. |

*All other phase behaviors have automated verification via signed local webhook payloads (D-01).*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
