---
phase: 06-agente-conversacional-de-agendamiento
fixed_at: 2026-07-07T21:20:00Z
review_path: .planning/phases/06-agente-conversacional-de-agendamiento/06-REVIEW.md
iteration: 1
findings_in_scope: 6
fixed: 6
skipped: 0
status: all_fixed
---

# Phase 6: Code Review Fix Report

**Fixed at:** 2026-07-07T21:20:00Z
**Source review:** .planning/phases/06-agente-conversacional-de-agendamiento/06-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope (critical + warning): 6
- Fixed: 6
- Skipped: 0

Info findings (IN-01, IN-02) were out of `fix_scope: critical_warning` and were not attempted.

## Fixed Issues

### CR-01: D-12 gate false-positives on legitimate cancellation replies, discarding them and forcing human handoff

**Files modified:** `apps/bot/src/conversation/closingLanguage.ts`, `apps/bot/src/conversation/responder.ts`, `apps/bot/src/conversation/responder.test.ts`, `apps/bot/evals/traceAssertions.ts`, `apps/bot/evals/traceAssertions.test.ts`, `apps/bot/evals/responder.eval.test.ts`, `apps/bot/evals/dataset/conversations.json`
**Commit:** `803d0ed`
**Applied fix:** Added a `hasSuccessfulCancel(steps)` helper to `closingLanguage.ts` (the single source of truth for D-12 guardrail logic, alongside the existing `hasClosingLanguage`/`CLOSING_LANGUAGE_LEXICON`) that returns `true` when a `cancelarTurno` tool-result with `ok:true` appears in the trace — cancelling never creates/moves a turno, so there's no `turno_id` to hallucinate, unlike `confirmarTurno`/`reagendarTurno`. `responder.ts`'s online gate and `traceAssertions.ts`'s offline mirror (`assertNoPhantomConfirmation`) both import this shared helper instead of redeclaring the logic, preserving the codebase's explicit "never redeclare the guardrail in two places" invariant. The gate condition changed from `closingLanguageDetected && !turnoIdReal` to `closingLanguageDetected && !turnoIdReal && !cancelacionExitosa`.

Locked in with a regression case: `cf-04`'s synthetic model text in `responder.eval.test.ts` was changed from a lexicon-avoiding string to `"Listo, tu turno del viernes queda cancelado."` (uses "listo"), and its dataset `veredictos.E1` was updated from `"N/A"` to `"PASS"` with an explanatory note — without the fix this case would now FAIL as a phantom confirmation. Added direct unit tests in `responder.test.ts` (2) and `traceAssertions.test.ts` (2) covering both the allowance and that it isn't a blind bypass (no tool success at all still triggers the gate).

### CR-02: D-12 gate patches the outgoing text but persists the unfiltered phantom text into conversation history

**Files modified:** `apps/bot/src/conversation/responder.ts`, `apps/bot/src/conversation/responder.test.ts`
**Commit:** `80db202`
**Applied fix:** Added `replaceLastAssistantText(messages, finalText)` in `responder.ts`, which finds the last `assistant`-role message in `result.response.messages` and swaps its text content for `finalText` (the safe fallback message), preserving any tool-call/tool-result parts intact (handles both string `content` and array-of-parts `content` shapes). When the D-12 gate fires, `messagesToPersist = replaceLastAssistantText(result.response.messages, finalText)` is used instead of the raw `result.response.messages` when building `conversacion.context.messages` — so the model's own future-turn history now matches what was actually sent to the customer, never the phantom confirmation the gate just blocked. Added two regression tests verifying (a) the persisted history contains `finalText` and never the phantom text, and (b) tool-call parts survive the substitution when `content` is an array.

### CR-03: `cancelarTurno`/`reagendarTurno` never verify the turno belongs to the requesting cliente — cross-client tampering within the same tenant

**Files modified:** `apps/bot/src/conversation/tools/cancelarTurno.ts`, `apps/bot/src/conversation/tools/cancelarTurno.test.ts`, `apps/bot/src/conversation/tools/reagendarTurno.ts`, `apps/bot/src/conversation/tools/reagendarTurno.test.ts`
**Commit:** `225d625`
**Applied fix:** Chose the tool-level pre-check option from the review (rather than extending `cancelAppointment`/`rescheduleAppointment` in `packages/availability-engine`), to keep `packages/availability-engine/src/booking.ts` and `packages/availability-engine/src/types.ts` completely untouched — this guarantees the dashboard's owner-initiated call sites (`apps/dashboard/app/actions/turnos.ts`, which legitimately operate across all clients of a negocio) are unaffected, since they call the engine functions directly and never go through these bot tools.

Both `cancelarTurnoTool` and `reagendarTurnoTool` now fetch the negocio-scoped `turnos()` (mirroring the existing pattern already used by `consultarNegocio.ts#estado_turno`) and verify `turno.cliente_id === clienteId` for the requested `turnoId` *before* delegating to `cancelAppointment`/`rescheduleAppointment`. If the turno doesn't exist or belongs to another client, both return the same generic error copy used for real failures (`GENERIC_ERROR_COPY`) — never distinguishing "not found" from "wrong owner" in the message, to avoid confirming/denying the existence of another customer's turno. `negocioScoped` was added to `CancelarTurnoDeps` (it was already present in `ReagendarTurnoDeps`). The now-unused `void clienteId;` parity comments were removed from both files since `clienteId` is genuinely used now.

