---
phase: 4
slug: grilla-y-turnos-del-dashboard
status: verified
threats_open: 0
asvs_level: 1
created: 2026-07-06
---

# SECURITY.md — Phase 04: Grilla y turnos del dashboard

Audit type: `register_authored_at_plan_time: true`. Threats below were declared in the
`<threat_model>` blocks of plans 04-01..04-07 at plan time. This audit verifies that each
declared mitigation is actually present in the implemented code — it does not scan for new
vulnerabilities beyond the register.

- ASVS Level: L1
- block_on: high
- Total threats: 27
- SUMMARY.md `## Threat Flags` sections: none found in any of the 7 plan summaries (04-01..04-07)
  → no executor-flagged new attack surface for this phase.

## Threat Verification

| Threat ID | Category | Plan | Severity | Disposition | Status | Evidence |
|-----------|----------|------|----------|-------------|--------|----------|
| T-04-01 | Tampering | 04-01 | high | mitigate | CLOSED | `packages/availability-engine/src/booking.ts:344-409` `rescheduleAppointment` builds `dataExcludingSelf` (self-exclusion), revalidates via `computeSlots` pre-UPDATE, and branches `updateError` through `isSlotTakenConcurrently` (23P01→slot_taken) at line 399. |
| T-04-02 | Elevation of Privilege | 04-01 | high | mitigate | CLOSED | `computeSlots.ts:138-142`: `skipBookingWindow` field is optional/falsy-default; only `true` bypasses the window filter. `booking.ts` `bookAppointment`/`rescheduleAppointment` never set it themselves — only callers (dashboard actions) pass `true` explicitly. |
| T-04-03 | Information Disclosure | 04-01 | medium | mitigate | CLOSED | `computeSlots.ts:38-63` `assertScopedToNegocio` runs unconditionally inside `computeSlots`, including when called with `dataExcludingSelf` (a spread+filter of the original scoped `freshData`, not a refetch). |
| T-04-04 | Tampering | 04-01 | medium | mitigate | CLOSED | `booking.ts:91-98` `rescheduleAppointmentInputSchema` uses `uuidLike` for `negocioId`/`turnoId`/`profesionalId`/`serviceIds`, `safeParse`'d at `rescheduleAppointment:348`. |
| T-04-05 | Tampering | 04-02 | medium | mitigate | CLOSED | `lib/schemas/turno.ts`, `lib/schemas/bloqueo.ts` (`.max(280)` on motivo), `lib/schemas/cliente.ts` (`.max(120)` on nombre, `.max(30)` on telefono) — all use `uuidLike` + length caps. |
| T-04-06 | Tampering (supply chain) | 04-02 | low | accept | CLOSED (accepted risk) | Verified via git history: commit `b39d235` shows `components/ui/popover.tsx` added with zero new `package.json` dependency lines; `radix-ui: ^1.6.1` (pre-existing umbrella) unchanged. Documented here as the accepted-risk log entry. |
| T-04-07 | Information Disclosure | 04-02 | low | accept | CLOSED (accepted risk) | No `dangerouslySetInnerHTML` in any Phase 4 component (verified across turno-detail-sheet.tsx, bloqueo-popover.tsx, grilla-turnos.tsx); free-text rendered as plain JSX children/`title` attrs, length-capped by schemas. Documented here as the accepted-risk log entry. |
| T-04-08 | EoP / Info Disclosure | 04-03 | high | mitigate | CLOSED | `app/actions/bloqueos.ts:41` `crearBloqueo`, `app/actions/clientes.ts:47,68` `buscarClientePorTelefono`/`crearClienteInline` — all derive `negocio.id` from `getNegocioActivo()`; none accept `negocioId` as a parameter. |
| T-04-09 | Tampering | 04-03 | high | mitigate | CLOSED | `app/actions/bloqueos.ts:67-71` `eliminarBloqueo` — `.delete().eq("id", bloqueoId).eq("negocio_id", negocio.id)`, defense-in-depth over RLS `bloqueo_aislamiento`. |
| T-04-10 | Information Disclosure | 04-03 | high | mitigate | CLOSED | `app/actions/clientes.ts:50-54` `buscarClientePorTelefono` — `.eq("negocio_id", negocio.id).ilike("telefono", ...)`. |
| T-04-11 | Elevation of Privilege | 04-03 | high | mitigate | CLOSED | Grep across `app/actions/turnos.ts`, `slots.ts`, `bloqueos.ts`, `clientes.ts`, `lib/availability-data.ts`: zero imports of `lib/supabase/admin.ts`; all import `createClient` from `@/lib/supabase/server`. The only dashboard file importing `lib/supabase/admin.ts` is the (out-of-phase) `app/actions/admin-tenants.ts` superadmin panel. |
| T-04-12 | Elevation of Privilege | 04-04 | high | mitigate | CLOSED | `app/actions/turnos.ts` — `crearTurnoManual:69`, `cancelarTurno:111`, `reagendarTurno:140` all call `getNegocioActivo()` and scope mutations with `.eq("negocio_id", negocio.id)`; no `negocioId` accepted as input. |
| T-04-13 | Tampering | 04-04 | high | mitigate | CLOSED | `app/actions/turnos.ts:149-159` `reagendarTurno` delegates entirely to `rescheduleAppointment` (Plan 01's revalidation + GiST EXCLUDE handling); no parallel concurrency check reimplemented. |
| T-04-14 | Tampering | 04-04 | high | mitigate | CLOSED | `app/actions/turnos.ts:74-85` `crearTurnoManual` calls only `bookAppointment`; grep for `.from("turno").insert(` in `turnos.ts` returns no match (only the `estado: "confirmado"` `.update()` at line 92-96, which is state-only and does not touch inicio/fin/profesional_id). |
| T-04-15 | Information Disclosure | 04-04 | medium | mitigate | CLOSED | `app/actions/slots.ts:60-75` `obtenerSlotsDisponibles` builds `freshData` via `buildAvailabilityData(negocio.id)` and wraps `computeSlots` in try/catch (assertScopedToNegocio throw → `GENERIC_ERROR_COPY`). |
| T-04-16 | Tampering | 04-04 | medium | mitigate | CLOSED | `app/actions/slots.ts:86-134` `profesionalesElegibles` filters to profesionales whose `profesional_servicio` set is a superset of all requested `serviceIds` (`.every(...)` at line 130). |
| T-04-17 | Tampering | 04-06 | high | mitigate | CLOSED | `app/actions/bloqueos.ts:67-71` `eliminarBloqueo` (same evidence as T-04-09) — scoped `.eq("negocio_id", ...)` + RLS. |
| T-04-18 | Information Disclosure | 04-06 | low | accept | CLOSED (accepted risk) | `components/bloqueo-popover.tsx:69-73` renders `bloqueo.motivo` as plain JSX text (`<p>{bloqueo.motivo}</p>`) with a null fallback to "Sin motivo especificado"; no `dangerouslySetInnerHTML`; schema caps length at 280 chars. Documented here as the accepted-risk log entry. |
| T-04-19 | DoS (UX) | 04-06 | low | mitigate | CLOSED | `components/bloqueo-form-dialog.tsx:171` (`disabled={isPending}` on submit) and `components/bloqueo-popover.tsx:79,94,97` (delete button + AlertDialog actions) all gate on `useTransition`'s `isPending`. |
| T-04-20 | Elevation of Privilege | 04-05 | high | mitigate | CLOSED | Same server-side scoping as T-04-12 (`turnos.ts`); client components (`turno-form-dialog.tsx`, `turno-detail-sheet.tsx`) only pass ids through — cannot bypass action-side `.eq`/RLS scoping. |
| T-04-21 | Tampering | 04-05 | medium | mitigate | CLOSED | `components/slot-selector.tsx:78,96` calls only `profesionalesElegibles`/`obtenerSlotsDisponibles` (never computes availability locally); write path revalidates again in `bookAppointment`/`rescheduleAppointment`. |
| T-04-22 | Information Disclosure | 04-05 | low | accept | CLOSED (accepted risk) | `components/turno-detail-sheet.tsx:99` `<SheetTitle>Turno de {turno.clienteNombre ?? turno.clienteTelefono}</SheetTitle>` — plain JSX interpolation, React default escaping, no `dangerouslySetInnerHTML`. Documented here as the accepted-risk log entry. |
| T-04-23 | DoS (UX) | 04-05 | low | mitigate | CLOSED | `components/turno-form-dialog.tsx:240` (submit `disabled={!puedeGuardar || isPending}`) and `components/turno-detail-sheet.tsx:128,136,151,154` (Reagendar/Cancelar/AlertDialog actions) all gate on `isPending`. |
| T-04-24 | EoP / Info Disclosure | 04-07 | high | mitigate | CLOSED | `app/(owner)/turnos/page.tsx:155-162` — `negocio` derived solely from `getNegocioActivo()`; `fechaParam`/`fechaActiva` only ever used for date resolution, never for negocio scoping. |
| T-04-25 | Tampering | 04-07 | medium | mitigate | CLOSED | `app/(owner)/turnos/page.tsx:46-49,158-162` `esFechaValida` validates `YYYY-MM-DD` shape + real-date check; invalid/absent falls back to `hoyEnZona(negocio.timezone)`; `fechaActiva` is passed as a plain string to `computeSlots`/`buildAvailabilityData`, never interpolated into a query string. |
| T-04-26 | Information Disclosure | 04-07 | high | mitigate | CLOSED | `page.tsx:178` fetch via `buildAvailabilityData(negocio.id)` (RLS + `.eq`), and `computeSlots` (called at line 234) runs `assertScopedToNegocio` unconditionally (same engine code verified for T-04-03/15). |
| T-04-27 | Information Disclosure | 04-07 | low | accept | CLOSED (accepted risk) | `components/grilla-turnos.tsx:122-130,216-219` `etiquetaCelda` output rendered via `<span title={etiqueta}>{etiqueta}</span>` — plain JSX + native `title`, no raw HTML. Documented here as the accepted-risk log entry. |

## Accepted Risks Log

The following risks are formally accepted for Phase 04 (not blockers). Re-verify at next audit
that the underlying rationale still holds (no `dangerouslySetInnerHTML` introduced, no new
supply-chain path for shadcn components, deep sanitization still deferred to Phase 6 for
LLM-driven free text):

1. **T-04-06** — Popover component supply chain: sourced from the official shadcn registry,
   backed by the already-installed `radix-ui@^1.6.1` umbrella; no new npm dependency added
   (confirmed via `git show b39d235 --stat`).
2. **T-04-07** — Free-text `motivo`/`nombre` re-rendered later in Phase 6 (bot context): length
   caps at the schema boundary + React's default JSX escaping; deep sanitization explicitly
   deferred to Phase 6 scope.
3. **T-04-18** — Rendered `motivo` free text in `bloqueo-popover.tsx`: React default escaping,
   280-char schema cap, no `dangerouslySetInnerHTML`.
4. **T-04-22** — Rendered `clienteNombre` free text in `turno-detail-sheet.tsx`: React default
   escaping, no `dangerouslySetInnerHTML`.
5. **T-04-27** — Rendered free text (cliente/motivo) in grid cells (`grilla-turnos.tsx`): React
   default escaping + native `title` attribute for truncated overflow, no raw HTML injection
   path.

## Unregistered Flags

None. No `## Threat Flags` section was present in any of the 7 plan SUMMARY.md files
(04-01-SUMMARY.md through 04-07-SUMMARY.md), indicating no new attack surface was flagged by
the executor during implementation beyond the plan-time register.

## Result

**27/27 threats CLOSED** (22 `mitigate` verified with code evidence, 5 `accept` confirmed with
rationale holding in code + logged above). No BLOCKER-level open threats. Phase 04 clears the
security audit gate (`block_on: high` — no high-severity open threats).

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-07-06 | 27 | 27 | 0 | gsd-security-auditor (sonnet) via /gsd:secure-phase 4 |

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-07-06
