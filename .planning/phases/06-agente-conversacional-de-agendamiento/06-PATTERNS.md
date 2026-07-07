# Phase 6: Agente conversacional de agendamiento - Pattern Map

**Mapped:** 2026-07-07
**Files analyzed:** 12 (new/modified)
**Analogs found:** 12 / 12

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `apps/bot/src/conversation/responder.ts` (REPLACE body) | service (orchestrator) | request-response | itself (Fase 5 stub) + `packages/availability-engine/src/booking.ts` (deps-injection shape) | exact (same file/contract) |
| `apps/bot/src/conversation/systemPrompt.ts` (NEW) | utility (prompt builder) | transform | none (net-new concern) — closest structural analog is a pure formatter like `autoAssign.ts` (pure function, no I/O) | role-match |
| `apps/bot/src/conversation/conversationState.ts` (NEW) | utility (parse/serialize) | transform | `apps/bot/src/whatsapp/payload.ts` (`extractFirstMessage`/`extractPhoneNumberId` — defensive parsing of a loosely-typed JSON payload with safe defaults) | role-match |
| `apps/bot/src/conversation/tools/buscarHorarios.ts` (NEW) | service (tool wrapper) | CRUD (read) | `apps/dashboard/lib/availability-data.ts` (`buildAvailabilityData` — assembles `AvailabilityData` for `computeSlots`) + `packages/availability-engine/src/computeSlots.ts` (the wrapped function) | role-match |
| `apps/bot/src/conversation/tools/asignarProfesional.ts` (NEW) | service (tool wrapper) | transform | `packages/availability-engine/src/autoAssign.ts` (the wrapped pure function) | exact |
| `apps/bot/src/conversation/tools/confirmarTurno.ts` (NEW) | service (tool wrapper) | CRUD (write) | `packages/availability-engine/src/booking.ts` `bookAppointment` (the wrapped function) + `apps/dashboard/app/actions/turnos.ts` `crearTurnoManual` (caller pattern: fetch freshData, call, map result) | exact |
| `apps/bot/src/conversation/tools/reagendarTurno.ts` (NEW) | service (tool wrapper) | CRUD (write) | `packages/availability-engine/src/booking.ts` `rescheduleAppointment` + `apps/dashboard/app/actions/turnos.ts` `reagendarTurno` (caller pattern) | exact |
| `apps/bot/src/conversation/tools/cancelarTurno.ts` (NEW) | service (tool wrapper) | CRUD (write) | `packages/availability-engine/src/booking.ts` `rescheduleAppointment` (structural sibling to model `cancelAppointment` on) + `apps/dashboard/app/actions/turnos.ts` `cancelarTurno` (current inline UPDATE to migrate away from) | role-match |
| `packages/availability-engine/src/booking.ts` (MODIFY — add `cancelAppointment`) | service (domain function) | CRUD (write) | `rescheduleAppointment` in the same file (closest sibling: UPDATE by id + negocio_id, no re-derivation) | exact |
| `packages/availability-engine/src/types.ts` (MODIFY — add `CancelAppointmentInput`) | model (type contract) | transform | `RescheduleAppointmentInput` in the same file | exact |
| `packages/availability-engine/src/index.ts` (MODIFY — export `cancelAppointment`) | config (barrel) | transform | existing `rescheduleAppointment` export lines | exact |
| `apps/bot/src/db/negocioScoped.ts` (MODIFY — optionally add turno write accessor) | model (data-access layer) | CRUD | `updateConversacion` accessor in the same file | exact |
| `apps/bot/src/queue/inboundWorker.ts` (MODIFY — call site + D-12 gate + needsHuman skip) | controller (queue worker) | event-driven | itself (Fase 5 orchestration, unchanged shape) | exact (same file) |
| `apps/dashboard/app/actions/turnos.ts` (MODIFY — `cancelarTurno` migrates to shared `cancelAppointment`) | controller (Next.js Server Action) | request-response | `reagendarTurno` in the same file (already delegates to the shared engine function — the pattern `cancelarTurno` must adopt) | exact |
| `apps/bot/package.json` (MODIFY — add `ai`, `@ai-sdk/google`, `@turnosbot/availability-engine`) | config | — | current `dependencies` block | exact |
| `apps/bot/src/conversation/tools/*.test.ts` (NEW, per tool) | test | request-response | `packages/availability-engine/src/booking.test.ts` (mocked-deps unit test style) | role-match |
| `packages/availability-engine/src/booking.test.ts` (MODIFY — add `cancelAppointment` cases) | test | CRUD | existing `describe("rescheduleAppointment (D-14)", ...)` block in same file | exact |
| `apps/bot/src/conversation/responder.test.ts` (REWRITE) | test | request-response | itself (Fase 5 stub test, to be replaced entirely) | exact (same file) |

