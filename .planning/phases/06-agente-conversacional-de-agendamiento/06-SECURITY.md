---
phase: 6
slug: agente-conversacional-de-agendamiento
status: complete
threats_open: 0
threats_closed: 26
asvs_level: 2
created: 2026-07-08
---

# Security Audit — Phase 6 (agente conversacional de agendamiento)

**Audit date:** 2026-07-08
**Auditor:** gsd-security-auditor (read-only verification against implemented code)
**ASVS Level:** 2
**block_on:** high
**Scope:** threat_model blocks authored in 06-01-PLAN.md … 06-06-PLAN.md, verified against the implementation in `apps/bot/src/conversation/`, `apps/bot/src/queue/inboundWorker.ts`, `apps/bot/src/db/`, `packages/availability-engine/src/`, `apps/bot/evals/`.

Full test suites re-run as part of verification (not just static grep):
- `apps/bot`: 23 files, 207 tests passed.
- `packages/availability-engine`: 7 files, 60 tests passed.

## Threat Verification

| Threat ID | Category | Disposition | Status | Evidence |
|-----------|----------|-------------|--------|----------|
| T-06-01 | Tampering | mitigate | CLOSED | `packages/availability-engine/src/booking.ts:478-483` — `cancelAppointment` UPDATE filters `.eq("id", turnoId).eq("negocio_id", negocioId)`; an id from another negocio never matches → `not_found`. |
| T-06-02 | Tampering | mitigate | CLOSED | `booking.ts:483` `.neq("estado","cancelado")` guard + `already_cancelled` branch (`booking.ts:504-507`); no `DELETE` on the cancel path anywhere in the codebase. |
| T-06-03 | Tampering | mitigate | CLOSED | `booking.ts:108-111` `cancelAppointmentInputSchema` uses `uuidLike` (shape-only UUID regex, `booking.ts:77-82`), rejecting non-UUID `turnoId`/`negocioId` at the package boundary. |
| T-06-04 | EoP / InfoDisc | mitigate | CLOSED | `apps/bot/src/conversation/systemPrompt.ts` never interpolates `negocioId` (grep confirmed 0 matches); real defense is structural (negocioScoped), documented explicitly in the file header. |
| T-06-05 | InfoDisc | mitigate | CLOSED | `apps/bot/src/conversation/buildBotAvailabilityData.ts` — all 5 reads go through `negocioScoped(negocioId)`; `grep supabaseAdmin.from` on this file and on `apps/bot/src/conversation/**`/`apps/bot/src/queue/**` (excluding negocioScoped.ts/client.ts) returns 0 matches. |
| T-06-06 | Tampering | mitigate | CLOSED | `apps/bot/src/conversation/conversationState.ts:31-45` `parseConversationContext` — defensive typeof/Array.isArray checks, falls back to `{messages:[], needsHuman:false}` on any malformed shape, never throws. |
| T-06-07 | InfoDisc | mitigate | CLOSED | `apps/bot/src/conversation/tools/consultarNegocio.ts:171-173` — `estado_turno` filters `turno.cliente_id === clienteId` where `clienteId` is a closure parameter (`consultarNegocioTool(negocioId, clienteId, ...)`), never a field of `consultarNegocioInputSchema`. |
| T-06-08 | EoP | mitigate | CLOSED | `negocioId` absent from every read-tool `inputSchema` (`buscarHorarios.ts`, `consultarNegocio.ts`); structural tests assert this directly: `buscarHorarios.test.ts:147-148`, `consultarNegocio.test.ts:260-262` (`expect(Object.keys(shape)).not.toContain("negocioId")`). |
| T-06-09 | Tampering | mitigate | CLOSED | `uuidLike` used for all id fields + `/^\d{4}-\d{2}-\d{2}$/` regex for `fechaDeseada` in `buscarHorarios.ts:35-42`; same `uuidLike` reused (not re-declared) in `confirmarTurno.ts`, `reagendarTurno.ts`, `cancelarTurno.ts`. |
| T-06-10 | InfoDisc | mitigate | CLOSED | `consultarNegocio.ts:182-189` — `estado_turno` servicios read `ts.nombre_snapshot/precio_snapshot/duracion_snapshot`, never a live join to `servicio.precio`. |
| T-06-11 | Repudiation/Tampering | mitigate | CLOSED | `apps/bot/src/conversation/tools/confirmarTurno.ts:52-74` — `ok:true` branch carries the real `turnoId` from `bookAppointment`; every error branch (`slot_taken`, default) omits `turnoId` entirely (type-level: `{ok:false; mensaje:string}` has no `turnoId` field). |
| T-06-12 | Tampering | mitigate | CLOSED | `booking.ts:261-276` re-validates the requested slot against fresh `computeSlots` immediately before insert (anti-cache); `booking.ts:297-301` maps SQLSTATE `23P01` (GiST exclusion violation) to `{ok:false, reason:"slot_taken"}` without retry. |
| T-06-13 | Tampering | mitigate | CLOSED | `cancelarTurno.ts:122-129` delegates 100% to the shared `cancelAppointment`; grep for inline `.from("turno").update` inside `cancelarTurno.ts` returns 0 matches. |
| T-06-14 | EoP | mitigate | CLOSED | `negocioId`/`clienteId` are constructor params of every write-tool factory (`confirmarTurnoTool`, `reagendarTurnoTool`, `cancelarTurnoTool`, `guardarNombreClienteTool`), never fields of their `inputSchema`s; structural tests confirm (`confirmarTurno.test.ts:127-129`, `cancelarTurno.test.ts:158-159`, `reagendarTurno.test.ts:206-207`). |
| T-06-15 | Tampering | mitigate | CLOSED (matches declared disposition exactly) | Plan explicitly declared this as a soft (prompt + offline-eval) mitigation, not a runtime code gate: `systemPrompt.ts` D-08 section ("Cancelaciones (confirmación explícita)", lines 97-98) instructs explicit confirmation; offline reinforcement via `apps/bot/evals/traceAssertions.ts:190-211` (`assertConfirmBeforeCancel`, E5) fails the trace if `cancelarTurno` succeeds against a message dataset-labeled as ambiguous/unconfirmed. No runtime code blocks premature cancellation — this is the mitigation as authored, not a gap. |
| T-06-16 | Repudiation/Tampering | mitigate | CLOSED | `apps/bot/src/conversation/responder.ts:282-313` — `extractRealTurnoId(result.steps)` scans tool results (never `result.text`) for a real UUID `turnoId` from `confirmarTurno`/`reagendarTurno`; gate substitutes `SAFE_FALLBACK_MESSAGE` and sets `needsHuman=true` when closing language is detected without a real turnoId or successful cancel. Lexicon sourced from single `closingLanguage.ts`. |
| T-06-17 | EoP/InfoDisc | mitigate | CLOSED | `responder.ts:104-114,214` — `buildResponderTools(negocioId, clienteId)` closes over both ids and is called before `deps.generateText(...)` (line 240); no tool's `inputSchema` receives either id from the model. |
| T-06-18 | DoS | mitigate | CLOSED | `responder.ts:244` `stopWhen: isStepCount(6)`. |
| T-06-19 | Tampering | mitigate | CLOSED | `apps/bot/src/queue/inboundWorker.ts:132-139` — `needsHuman` is parsed from `conversacion.context` and checked BEFORE `deps.responder(...)` is ever called (line 159); the skip is enforced by the worker, structurally outside the model's control (the model has no path to unset an already-active `needsHuman`). |
| T-06-20 | InfoDisc | mitigate | CLOSED | `responder.ts:250-280` try/catch distinguishes `NoSuchToolError`/`InvalidToolInputError`/generic error via distinct log messages; on any of these, the function returns `SAFE_FALLBACK_MESSAGE` and sets `needsHuman:true` — never narrates an error as a successful confirmation. |
| T-06-21 | EoP/Tampering | mitigate | CLOSED | `grep -n "eval(\|new Function"` across `traceAssertions.ts`, `dataset/*.json`, `judge.ts`, `promptfooconfig.yaml` returns 0 matches; dataset confirmed as valid inert JSON (`python3 json.load` succeeds, 20 records, no executable content); `judge.ts:68-73` explicit anti-injection framing treats transcript/tool-results as DATA. |
| T-06-22 | InfoDisc | mitigate | CLOSED | `GOOGLE_GENERATIVE_AI_API_KEY` read only from `process.env` (`apps/bot/src/config/env.ts:42`, `@ai-sdk/google` internals); grep for the key literal / `AIza` prefix in `dataset/conversations.json` and `promptfooconfig.yaml` returns 0 real-secret matches (only a fake test-only literal `AIzaFAKE_TEST_KEY_DO_NOT_USE` in `judge.test.ts`, deleted after the test). `promptfooconfig.yaml:48` interpolates `{{ env.GOOGLE_GENERATIVE_AI_API_KEY }}`, never hardcodes. |
| T-06-23 | Repudiation | mitigate | CLOSED | `apps/bot/evals/judge.ts:8-15` explicit calibration-gate comment: judge is ADVISORY until ≥0.7 correlation against ≥15 human labels is reached; hard PASS/FAIL decisions are made by the deterministic helpers in `traceAssertions.ts` (E1/E3/E4/E5), never by `judge()`. |
| T-06-24 | DoS | mitigate | CLOSED (with note) | `responder.eval.test.ts`, `judge.test.ts`, `promptfooconfig.test.ts` are 100% mocked (`vi.fn()`-injected `generateText`, explicit "CERO llamadas a Gemini live" comments) and run via plain `vitest run`; the real-Gemini `promptfoo eval` command is documented as manual-only (`promptfooconfig.yaml:21`, not wired into any npm script or test file) — no automated path exists that could burn the free-tier quota. **Note:** no `.github/workflows` (or any CI config) exists anywhere in the repo, so the "nightly/on-change" CI *schedule* described in the plan is not actually implemented yet — this doesn't currently create risk (there is no automation at all that could trigger the paid/quota-limited path), but flagging since the plan's literal claim of scheduled CI gating is aspirational, not present in code. |
| T-06-SC (06-02) | Tampering | accept | CLOSED (risk logged below) | `.planning/phases/06-agente-conversacional-de-agendamiento/06-RESEARCH.md:32-47` "Package Legitimacy Audit" — `ai`, `@ai-sdk/google`, `zod`, `promptfoo` manually cross-verified against npm registry + official repos, no postinstall scripts, long-established packages; `promptfoo` (installed later in plan 06-06) was pre-audited here. Logged in Accepted Risks Log below. |
| T-06-SC (06-01/03/04/05/06) | Tampering | mitigate | CLOSED | Confirmed via `apps/bot/package.json` — only dependencies present are the ones audited above (`ai`, `@ai-sdk/google`, `@turnosbot/availability-engine`, `zod`, plus devDeps `promptfoo`/`tsx`/`typescript`/`vitest`/`@types/node`); no plan besides 06-02/06-06 modifies `package.json` dependencies. |

