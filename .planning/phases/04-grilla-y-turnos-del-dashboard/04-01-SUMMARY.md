---
phase: 04-grilla-y-turnos-del-dashboard
plan: 01
subsystem: api
tags: [availability-engine, zod, typescript, vitest, supabase, tdd]

# Dependency graph
requires:
  - phase: 03-motor-de-disponibilidad
    provides: computeSlots/bookAppointment engine, GiST EXCLUDE 23P01 translation via isSlotTakenConcurrently
provides:
  - "ComputeSlotsInput.skipBookingWindow?/BookAppointmentInput.skipBookingWindow? (D-08): opt-in bypass of the 60min/30d booking window filter, default-preserving for the bot"
  - "RescheduleAppointmentInput + rescheduleAppointmentInputSchema (types.ts/booking.ts)"
  - "rescheduleAppointment(rawInput, deps): UPDATE-based reschedule with self-exclusion of the turno's own old slot, 23P01->slot_taken translation, re-exported from index.ts"
  - "scripts/verify-reschedule.ts: gated live smoke test proving the GiST EXCLUDE re-fires on UPDATE (A1)"
affects: [04-grilla-y-turnos-del-dashboard (Plans 03-07, which import rescheduleAppointment + skipBookingWindow from the dashboard), fase-6-bot-whatsapp (BOT-10 will reuse rescheduleAppointment)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Self-exclusion via spread+filter: dataExcludingSelf = {...freshData, turnos: freshData.turnos.filter(t => t.id !== turnoId)} preserves negocio-scoping without a refetch"
    - "Reschedule always passes skipBookingWindow:true internally to computeSlots (hardcoded, not forwarded from caller) per D-07 — the owner can reschedule outside the 60min/30d window"
    - "Chainable supabase mock (from->update->eq->eq->select->single) for unit-testing UPDATE-based domain functions without a live DB"

key-files:
  created:
    - scripts/verify-reschedule.ts
  modified:
    - packages/availability-engine/src/types.ts
    - packages/availability-engine/src/computeSlots.ts
    - packages/availability-engine/src/computeSlots.test.ts
    - packages/availability-engine/src/booking.ts
    - packages/availability-engine/src/booking.test.ts
    - packages/availability-engine/src/index.ts

key-decisions:
  - "rescheduleAppointment hardcodes skipBookingWindow:true in its internal computeSlots call (per plan text) rather than forwarding RescheduleAppointmentInput.skipBookingWindow — the field exists on the type for symmetry with BookAppointmentInput but is not read by the current implementation"
  - "rescheduleAppointment never recalculates precio_total; it carries over the existing turno's precio_total unchanged, since D-14 only overwrites inicio/fin/profesional_id and never touches turno_servicio"
  - "Test negocio fixture uses granularidad_min:15 (instead of the package default 30) in booking.test.ts's reschedule describe block, to exercise the exact 10:15 self-exclusion scenario the plan specifies"

patterns-established:
  - "Domain functions that UPDATE (vs INSERT) reuse the same BookAppointmentDeps/BookAppointmentResult shapes and isSlotTakenConcurrently helper — no parallel error-handling path needed"

requirements-completed: [APPT-05, APPT-06]

# Metrics
duration: ~15min
completed: 2026-07-05
---

# Phase 4 Plan 1: Availability Engine Extensions (skipBookingWindow + rescheduleAppointment) Summary

**Added an opt-in `skipBookingWindow` bypass to `computeSlots` (D-08) and a new `rescheduleAppointment` UPDATE-based function with self-exclusion and 23P01 handling (D-14) to `@turnosbot/availability-engine`, so the dashboard and the future bot share exactly one booking engine.**

## Performance

- **Duration:** ~15 min (4 commits spanning 22:36:01–22:42:57 local, plus context-reading time)
- **Started:** 2026-07-05T22:35:00-03:00 (approx.)
- **Completed:** 2026-07-05T22:43:00-03:00
- **Tasks:** 2 (both `type="tdd"`)
- **Files modified:** 6 modified, 1 created

## Accomplishments

- `computeSlots` now accepts `skipBookingWindow?: boolean` on `ComputeSlotsInput`; when `true` it skips the `BOOKING_MIN_LEAD_MINUTES`/`BOOKING_MAX_ADVANCE_DAYS` filter entirely, while omitting the field (or passing `false`) reproduces the exact pre-existing bot behavior — verified with a byte-for-byte regression test comparing omitted vs. explicit-false runs.
- `rescheduleAppointment` implemented as a sibling of `bookAppointment`: validates input with zod, excludes the turno's own old slot from `freshData.turnos` before revalidating against `computeSlots`, performs `UPDATE turno SET inicio, fin, profesional_id WHERE id = turnoId AND negocio_id = negocioId` (never cancel+create), and translates a `23P01` from the GiST EXCLUDE into `{ok:false, reason:"slot_taken"}` — reusing the existing `isSlotTakenConcurrently` helper unchanged.
- `scripts/verify-reschedule.ts` written (not executed — gated on `.env`) to prove live against `bdgufnitakelyialjoqg` that the GiST EXCLUDE re-fires on `UPDATE`, not just `INSERT` (A1 from 04-RESEARCH.md).

## Task Commits

Each task followed the TDD RED → GREEN cycle with atomic commits:

1. **Task 1: Flag skipBookingWindow (D-08)**
   - `f93d1e7` test(04-01): add failing tests for skipBookingWindow window bypass (D-08)
   - `e2b59d9` feat(04-01): add skipBookingWindow bypass flag to computeSlots (D-08)
2. **Task 2: rescheduleAppointment (D-14) with self-exclusion + UPDATE**
   - `9188517` test(04-01): add failing tests for rescheduleAppointment (D-14)
   - `e3c4d83` feat(04-01): implement rescheduleAppointment with self-exclusion (D-14)
   - `14eb7c1` feat(04-01): add gated live verification script for reschedule 23P01 (A1)

**Plan metadata:** (this commit)

## Files Created/Modified

- `packages/availability-engine/src/types.ts` - Added `ComputeSlotsInput.skipBookingWindow?`, `BookAppointmentInput.skipBookingWindow?`, and the new `RescheduleAppointmentInput` interface
- `packages/availability-engine/src/computeSlots.ts` - `slotsEnVentana` now branches on `input.skipBookingWindow` instead of unconditionally filtering
- `packages/availability-engine/src/computeSlots.test.ts` - 4 new tests under a `D-08: skipBookingWindow` describe block (now-slot bypass, >30d bypass, regression guard, explicit-false parity)
- `packages/availability-engine/src/booking.ts` - Added `rescheduleAppointmentInputSchema` and `rescheduleAppointment(rawInput, deps)`
- `packages/availability-engine/src/booking.test.ts` - 6 new tests under a `rescheduleAppointment (D-14)` describe block (self-exclusion, validation_error, 23P01, other-error, unavailable-slot, no-turno_servicio-call)
- `packages/availability-engine/src/index.ts` - Re-exports `rescheduleAppointment`
- `scripts/verify-reschedule.ts` (new) - Gated live smoke test for the A1 UPDATE/GiST-EXCLUDE interaction

## Decisions Made

- Followed the plan's explicit instruction to hardcode `skipBookingWindow: true` inside `rescheduleAppointment`'s internal `computeSlots` call rather than forwarding the caller's `RescheduleAppointmentInput.skipBookingWindow` value — the field remains on the type for interface symmetry with `BookAppointmentInput` but the reschedule path always bypasses the window per D-07 (owner can reschedule outside the 60min/30d window regardless of what the caller passes).
- `precio_total` on a successful reschedule is carried over unchanged from the existing `turno` row (read from `freshData.turnos`), never recalculated — consistent with D-14's scope (only `inicio`/`fin`/`profesional_id` are ever overwritten; `turno_servicio` snapshots are untouched).
- Used `granularidad_min: 15` in the reschedule test fixtures (vs. the package's default 30) so the self-exclusion test could exercise the exact 10:15 start time specified in the plan's behavior section, while all pre-existing tests (which rely on the 30min default) were left untouched.

## Deviations from Plan

None - plan executed exactly as written. The starting assumption in the task brief (that a prior worktree session had already implemented this work) did not hold once the actual source was inspected — `skipBookingWindow`, `RescheduleAppointmentInput`, and `scripts/verify-reschedule.ts` were all absent, confirming the "treat as fresh implementation" framing was correct, and the plan was executed from scratch accordingly.

## Issues Encountered

- `pnpm` was not on `PATH` (only `corepack` was available, and `corepack enable` failed with `EACCES` on the global symlink). Worked around by invoking `corepack pnpm <args>` directly, which does not require the global symlink. `pnpm install` had to be run once before any test/build command since `node_modules` was absent.
- Ad-hoc standalone `tsc --noEmit` checks against `scripts/verify-reschedule.ts` reported `Cannot find name 'process'` and a few narrowing errors; running the identical check against the pre-existing `scripts/verify-availability-engine.ts` reproduced the same class of errors, confirming these are artifacts of `scripts/` never being part of a typechecked project reference (only executed via `tsx`, which doesn't type-check) — not a defect introduced by this plan.

## User Setup Required

None - no external service configuration required. `scripts/verify-reschedule.ts` requires `.env` (`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`) to run manually against `bdgufnitakelyialjoqg`, but this is a gated live-verification script, not a blocker for downstream plans (same pattern as Phase 3's gated scripts).

## Next Phase Readiness

- `@turnosbot/availability-engine` now exports `rescheduleAppointment` and supports `skipBookingWindow` on both `computeSlots` and `bookAppointment` — Plans 03-07 of Phase 4 (dashboard grid/appointment UI) can import both directly from `@turnosbot/availability-engine` without duplicating booking logic.
- `pnpm --filter @turnosbot/availability-engine test` (54/54 passing) and `pnpm --filter @turnosbot/availability-engine build` (tsc -b, clean) both verified green.
- Live verification of `scripts/verify-reschedule.ts` against `bdgufnitakelyialjoqg` remains outstanding (requires `.env` with real credentials) — does not block downstream plans, same as the Phase 3 precedent.

---
*Phase: 04-grilla-y-turnos-del-dashboard*
*Completed: 2026-07-05*

## Self-Check: PASSED

All created/modified files verified present on disk; all task commits (`f93d1e7`, `e2b59d9`, `9188517`, `e3c4d83`, `14eb7c1`) and the plan-metadata commit (`ba39eea`) verified present in `git log`.
