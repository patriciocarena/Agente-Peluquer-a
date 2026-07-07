---
phase: 06-agente-conversacional-de-agendamiento
reviewed: 2026-07-07T00:00:00Z
depth: standard
files_reviewed: 27
files_reviewed_list:
  - apps/bot/evals/dataset/conversations.json
  - apps/bot/evals/judge.test.ts
  - apps/bot/evals/judge.ts
  - apps/bot/evals/promptfooconfig.yaml
  - apps/bot/evals/responder.eval.test.ts
  - apps/bot/evals/traceAssertions.test.ts
  - apps/bot/evals/traceAssertions.ts
  - apps/bot/package.json
  - apps/bot/vitest.config.ts
  - apps/bot/src/conversation/conversationState.ts
  - apps/bot/src/conversation/conversationState.test.ts
  - apps/bot/src/conversation/systemPrompt.ts
  - apps/bot/src/conversation/buildBotAvailabilityData.ts
  - apps/bot/src/conversation/tools/buscarHorarios.ts
  - apps/bot/src/conversation/tools/buscarHorarios.test.ts
  - apps/bot/src/conversation/tools/asignarProfesional.ts
  - apps/bot/src/conversation/tools/asignarProfesional.test.ts
  - apps/bot/src/conversation/tools/consultarNegocio.ts
  - apps/bot/src/conversation/tools/consultarNegocio.test.ts
  - packages/availability-engine/src/index.ts
  - apps/bot/src/conversation/tools/confirmarTurno.ts
  - apps/bot/src/conversation/tools/confirmarTurno.test.ts
  - apps/bot/src/conversation/tools/reagendarTurno.ts
  - apps/bot/src/conversation/tools/reagendarTurno.test.ts
  - apps/bot/src/conversation/tools/cancelarTurno.ts
  - apps/bot/src/conversation/tools/cancelarTurno.test.ts
  - apps/bot/src/conversation/closingLanguage.ts
  - apps/bot/src/conversation/closingLanguage.test.ts
  - apps/bot/src/conversation/responder.ts
  - apps/bot/src/conversation/responder.test.ts
  - apps/bot/src/queue/inboundWorker.ts
  - apps/bot/src/queue/inboundWorker.test.ts
  - packages/availability-engine/src/booking.ts
  - packages/availability-engine/src/types.ts
  - packages/availability-engine/src/booking.test.ts
  - apps/dashboard/app/actions/turnos.ts
findings:
  critical: 3
  warning: 3
  info: 2
  total: 8
status: issues_found
---

# Phase 6: Code Review Report

**Reviewed:** 2026-07-07T00:00:00Z
**Depth:** standard
**Files Reviewed:** 27 (+ associated `*.test.ts`)
**Status:** issues_found

## Summary

Reviewed the conversational-agent foundation, the six agent tools, the shared
`cancelAppointment` addition to `@turnosbot/availability-engine`, the
tool-loop/anti-hallucination gate in `responder.ts`, and the evals layer
(dataset, deterministic trace assertions, LLM judge, promptfoo config).

The tenant-isolation pattern (closures over `negocioId`/`clienteId`, tools
never exposing those as model-fillable parameters) is applied consistently
and correctly for every **read** path (`buscarHorarios`, `asignarProfesional`,
`consultarNegocio`), and the snapshot/anti-cache/concurrency handling in
`booking.ts` (including the new `cancelAppointment`) is solid and well
tested.

However, three real defects were found, all in the highest-stakes area this
phase built — the D-12 anti-hallucination gate and the write-tool
authorization boundary:

1. The D-12 "no phantom confirmation" gate only recognizes
   `confirmarTurno`/`reagendarTurno` as tools that can legitimize closing
   language, but the closing-language lexicon (`closingLanguage.ts`) includes
   "listo", which is the literal wording the `cancelarTurno` tool itself
   returns on success (`CANCELADO_OK_COPY = "Listo, cancelamos tu turno."`).
   A model that naturally echoes "listo" after a *successful* cancellation
   trips the gate as a false positive, discarding a correct reply and
   incorrectly triggering permanent human handoff.