## Pattern Assignments

### `apps/bot/src/conversation/responder.ts` (service, request-response)

**Analog:** itself (current stub) + `packages/availability-engine/src/booking.ts` for the deps-injection idiom.

**Current file in full** (contract to preserve — signature is locked by the header comment, D-02):
```typescript
// Source: apps/bot/src/conversation/responder.ts, lines 1-19
/**
 * apps/bot/src/conversation/responder.ts — the Phase 6 swap point (D-02).
 *
 * Phase 5: deterministic stub. Phase 6 replaces the BODY of this function
 * (Vercel AI SDK + Gemini agent) WITHOUT changing this signature or any
 * call site — the worker (plan 05-05) and every future caller only ever
 * import and call `responder(conversacion, mensajeEntrante)`. This
 * single-point-of-replacement is the entire reason the worker calls
 * `responder(...)` here instead of inlining a reply: swapping in the real
 * LLM agent later is a one-file change.
 */
import type { Tables } from "@turnosbot/db-types";

export async function responder(
  conversacion: Tables<"conversacion">,
  mensajeEntrante: string,
): Promise<string> {
  return "¡Hola! Recibimos tu mensaje 🙌 En breve te ayudamos a reservar tu turno.";
}
```

**Recommendation (per RESEARCH.md Pitfall 2/6, A1/A2):** keep the positional signature `responder(conversacion, mensajeEntrante)` and derive `negocioId = conversacion.negocio_id`, `clienteId = conversacion.cliente_id`, `history = parseConversationContext(conversacion.context).messages` inside the body. Put the D-12 gate INSIDE `responder.ts` (option a of Pitfall 6) so the return type stays `Promise<string>` and `inboundWorker.ts`'s call site (line 140) needs zero signature changes.

**Deps-injection idiom to copy** (so `generateText`/Gemini can be mocked in tests, mirrors `BookAppointmentDeps`):
```typescript
// Source: packages/availability-engine/src/booking.ts, lines 177-190
export interface BookAppointmentDeps {
  supabase: SupabaseClient<Database>;
  freshData: AvailabilityData;
  now?: number;
}
```
Apply the same shape to `responder.ts`: an optional `deps` param whose default wires the real `negocioScoped`, real `google("gemini-2.5-flash-lite")` model, and real tool `execute` functions — exactly like `ProcessInboundWhatsappEventDeps` below.

**Result-type/error-branch idiom to copy** (discriminated union, no throw for expected outcomes):
```typescript
// Source: packages/availability-engine/src/booking.ts, lines 192-196
export type BookAppointmentResult =
  | { ok: true; turnoId: string; precioTotal: number }
  | { ok: false; reason: "validation_error"; issues: string[] }
  | { ok: false; reason: "slot_taken" }
  | { ok: false; reason: "insert_error"; message: string };
```
Apply the analogous idea to the D-12 gate's internal check: branch on `result.steps` for a real `turno_id` before allowing closing language in the returned string, else substitute a safe fallback message and mark `needsHuman`.

---

