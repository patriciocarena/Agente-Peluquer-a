---
phase: 04-grilla-y-turnos-del-dashboard
verified: 2026-07-06T00:10:00Z
status: human_needed
score: 6/6 must-haves verified in code; 0/4 mandatory Manual-Only Verifications executed
overrides_applied: 0
human_verification:
  - test: "MQ-1 — Grid renders professionals x hours for a single day with 4 distinct color states, click-to-create, immediate repaint, day nav, empty states"
    expected: "See 04-VALIDATION.md MQ-1 full script (professionals as columns, libre/confirmado/pendiente/bloqueo colors, click-to-create popover, instant repaint, day arrows, empty states)"
    why_human: "No component-render test framework configured in apps/dashboard (documented project convention since Phase 2); grid layout, coloring, click interactions and repaint-after-write are runtime/visual behaviors typecheck/build cannot observe"
  - test: "MQ-2 — Turno detail panel (cliente, servicios, precio, horario, cancel without motivo, reschedule)"
    expected: "See 04-VALIDATION.md MQ-2 full script"
    why_human: "Sheet content, currency/time formatting, and the cancel-confirmation flow are visual/interactive"
  - test: "MQ-3 — Manual turno creation: inline client search/create, real slot picker with booking-window bypass, success toast"
    expected: "See 04-VALIDATION.md MQ-3 full script"
    why_human: "Inline client search/create flow, eligible-professional slot chips and the D-07 window bypass are only observable end-to-end at runtime"
  - test: "MQ-4 — Bloqueo create (pre-loaded professional+hour) and delete (motivo shown, confirmation, frees slot)"
    expected: "See 04-VALIDATION.md MQ-4 full script"
    why_human: "Popover content, motivo fallback text, destructive confirmation and immediate slot-free-after-delete are runtime/visual"
  - test: "scripts/verify-reschedule.ts — live gated smoke test proving the GiST EXCLUDE re-fires on UPDATE (not just INSERT), against bdgufnitakelyialjoqg"
    expected: "Script exits 0, confirming a second UPDATE onto an occupied slot is rejected with 23P01 and translated to slot_taken"
    why_human: "Requires a real .env (SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY) against the live bdgufnitakelyialjoqg project — absent in this verification environment per CLAUDE.md isolation rules; written and reviewed but never executed (04-01-SUMMARY.md confirms this explicitly)"
    status: DONE_2026-07-10
    result: |
      EJECUTADO EN VIVO Y PASSED (exit 0), contra bdgufnitakelyialjoqg (ref confirmado antes de correr):
        - turno A creado 09:00-09:30 AR; turno B creado 10:00-10:30 AR DESPUÉS del fetch, dejando `freshData` stale a propósito.
        - el UPDATE de `rescheduleAppointment` disparó la GiST EXCLUDE real (23P01) y fue traducido a `slot_taken` (A1, T-04-01).
        - el turno A conservó su horario original — el UPDATE rechazado no dejó estado inconsistente.
      Invocación: `node --env-file=.env --import tsx scripts/verify-reschedule.ts`
      NOTA: la premisa "absent in this verification environment" era FALSA. Claude no puede LEER el .env
      con sus herramientas, pero `node --env-file=.env` lo carga en el proceso hijo. Los scripts gated
      SÍ son ejecutables. Ver `.planning/HANDOFF-milestone-v1.md`.
---

# Phase 4: Grilla y turnos del dashboard — Verification Report

**Phase Goal:** El dueño puede operar la agenda completa de turnos desde el dashboard, usando el mismo motor de disponibilidad que luego usará el bot.
**Verified:** 2026-07-06
**Status:** human_needed
**Re-verification:** No — initial verification

## Summary Verdict

**PASS-WITH-PENDING.** Every observable truth required by the ROADMAP Success Criteria and REQUIREMENTS.md (APPT-01..06) is backed by real, substantive, wired code — not stubs. All automated gates are green (engine unit tests 54/54, dashboard unit tests 58/58, dashboard `typecheck` clean, dashboard `build` succeeds for `/turnos` when Supabase env vars are present). No debt markers (TBD/FIXME/XXX/TODO/HACK/placeholder) were found in any file this phase touched.