2. The same gate patches only the *outgoing* text (`finalText`), not the
   conversation state persisted for future turns — `result.response.messages`
   (containing the original, unfiltered phantom-confirmation text) is
   persisted verbatim into `conversacion.context.messages`, so the model's
   own future context asserts a booking happened that never did.
3. `cancelarTurno`/`reagendarTurno` (and the underlying
   `cancelAppointment`/`rescheduleAppointment` engine functions) scope
   writes only by `negocioId` + `turnoId`, never by the requesting
   `clienteId` — unlike every read tool (`consultarNegocio`), which
   deliberately scopes by `clienteId` to prevent cross-client disclosure
   within the same tenant. A customer who supplies (or is fed, via prompt
   injection / social engineering) another customer's real `turnoId` can
   cancel or reschedule that other customer's appointment.

## Critical Issues

### CR-01: D-12 gate false-positives on legitimate cancellation replies, discarding them and forcing human handoff

**File:** `apps/bot/src/conversation/responder.ts:66-68, 122-139, 192-209`
**Also relevant:** `apps/bot/src/conversation/closingLanguage.ts:27-34`, `apps/bot/src/conversation/tools/cancelarTurno.ts:47`

**Issue:** `CONFIRMING_TOOL_NAMES` (both in `responder.ts` and its offline
mirror `evals/traceAssertions.ts`) is `new Set(["confirmarTurno",
"reagendarTurno"])` — `cancelarTurno` is deliberately excluded, since
cancelling doesn't produce a `turno_id` that needs surfacing. But the shared
closing-language lexicon (`CLOSING_LANGUAGE_LEXICON`) includes `"listo"`,
and `cancelarTurno.ts`'s own success copy is literally
`"Listo, cancelamos tu turno."` (`CANCELADO_OK_COPY`). Nothing stops the
model from paraphrasing a *successful, tool-backed* cancellation with
"Listo, cancelamos tu turno" or "dale, quedó cancelado" — and `systemPrompt.ts`
line 42 actually invites this ("Todo dato que le das al cliente... tiene que
salir de una herramienta real" — a real, successful cancellation qualifies).

When that happens: `hasClosingLanguage(result.text)` is `true`, but
`extractRealTurnoId(result.steps)` returns `null` (because `cancelarTurno`
isn't in `CONFIRMING_TOOL_NAMES`, and even if it were, `cancelarTurno`'s own
`already_cancelled` branch returns `turnoId: ""`, which fails the `uuidLike`
check anyway). The gate then:
- silently replaces the customer's correct "your appointment is cancelled"
  reply with `SAFE_FALLBACK_MESSAGE` ("Dame un segundo que verifico y te
  confirmo 🙌") — a nonsensical message to send immediately *after* a
  cancellation already succeeded in the DB, and
- sets `needsHuman = true`, permanently pausing the bot for that thread
  (D-11) even though nothing went wrong.

This is not a hypothetical: `evals/responder.eval.test.ts`'s hand-written
`TEXTOS_MODELO["cf-04"]` for the cancellation happy-path case was
deliberately written as `"Dale, tu turno del viernes queda cancelado."` —
avoiding every word in the lexicon — so this exact interaction is never
exercised by the eval suite or `responder.test.ts`/`cancelarTurno.test.ts`,
leaving the gap uncaught.

**Fix:** Add `cancelarTurno` to a lexicon-allowance set (it doesn't need a
`turnoId`, just a successful `ok:true` tool-result in the same turn), e.g.:

```ts
// closingLanguage.ts / responder.ts / traceAssertions.ts
const WRITE_TOOL_NAMES_THAT_LEGITIMIZE_CLOSING_LANGUAGE = new Set([
  "confirmarTurno",
  "reagendarTurno",
  "cancelarTurno",
]);

function hasSuccessfulWrite(steps: ResponderGenerateTextResult["steps"]): boolean {
  for (const step of steps) {
    for (const toolResult of step.toolResults ?? []) {
      if (!WRITE_TOOL_NAMES_THAT_LEGITIMIZE_CLOSING_LANGUAGE.has(toolResult.toolName)) continue;
      const output = toolResult.output as { ok?: boolean } | undefined;
      if (output?.ok === true) return true;
    }
  }
  return false;
}
```
and gate on `closingLanguageDetected && !turnoIdReal && !hasSuccessfulCancel`
(keeping the stricter `uuidLike` turno_id requirement for
`confirmarTurno`/`reagendarTurno`, since those are the ones that can
hallucinate a *booking* that doesn't exist — cancellation has no id to
hallucinate). Add a dataset case (or extend `cf-04`) where the synthetic
model text uses "listo"/"cancelado" wording to lock in the fix.

### CR-02: D-12 gate patches the outgoing text but persists the unfiltered phantom text into conversation history

**File:** `apps/bot/src/conversation/responder.ts:192-218`

**Issue:**

```ts
const turnoIdReal = extractRealTurnoId(result.steps);
const closingLanguageDetected = hasClosingLanguage(result.text);

let finalText = result.text;
let needsHuman = false;

if (closingLanguageDetected && !turnoIdReal) {
  finalText = SAFE_FALLBACK_MESSAGE;
  needsHuman = true;
}

const newContext = serializeConversationContext({
  messages: [...history, ...result.response.messages],   // <-- unfiltered
  needsHuman,
});
```

`finalText` is what gets returned (and what `inboundWorker.ts` actually sends
to the customer and records in the `mensaje` table). But the persisted
conversation state fed back into the *next* `generateText` call is built
from `result.response.messages` — the AI SDK's raw response, which still
contains the model's original assistant text (the phantom confirmation,
e.g. "Listo, quedaste el sábado a las 15hs"), never the substituted
`SAFE_FALLBACK_MESSAGE`.

Consequence: the customer-facing audit trail (`mensaje` table) and the
model-facing memory (`conversacion.context.messages`) diverge. If this
thread is ever handed back to the bot after human intervention (the whole
point of D-11's pause/resume design), the model's own history asserts a
turno was confirmed that was never actually created — it may skip
re-offering a real booking, or reference a `turno_id`/time that doesn't
exist, compounding exactly the hallucination D-12 exists to prevent, just
one turn later and now baked into ground truth.

**Fix:** When the gate fires, replace the assistant's text in the persisted
messages with `finalText` before serializing, e.g.:

```ts
const messagesToPersist = closingLanguageDetected && !turnoIdReal
  ? replaceLastAssistantText(result.response.messages, finalText)
  : result.response.messages;

const newContext = serializeConversationContext({
  messages: [...history, ...messagesToPersist],
  needsHuman,
});
```
where `replaceLastAssistantText` swaps the trailing assistant text part(s)
for `finalText` (keeping any tool-call/tool-result parts intact, since those
correctly show `ok:false`/no confirming call and are useful context).

### CR-03: `cancelarTurno`/`reagendarTurno` never verify the turno belongs to the requesting cliente — cross-client tampering within the same tenant

**File:** `apps/bot/src/conversation/tools/cancelarTurno.ts:87-108`, `apps/bot/src/conversation/tools/reagendarTurno.ts:92-129`
**Also relevant:** `packages/availability-engine/src/booking.ts:463-508` (`cancelAppointment`), `packages/availability-engine/src/booking.ts:357-423` (`rescheduleAppointment`)

**Issue:** Both write tools accept `clienteId` in their factory signature
purely "for parity" (`void clienteId; // reservado para paridad de firma`)
and never use it to scope the write. The actual scoping performed by
`cancelAppointment`/`rescheduleAppointment` is `negocioId` + `turnoId` only:

```ts
// booking.ts, cancelAppointment
.eq("id", input.turnoId)
.eq("negocio_id", input.negocioId)
.neq("estado", "cancelado")
```

Contrast this with `consultarNegocio.ts`'s `estado_turno` branch, which is
explicitly scoped by the closure-captured `clienteId` (T-06-07/T-06-08) so a
customer can never read another customer's turno at the same negocio. The
two write tools don't apply the equivalent defense-in-depth: any `turnoId`
belonging to *any* customer of the same negocio can be cancelled or
rescheduled by *any other* customer's WhatsApp conversation, as long as the
model is induced to call the tool with that id (e.g. a customer pasting a
friend's confirmation text/UUID into the chat, or a targeted prompt-injection
attempt — a variant of `adv-04` in the eval dataset, which only tests the
*read*-disclosure angle, not the write-tampering angle).

The code comments acknowledge this is a deliberate choice, justified by
analogy to the dashboard ("mismo modelo de confianza que el dashboard, donde
el owner tampoco filtra por cliente_id") — but that analogy doesn't hold:
the dashboard actor is an authenticated business owner/staff member trusted
to manage every customer's bookings; the bot actor is an anonymous WhatsApp
customer who should only ever be able to touch their own appointment. This
is exactly the class of bug this phase's own design doctrine (D-13/BOT-11:
"tools must be scoped by negocioId, never trust model-supplied ids") was
meant to close, and here it's only half-closed.

**Fix:** Scope both writes by `clienteId` too — either pass it through to
`cancelAppointment`/`rescheduleAppointment` (extending
`CancelAppointmentInput`/`RescheduleAppointmentInput` with an optional
`clienteId` used as an additional `.eq("cliente_id", ...)` filter when
present, so the dashboard's owner-initiated calls can still omit it), or
have the bot tools pre-check ownership before calling the engine:

```ts
// cancelarTurno.ts
execute: async (input) => {
  const db = negocioScoped(negocioId); // or reuse existing scoped client
  const { data: turno } = await db.turnos(); // already scoped by negocio_id
  const own = turno?.find((t) => t.id === input.turnoId && t.cliente_id === clienteId);
  if (!own) {
    return { ok: false, mensaje: GENERIC_ERROR_COPY }; // don't leak not_found vs wrong-owner
  }
  const result = await deps.cancelAppointment({ negocioId, turnoId: input.turnoId }, { supabase: deps.supabase });
  return mapCancelAppointmentResult(result);
},
```
Add an adversarial eval case exercising this (customer supplies a foreign,
valid-shaped `turnoId` and asks the bot to cancel/reagendar it) alongside
`adv-04`.

## Warnings

### WR-01: `buildBotAvailabilityData` can silently load the wrong negocio's row for multi-location tenants

**File:** `apps/bot/src/conversation/buildBotAvailabilityData.ts:44-53`

**Issue:** The function's own comment documents that `negocioScoped(negocioId).negocio()`
filters by `tenant_id`, not `id` (a pre-existing quirk of `negocioScoped.ts`,
not introduced this phase), and can return more than one row "si el tenant
tiene varios negocios" — then simply takes `.data?.[0]` with no check that
the returned row's `id` actually equals the `negocioId` this function was
asked to build data for:

```ts
const negocio = negocioRes.data?.[0];
if (negocioRes.error || !negocio) { throw ... }
return { ..., negocio };
```

For any tenant that owns more than one `negocio` (multiple shop locations —
plausible for this SaaS's target market as it scales), this can hand back
the wrong business's `timezone`/`granularidad_min`/name to `computeSlots`,
`bookAppointment`, and everything downstream — a silent cross-location data
mixup, not merely a performance concern.

**Fix:** Assert the row matches before returning, and fail loudly rather
than guessing:

```ts
const negocio = negocioRes.data?.find((n) => n.id === negocioId);
if (negocioRes.error || !negocio) {
  throw new Error(
    `buildBotAvailabilityData: no se pudo cargar el negocio esperado (negocioId=${negocioId}): ${negocioRes.error?.message ?? "no matching row"}`,
  );
}
```
(Longer term, this points at fixing `negocioScoped.ts#negocio()` itself to
filter by `id`, but that's outside this phase's file set.)

### WR-02: Cancellation's `turnoId: ""` sentinel is a fragile stand-in for "no id"

**File:** `apps/bot/src/conversation/tools/cancelarTurno.ts:43-45, 60-61`

**Issue:** `CancelarTurnoResult`'s `ok: true` variant types `turnoId` as a
plain (non-optional) `string`, but the `already_cancelled` branch returns
`turnoId: ""` as a sentinel for "there's no real id to report." Nothing
currently consumes this value expecting a real UUID (D-12's
`extractRealTurnoId` never inspects `cancelarTurno`), so it's latent rather
than actively wrong today — but it's a landmine for the next person who
extends the D-12 allowance list (see CR-01's suggested fix) without noticing
that `cancelarTurno`'s `ok:true` doesn't always carry a meaningful
`turnoId`.

**Fix:** Make the field honestly optional (`turnoId?: string`) so a future
consumer can't accidentally treat `""` as a real id:

```ts
export type CancelarTurnoResult =
  | { ok: true; turnoId?: string; mensaje: string }
  | { ok: false; mensaje: string };
```

### WR-03: promptfoo's copy of the system prompt is a hand-maintained duplicate with no automated drift check

**File:** `apps/bot/evals/promptfooconfig.yaml:53-74`

**Issue:** The `prompts` block re-states D-01/05/06/08/12/13 in prose,
independent of `buildSystemPrompt()` in `systemPrompt.ts`. The file's own
header comment acknowledges this and mandates updating both in the same PR,
but nothing enforces it mechanically — a future change to
`systemPrompt.ts`'s wording (e.g., adding a new closing-language word, or
loosening a domain boundary) can silently desync from what this nightly/
gated regression actually exercises, and CI won't catch the drift because
this suite doesn't import `systemPrompt.ts` at all.

**Fix:** At minimum, have this file assert its own freshness with a small
unit test that imports `buildSystemPrompt()` and checks the key guardrail
phrases (D-12 lexicon words, D-13 framing sentence) still appear verbatim in
`systemPrompt.ts`'s output, so a wording change trips a test rather than
silently invalidating the nightly promptfoo run.

## Info

### IN-01: `ESTADOS_QUE_BLOQUEAN_CONSULTA` is a single string dressed as a "states" collection

**File:** `apps/bot/src/conversation/tools/consultarNegocio.ts:28, 134`

**Issue:** The name suggests a set/array of blocking states, but it's one
string (`"cancelado"`) compared with `!==`. Harmless today, but the name
invites someone to `.includes()` it later and get a `TypeError`, or to add a
second blocked state directly to the string.

**Fix:** Either rename to `ESTADO_QUE_BLOQUEA_CONSULTA` (singular) or make it
an actual array/set if more than one state is ever expected to be excluded:
```ts
const ESTADOS_QUE_BLOQUEAN_CONSULTA = new Set(["cancelado"]);
// ...
.filter((turno) => turno.cliente_id === clienteId && !ESTADOS_QUE_BLOQUEAN_CONSULTA.has(turno.estado))
```

### IN-02: `reagendarTurno`'s `serviceIds` lookup silently degrades to an empty array for an unknown/foreign `turnoId`

**File:** `apps/bot/src/conversation/tools/reagendarTurno.ts:103-107`

**Issue:**
```ts
const { data: turnoServiciosData } = await db.turnoServicios();
const serviceIds = (turnoServiciosData ?? [])
  .filter((ts) => ts.turno_id === input.turnoId)
  .map((ts) => ts.servicio_id);
```
If `input.turnoId` doesn't match any row (foreign/garbage id), `serviceIds`
is `[]`, which happens to be caught downstream by
`rescheduleAppointmentInputSchema`'s `.min(1, ...)` — but that's incidental:
the error surfaced to the model in that case is a generic
`validation_error` → `GENERIC_ERROR_COPY`, not a clear "ese turno no existe"
signal, and a future refactor that changes how `serviceIds` is validated
could silently proceed with zero services. Combined with CR-03 above, this
is also the only thing currently standing between a foreign `turnoId` and a
`rescheduleAppointment` call for a customer's own conversation.

**Fix:** Fail fast and explicitly when no matching `turno_servicio` rows are
found, independent of the eventual `rescheduleAppointment` validation:
```ts
if (serviceIds.length === 0) {
  return { ok: false, mensaje: GENERIC_ERROR_COPY };
}
```

---

_Reviewed: 2026-07-07T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