### `apps/bot/src/conversation/conversationState.ts` (utility, transform)

**Analog:** `apps/bot/src/whatsapp/payload.ts` pattern of defensive parsing with safe defaults (referenced in RESEARCH.md Pitfall 4 as the model to follow — same "never throw on unexpected/empty shape" discipline as `findOrCreateConversacion.ts`'s documented open `context: {}` contract).

**Contract to honor** (from `findOrCreateConversacion.ts`, lines 11-19):
```typescript
// Source: apps/bot/src/conversation/findOrCreateConversacion.ts, lines 11-19
 * Pitfall 8: the `context` column written on create is intentionally the
 * minimal `{}` shape. Phase 5 does NOT define what goes inside it — Phase 6
 * (the Vercel AI SDK agent) owns extending `context` (e.g. conversation
 * history, in-progress booking state). Stating this contract explicitly
 * here — rather than leaving it implicit — is the whole point of this
 * comment: Phase 6 must not assume any particular shape beyond "valid JSON
 * object" when it starts reading/writing this column.
```

**Required shape** (per RESEARCH.md "Conversation State Schema"):
```typescript
interface ConversationContext {
  messages: ModelMessage[]; // AI SDK v7 ModelMessage[], persisted from result.response.messages
  needsHuman: boolean;      // D-11 handoff flag
}
```

`parseConversationContext(context: Json)` MUST default to `{ messages: [], needsHuman: false }` for any empty/malformed shape (never throw) — same defensive posture as `extractFirstMessage`/`extractPhoneNumberId` in `payload.ts` returning `null`/safe fallback rather than throwing on a malformed webhook body.

---

### `apps/bot/src/conversation/tools/buscarHorarios.ts` (service/tool wrapper, CRUD read)

**Analog:** `apps/dashboard/lib/availability-data.ts` `buildAvailabilityData` (assembling `AvailabilityData`) wrapping `packages/availability-engine/src/computeSlots.ts`'s `computeSlots`.

**Imports/assembly pattern to copy** (adapted to bot's `negocioScoped` instead of dashboard's RLS client):
```typescript
// Source: apps/dashboard/lib/availability-data.ts, lines 24-55
import type { AvailabilityData, TurnoServicioRow } from "@turnosbot/availability-engine";

export async function buildAvailabilityData(negocioId: string): Promise<AvailabilityData> {
  const [horariosRes, bloqueosRes, turnosRes, serviciosRes, negocioRes] = await Promise.all([
    supabase.from("horario_trabajo").select("*").eq("negocio_id", negocioId),
    supabase.from("bloqueo").select("*").eq("negocio_id", negocioId),
    supabase.from("turno").select("*").eq("negocio_id", negocioId),
    supabase.from("servicio").select("*").eq("negocio_id", negocioId),
    supabase.from("negocio").select("*").eq("id", negocioId).single(),
  ]);
  if (negocioRes.error || !negocioRes.data) {
    throw new Error("Hubo un problema al cargar la agenda. Recargá la página o intentá más tarde.");
  }
  return {
    horarios: horariosRes.data ?? [],
    bloqueos: bloqueosRes.data ?? [],
    turnos: turnosRes.data ?? [],
    servicios: serviciosRes.data ?? [],
    negocio: negocioRes.data,
  };
}
```
For the bot, replace each raw `supabase.from(...).eq("negocio_id", negocioId)` call with the equivalent `negocioScoped(negocioId).X()` accessor (`horariosTrabajo()`, `bloqueos()`, `turnos()`, `servicios()`, `negocio()` — note `negocio()` filters by `tenant_id`, see Pitfall 3 below) — this is the D-13/CORE-03 isolation guarantee applied to the new read path.

**inputSchema pattern to copy** (uuidLike, never `negocioId` as a tool param — see Shared Patterns):
```typescript
// Source: packages/availability-engine/src/booking.ts, lines 72-86
const uuidLike = z
  .string()
  .regex(
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
    "UUID inválido",
  );
```
Import `uuidLike` from `@turnosbot/availability-engine` if exported, or replicate exactly (RESEARCH.md explicitly warns against `z.uuid()` strict, which rejects real seed/fixture UUIDs the DB already accepts).

---

### `apps/bot/src/conversation/tools/asignarProfesional.ts` (service/tool wrapper, transform)

**Analog:** `packages/availability-engine/src/autoAssign.ts` (the wrapped pure function) — no I/O of its own.

**Full pattern to wrap** (pure, deterministic tie-break):
```typescript
// Source: packages/availability-engine/src/autoAssign.ts, lines 35-53
export function autoAssign(
  slotsByProfessional: Map<string, AvailableSlot[]>,
): { professionalId: string; slot: AvailableSlot } | null {
  const sortedEntries = [...slotsByProfessional.entries()].sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  let best: { professionalId: string; slot: AvailableSlot } | null = null;
  for (const [professionalId, slots] of sortedEntries) {
    if (slots.length === 0) continue;
    const earliest = slots[0];
    if (!best || earliest.start < best.slot.start) {
      best = { professionalId, slot: earliest };
    }
  }
  return best;
}
```
The tool wrapper's `execute` should call `computeSlots` for each candidate professional (or reuse the same slots-by-professional map already built by `buscarHorarios`) and pass it straight into `autoAssign` — no new heuristic logic, per "Don't Hand-Roll" in RESEARCH.md.

---

### `apps/bot/src/conversation/tools/confirmarTurno.ts` (service/tool wrapper, CRUD write)

**Analog:** `packages/availability-engine/src/booking.ts` `bookAppointment` (wrapped function) + `apps/dashboard/app/actions/turnos.ts` `crearTurnoManual` (caller-side pattern: fetch `freshData`, call, map result).

**Caller pattern to copy** (freshData fetch immediately before the call — anti-cache, never reuse a stale computeSlots snapshot from earlier in the conversation):
```typescript
// Source: apps/dashboard/app/actions/turnos.ts, lines 60-101
export async function crearTurnoManual(input: TurnoInput): Promise<TurnoActionResult> {
  await requireRole("owner");
  const parsed = turnoSchema.safeParse(input);
  if (!parsed.success) {
    return { error: SAVE_ERROR_COPY };
  }
  const { negocio } = await getNegocioActivo();
  const supabase = await createClient();
  const freshData = await buildAvailabilityData(negocio.id);

  const result = await bookAppointment(
    {
      negocioId: negocio.id,
      profesionalId: parsed.data.profesionalId,
      clienteId: parsed.data.clienteId,
      serviceIds: parsed.data.serviceIds,
      inicio: parsed.data.inicio,
      fin: parsed.data.fin,
      skipBookingWindow: true,
    },
    { supabase, freshData },
  );
  revalidatePath("/turnos");
  return mapBookResult(result);
}
```
For the bot's `confirmarTurno` tool: `negocioId` comes from the closure (`negocioScoped(negocioId)`'s captured value, NEVER from `parsed.data`/model input — Pattern 1 in Shared Patterns), `skipBookingWindow` stays `false`/omitted (the bot must respect the 60min/30day window, unlike the dashboard owner path), and the tool's `execute` return value must surface the real `turnoId` (D-12 requirement) rather than only a text summary.