**Closed: 26/26 threat entries** (24 numbered threats T-06-01..T-06-24, plus 2 T-06-SC package-install entries).

## Unregistered Flags

None. All 6 phase-6 SUMMARY.md files were checked for a `## Threat Flags` section (`grep -n "Threat Flag"`) — none present, matching the prompt's stated context. No new attack surface was identified outside the declared threat register during verification (structural checks — direct `supabaseAdmin.from`/`.from(` usage — were run across `apps/bot/src/conversation/`, `apps/bot/src/queue/`, and all tool files, and turned up clean).

## Accepted Risks Log

- **T-06-SC (06-02):** Accepted 2026-07-08. `ai@^7.0.16`, `@ai-sdk/google@^4.0.8`, `zod@^4.4.3`, `promptfoo@^0.121.17` installed without a `slopcheck` automated scan (tool unavailable in the research environment — `pip install slopcheck` failed with no index access). Manual verification performed instead: npm registry age/downloads, official GitHub repo cross-reference, absence of `postinstall` scripts (all confirmed in `06-RESEARCH.md` Package Legitimacy Audit table). Residual risk: a supply-chain compromise of any of these 4 packages between the 06-RESEARCH.md audit date and install time would not have been caught by this manual process. Accepted as low-risk given these are high-adoption, long-history packages already locked in `CLAUDE.md`'s Technology Stack.

## Notes / Non-blocking Observations

1. **T-06-24 CI schedule not yet implemented.** No `.github/workflows` or equivalent CI config exists in this repo. The "trace assertions mocked on every PR; judge/promptfoo nightly/on-change only" gating described in the plan and in `promptfooconfig.yaml`'s header comment is currently enforced only by convention (manual command, not wired to any script) rather than by an actual CI schedule. This does not create present risk (nothing automated can trigger the paid/quota path), but should be closed out when CI is actually set up for this repo — verify at that time that the workflow file matches the on-change/nightly trigger paths documented in `promptfooconfig.yaml`.
2. **Out-of-phase-6 observation (not a phase-6 threat, no action required here):** `apps/bot/src/whatsapp/getWhatsappToken.ts` uses `supabaseAdmin.from("negocio")` directly (outside `negocioScoped`), scoped by `.eq("id", negocioId)` on the negocio's own primary key — same single-row-by-PK pattern that `negocioScoped.ts` itself documents as the correct one for the `negocio` table. This is Phase 5 code, out of Phase 6's threat register scope, and not re-audited here.