The reason this is **not** an unconditional `passed` is that the phase's own `04-VALIDATION.md` designates four runtime/visual behaviors (MQ-1..MQ-4) as **mandatory Manual-Only Verifications** — by the project's own established convention (no React component-render test framework in `apps/dashboard`, same as Phase 2) — and all three UI-plan SUMMARYs (04-05, 04-06, 04-07) explicitly state these have **not yet been run** against a live dev server. Additionally, the gated live smoke script `scripts/verify-reschedule.ts` (proving the GiST EXCLUDE constraint re-fires on `UPDATE`, not just `INSERT`) has been written and reviewed but not executed, because `.env` credentials for `bdgufnitakelyialjoqg` are absent in this environment — consistent with CLAUDE.md's project-isolation rule and the task framing that these are pending checkpoints, not failures.

Per the verification decision tree, any phase with outstanding mandatory human-verification items must resolve to `human_needed`, not `passed`, regardless of how strong the code evidence is.

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria + REQUIREMENTS APPT-01..06)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | El dueño ve una grilla de turnos por profesional y por día, reflejando el estado real de disponibilidad (APPT-01, SC#1) | ✓ VERIFIED (code) / pending MQ-1 | `apps/dashboard/components/grilla-turnos.tsx` renders professional columns x hour rows with 4 distinct `estado` styles (libre/confirmado/pendiente/bloqueo); `apps/dashboard/app/(owner)/turnos/page.tsx` computes cells from real `computeSlots` output + raw `turno`/`bloqueo` rows scoped to `negocio_id`, never hand-rolled availability math |
| 2 | El dueño puede bloquear manualmente un slot de un profesional y ese bloqueo se refleja de inmediato en la disponibilidad (APPT-02, SC#2) | ✓ VERIFIED (code) / pending MQ-4 | `apps/dashboard/app/actions/bloqueos.ts::crearBloqueo`/`eliminarBloqueo` insert/delete real rows in `bloqueo` scoped by `negocio_id` from `getNegocioActivo()`, end with `revalidatePath("/turnos")`; `bloqueo-form-dialog.tsx` + `bloqueo-popover.tsx` wire the UI end to end |
| 3 | El dueño puede ver el detalle de un turno confirmado (cliente, servicios, precio, horario) (APPT-03, SC#3) | ✓ VERIFIED (code) / pending MQ-2 | `apps/dashboard/components/turno-detail-sheet.tsx` renders `turno.servicios` (nombre/precio snapshot), total, `HH:mm–HH:mm` schedule, and professional name, fed by `fetchTurnoServicios` + a `cliente` join built in `page.tsx` |
| 4 | El dueño puede cancelar un turno desde el dashboard (APPT-04, SC#4) | ✓ VERIFIED (code) / pending MQ-2 | `app/actions/turnos.ts::cancelarTurno` does `UPDATE turno SET estado='cancelado'` (never DELETE, preserves history per D-12); `turno-detail-sheet.tsx` wires a simple confirm dialog with no motivo field, matching D-12 exactly |
| 5 | El dueño puede reagendar un turno desde el dashboard (APPT-05, SC#4) | ✓ VERIFIED (code + unit tests) / pending MQ-2 + live script | `packages/availability-engine/src/booking.ts::rescheduleAppointment` does an `UPDATE` (never cancel+create) with explicit self-exclusion of the turno's own old slot before revalidating via `computeSlots`, translates `23P01`→`slot_taken`; `booking.test.ts` covers self-exclusion + validation + concurrency translation (part of the 54 green engine tests); `app/actions/turnos.ts::reagendarTurno` + `turno-form-dialog.tsx` (mode="reagendar") wire it to the UI |
| 6 | El dueño puede crear un turno manualmente desde el dashboard (cliente que llama/viene) (APPT-06, SC#4) | ✓ VERIFIED (code + unit tests) / pending MQ-3 | `computeSlots`/`bookAppointment` extended with `skipBookingWindow` (opt-in, default-false, preserves bot behavior — `computeSlots.test.ts` regression-tests omitted vs. explicit-false); `app/actions/turnos.ts::crearTurnoManual` calls `bookAppointment({..., skipBookingWindow: true})` then a state-only `UPDATE` to `confirmado`; `cliente-search.tsx` + `app/actions/clientes.ts` implement the D-09 search-or-create-inline flow; `slot-selector.tsx` + `app/actions/slots.ts` supply only real, eligible-professional slot chips from `computeSlots` — never a free-text time input |

**Score:** 6/6 truths backed by substantive, wired code. 0/4 mandatory runtime Manual-Only Verifications executed (blocking `passed`, per the phase's own validation contract).

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/availability-engine/src/types.ts` | `skipBookingWindow?` on `ComputeSlotsInput`/`BookAppointmentInput`, `RescheduleAppointmentInput` | ✓ VERIFIED | Present, lines 63/128/162; documented D-08 semantics |
| `packages/availability-engine/src/computeSlots.ts` | Booking-window filter bypassable | ✓ VERIFIED | `input.skipBookingWindow` branch at line ~135-138, skips `BOOKING_MIN_LEAD_MINUTES`/`BOOKING_MAX_ADVANCE_DAYS` filter entirely when true |
| `packages/availability-engine/src/booking.ts` | `bookAppointment` (skip-window aware) + new `rescheduleAppointment` (D-14) | ✓ VERIFIED | `rescheduleAppointment` at line 344: self-exclusion via spread+filter, `computeSlots` revalidation, `UPDATE` (not insert), `23P01`→`slot_taken` via existing `isSlotTakenConcurrently` |
| `packages/availability-engine/src/index.ts` | Barrel exports `rescheduleAppointment`, `BookAppointmentDeps`, `BookAppointmentResult` | ✓ VERIFIED | Confirmed exported (04-04-SUMMARY documents a blocking fix that added the missing type exports; `apps/dashboard` typechecks clean against them now) |
| `apps/dashboard/lib/availability-data.ts` | Single RLS fetch helper building `AvailabilityData`, never `service_role` | ✓ VERIFIED | `buildAvailabilityData` uses `@/lib/supabase/server` (RLS) exclusively, 5 queries scoped by `negocio_id`, feeds both `page.tsx` and Server Actions — one read path (AVAIL-04) |
| `apps/dashboard/app/actions/bloqueos.ts` | `crearBloqueo`/`eliminarBloqueo`, negocio derived server-side | ✓ VERIFIED | `negocio_id` always from `getNegocioActivo()`, never client input; `.eq("negocio_id", ...)` defense-in-depth on delete |
| `apps/dashboard/app/actions/clientes.ts` | `buscarClientePorTelefono`/`crearClienteInline` scoped search+create | ✓ VERIFIED | `.ilike` partial match scoped to active negocio; insert scoped to negocio |
| `apps/dashboard/app/actions/turnos.ts` | `crearTurnoManual`/`cancelarTurno`/`reagendarTurno`, delegate to engine only | ✓ VERIFIED | All three delegate to `bookAppointment`/`rescheduleAppointment` or a state-only `UPDATE`; no parallel insert logic; all `revalidatePath("/turnos")` |
| `apps/dashboard/app/actions/slots.ts` | `obtenerSlotsDisponibles`/`profesionalesElegibles` | ✓ VERIFIED | Pure `computeSlots` wrapper with `skipBookingWindow:true`; eligibility gate requires a professional to serve ALL requested `serviceIds` (Pitfall 6) |
| `apps/dashboard/components/cliente-search.tsx`, `slot-selector.tsx` | Client search/inline-create + slot picker | ✓ VERIFIED | Both delegate to server actions exclusively, no client-side availability math |
| `apps/dashboard/components/turno-form-dialog.tsx` | Dual-mode alta/reagendar dialog | ✓ VERIFIED | Mode-aware, delegates to `crearTurnoManual`/`reagendarTurno`, `disabled={isPending}` anti-double-submit, maps server error copy verbatim |
| `apps/dashboard/components/turno-detail-sheet.tsx` | Read-only detail + cancel (no motivo) + reschedule trigger | ✓ VERIFIED | Renders cliente/servicios/precio/horario; cancel via `AlertDialog` with no motivo field (D-12); opens `TurnoFormDialog(mode="reagendar")` |
| `apps/dashboard/components/bloqueo-form-dialog.tsx`, `bloqueo-popover.tsx` | Pre-loaded create + motivo/eliminar popover | ✓ VERIFIED | Professional+hour pre-loaded via props (never re-typed); popover shows motivo or fallback + destructive delete with `aria-label` |
| `apps/dashboard/components/slot-popover.tsx` | Popover offering "Crear turno"/"Bloquear" on a free cell | ✓ VERIFIED | Both dialogs pre-loaded with `profesionalId`/`horaInicio` from props |
| `apps/dashboard/components/grilla-turnos.tsx` | Grid rendering 4 color states, delegates interactions | ✓ VERIFIED | Client component, receives fully pre-computed `celdas` from `page.tsx`, never computes availability itself; block-continuation merge logic for multi-slot turnos/bloqueos |
| `apps/dashboard/app/(owner)/turnos/page.tsx` | Assembles the `/turnos` screen | ✓ VERIFIED | `negocio` always from `getNegocioActivo()`; `?fecha=` validated via regex + calendar-date check, never used for scoping; cancelados excluded from painted cells (D-06) |
| `apps/dashboard/app/(owner)/turnos/loading.tsx` | Loading skeleton | ✓ VERIFIED (exists) | Present per file listing |
| `apps/dashboard/components/owner-sidebar.tsx` | "Turnos" nav entry, first item | ✓ VERIFIED | `{ href: "/turnos", label: "Turnos", icon: CalendarDays }` is the first nav entry |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `grilla-turnos.tsx` (celda libre) | `slot-popover.tsx` → `turno-form-dialog.tsx` / `bloqueo-form-dialog.tsx` | `SlotPopover` wraps the cell as trigger, passes pre-loaded `profesionalId`/`horaInicio` | WIRED | Confirmed by direct read of both files |
| `turno-form-dialog.tsx` (alta) | `app/actions/turnos.ts::crearTurnoManual` | direct async call inside `startTransition` | WIRED | Result mapped to toast/error state |
| `turno-form-dialog.tsx` (reagendar) | `app/actions/turnos.ts::reagendarTurno` | direct async call inside `startTransition` | WIRED | Same mapping path |
| `app/actions/turnos.ts` | `@turnosbot/availability-engine::bookAppointment`/`rescheduleAppointment` | direct import + call with `{ supabase, freshData }` deps | WIRED | No parallel insert/update of `turno` availability fields outside the engine |
| `app/actions/bloqueos.ts` | `bloqueo` table | direct Supabase `.insert()`/`.delete()`, scoped `.eq("negocio_id", ...)` | WIRED | |
| `turno-detail-sheet.tsx` | `app/actions/turnos.ts::cancelarTurno` | direct async call | WIRED | Toast + `onOpenChange(false)` on success |
| `slot-selector.tsx` | `app/actions/slots.ts::obtenerSlotsDisponibles`/`profesionalesElegibles` | `useEffect` + `startTransition` | WIRED | Renders real slot chips only, never a free-text time field |
| `cliente-search.tsx` | `app/actions/clientes.ts::buscarClientePorTelefono`/`crearClienteInline` | direct async calls | WIRED | |
| `app/(owner)/turnos/page.tsx` | `@turnosbot/availability-engine::computeSlots` + `lib/availability-data.ts::buildAvailabilityData` | direct import + per-professional call | WIRED | AVAIL-04 respected — no hand-rolled slot math in the dashboard |
| `owner-sidebar.tsx` | `/turnos` route | `<Link href="/turnos">` nav item | WIRED | |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `grilla-turnos.tsx` | `celdas` prop | `page.tsx` builds it from `computeSlots` output + real `turno`/`bloqueo` rows fetched via `buildAvailabilityData` (RLS, scoped by `negocio_id`) | Yes — no static/empty fallback other than legitimate empty states (no professionals / no schedule) | ✓ FLOWING |
| `turno-detail-sheet.tsx` | `turno: TurnoDetalle` prop | Built in `page.tsx` from real `turno`/`turno_servicio`/`cliente` joins (`fetchTurnoServicios`) | Yes | ✓ FLOWING |
| `slot-selector.tsx` | `slots` state | `obtenerSlotsDisponibles` → `computeSlots(freshData)` — a real, freshly-fetched `AvailabilityData`, not a cached/static array | Yes | ✓ FLOWING |
| `cliente-search.tsx` | `resultados` state | `buscarClientePorTelefono` → real `.ilike` query against `cliente` table | Yes | ✓ FLOWING |

No hollow props or static-return API stubs found.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Availability engine unit suite (includes `skipBookingWindow` D-08 and `rescheduleAppointment` D-14 coverage) | `corepack pnpm --filter @turnosbot/availability-engine test` | 7 test files, 54 tests, all passed | ✓ PASS |
| Dashboard unit suite (schemas: turno/bloqueo/cliente) | `corepack pnpm --filter @turnosbot/dashboard test` | 10 test files, 58 tests, all passed | ✓ PASS |
| Dashboard type-check | `corepack pnpm --filter @turnosbot/dashboard typecheck` | Clean, zero errors | ✓ PASS |
| Dashboard build without env (documents pre-existing unrelated blocker) | `corepack pnpm --filter @turnosbot/dashboard build` | Fails at page-data collection for `/admin/[tenantId]` only, AFTER "Compiled successfully" + "Finished TypeScript" both pass for all routes including `/turnos` | ⚠️ Expected pre-existing gap (documented in `deferred-items.md`, traced to Phase 02-08's `admin.ts` service-role guard, unrelated to this phase's files) |
| Dashboard build WITH dummy env vars (isolates the above) | `SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... corepack pnpm --filter @turnosbot/dashboard build` | Succeeds; `/turnos` listed as a working dynamic (ƒ) route alongside all others | ✓ PASS |

### Probe Execution

No `scripts/*/tests/probe-*.sh` convention exists in this project; the phase's own gated-verification convention is `scripts/verify-*.ts` run manually against a real `.env`. Ran as follows:

| Probe | Command | Result | Status |
|-------|---------|--------|--------|
| `scripts/verify-reschedule.ts` | `bash`/`tsx` run against live `bdgufnitakelyialjoqg` | Not executed — `.env` absent in this environment | MISSING_ENV (not a code failure; expected/documented per CLAUDE.md isolation + 04-01-SUMMARY.md) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| APPT-01 | 04-07 | Grilla por profesional y día | ✓ SATISFIED (code) — pending MQ-1 | `grilla-turnos.tsx` + `page.tsx` |
| APPT-02 | 04-03, 04-06 | Bloqueo manual de slot | ✓ SATISFIED (code) — pending MQ-4 | `app/actions/bloqueos.ts`, `bloqueo-form-dialog.tsx`, `bloqueo-popover.tsx` |
| APPT-03 | 04-05, 04-07 | Detalle de turno confirmado | ✓ SATISFIED (code) — pending MQ-2 | `turno-detail-sheet.tsx` |
| APPT-04 | 04-04, 04-05 | Cancelar turno | ✓ SATISFIED (code) — pending MQ-2 | `app/actions/turnos.ts::cancelarTurno` |
| APPT-05 | 04-01, 04-04, 04-05 | Reagendar turno | ✓ SATISFIED (code + unit tests) — pending MQ-2 + live script | `rescheduleAppointment`, `reagendarTurno`, `turno-form-dialog.tsx` |
| APPT-06 | 04-01, 04-02, 04-03, 04-04, 04-05 | Alta manual de turno | ✓ SATISFIED (code + unit tests) — pending MQ-3 | `skipBookingWindow`, `crearTurnoManual`, `cliente-search.tsx`, `slot-selector.tsx` |

No orphaned requirements — REQUIREMENTS.md maps exactly APPT-01..06 to Phase 4, and all six appear in at least one plan's stated scope.

### Anti-Patterns Found

None. Scanned every file this phase touched (all `04-*` plan artifacts, dashboard actions/components, engine `booking.ts`/`computeSlots.ts`/`types.ts`) for `TBD|FIXME|XXX|TODO|HACK|PLACEHOLDER`, `placeholder/coming soon/not yet implemented` copy, empty-return stubs, and hardcoded-empty props. The only "TODO" string matches found were the Spanish word "todo" (all/every) inside comments — not debt markers. No `return null`/`return {}`/`return []` stub patterns, no hardcoded-empty JSX props, no console.log-only handlers.

### Human Verification Required

The phase's own `04-VALIDATION.md` designates the following as **mandatory** (not optional) because no React component-render test framework is configured in `apps/dashboard` — this is an established Phase-2 convention carried forward, not a shortcut taken by this phase. All four items are documented in `04-05-SUMMARY.md`, `04-06-SUMMARY.md`, and `04-07-SUMMARY.md` as explicitly **not yet run**.

#### 1. MQ-1 — Grid render, color states, day nav, empty states (APPT-01)

**Test:** Run `pnpm --filter @turnosbot/dashboard dev`, log in as an owner with ≥2 active professionals + schedule + a service, open `/turnos`, and walk through the full script in `04-VALIDATION.md` (layout = professionals as columns/hours as rows for one day; 4 distinct color treatments for libre/confirmado/pendiente/bloqueo; click a free cell → popover offers "Crear turno"/"Bloquear" with pre-loaded professional+hour; create a turno and confirm the cell repaints to confirmado with no manual refresh; day-navigation arrows and date-picker change `?fecha=`; empty states for zero active professionals and for a professional with no schedule that day).
**Expected:** All behaviors described above, matching D-01/D-02/D-03/D-06/D-07.
**Why human:** Grid layout, per-state coloring, click-to-open, and instant-repaint-after-write are runtime/visual behaviors a `typecheck`/`build` cannot observe.

#### 2. MQ-2 — Turno detail panel, cancel, reschedule (APPT-03/04/05)

**Test:** Click a confirmado/pendiente cell → verify the Sheet shows client name/phone, each service with snapshot price, total, `HH:mm–HH:mm` schedule, professional name, es-AR ARS currency formatting; click "Cancelar turno" → confirm the "¿Seguro que querés cancelar este turno?" dialog has NO motivo field; confirm cancellation frees the cell instantly; click "Reagendar" → confirm the shared eligible-professional slot picker opens and completing it moves the same turno (not a new row).
**Expected:** Matches D-04/D-12/D-13 exactly, per `04-VALIDATION.md` MQ-2.
**Why human:** Sheet content, currency/time formatting, and the cancel-confirmation flow are visual/interactive; the "no motivo field" rule can't be asserted by a type check.

#### 3. MQ-3 — Manual turno creation (APPT-06)

**Test:** From a free cell's popover, choose "Crear turno"; search a phone with no match → confirm inline "No encontramos un cliente..." + inline create works without leaving the modal; confirm the professional selector lists only eligible professionals and slot chips include a "right now"/<60min option (proving the D-07 window bypass); submit and confirm a "Turno creado." toast plus the new confirmado cell.
**Expected:** Matches D-07/D-09/D-10/D-11, per `04-VALIDATION.md` MQ-3.
**Why human:** The inline client search/create flow and the window-bypass proof are only observable end-to-end at runtime.

#### 4. MQ-4 — Bloqueo create/delete (APPT-02)

**Test:** From a free cell's popover, choose "Bloquear" → confirm professional+hour are pre-loaded (not re-typed); submit → toast "Horario bloqueado." + striped cell; click the bloqueo cell → popover shows motivo or "Sin motivo especificado" + destructive "Eliminar bloqueo"; confirm delete → toast "Bloqueo eliminado." and the cell frees instantly.
**Expected:** Matches D-03/D-05, per `04-VALIDATION.md` MQ-4.
**Why human:** Popover content, motivo fallback text, destructive confirmation, and immediate slot-free-after-delete are runtime/visual.

#### 5. Live gated smoke script — `scripts/verify-reschedule.ts` (APPT-05 concurrency proof)

**Test:** With real `.env` (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) for `bdgufnitakelyialjoqg`, run `scripts/verify-reschedule.ts` to prove the GiST EXCLUDE constraint re-fires on `UPDATE`, not just `INSERT` — i.e. that concurrently rescheduling two turnos into the same slot is rejected at the DB layer, not just caught by the pre-check in `computeSlots`.
**Expected:** Script exits 0 confirming `23P01`→`slot_taken` translation on a real concurrent UPDATE collision.
**Why human/environment:** Requires live credentials against the one sanctioned Supabase project (`bdgufnitakelyialjoqg`, per CLAUDE.md project-isolation rule); this verification environment has no `.env`. This mirrors the same class of gated checkpoint already accepted for Phase 3 (`verify-availability-engine.ts`) and Phase 2 (`verify-admin-tenant-lifecycle.ts`).

### Gaps Summary

No code-level gaps. The engine and dashboard implement every APPT-01..06 requirement with real, wired, non-stub logic; the shared `@turnosbot/availability-engine` (never a parallel dashboard-side availability calculation) is used for every read AND write path — satisfying AVAIL-04's cross-consumer consistency guarantee for this phase's surface. Automated gates (unit tests, typecheck, isolated build) are all green.

The phase is held at `human_needed` rather than `passed` strictly because of outstanding **mandatory** runtime verification that the phase's own `04-VALIDATION.md` requires before APPT-01/02/03/05/06 can be considered fully closed, plus one gated live DB script pending real Supabase credentials. Both classes of pending item are expected and explicitly acknowledged by the executing plans themselves (not silently skipped) — they are checkpoints, not evidence of missing implementation.

---

_Verified: 2026-07-06_
_Verifier: Claude (gsd-verifier)_