Added adversarial test cases to both tool test files: a foreign-but-existing `turnoId` (owned by another client of the same negocio) and a nonexistent `turnoId`, both asserting the underlying engine function (`cancelAppointment`/`rescheduleAppointment`) is never called and the generic error message is returned in both cases (no leak).

### WR-01: `buildBotAvailabilityData` can silently load the wrong negocio's row for multi-location tenants

**Files modified:** `apps/bot/src/conversation/buildBotAvailabilityData.ts`, `apps/bot/src/conversation/buildBotAvailabilityData.test.ts` (new)
**Commit:** `e8e8871`
**Applied fix:** Changed `const negocio = negocioRes.data?.[0]` to `const negocio = negocioRes.data?.find((n) => n.id === negocioId)`, and updated the error message to distinguish a real Postgrest error from "no matching row" (`"no matching row"` fallback when `negocioRes.error` is undefined but no row matched). No test file previously existed for this module; created one from scratch covering: single-negocio happy path, a multi-negocio tenant where the requested `negocioId` is NOT first in the array (would have silently returned the wrong negocio before the fix), a `negocioId` absent from the returned rows (now throws instead of guessing), and a Postgrest error passthrough.

### WR-02: Cancellation's `turnoId: ""` sentinel is a fragile stand-in for "no id"

**Files modified:** `apps/bot/src/conversation/tools/cancelarTurno.ts`, `apps/bot/src/conversation/tools/cancelarTurno.test.ts`
**Commit:** `f09aed8`
**Applied fix:** Changed `CancelarTurnoResult`'s `ok: true` variant from `{ ok: true; turnoId: string; mensaje: string }` to `{ ok: true; turnoId?: string; mensaje: string }`. Went slightly further than the review's minimal type-only suggestion: also updated the `already_cancelled` branch of `mapCancelAppointmentResult` to omit the `turnoId` field entirely (`{ ok: true, mensaje: YA_CANCELADO_COPY }`) instead of assigning the `""` sentinel, since a non-optional-looking-but-actually-optional field with an empty-string placeholder was the exact landmine the finding warned about — removing the sentinel value itself (not just relaxing the type) fully closes the gap. Confirmed via grep that no consumer currently reads `CancelarTurnoResult.turnoId`, so this is a safe, non-breaking change. Added a regression assertion that the `already_cancelled` result has no `turnoId` property at all.

### WR-03: promptfoo's copy of the system prompt is a hand-maintained duplicate with no automated drift check

**Files modified:** `apps/bot/src/conversation/systemPrompt.ts`, `apps/bot/evals/promptfooconfig.test.ts` (new)
**Commit:** `c514287`
**Applied fix:** Adapted the review's suggestion slightly: rather than only adding a freshness test, also fixed a related latent gap the test would have otherwise immediately exposed — `systemPrompt.ts`'s D-12 paragraph previously hardcoded only 3 of the 6 words in `CLOSING_LANGUAGE_LEXICON` ("listo", "confirmado", "quedaste"), silently omitting "te espero", "reservado", "agendado" from what the model is told to avoid. Changed `systemPrompt.ts` to import `CLOSING_LANGUAGE_LEXICON` from `closingLanguage.ts` and interpolate the full list (`CLOSING_LANGUAGE_EXAMPLES`) into the prompt text, so the model-facing wording can never drift from the single source of truth used by the D-12 code gate. Then added `apps/bot/evals/promptfooconfig.test.ts`, a cheap Vitest suite (no Gemini call) that imports `buildSystemPrompt()` directly and asserts every `CLOSING_LANGUAGE_LEXICON` word, the D-13 isolation framing sentence, and the D-08 confirmation-before-cancel phrase all still appear in its output — catching future wording regressions in CI rather than relying on someone remembering to update `promptfooconfig.yaml` in the same PR.

## Skipped Issues

None — all 6 in-scope findings (CR-01, CR-02, CR-03, WR-01, WR-02, WR-03) were fixed.

## Verification

Ran the full monorepo suite after all fixes (per the extra safety-critical instructions for this phase):

```
pnpm -r --if-present run test
```

- `packages/availability-engine`: 60/60 passed (unchanged — untouched by CR-03's fix approach)
- `apps/dashboard`: 58/58 passed (unchanged — untouched; confirmed `apps/dashboard/app/actions/turnos.ts`'s owner-initiated call sites were never modified)
- `apps/bot`: 196/196 passed (179 baseline + 17 new: 4 in `responder.test.ts`, 2 in `traceAssertions.test.ts`, 2 in `cancelarTurno.test.ts`, 2 in `reagendarTurno.test.ts`, 4 in `buildBotAvailabilityData.test.ts`, 3 in `promptfooconfig.test.ts`)

Also ran `pnpm --filter @turnosbot/bot exec vitest run evals/` explicitly: 97/97 passed (92 baseline + 2 traceAssertions.test.ts + 3 promptfooconfig.test.ts).

`npx tsc --noEmit -p apps/bot/tsconfig.json` was run after each fix — zero type errors throughout.

No findings required "requires human verification" flagging — each fix's logic was covered by a targeted regression test that fails without the fix and passes with it (verified by reasoning through the pre-fix code path for each new/modified test).

---

_Fixed: 2026-07-07T21:20:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
