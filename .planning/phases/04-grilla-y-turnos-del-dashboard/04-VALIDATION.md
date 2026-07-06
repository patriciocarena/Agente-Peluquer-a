---
phase: 4
slug: grilla-y-turnos-del-dashboard
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-05
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest `4.1.9` (already configured in `packages/availability-engine/vitest.config.ts` and `apps/dashboard`, per Phase 2/3 conventions) |
| **Config file** | `packages/availability-engine/vitest.config.ts` (engine unit tests); `apps/dashboard/vitest.config.ts` (dashboard schema/unit tests) |
| **Quick run command** | `pnpm --filter @turnosbot/availability-engine test` (engine, pure-function, <5s) · `pnpm --filter @turnosbot/dashboard test` (dashboard schemas) |
| **Full suite command** | `pnpm -r test` (every workspace package's `test` script) |
| **Estimated runtime** | ~10-20 seconds full suite (all pure/unit; no component-render tests configured in this repo) |

**Type/compile gate (dashboard UI + actions):** `pnpm --filter @turnosbot/dashboard typecheck` and, for the route that assembles the page, `pnpm --filter @turnosbot/dashboard build`. These prove the code compiles and types line up, but they do NOT exercise runtime UI behavior (toasts, confirmations, color states, grid interaction) — those are covered by the Manual-Only Verifications table below, which is mandatory, not optional.

---

## Sampling Rate

- **After every task commit:** Run the task's quick command (`pnpm --filter @turnosbot/availability-engine test` for engine tasks; `pnpm --filter @turnosbot/dashboard typecheck` for dashboard tasks; `pnpm --filter @turnosbot/dashboard test -- schemas` for schema tasks)
- **After every plan wave:** Run `pnpm -r test` (full workspace suite)
- **After the UI waves (4-5):** Run the Manual-Only Verifications for APPT-01 and APPT-03 (see table) against the dashboard dev server — the typecheck/build gates cannot observe these behaviors
- **Before `/gsd-verify-work`:** Full suite green + the live reschedule-concurrency smoke check (`scripts/verify-reschedule.ts`, gated on `.env`) + APPT-01/APPT-03 manual QA passed
- **Max feedback latency:** ~20 seconds (automated); manual QA is a one-time per-wave gate, not per-commit

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 04-01-01 | 01 | 1 | APPT-06 | T-04-02 | `skipBookingWindow` default falsy preserves bot booking-window (bot path cannot book <60min/>30d) | unit (tdd) | `pnpm --filter @turnosbot/availability-engine test -- computeSlots` | ✅ computeSlots.test.ts (extended) | ⬜ pending |
| 04-01-02 | 01 | 1 | APPT-05 | T-04-01 / T-04-03 / T-04-04 | reschedule self-excludes own row; `23P01`→`slot_taken`; `uuidLike` cuts malformed input | unit (tdd) | `pnpm --filter @turnosbot/availability-engine test -- booking` | ✅ booking.test.ts (extended) + scripts/verify-reschedule.ts (gated live) | ⬜ pending |
| 04-02-01 | 02 | 1 | APPT-01, APPT-02, APPT-06 | T-04-06 | Popover from official shadcn registry / already-installed umbrella (no new dep family) | smoke | `test -f apps/dashboard/components/ui/popover.tsx && grep -q PopoverContent apps/dashboard/components/ui/popover.tsx && grep -q /turnos apps/dashboard/components/owner-sidebar.tsx` | ✅ generated | ⬜ pending |
| 04-02-02 | 02 | 1 | APPT-01, APPT-02, APPT-06 | T-04-05 | zod schemas (`uuidLike` + `.max()` caps) cut malformed input at the server boundary (V5) | unit | `pnpm --filter @turnosbot/dashboard test -- schemas` | ✅ turno/bloqueo/cliente.test.ts | ⬜ pending |
| 04-03-01 | 03 | 2 | APPT-02, APPT-06 | T-04-11 | single RLS fetch helper (never `service_role`); `AvailabilityData` from engine types | typecheck | `pnpm --filter @turnosbot/dashboard typecheck` | ✅ availability-data.ts | ⬜ pending |
| 04-03-02 | 03 | 2 | APPT-02 | T-04-08 / T-04-09 | `crearBloqueo`/`eliminarBloqueo` derive `negocio_id` from `getNegocioActivo()`, `.eq` scoping | typecheck | `pnpm --filter @turnosbot/dashboard typecheck` | ✅ actions/bloqueos.ts | ⬜ pending |
| 04-03-03 | 03 | 2 | APPT-06 | T-04-10 | client search scoped to active negocio; never trusts client `negocioId` | typecheck | `pnpm --filter @turnosbot/dashboard typecheck` | ✅ actions/clientes.ts | ⬜ pending |
| 04-04-01 | 04 | 3 | APPT-04, APPT-05, APPT-06 | T-04-12 / T-04-13 / T-04-14 | all writes delegate to `bookAppointment`/`rescheduleAppointment` (no parallel insert); cancel = state-only update, not delete | typecheck | `pnpm --filter @turnosbot/dashboard typecheck` | ✅ actions/turnos.ts | ⬜ pending |
| 04-04-02 | 04 | 3 | APPT-05, APPT-06 | T-04-15 / T-04-16 | slots via `computeSlots` only (AVAIL-04); professional eligibility gate via `profesional_servicio` | typecheck | `pnpm --filter @turnosbot/dashboard typecheck` | ✅ actions/slots.ts | ⬜ pending |
| 04-05-01 | 05 | 4 | APPT-06 | T-04-21 | client search/inline-create + slot picker delegate to server actions; never compute availability client-side | typecheck | `pnpm --filter @turnosbot/dashboard typecheck` | ✅ cliente-search.tsx, slot-selector.tsx | ⬜ pending |
| 04-05-02 | 05 | 4 | APPT-05, APPT-06 | T-04-20 / T-04-23 | dual-mode dialog; server-action-mapped error copy; `disabled={isPending}` anti-double-submit | typecheck + **manual** | `pnpm --filter @turnosbot/dashboard typecheck` + MQ-3 (toasts "Turno creado."/"Turno reagendado.") | ✅ turno-form-dialog.tsx | ⬜ pending |
| 04-05-03 | 05 | 4 | APPT-03, APPT-04, APPT-05 | T-04-20 / T-04-22 | detail panel is read-only display; cancel confirmation without motivo (D-12); React escaping on free-text | typecheck + **manual** | `pnpm --filter @turnosbot/dashboard typecheck` + **MQ-2 (APPT-03 detail panel)** | ✅ turno-detail-sheet.tsx | ⬜ pending |
| 04-06-01 | 06 | 3 | APPT-02 | T-04-19 | bloqueo dialog pre-loads professional+hour via props; server action derives negocio | typecheck + **manual** | `pnpm --filter @turnosbot/dashboard typecheck` + MQ-4 (toast "Horario bloqueado.") | ✅ bloqueo-form-dialog.tsx | ⬜ pending |
| 04-06-02 | 06 | 3 | APPT-02 | T-04-17 / T-04-18 | destructive delete behind confirmation + `aria-label`; React escaping on `motivo` | typecheck + **manual** | `pnpm --filter @turnosbot/dashboard typecheck` + MQ-4 (motivo/"Sin motivo especificado", toast "Bloqueo eliminado.") | ✅ bloqueo-popover.tsx | ⬜ pending |
| 04-07-01 | 07 | 5 | APPT-01 | T-04-27 | slot-popover pre-loads props (D-03); loading skeleton | typecheck + **manual** | `pnpm --filter @turnosbot/dashboard typecheck` + MQ-1 (popover "Crear turno"/"Bloquear") | ✅ slot-popover.tsx, loading.tsx | ⬜ pending |
| 04-07-02 | 07 | 5 | APPT-01 | T-04-27 | grid renders 4 color states from real data; interactions delegate to child components | typecheck + **manual** | `pnpm --filter @turnosbot/dashboard typecheck` + **MQ-1 (APPT-01 grid render + color states D-02)** | ✅ grilla-turnos.tsx | ⬜ pending |
| 04-07-03 | 07 | 5 | APPT-01, APPT-03 | T-04-24 / T-04-25 / T-04-26 | negocio from `getNegocioActivo()` only; `?fecha=` validated, never used for scoping; cancelados not painted (D-06) | build + **manual** | `pnpm --filter @turnosbot/dashboard build` + **MQ-1 (grid + day nav + empty states)** | ✅ app/(owner)/turnos/page.tsx | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*Test Type "typecheck"/"build" = compile-only gate; behaviors marked **manual** MUST also pass their Manual-Only Verification (MQ-N) below before the requirement is considered verified.*

---

## Wave 0 Requirements

Engine unit-test scaffolding (Plan 01, Wave 1, TDD — created RED-first inside the plan itself; these are the automated coverage for APPT-05/APPT-06's engine surface):

- [x] `packages/availability-engine/src/computeSlots.test.ts` — new cases for `skipBookingWindow: true` / `false` / omitted (APPT-06 bypass + Pitfall 1 regression guard) — **scaffolded by Plan 01 Task 1 (RED before GREEN)**
- [x] `packages/availability-engine/src/booking.test.ts` — new `describe("rescheduleAppointment")`: self-exclusion (Pitfall 2 own-slot overlap), validation schema, `23P01`→`slot_taken` — **scaffolded by Plan 01 Task 2 (RED before GREEN)**
- [x] `packages/availability-engine/src/*` — new dashboard schema tests (`turno`/`bloqueo`/`cliente`) — **scaffolded by Plan 02 Task 2**
- [x] `scripts/verify-reschedule.ts` — live gated smoke script confirming UPDATE triggers `23P01` on the GiST EXCLUDE (A1) — **written by Plan 01 Task 2, executed manually with `.env`, non-blocking for downstream type-surface consumers**

**Dashboard UI-level testing (RESEARCH.md "Wave 0 Gaps" open question — resolved):** No React component-render test framework (React Testing Library, Playwright, etc.) is configured in `apps/dashboard`, and Phase 2 established the convention of relying on **manual QA for UI-level behavior**. This phase continues that convention: UI-level requirements **APPT-01 (grid render)** and **APPT-03 (detail panel)** — plus the toast/confirmation/color-state behaviors of Plans 05/06/07 that a `typecheck` cannot observe — are covered by the **Manual-Only Verifications** table below with concrete, mandatory step-by-step instructions. This resolves the previously-unaddressed gap: APPT-01/03 now have actionable verification beyond compile checks. Introducing a component-testing framework is out of scope for Phase 4 (would be its own infrastructure phase) and is not required to close this gap.

---

## Manual-Only Verifications

**Setup (once, before any MQ below):**
1. From repo root run `pnpm --filter @turnosbot/dashboard dev` and open the dashboard in a browser.
2. Log in as an **owner** whose **negocio activo** has: ≥2 `profesional` rows with `activo=true`, at least one `horario_trabajo` covering today, and at least one `servicio`. (Seed via the Phase 2 flows if missing.)
3. Ensure there is at least one existing `turno` (`estado='confirmado'` or `'pendiente'`) for today so the detail-panel checks have a target — create one via the grid itself during MQ-1 if none exists.

| ID | Behavior | Requirement | Why Manual | Test Instructions |
|----|----------|-------------|------------|-------------------|
| **MQ-1** | Grid renders professionals×hours for a single day with 4 distinct color states, is interactive, navigates by day, and handles empty states | **APPT-01** (also D-01, D-02, D-03, D-06) | No component-render test framework in `apps/dashboard`; grid layout, per-state coloring, click-to-open, and immediate repaint after a write are runtime/visual behaviors a `typecheck`/`build` cannot observe | 1. Click **"Turnos"** (first sidebar item) → lands on `/turnos`. 2. **Layout:** confirm columns = one per active professional (header shows Avatar + name), vertical axis = the day's hours stepped at `negocio.granularidad_min`, showing **one day at a time**. 3. **Color states (D-02):** confirm four visually distinct treatments — **libre** (background/white, hover highlight, pointer cursor), **confirmado** (green/primary tint), **pendiente** (faint amber), **bloqueo** (diagonal gray stripes). 4. **Create-via-grid (D-03):** click a **free** cell → a small popover offers **"Crear turno"** and **"Bloquear"** with that professional + start hour pre-loaded. Create a turno; confirm the cell **immediately** repaints to `confirmado` with no manual refresh (revalidatePath / Success Criteria #2). 5. **Cancel frees instantly (D-06):** cancel that turno (via MQ-2) and confirm the cell returns to **libre (white)** at once — not struck-through. 6. **Day navigation:** click the ← / → arrows (`aria-label` "Día anterior"/"Día siguiente") and the date-picker; the grid re-renders for the chosen day (`?fecha=` changes). 7. **Empty states:** switch to a negocio with **no active professionals** → the grid is NOT rendered and **"Todavía no tenés profesionales activos"** shows; a professional with **no horario that day** → their column shows "Sin horario este día" **but its cells stay clickable** (D-07). **Correct = professionals-as-columns single-day grid, 4 distinct states, click-to-create, instant repaint after every write.** |
| **MQ-2** | Turno detail panel shows cliente + each service with price + total + schedule + professional, and offers cancel (simple confirm, no motivo) and reschedule | **APPT-03** (also APPT-04, APPT-05, D-04, D-12) | Sheet content, currency/time formatting, and the cancel-confirmation flow are visual/interactive; `turno_servicio` join display and the "no motivo field" rule cannot be asserted by a type check | 1. On `/turnos`, click a **turno** cell (confirmado or pendiente) → a right-side **Sheet** opens. 2. **Content (APPT-03):** confirm it shows the **client name** (or phone if unnamed), **each booked service with its snapshot price**, the **total** in `font-semibold`, the **schedule** as `HH:mm – HH:mm`, and the **professional** name. 3. **Formatting:** prices are es-AR ARS (e.g. `$ 12.500`, no decimals); times are `HH:mm`. 4. **Footer:** a **"Reagendar"** (outline) and a **"Cancelar turno"** (destructive/red) button. 5. **Cancel (D-12/APPT-04):** click "Cancelar turno" → a confirmation **"¿Seguro que querés cancelar este turno?"** with **"Confirmar"/"Volver"** and **NO motivo field**. Confirm → toast **"Turno cancelado."**, sheet closes, and the grid cell frees instantly (ties into MQ-1 step 5). 6. **Reschedule (APPT-05/D-13):** re-open a turno, click "Reagendar" → a dialog with the **shared slot-selector** restricted to **eligible professionals** (Pitfall 6); pick a new slot, confirm → toast **"Turno reagendado."** and the turno moves to the new cell (same turno id, not a new row). **Correct = read-only detail with cliente/servicios/precio/horario, cancel via simple confirm without motivo, reschedule via the shared eligible-professional slot picker.** |
| **MQ-3** | Manual turno creation: search-or-create client inline, pick a real slot (window bypassed), toast on success | **APPT-06** (also D-09, D-10, D-11) | The inline client search/create flow, eligible-professional slot chips, and success toast are runtime UI; the D-07 window bypass ("ahora mismo") is only observable end-to-end | 1. From a free cell's popover (MQ-1 step 4) choose **"Crear turno"**. 2. **Client (D-09):** search by phone; with no match, confirm the inline **"No encontramos un cliente con ese teléfono."** + inline create ("Usar este cliente") works without leaving the modal. 3. **Slot (D-10):** confirm the professional selector lists **only eligible** professionals and the slots shown are **real chips** from `computeSlots` — including a slot **"for right now"/<60min** (window bypass D-07 proves the owner is not bound by the bot's booking window). 4. Submit **"Crear turno"** → toast **"Turno creado."**, modal closes, grid shows the new confirmado turno (MQ-1). **Correct = one modal that finds/creates a client and books a real, window-bypassed slot for an eligible professional.** |
| **MQ-4** | Bloqueo create (pre-loaded professional+hour) and delete (motivo shown, confirmation, frees slot) | **APPT-02** (also D-03, D-05) | Popover content, "Sin motivo especificado" fallback, destructive confirmation, and immediate slot-free-after-delete are runtime/visual | 1. From a free cell popover choose **"Bloquear"** → dialog with professional + start hour **pre-loaded** (not re-typed); optionally add a motivo; submit → toast **"Horario bloqueado."** and the cell repaints to the **striped bloqueo** state. 2. Click the **bloqueo** cell → a popover shows the **motivo** (or **"Sin motivo especificado"** in muted text) and a destructive **"Eliminar bloqueo"** (`aria-label` present). 3. Click it → confirmation **"¿Eliminar este bloqueo? El horario vuelve a estar disponible."**; confirm → toast **"Bloqueo eliminado."** and the cell returns to **libre** at once. **Correct = pre-loaded block creation and a confirm-gated delete that frees the slot immediately.** |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (every task has a typecheck/test/build gate; UI-behavior tasks add a mandatory MQ on top)
- [x] Wave 0 covers all MISSING references (engine + schema test scaffolds created RED-first in Plans 01/02; dashboard UI-level gap resolved via mandatory Manual-Only Verifications MQ-1..MQ-4)
- [x] No watch-mode flags
- [x] Feedback latency < 20s (automated); manual QA is a per-wave gate
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-07-05
