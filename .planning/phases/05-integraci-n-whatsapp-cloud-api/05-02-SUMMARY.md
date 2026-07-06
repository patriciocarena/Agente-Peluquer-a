---
phase: 05-integraci-n-whatsapp-cloud-api
plan: 02
subsystem: infra
tags: [whatsapp, hmac, zod, crypto, vitest, webhook]

# Dependency graph
requires:
  - phase: 05-integraci-n-whatsapp-cloud-api
    provides: "05-01: vitest runner in apps/bot, extended env.ts (WHATSAPP_APP_SECRET etc.)"
provides:
  - "verifyWhatsappSignature(rawBody, signatureHeader, appSecret): boolean — constant-time HMAC-SHA256 verification over the raw request Buffer"
  - "whatsappWebhookEventSchema (zod) + WhatsappWebhookEvent type — validated shape of Meta's parsed webhook body"
  - "extractPhoneNumberId(event) / extractFirstMessage(event) — defensive, non-throwing extraction helpers"
affects: [05-05, 05-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "First HMAC/crypto utility in the codebase: node:crypto createHmac + timingSafeEqual, length-guard before compare (Pitfall 2)"
    - "Zod-boundary-validation for the Meta webhook payload, mirroring booking.ts's satisfies z.ZodType convention (unknown keys tolerated, no .strict())"

key-files:
  created:
    - apps/bot/src/whatsapp/signature.ts
    - apps/bot/src/whatsapp/signature.test.ts
    - apps/bot/src/whatsapp/payload.ts
    - apps/bot/src/whatsapp/payload.test.ts
  modified: []

key-decisions:
  - "Followed 05-RESEARCH.md Pattern 2 verbatim for verifyWhatsappSignature — no deviation from the pre-verified reference implementation"
  - "payload.ts keeps whatsappWebhookEventSchema permissive (no .strict()) per 05-PATTERNS.md, since Meta adds webhook fields over time"

patterns-established:
  - "Signature verification always takes the raw Buffer as its first argument, never a re-serialized object — documented inline as a hard rule for the webhook route (plan 05-06) to follow"

requirements-completed: [WA-01]

coverage:
  - id: D1
    description: "verifyWhatsappSignature correctly verifies a valid signature, rejects tampered body/wrong secret/missing header/malformed prefix, and never throws on a length-mismatched header (Pitfall 2)"
    requirement: "WA-01"
    verification:
      - kind: unit
        ref: "apps/bot/src/whatsapp/signature.test.ts (6 tests, all pass)"
        status: pass
    human_judgment: false
  - id: D2
    description: "whatsappWebhookEventSchema validates a valid text-message event and a status-update event (no messages[]), rejects malformed events missing metadata.phone_number_id or entry; extractPhoneNumberId/extractFirstMessage extract safely"
    requirement: "WA-01"
    verification:
      - kind: unit
        ref: "apps/bot/src/whatsapp/payload.test.ts (7 tests, all pass)"
        status: pass
    human_judgment: false

# Metrics
duration: 12min
completed: 2026-07-06
status: complete
---

# Phase 5 Plan 02: Signature Verification + Webhook Payload Shape Summary

**HMAC-SHA256 `X-Hub-Signature-256` verification (timing-safe, length-guarded against the Pitfall 2 DoS) and a permissive zod schema for Meta's webhook payload, both pure functions ready to be consumed by the webhook route (05-06) and worker (05-05).**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-07-06T20:00:00Z
- **Completed:** 2026-07-06T20:12:00Z
- **Tasks:** 2 completed
- **Files modified:** 4 (all created)

## Accomplishments
- `verifyWhatsappSignature(rawBody, signatureHeader, appSecret)` computes HMAC-SHA256 over the raw `Buffer` and compares with `crypto.timingSafeEqual`, guarding buffer-length equality first so a truncated/garbage header returns `false` instead of throwing a `RangeError` (Pitfall 2)
- `whatsappWebhookEventSchema` validates `entry[].changes[].value.metadata.phone_number_id` (required) and `messages[]` (optional, since status-update events omit it), tolerating unknown Meta fields by not using `.strict()`
- `extractPhoneNumberId` / `extractFirstMessage` read the validated event defensively (optional chaining throughout), returning `undefined` rather than throwing when the expected path is absent
- All 19 tests in `apps/bot` pass (`pnpm --filter @turnosbot/bot test`), including the pre-existing `env.test.ts` from 05-01

## Task Commits

Each task was committed atomically (TDD RED → GREEN):

1. **Task 1: HMAC-SHA256 signature verification** - test (RED): `8f70995`, feat (GREEN): `f3d4ae9`
2. **Task 2: zod schema for the Meta webhook payload** - test (RED): `8ba09fe`, feat (GREEN): `e91b023`

**Plan metadata:** (this SUMMARY commit, following)

## Files Created/Modified
- `apps/bot/src/whatsapp/signature.ts` (NEW) - `verifyWhatsappSignature`, HMAC-SHA256 over raw Buffer, timing-safe comparison with a length guard
- `apps/bot/src/whatsapp/signature.test.ts` (NEW) - 6 tests: valid signature, tampered body, wrong secret, missing header, missing `sha256=` prefix, length-mismatched header (no throw)
- `apps/bot/src/whatsapp/payload.ts` (NEW) - `whatsappWebhookEventSchema`, `WhatsappWebhookEvent`/`WhatsappMessage` types, `extractPhoneNumberId`, `extractFirstMessage`
- `apps/bot/src/whatsapp/payload.test.ts` (NEW) - 7 tests: valid text-message event, status-update event (no `messages[]`), missing `metadata.phone_number_id`, missing `entry`, and both extraction helpers

## Decisions Made
- Used the plan's/05-RESEARCH.md's exact reference implementation for `verifyWhatsappSignature` — no deviation, since it was already cross-verified against Node.js `crypto` docs and Meta's spec.
- Kept `whatsappWebhookEventSchema` non-strict (tolerates unknown keys) per 05-PATTERNS.md's explicit guidance that Meta's webhook payload gains fields over time.

## Deviations from Plan

None - plan executed exactly as written. Both tasks followed the TDD RED→GREEN cycle specified in the plan (`tdd="true"`), with the reference implementations from 05-RESEARCH.md/05-PATTERNS.md applied directly.

## Issues Encountered
- `apps/bot`'s `node_modules` (and the rest of the monorepo's workspace `node_modules`) were not yet installed in this fresh worktree checkout — ran `pnpm install --frozen-lockfile` at the repo root before the vitest runner or `tsc` could execute. This is normal worktree setup, not a plan deviation (no source files were touched to fix it).

## User Setup Required
None - no external service configuration required. Both modules are pure functions with no DB/queue/HTTP coupling.

## Next Phase Readiness
- `verifyWhatsappSignature` is ready for the webhook POST route (plan 05-06) to call as the sole gate before enqueuing.
- `whatsappWebhookEventSchema`/`WhatsappWebhookEvent`/`extractPhoneNumberId`/`extractFirstMessage` are ready for both the webhook route (05-06) and the pg-boss worker (05-05) to consume.
- No blockers identified for the rest of Wave 2/3 of Phase 5.

---
*Phase: 05-integraci-n-whatsapp-cloud-api*
*Completed: 2026-07-06*

## Self-Check: PASSED

All four created files (`signature.ts`, `signature.test.ts`, `payload.ts`, `payload.test.ts`) verified present on disk; all task commit hashes (`8f70995`, `f3d4ae9`, `8ba09fe`, `e91b023`) verified present in git log.