**Result-branching pattern to copy** (map domain result → user-facing outcome, never leak raw DB errors):
```typescript
// Source: apps/dashboard/app/actions/turnos.ts, lines 39-52
function mapBookResult(result: BookAppointmentResult): TurnoActionResult {
  if (result.ok) {
    return { success: true };
  }
  switch (result.reason) {
    case "slot_taken":
      return { error: SLOT_TAKEN_COPY };
    case "validation_error":
      return { error: SAVE_ERROR_COPY };
    case "insert_error":
    default:
      return { error: GENERIC_ERROR_COPY };
  }
}
```
The tool's `execute` should apply the same exhaustive switch over `BookAppointmentResult.reason`, translating `slot_taken` to "ese horario se acaba de ocupar, ¿probamos otro?" (D-03-aligned copy) instead of a raw error, and always include `turnoId` in the tool's structured return so the D-12 gate in `responder.ts` can inspect `result.steps` for it.

---

### `apps/bot/src/conversation/tools/reagendarTurno.ts` (service/tool wrapper, CRUD write)

**Analog:** `packages/availability-engine/src/booking.ts` `rescheduleAppointment` + `apps/dashboard/app/actions/turnos.ts` `reagendarTurno`.

**Caller pattern to copy exactly** (D-09 requires bot and dashboard share this same call shape):
```typescript
// Source: apps/dashboard/app/actions/turnos.ts, lines 134-163
export async function reagendarTurno(
  turnoId: string,
  input: { profesionalId: string; inicio: string; fin: string },
): Promise<TurnoActionResult> {
  await requireRole("owner");
  const { negocio } = await getNegocioActivo();
  const supabase = await createClient();

  const serviciosDelTurno = await fetchTurnoServicios(negocio.id, turnoId);
  const serviceIds = serviciosDelTurno.map((s) => s.servicio_id);

  const freshData = await buildAvailabilityData(negocio.id);

  const result = await rescheduleAppointment(
    {
      negocioId: negocio.id,
      turnoId,
      profesionalId: input.profesionalId,
      serviceIds,
      inicio: input.inicio,
      fin: input.fin,
    },
    { supabase, freshData },
  );
  revalidatePath("/turnos");
  return mapBookResult(result);
}
```
Bot equivalent: fetch `serviceIds` via `negocioScoped(negocioId).turnoServicios()` filtered by `turnoId` (read-only accessor already exists), fetch `freshData` via the bot's own `buildAvailabilityData`-equivalent (built for `buscarHorarios`), then call `rescheduleAppointment` with the SAME input shape — no `skipBookingWindow: true` (D-09: bot respects the same lead-time/advance-window rules the dashboard's non-owner paths respect; only the owner dashboard path skips it).

---

### `packages/availability-engine/src/booking.ts` — add `cancelAppointment` (service, CRUD write)

**Analog:** `rescheduleAppointment` in the same file — closest sibling (UPDATE by id + negocio_id scoping, no snapshot recomputation, never DELETE).

**Full sibling function to mirror structurally** (UPDATE shape, error branching, negocio_id defense-in-depth):
```typescript
// Source: packages/availability-engine/src/booking.ts, lines 385-403 (the UPDATE core of rescheduleAppointment)
const { data: turnoRow, error: updateError } = await supabase
  .from("turno")
  .update({
    inicio: input.inicio,
    fin: input.fin,
    profesional_id: input.profesionalId,
  })
  .eq("id", input.turnoId)
  .eq("negocio_id", input.negocioId)
  .select("id")
  .single();

if (updateError) {
  if (isSlotTakenConcurrently(updateError)) {
    return { ok: false, reason: "slot_taken" };
  }
  return { ok: false, reason: "insert_error", message: updateError.message };
}
```
`cancelAppointment` mirrors this shape but updates only `estado: "cancelado"`, adds a guard `.neq("estado", "cancelado")` (per RESEARCH.md's proposed signature, "evita cancelar dos veces silencioso") and returns a result union with `already_cancelled`/`not_found` reasons instead of `slot_taken` (cancellation has no slot-availability re-check — no `computeSlots` call needed here, unlike book/reschedule).

**Result-type sibling to copy** (per RESEARCH.md's own proposed shape — already the recommended contract, use verbatim):
```typescript
// Source: 06-RESEARCH.md "Pattern 2" code block (proposed, not yet in repo)
export interface CancelAppointmentInput {
  negocioId: string;
  turnoId: string;
}
export type CancelAppointmentResult =
  | { ok: true; turnoId: string }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "already_cancelled" }
  | { ok: false; reason: "update_error"; message: string };
```

**Validation schema sibling to copy** (same `uuidLike`, same `satisfies z.ZodType<...>` idiom):
```typescript
// Source: packages/availability-engine/src/booking.ts, lines 91-98 (rescheduleAppointmentInputSchema, structurally closest — no serviceIds/inicio/fin needed for cancel)
export const rescheduleAppointmentInputSchema = z.object({
  negocioId: uuidLike,
  turnoId: uuidLike,
  profesionalId: uuidLike,
  serviceIds: z.array(uuidLike).min(1, "serviceIds no puede estar vacío"),
  inicio: z.iso.datetime(),
  fin: z.iso.datetime(),
}) satisfies z.ZodType<RescheduleAppointmentInput, unknown>;
```
`cancelAppointmentInputSchema` needs only `{ negocioId: uuidLike, turnoId: uuidLike }`.

**Deps shape:** reuse `BookAppointmentDeps["supabase"]` only (no `freshData`/`now` needed — cancellation doesn't re-validate against `computeSlots`), or define a minimal `{ supabase: SupabaseClient<Database> }` deps interface for `cancelAppointment` alone.

---

### `apps/dashboard/app/actions/turnos.ts` — migrate `cancelarTurno` (controller, request-response)

**Analog:** `reagendarTurno` in the same file (already correctly delegates to the shared engine function — the exact pattern `cancelarTurno` must adopt instead of its current inline UPDATE).

**Current implementation to REPLACE** (the gap RESEARCH.md flags — inline UPDATE, not shared with any other caller):
```typescript
// Source: apps/dashboard/app/actions/turnos.ts, lines 108-126 (CURRENT — to migrate away from)
export async function cancelarTurno(turnoId: string): Promise<TurnoActionResult> {
  await requireRole("owner");
  const { negocio } = await getNegocioActivo();
  const supabase = await createClient();
  const { error } = await supabase
    .from("turno")
    .update({ estado: "cancelado" })
    .eq("id", turnoId)
    .eq("negocio_id", negocio.id); // defensa en profundidad, RLS ya lo scopea

  if (error) {
    return { error: GENERIC_ERROR_COPY };
  }
  revalidatePath("/turnos");
  return { success: true };
}
```
**Target shape** (mirrors `reagendarTurno`'s delegation pattern immediately above it in the same file): replace the inline `supabase.from("turno").update(...)` block with a call to the new `cancelAppointment({ negocioId: negocio.id, turnoId }, { supabase })` from `@turnosbot/availability-engine`, then map its result union (`not_found`/`already_cancelled`/`update_error`) to `TurnoActionResult` the same way `mapBookResult` does for `BookAppointmentResult`.

---

### `apps/bot/src/queue/inboundWorker.ts` (controller, event-driven)

**Analog:** itself — the orchestration shape is preserved; only the internals of the `try` block and the pre-`responder()` gate change.

**Exact call site to modify** (line 140, and the deps interface around it):
```typescript
// Source: apps/bot/src/queue/inboundWorker.ts, lines 139-151
try {
  const reply = await deps.responder(conversacion, message.text?.body ?? "");

  const nowMs = deps.now ? deps.now() : Date.now();
  const ventanaExpiraMs = conversacion.ventana_expira_at
    ? new Date(conversacion.ventana_expira_at).getTime()
    : 0;
  if (nowMs < ventanaExpiraMs) {
    await deps.sendWhatsappMessage(negocio.id, message.from, reply);
    ...
```
Per RESEARCH.md Open Question 1, add a `needsHuman` check reading `conversacion.context` BEFORE calling `deps.responder(...)` (skip invocation entirely if flagged) — this requires this file to start parsing `context` via the new `parseConversationContext` helper, something it does not do today. Preserve the existing `Deps` injection idiom below for this new collaborator.

**Deps interface pattern to extend** (add `parseConversationContext` as an injectable collaborator, same idiom as every other collaborator here):
```typescript
// Source: apps/bot/src/queue/inboundWorker.ts, lines 46-59
export interface ProcessInboundWhatsappEventDeps {
  supabaseAdmin: Pick<SupabaseClient<Database>, "from">;
  findOrCreateCliente: typeof realFindOrCreateCliente;
  findOrCreateConversacion: typeof realFindOrCreateConversacion;
  responder: typeof realResponder;
  sendWhatsappMessage: typeof realSendWhatsappMessage;
  negocioScoped: typeof realNegocioScoped;
  log: (obj: unknown, msg: string) => void;
  now?: () => number;
}
```

---

### `apps/bot/src/db/negocioScoped.ts` (model/data-access, CRUD — optional write accessor)

**Analog:** `updateConversacion` in the same file — exact shape to mirror if the planner chooses path (b) from RESEARCH.md Pattern 2 (write accessor inside `negocioScoped` rather than solely inside `cancelAppointment`'s injected `supabase` client).

```typescript
// Source: apps/bot/src/db/negocioScoped.ts, lines 88-93
updateConversacion: (id: string, patch: ConversacionUpdate) =>
  supabaseAdmin
    .from("conversacion")
    .update(patch)
    .eq("negocio_id", negocioId)
    .eq("id", id),
```
**Note:** RESEARCH.md recommends path (a) instead — `cancelAppointment` lives entirely in `availability-engine` and receives `deps.supabase` directly (same injection style as `bookAppointment`/`rescheduleAppointment`), so `negocioScoped.ts` may not need a new accessor at all if the bot's `cancelarTurno` tool passes `negocioScoped(negocioId)`'s underlying `supabaseAdmin` client — confirm with the planner which path was chosen before implementing.

---

## Shared Patterns

### Pattern 1: `negocioId` is NEVER a tool `inputSchema` field — always closure-captured
**Source:** `apps/bot/src/db/negocioScoped.ts` (whole-file discipline) + `apps/bot/src/queue/inboundWorker.ts` lines 84-93 (negocio resolved strictly by `phone_number_id` before any downstream call)
**Apply to:** every file under `apps/bot/src/conversation/tools/`
```typescript
// Structural rule (D-13/BOT-11) — negocioId comes from the closure over
// negocioScoped(negocioId), resolved in inboundWorker.ts BEFORE generateText()
// is ever invoked. No tool's z.object({...}) schema may include negocioId.
```

### Pattern 2: `uuidLike` regex, not `z.uuid()` strict
**Source:** `packages/availability-engine/src/booking.ts`, lines 66-77
**Apply to:** every new Zod `inputSchema` (tools + `cancelAppointmentInputSchema`)
```typescript
const uuidLike = z
  .string()
  .regex(
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
    "UUID inválido",
  );
```

### Pattern 3: Optional injectable `deps` param with a real default
**Source:** `apps/bot/src/queue/inboundWorker.ts` lines 46-69 (`ProcessInboundWhatsappEventDeps` + `defaultDeps`) and `packages/availability-engine/src/booking.ts` lines 181-190 (`BookAppointmentDeps`)
**Apply to:** `responder.ts` (model client + tool executes), each tool file, `cancelAppointment`
```typescript
export interface XDeps { /* each collaborator, typed against the real thing */ }
const defaultDeps: XDeps = { /* real implementations */ };
export async function x(input, deps: XDeps = defaultDeps) { ... }
```

### Pattern 4: Domain result as discriminated union, never throw for expected outcomes
**Source:** `packages/availability-engine/src/booking.ts` lines 192-196 (`BookAppointmentResult`)
**Apply to:** `CancelAppointmentResult`, every tool's return shape (so `responder.ts`'s D-12 gate can pattern-match on `result.steps` without try/catch)

### Pattern 5: `negocio()` accessor filters by `tenant_id`, not `negocio_id` — do not "fix" this
**Source:** `apps/bot/src/db/negocioScoped.ts`, lines 18-28 (header comment) and line 61
```typescript
negocio: () => supabaseAdmin.from("negocio").select("*").eq("tenant_id", negocioId),
```
**Apply to:** any new tool (`buscarHorarios`) that reads `negocio` (timezone, granularidad_min) via `negocioScoped(negocioId).negocio()` — leave this accessor untouched.

### Pattern 6: Never re-derive money/duration from a live join — only from frozen snapshots
**Source:** `packages/availability-engine/src/booking.ts`, lines 104-151 (`buildTurnoServicioSnapshots`/`sumPrecioTotal`)
**Apply to:** any tool reporting price/duration to the client — always read `turno_servicio.*_snapshot`, never `servicio.precio` live, when describing an EXISTING turno (e.g. a "check turno status" tool for BOT-08).

### Pattern 7: Anti-cache re-validation immediately before any write
**Source:** `packages/availability-engine/src/booking.ts`, lines 248-263 (bookAppointment) and 367-383 (rescheduleAppointment) — `computeSlots(freshData)` called right before insert/update, never trusting an earlier-computed slot
**Apply to:** `confirmarTurno.ts`/`reagendarTurno.ts` tools — fetch `freshData` inside the tool's `execute`, not once at the start of the conversation turn, and let `bookAppointment`/`rescheduleAppointment` do their own internal re-check (don't duplicate it in the tool).

### Pattern 8: Test file structure — mocked deps, no live network/DB
**Source:** `packages/availability-engine/src/booking.test.ts` (`describe("rescheduleAppointment (D-14)", ...)` block, using `vi` mocks for `supabase`) and `apps/bot/src/queue/inboundWorker.test.ts` (mocked `deps` object matching `ProcessInboundWhatsappEventDeps`)
**Apply to:** every new `apps/bot/src/conversation/tools/*.test.ts` — mock `db`/`bookAppointment`/`rescheduleAppointment`/`cancelAppointment`, never call Gemini live.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `apps/bot/src/conversation/systemPrompt.ts` | utility | transform | No prior file in this codebase builds an LLM system prompt — this is the first LLM integration. Use 06-AI-SPEC.md's prompt design guidance (D-01/D-05/D-06/D-12/D-13) directly; no internal analog to copy structure from beyond "pure function, no I/O" discipline shared with `autoAssign.ts`. |
| `evals/*` (dataset, judge.ts, traceAssertions.ts, responder.eval.test.ts, promptfooconfig.yaml) | test/config | batch | Net-new directory — no eval/judge infra exists anywhere in the repo yet. Follow 06-AI-SPEC.md Section 5 verbatim; this is out of RESEARCH.md's code-reading scope since nothing comparable exists to read. |
| AI SDK tool-loop wiring itself (`generateText` + `stopWhen: isStepCount(6)` + `tools: {...}` in `responder.ts`) | service | event-driven | No prior AI SDK usage anywhere in the repo (`ai`/`@ai-sdk/google` are being installed fresh this phase) — the only "pattern" available is the library's own documented API (06-AI-SPEC.md Section 3/4), not an internal codebase analog. |

## Metadata

**Analog search scope:** `apps/bot/src/**`, `packages/availability-engine/src/**`, `apps/dashboard/app/actions/**`, `apps/dashboard/lib/**`
**Files scanned:** 14 (responder.ts, responder.test.ts, inboundWorker.ts, inboundWorker.test.ts, negocioScoped.ts, negocioScoped.test.ts, findOrCreateCliente.ts, findOrCreateConversacion.ts, graphClient.ts, booking.ts, booking.test.ts, index.ts, types.ts, autoAssign.ts, availability-data.ts, turnos.ts (dashboard), env.ts (config))
**Pattern extraction date:** 2026-07-07
