# Phase 4: Grilla y turnos del dashboard - Research

**Researched:** 2026-07-05
**Domain:** Next.js 16 App Router dashboard grid UI + extension of a pure availability engine (Node/TS monorepo package)
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Layout y visualización de la grilla**
- **D-01:** Vista principal: columnas = profesionales activos del negocio, un día a la vez, eje vertical = horas del día alineadas a la granularidad del negocio (`negocio.granularidad_min`). Navegación día por día (flechas / date-picker).
- **D-02:** Estados visuales por color: confirmado, pendiente, bloqueo manual y libre tienen cada uno un estilo distinto.
- **D-03:** Click en un slot libre abre un menú/popover chico con dos opciones ("Crear turno" / "Bloquear"), cada una abre su modal correspondiente con profesional + hora de inicio pre-cargados.
- **D-04:** Click en un turno existente (pendiente o confirmado) abre un panel de detalle (cliente, servicio(s), precio, horario) con acciones "Cancelar" / "Reagendar" (satisface APPT-03).
- **D-05:** Click en un bloqueo manual existente abre un popover simple con el motivo (si lo hay) y un botón para eliminar el bloqueo (libera el slot).
- **D-06:** Al cancelar un turno, la celda vuelve a verse libre al instante (blanco) — no queda tachado. El turno sigue existiendo en la base con `estado='cancelado'` para historial.

**Ventana de reserva para el dueño (D-04/D-05 de Fase 3 vs. dashboard)**
- **D-07:** El dueño NO respeta la ventana de reserva pensada para el cliente por WhatsApp (mínimo 60 min de anticipación / máximo 30 días). Puede cargar un turno manual para "ahora mismo", corrección hacia atrás, o más de 30 días. Restricción exclusiva del camino bot/cliente final (Fase 6).
- **D-08 (nota técnica):** Hoy `computeSlots` aplica el filtro de ventana internamente, y `bookAppointment` revalida siempre llamando `computeSlots(freshData)`. Hace falta una forma de bypassear ese filtro solo en el camino del dashboard (ej. `skipBookingWindow?: boolean`, default `false`/comportamiento actual para el bot). El usuario delegó la forma exacta al planner/researcher — requisito duro: un solo motor compartido, sin lógica de disponibilidad paralela para el dashboard.

**Alta manual de turno (cliente que llama/viene)**
- **D-09:** Si el cliente no existe en `cliente` (identificado por teléfono), se busca o crea al vuelo dentro del mismo modal de alta: input de búsqueda por teléfono/nombre; si no hay match, un formulario inline (teléfono + nombre opcional) crea la fila de `cliente` en el momento.
- **D-10:** El slot se elige mostrando los huecos reales calculados por `computeSlots` para el profesional/servicio(s)/día elegidos (sin la ventana de 60min/30d, por D-07) — nunca un input de hora libre sin validar. Mismo componente que usa "Reagendar" (D-13).
- **D-11:** El alta manual reutiliza `bookAppointment` como único camino de escritura (con el bypass de ventana activado) — sin lógica de inserción paralela.

**Cancelar y reagendar**
- **D-12:** Cancelar = confirmación simple ("¿Seguro que querés cancelar este turno?" Confirmar/Volver), sin campo de motivo (no existe columna, no se agrega).
- **D-13:** Reagendar = desde el panel de detalle (D-04), botón "Reagendar" abre un modal con la misma grilla de disponibilidad (mismo componente selector de slot que el alta manual, D-10).
- **D-14:** Reagendar se implementa como UPDATE del mismo `turno` (mismo `turno_id`, se pisan `inicio`/`fin`, y `profesional_id` si cambia) — NO se cancela+crea uno nuevo. Nota técnica: requiere una función nueva (ej. `rescheduleAppointment`, análoga a `bookAppointment` pero con UPDATE) que revalide contra `computeSlots(freshData)` EXCLUYENDO el propio turno que se reagenda de los turnos "activos" que bloquean. Esta misma función la reutilizará el bot en Fase 6 (BOT-10).

### Claude's Discretion

Áreas no discutidas explícitamente por el usuario — decide el planner/researcher:
- Forma exacta del bypass de ventana de reserva (D-08): nombre del flag, si vive en `ComputeSlotsInput`, `BookAppointmentInput`, o ambos.
- Forma exacta de `rescheduleAppointment` (D-14): firma, manejo del error `23P01` (mismo patrón que `bookAppointment`), si vive en `booking.ts` o un módulo nuevo.
- Densidad exacta de la grilla (alto de fila en píxeles, cómo se comprime cuando hay muchos profesionales — scroll horizontal vs. columnas angostas).
- Patrón de fetch/revalidación de la grilla (Server Component + Server Actions con `revalidatePath`, vs. cliente con refetch) — seguir el patrón ya establecido en Fase 2 (Server Actions + `useTransition`, ver `servicio-dialog.tsx`).
- Manejo de negocios sin profesionales activos o sin horario cargado ese día (empty state de la grilla).

### Deferred Ideas (OUT OF SCOPE)

- **Drag-and-drop de turnos sobre la grilla** (para reagendar) — descartado para v1 a favor de un modal con selector de slot; podría evaluarse como mejora futura de UX.
- **Motivo de cancelación** — no se agrega campo de schema en v1; si se necesita auditar cancelaciones a futuro, requeriría una migración.
- **Bloqueos recurrentes** (ej. "todos los martes de 15 a 16") — la tabla `bloqueo` solo soporta instancias puntuales (`inicio`/`fin` concretos); no se discutieron y quedan fuera de esta fase (el horario semanal regular ya cubre la disponibilidad recurrente vía `horario_trabajo`).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| APPT-01 | El dueño ve una grilla de turnos por profesional y por día | Pattern 1 (`buildAvailabilityData` + `computeSlots` orchestration), Recommended Project Structure (`app/(owner)/turnos/page.tsx`, `components/grilla-turnos.tsx`) |
| APPT-02 | El dueño puede bloquear manualmente slots de un profesional | Pattern 3 (D-03 popover flow), `bloqueo` schema confirmed (Sources: `0001_schema_core.sql`), Server Action `crearBloqueo`/`eliminarBloqueo` in Recommended Project Structure |
| APPT-03 | El dueño puede ver el detalle de un turno confirmado (cliente, servicios, precio, horario) | Pitfall 5 (`turno_servicio` join needed beyond `AvailabilityData`), `turno-detail-sheet.tsx` in Recommended Project Structure |
| APPT-04 | El dueño puede cancelar un turno desde el dashboard | Anti-Patterns (no schema change, `estado='cancelado'` only), Pitfall 4 (`revalidatePath` requirement), D-06/D-12 fidelity notes |
| APPT-05 | El dueño puede reagendar un turno desde el dashboard | Pattern 3 (`rescheduleAppointment` full design), Pitfall 2 (self-exclusion), Pitfall 6 (professional/service eligibility gap), Open Question 1 |
| APPT-06 | El dueño puede crear un turno manualmente desde el dashboard | Pattern 2 (D-08 bypass flag), Pattern 4 (client search/inline-create), Don't Hand-Roll table |
</phase_requirements>

## Summary

Phase 4 has almost no external-library risk — the hard part is entirely internal API design on top of code this project already wrote and verified in Phase 3. `computeSlots` and `bookAppointment` are pure/impure functions living in `packages/availability-engine/src/`, already reading `AvailabilityData` (rows pre-fetched by the caller) and already re-validating freshness before insert. The two "critical research questions" from CONTEXT.md (D-08 bypass flag, D-14 `rescheduleAppointment`) are answered directly by reading the existing source: both extensions are additive, narrowly-scoped changes to `computeSlots.ts`/`booking.ts`/`types.ts` that preserve the current bot-facing default behavior.

The dashboard side is a straight continuation of the Phase 2 CRUD pattern (Server Actions + `react-hook-form` + `zodResolver` + `useTransition` + `sonner`, RLS-scoped Supabase client, `negocio_id` always derived server-side from `getNegocioActivo()`, never trusted from client input). No new architectural pattern is needed for the grid itself: it is a Server Component that fetches the same six tables `computeSlots` needs (`horario_trabajo`, `bloqueo`, `turno` (+`turno_servicio`), `servicio`, `profesional`, `negocio`), all scoped to the active `negocio_id`, and renders professionals × time-slots using `computeSlots` output merged with raw `turno`/`bloqueo` rows for coloring. One shadcn component is missing and must be added: `Popover` (needed for D-03's click-to-open mini-menu and D-05's bloqueo-detail popover) — everything else needed (Dialog, Table, Form, DropdownMenu) is already installed.

**Primary recommendation:** Extend `ComputeSlotsInput` with an optional `skipBookingWindow?: boolean` (default `false`, preserves bot behavior exactly) consumed only inside `computeSlots.ts`'s window-filter step; add a new `rescheduleAppointment` function in `booking.ts` (sibling to `bookAppointment`, sharing its freshness-revalidation/23P01-handling pattern) that accepts a `turnoId` to exclude from the "active turnos" filter passed into `computeSlots`, and does an `UPDATE ... WHERE id = turnoId` instead of an `INSERT`. Build the grid as a Server Component fetching the six negocio-scoped tables and delegate all availability math to the existing engine — never hand-roll a second computation.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Compute available slots (grid rendering, slot picker) | API/Backend logic (shared package, invoked from Frontend Server) | — | `computeSlots` is a pure function; Next.js Server Components call it directly in-process (no separate backend service exists yet — bot service is Phase 5/6) |
| Grid rendering (professionals × hours) | Frontend Server (SSR, Server Component) | Browser/Client (color/interaction only) | Data fetch + `computeSlots` orchestration must happen server-side (RLS client, `negocioId` from server-only cookie context); client only needs the rendered grid + click handlers |
| Create/cancel/reschedule/block turno (writes) | API/Backend logic (Server Actions calling `bookAppointment`/`rescheduleAppointment`) | Frontend Server (Server Action is Next.js's backend boundary here) | Same rationale as Phase 2: Server Actions ARE the backend tier in this app (no separate API layer) — writes always go through the shared engine, never a parallel dashboard-only insert |
| Client search/inline-create (`cliente` lookup) | API/Backend logic (Server Action query + insert) | Browser/Client (search input UX) | Must be RLS-scoped (owner JWT), same as all other dashboard writes — no service_role in dashboard |
| Booking-window bypass (D-07/D-08) | API/Backend logic (flag threaded through `ComputeSlotsInput`/`BookAppointmentInput`) | — | Must live inside the shared engine so both dashboard and future bot import the same filter; a dashboard-side skip would violate AVAIL-04 |
| Visual color-coding of slot states | Browser/Client | — | Pure presentation over data already fetched server-side; no additional business logic |
| Double-booking prevention | Database (Postgres GiST EXCLUDE) | API/Backend logic (translates `23P01` to `slot_taken`) | Already implemented (Phase 1/3) — reschedule must replicate this handling, not bypass it |

## Standard Stack

### Core

| Library | Version (installed) | Purpose | Why Standard |
|---------|---------|---------|---------------|
| Next.js | `^16.2.10` | Dashboard App Router, Server Components + Server Actions | Already locked project-wide; grid page is a Server Component under `app/(owner)/turnos/` |
| React | `^19.0.0` | UI runtime | Already locked |
| `@turnosbot/availability-engine` | `workspace:*` (local) | `computeSlots`, `bookAppointment`, new `rescheduleAppointment` | The one and only availability computation/write path (AVAIL-04) — extend it, never duplicate it |
| `@turnosbot/db-types` | `workspace:*` (local) | `Tables<"turno">`, `Tables<"bloqueo">`, `Tables<"cliente">`, `Database` | Source of truth for all row shapes; already used by `types.ts` in the engine |
| `react-hook-form` | `7.80.0` | Form state for turno/bloqueo/cliente-inline modals | Already the established pattern (`servicio-dialog.tsx`) |
| `@hookform/resolvers` (zodResolver) | matches `zod@^4.4.3` peer | Bridges react-hook-form ↔ zod schemas | Already used in every Phase 2 dialog |
| `zod` | `^4.4.3` | Client + server validation, matches `bookAppointmentInputSchema`'s `z` usage in the engine | Already the project-wide validation library |
| `sonner` | `^2.0.7` | Toast feedback on mutations | Already the established pattern |
| `@date-fns/tz` (`TZDate`) | `^1.5.0` | Timezone-correct date math for grid navigation (day picker, "now" comparisons for D-07) | Already a dependency of the engine; dashboard should reuse the same `TZDate` pattern instead of `Intl`/raw `Date` to stay consistent with Pitfall 2 (Phase 3) |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| shadcn `Popover` (`@radix-ui/react-popover`) | `^1.1.18` (peer, matches installed `radix-ui@^1.6.1`) | D-03 click-on-free-slot mini-menu ("Crear turno" / "Bloquear"), D-05 bloqueo-detail popover | **NOT YET INSTALLED** — verified via `ls apps/dashboard/components/ui/` (only alert-dialog, avatar, badge, button, card, checkbox, dialog, dropdown-menu, form, input, label, select, separator, sheet, sidebar, skeleton, sonner, switch, table, tabs, textarea, tooltip exist). Add via `pnpm dlx shadcn@latest add popover` from `apps/dashboard/` — the project already uses `shadcn@^4.13.0` CLI and `radix-ui@^1.6.1` umbrella package, so this is a drop-in addition, not a new dependency family. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| shadcn `Popover` for D-03 mini-menu | shadcn `DropdownMenu` (already installed) | `DropdownMenu` is semantically for menus/actions and already installed — it is a legitimate substitute for the "click slot → 2 options" mini-menu and avoids adding a new component. `Popover` is still needed anyway for D-05 (bloqueo detail, which is content/info + a delete button, not a pure action menu) so installing it is unavoidable regardless; CONTEXT.md's own code_context section explicitly names `Popover` as "a confirmar si ya está instalado" — confirmed NOT installed. |
| Server Component fetch + re-render on `revalidatePath` | Client Component with polling/refetch (SWR/React Query) | Adding a data-fetching library for this phase is unjustified — the grid does not need real-time cross-user sync in v1 (single owner operating their own agenda), and `revalidatePath` after each Server Action already covers the "I just wrote, show me the new state" case established in Phase 2. Do not add SWR/TanStack Query for this. |
| A custom hand-rolled day-of-week grid layout | CSS Grid (`grid-template-columns: repeat(N, minmax(...))`) with native `<table>` or div-grid | No calendar/scheduling UI library is justified at this scope (single day, N professionals as columns) — a library like FullCalendar/react-big-calendar would pull in a week/month view machinery this project explicitly does not need (D-01 locks single-day view) and would fight the "grid state = engine output" model. Plain CSS Grid + shadcn `Table` primitives are sufficient and keep the source of truth simple. |

**Installation:**
```bash
cd apps/dashboard
pnpm dlx shadcn@latest add popover
```

**Version verification:** `@radix-ui/react-popover@1.1.18` confirmed current on the npm registry via `npm view @radix-ui/react-popover version` [VERIFIED: npm registry, 2026-07-05]. The project's `radix-ui@^1.6.1` umbrella package (confirmed installed via `apps/dashboard/package.json`) bundles this primitive — the shadcn CLI `add popover` command generates `components/ui/popover.tsx` sourcing from the already-installed umbrella package, matching the pattern used for every other already-installed shadcn primitive in this repo (no separate `@radix-ui/react-popover` entry needed in `package.json`).

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│ Browser (owner)                                                     │
│  - clicks free slot → Popover(D-03: Crear turno | Bloquear)          │
│  - clicks turno cell → detail panel (D-04: Cancelar | Reagendar)     │
│  - clicks bloqueo cell → Popover(D-05: motivo + Eliminar)            │
└───────────────┬───────────────────────────────────────────────────┬─┘
                │ navigate/open modal                                 │ Server Action call
                ▼                                                     ▼
┌───────────────────────────────────────────┐   ┌───────────────────────────────────────────┐
│ app/(owner)/turnos/page.tsx (Server Comp.) │   │ app/actions/turnos.ts (Server Actions)     │
│  1. getNegocioActivo() → negocio_id        │   │  - crearTurnoManual(input)                  │
│  2. Fetch (RLS client, scoped):            │   │  - cancelarTurno(turnoId)                   │
│     horario_trabajo, bloqueo, turno        │   │  - reagendarTurno(turnoId, nuevoInput)       │
│     (+turno_servicio), servicio,           │   │  - crearBloqueo(input) / eliminarBloqueo(id) │
│     profesional, negocio                   │   │  - buscarOCrearCliente(telefono, nombre?)   │
│  3. Build AvailabilityData                 │   └───────────────┬─────────────────────────────┘
│  4. computeSlots(input, data) → free slots │                   │ calls
│  5. Merge free slots + raw turno/bloqueo   │                   ▼
│     rows → grid cells with color state     │   ┌───────────────────────────────────────────┐
└───────────────┬─────────────────────────────┘   │ @turnosbot/availability-engine (pure pkg)   │
                │ renders                          │  - computeSlots(input, data, now?)          │
                ▼                                  │    + skipBookingWindow?: boolean (D-08)     │
┌───────────────────────────────────────────┐      │  - bookAppointment(input, deps)             │
│ Grid UI (Client Components for            │      │    + skipBookingWindow?: boolean passthrough│
│  interactivity: click handlers, Popover,  │      │  - rescheduleAppointment(input, deps) (D-14)│
│  Dialog forms)                            │      │    excludes turnoId from "active turnos"    │
└────────────────────────────────────────────┘      │  - isSlotTakenConcurrently(error)           │
                                                     └───────────────┬─────────────────────────────┘
                                                                     │ deps.supabase (RLS client, owner JWT)
                                                                     ▼
                                                     ┌───────────────────────────────────────────┐
                                                     │ Supabase Postgres (bdgufnitakelyialjoqg)    │
                                                     │  turno (EXCLUDE gist anti-doble-reserva)    │
                                                     │  bloqueo, cliente, turno_servicio            │
                                                     └───────────────────────────────────────────┘
```

Reading the primary use case (owner reschedules a turno) end to end: browser click on turno cell → detail panel → "Reagendar" → slot picker modal re-fetches fresh `AvailabilityData` and calls `computeSlots` with the bypass flag and the turno's own id passed through so its old slot is excluded → owner picks new slot → Server Action `reagendarTurno` calls `rescheduleAppointment` → engine re-validates via `computeSlots(freshData)` (still excluding `turnoId`) → `UPDATE turno SET inicio=..., fin=..., profesional_id=... WHERE id=turnoId` → GiST EXCLUDE is the final arbiter → `revalidatePath` re-renders the grid.

### Recommended Project Structure

```
apps/dashboard/
├── app/(owner)/turnos/
│   ├── page.tsx                    # Server Component: grid page, day nav via ?fecha= searchParam
│   └── loading.tsx                 # Skeleton while grid data fetches (optional, matches Phase 2 pattern)
├── app/actions/
│   ├── turnos.ts                   # crearTurnoManual, cancelarTurno, reagendarTurno
│   ├── bloqueos.ts                 # crearBloqueo, eliminarBloqueo
│   └── clientes.ts                 # buscarClientePorTelefono, crearClienteInline
├── components/
│   ├── grilla-turnos.tsx           # Client Component: renders the professionals×hours grid, owns click state
│   ├── slot-popover.tsx            # D-03: Popover on empty slot click ("Crear turno" / "Bloquear")
│   ├── turno-detail-sheet.tsx      # D-04: panel on turno click (Sheet or Dialog — see Open Question 1)
│   ├── bloqueo-popover.tsx         # D-05: Popover on bloqueo click (motivo + Eliminar)
│   ├── turno-form-dialog.tsx       # D-09/D-10/D-11: alta manual, reused by reschedule (D-13)
│   ├── slot-selector.tsx           # D-10/D-13 shared component: real computeSlots-backed slot picker
│   ├── cliente-search.tsx          # D-09: search-by-phone + inline create, embedded in turno-form-dialog
│   └── bloqueo-form-dialog.tsx     # APPT-02: bloqueo creation modal
└── lib/
    └── availability-data.ts        # buildAvailabilityData(negocioId, fecha) — the single fetch helper both page.tsx and Server Actions reuse to avoid drift between "what the grid shows" and "what a write revalidates against"
```

### Pattern 1: Single shared `buildAvailabilityData` fetch helper

**What:** One function, `lib/availability-data.ts`, that fetches all six tables (`horario_trabajo`, `bloqueo`, `turno`, `servicio`, `profesional`, `negocio`) scoped to a `negocio_id`, shaped exactly as `AvailabilityData` expects.

**When to use:** Called from `page.tsx` (to render the grid) AND from every Server Action that calls `bookAppointment`/`rescheduleAppointment` (to build `deps.freshData`). This is the mechanism that prevents "two slightly different fetch implementations" drift — a real risk called out implicitly by AVAIL-04's spirit even though AVAIL-04 itself is about the compute step, not the fetch step.

**Example:**
```typescript
// lib/availability-data.ts
import { createClient } from "@/lib/supabase/server";
import type { AvailabilityData } from "@turnosbot/availability-engine";

export async function buildAvailabilityData(negocioId: string): Promise<AvailabilityData> {
  const supabase = await createClient();
  const [horarios, bloqueos, turnos, servicios, negocioRes] = await Promise.all([
    supabase.from("horario_trabajo").select("*").eq("negocio_id", negocioId),
    supabase.from("bloqueo").select("*").eq("negocio_id", negocioId),
    supabase.from("turno").select("*").eq("negocio_id", negocioId),
    supabase.from("servicio").select("*").eq("negocio_id", negocioId),
    supabase.from("negocio").select("*").eq("id", negocioId).single(),
  ]);
  // ...error handling omitted for brevity; throw or return a domain error per
  // the existing GENERIC_ERROR_COPY convention in app/actions/servicios.ts
  return {
    horarios: horarios.data ?? [],
    bloqueos: bloqueos.data ?? [],
    turnos: turnos.data ?? [],
    servicios: servicios.data ?? [],
    negocio: negocioRes.data!,
  };
}
```
Note: for a single day's grid you likely want to narrow `turno`/`bloqueo` queries with a date range filter (`.gte("inicio", dayStart).lt("inicio", dayEnd)` in the business timezone) for performance once data volume grows, but `computeSlots` itself does not require pre-filtering by date — it already filters internally. Fetching the full unfiltered set is simplest and safe to start with; narrow later if needed. `[ASSUMED]` — no explicit guidance in CONTEXT.md on query-narrowing; low risk either way since RLS+negocio_id scoping already bounds the row count to one business's data.

### Pattern 2: D-08 — `skipBookingWindow` flag threaded through `ComputeSlotsInput`

**What:** Add one optional field to `ComputeSlotsInput` in `types.ts`:
```typescript
export interface ComputeSlotsInput {
  negocioId: string;
  serviceIds: string[];
  professionalId?: string;
  date: string;
  /** Si true, computeSlots NO aplica el filtro de ventana de reserva
   * (BOOKING_MIN_LEAD_MINUTES / BOOKING_MAX_ADVANCE_DAYS). Default false
   * preserva el comportamiento actual (bot/cliente final, D-04/D-05 Fase 3).
   * Solo el dashboard (D-07) debe pasar `true`. */
  skipBookingWindow?: boolean;
}
```
Then in `computeSlots.ts`, step 4 ("Ventana de reserva: start >= now+60min y start <= now+30d") becomes conditional:
```typescript
const slotsEnVentana = input.skipBookingWindow
  ? slotsIntervalos
  : slotsIntervalos.filter(
      (slotInterval) => slotInterval.start >= minStart && slotInterval.start <= maxStart,
    );
```
**Where it intercepts:** Exactly at `computeSlots.ts` line ~134-137 (the existing `slotsEnVentana` filter step) — a single conditional branch, no restructuring of the surrounding orchestration (steps 1-3, 5-6 are untouched).

**Why on `ComputeSlotsInput` (not a separate parameter):** `bookAppointment`'s freshness re-validation already builds a `ComputeSlotsInput` internally (`booking.ts` line 237-242, `computeInput`) from `BookAppointmentInput`. The cleanest way for `bookAppointment`/`rescheduleAppointment` to propagate the dashboard's bypass into that re-validation call is to also add `skipBookingWindow?: boolean` to `BookAppointmentInput` and copy it into the `computeInput` object being built — one flag travels the whole path (dashboard Server Action → `BookAppointmentInput.skipBookingWindow` → `bookAppointment` copies it into `computeInput.skipBookingWindow` → `computeSlots` skips the filter). This avoids a second, disconnected way to bypass the window that could drift from what `computeSlots` actually checks.

**When to use:** `skipBookingWindow: true` ONLY from dashboard Server Actions (manual turno creation `crearTurnoManual`, reschedule `reagendarTurno`, and the slot-picker component's `computeSlots` calls that back D-10/D-13). The bot (Phase 6) NEVER sets this field — omitting it defaults to `false`/current behavior, satisfying CONTEXT.md's explicit requirement ("Default debe preservar el comportamiento actual (bot)").

**Confidence:** HIGH — this is a direct reading of `computeSlots.ts`'s actual source (not assumed), and the shape mirrors the existing `now?: number` injectable-parameter pattern already used for testability in both `computeSlots` and `bookAppointment`.

### Pattern 3: D-14 — `rescheduleAppointment` as UPDATE, excluding its own turno from "active" filtering

**What:** A new exported function in `booking.ts`, structurally parallel to `bookAppointment`:

```typescript
export interface RescheduleAppointmentInput {
  negocioId: string;
  turnoId: string;           // the turno being rescheduled — excluded from "active" checks
  profesionalId: string;     // may be same as before, or a new professional
  inicio: string;
  fin: string;
}

export async function rescheduleAppointment(
  rawInput: RescheduleAppointmentInput,
  deps: BookAppointmentDeps,  // same shape: { supabase, freshData, now? }
): Promise<BookAppointmentResult> {  // reuse the same result union (ok/slot_taken/insert_error/validation_error)
  // 1. zod-validate rawInput (new rescheduleAppointmentInputSchema, same uuidLike pattern)
  // 2. Build ComputeSlotsInput from freshData EXCLUDING the turno being moved:
  //    const dataExcludingSelf: AvailabilityData = {
  //      ...freshData,
  //      turnos: freshData.turnos.filter((t) => t.id !== input.turnoId),
  //    };
  // 3. computeSlots(computeInput, dataExcludingSelf, now) with skipBookingWindow: true (D-07)
  // 4. Check requested slot is in freshSlots (same pattern as bookAppointment lines 244-249)
  // 5. UPDATE turno SET inicio, fin, profesional_id WHERE id = turnoId AND negocio_id = negocioId
  //    (no INSERT, no turno_servicio touch — services/snapshots/precio_total are untouched,
  //    since D-14 only repoints inicio/fin/profesional_id, not what was booked)
  // 6. If update error is 23P01 -> { ok:false, reason:"slot_taken" } (same isSlotTakenConcurrently helper)
}
```

**How the exclusion works, concretely:** `computeSlots` builds its "busy" filter from `data.turnos.filter((t) => t.profesional_id === profesionalId && ESTADOS_QUE_BLOQUEAN.has(t.estado))` (computeSlots.ts line 125-127). Filtering the turno being rescheduled OUT of the `turnos` array **before** calling `computeSlots` is sufficient and requires zero changes to `computeSlots` itself — its own logic never needs to know about "self-exclusion" as a concept; it simply never sees the row. This is the same trick as building a `dataExcludingSelf: AvailabilityData` object with `.turnos` filtered, everything else untouched. No new field needed on `ComputeSlotsInput` for this — self-exclusion is entirely a `booking.ts`-side data-prep concern, not a `computeSlots` concern.

**Why no `INSERT`/no `turno_servicio` touch:** CONTEXT.md D-14 explicitly scopes reschedule to overwriting `inicio`/`fin`(/`profesional_id`) on the SAME row — the services booked, their snapshots, and `precio_total` are unaffected by moving a turno to a new time/professional. Only if a future requirement lets the owner change *which services* during a reschedule would `turno_servicio` need touching — out of scope here per D-14's own wording ("se pisan inicio/fin/profesional_id").

**23P01 handling parallel to `bookAppointment`:** Reuse the existing `isSlotTakenConcurrently(error)` helper unchanged — the GiST EXCLUDE constraint (`turno_no_overlap ... WHERE (estado != 'cancelado')`) fires identically whether the conflicting write is an `INSERT` or an `UPDATE` that changes `inicio`/`fin`/`profesional_id` on an existing row, because Postgres re-checks EXCLUDE constraints on UPDATE too. **This is the one point worth double-checking at implementation time** — confirm via a live smoke test (mirroring `scripts/verify-availability-engine.ts` from Phase 3) that an UPDATE that would collide with another turno actually triggers `23P01`, not a different error path, before trusting this in production. `[ASSUMED — HIGH confidence, standard Postgres EXCLUDE behavior, but not re-verified live in this research pass]`.

**Where it lives:** `booking.ts` (not a new module) — CONTEXT.md's own Claude's Discretion section explicitly poses this as an open question and the existing file already contains all the shared pure helpers (`buildTurnoServicioSnapshots` is NOT needed by reschedule, but `isSlotTakenConcurrently`, the uuid validation pattern, and the freshness-revalidation idiom all are) — keeping it in the same file avoids duplicating those imports/patterns in a new module for a ~40-line function.

**Confidence:** HIGH for the exclusion mechanism and overall shape (directly derivable from reading `computeSlots.ts` + `booking.ts`); MEDIUM for the exact Postgres UPDATE-vs-EXCLUDE-constraint trigger behavior (standard behavior, not re-verified live in this session — flag for a live checkpoint at execution time, same pattern Phase 3 used for its own live verification).

### Pattern 4: Client-search-or-create inline (D-09)

**What:** A Server Action `buscarClientePorTelefono(telefono: string, negocioId: string)` that queries `cliente` filtered by `negocio_id` + `telefono` (exact or partial match — recommend exact match on normalized phone since `cliente_telefono_unico_por_tenant`/`negocio` unique constraint implies phone is the natural lookup key), returning existing rows or empty. If no match, an inline form (phone + optional name) calls `crearClienteInline(telefono, nombre?, negocioId)` which does a plain `.insert()` into `cliente` (no engine involvement — `cliente` creation is unrelated to availability computation) and returns the new `cliente_id` to the caller component, which then proceeds to the slot-picker step (D-10) already holding a valid `clienteId`.

**Example (Server Action skeleton):**
```typescript
"use server";
export async function buscarClientePorTelefono(telefono: string) {
  await requireRole("owner");
  const { negocio } = await getNegocioActivo();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cliente")
    .select("id, nombre, telefono")
    .eq("negocio_id", negocio.id)
    .eq("telefono", telefono.trim());
  if (error) return { error: "..." };
  return { clientes: data ?? [] };
}

export async function crearClienteInline(telefono: string, nombre?: string) {
  await requireRole("owner");
  const { negocio } = await getNegocioActivo();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cliente")
    .insert({ negocio_id: negocio.id, telefono: telefono.trim(), nombre: nombre?.trim() || null })
    .select("id")
    .single();
  if (error) return { error: "..." };
  return { clienteId: data.id };
}
```
This follows the exact `requireRole("owner")` + `getNegocioActivo()` + RLS-client + `negocio_id` derivation pattern already established in `app/actions/servicios.ts`.

### Anti-Patterns to Avoid

- **Computing availability in the dashboard without calling `computeSlots`:** Any temptation to "just query `turno`/`bloqueo` directly and eyeball free slots" for the grid must be rejected — the grid MUST call `computeSlots` for the "what's free" logic (even though it separately reads raw `turno`/`bloqueo` rows for coloring already-occupied cells). Two implementations of "what's free" is exactly what AVAIL-04 forbids.
- **A dashboard-only insert path for manual turnos:** D-11 is explicit — `bookAppointment` (with the bypass flag) is the only write path, never a parallel `.insert()` into `turno` from a dashboard action.
- **Cancel-then-recreate for reschedule:** D-14 explicitly forbids this — it would break turno identity/traceability and would also mean the old turno_id referenced in any future WhatsApp confirmation message (Phase 6, BOT-10) goes stale.
- **Trusting a `negocio_id` sent from the client for any read/write in this phase:** every established pattern in this repo derives it from `getNegocioActivo()` server-side; continue that exactly.
- **Using `service_role` anywhere in the dashboard:** confirmed hard rule (CONTEXT.md canonical_refs) — dashboard always uses the RLS-scoped client with the owner's JWT, even for the availability engine's `deps.supabase`.
- **Re-deriving `precio_total`/service snapshots on reschedule:** reschedule only touches `inicio`/`fin`/`profesional_id` — do not re-run `buildTurnoServicioSnapshots` or touch `turno_servicio` rows.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| "What's free for professional X on day Y" | A second interval-subtraction/grid-snap implementation in the dashboard | `computeSlots` from `@turnosbot/availability-engine`, called with real fetched rows | This is the entire point of AVAIL-04 and Phase 3's existence — two implementations WILL drift eventually even if they start identical |
| Concurrency-safe turno creation/update | Manual "check then insert" without re-validation | `bookAppointment`/`rescheduleAppointment`'s existing freshness-revalidation + `23P01`→`slot_taken` translation | The GiST EXCLUDE constraint + re-validation-before-write pattern already solves the TOCTOU race; reimplementing it in a Server Action would reintroduce the race the engine was built to close |
| Timezone-correct "is this slot >= 60min from now" math | Native `Date`/UTC offset arithmetic in a Server Action | `TZDate` from `@date-fns/tz`, same as `computeSlots.ts`/`booking.ts` already use | Pitfall 2 from Phase 3 (never UTC-naive) applies identically here; the engine's own helpers (`isoDateInZone`, `formatHHmmInZone`) are private to `booking.ts` but the pattern (construct a `TZDate` from epoch ms + IANA timezone string) should be mirrored, not reinvented with a different library |
| Day-of-week/calendar grid UI | react-big-calendar / FullCalendar / any scheduling UI library | Plain CSS Grid + shadcn `Table`/`Card` primitives, single-day view only (D-01 locks this) | These libraries are built for week/month/multi-view calendars this project explicitly does not need; adopting one adds a large API surface (event models, recurrence, drag-drop internals) to fight against a UI spec that's actually simpler than what those libraries assume |
| Search-as-you-type combobox for client search (D-09) | A hand-rolled debounced fetch + dropdown | shadcn's already-available primitives (`Input` + a simple filtered list, OR add `Command`/`Combobox` if UX requires typeahead) — a plain phone-number `Input` + "Buscar" button + result list is sufficient given D-09's own wording ("input de búsqueda por teléfono/nombre") and does not require an additional shadcn component | D-09 does not ask for typeahead/fuzzy search — a simple search-then-list is enough and avoids installing `Command`/`cmdk` for a v1 feature that's really "look up by phone, or create" |

**Key insight:** Every "don't hand-roll" item in this phase reduces to the same principle already established in Phase 3: this project has exactly one availability engine, and every dashboard feature in Phase 4 is a consumer of it, never a re-implementer.

## Common Pitfalls

### Pitfall 1: Bypassing the booking window by mistake for the bot path

**What goes wrong:** If `skipBookingWindow` defaults to `true` anywhere, or if a shared helper accidentally always sets it, the bot (Phase 6) would let clients book turnos with <60min notice or >30 days out, silently violating D-04/D-05 from Phase 3.

**Why it happens:** Flags that default to the "permissive" value are an easy mistake when threading a new optional field through multiple layers (`ComputeSlotsInput` → `BookAppointmentInput` → the Server Action).

**How to avoid:** Default `skipBookingWindow` to `undefined`/`false` at every layer; only dashboard Server Actions explicitly pass `true`. Add a unit test in `computeSlots.test.ts` asserting that omitting the field produces byte-identical behavior to the pre-Phase-4 behavior (regression guard for AVAIL-04's "bot and dashboard never discrepan" spirit, even though this flag is precisely where they're *allowed* to diverge by design).

**Warning signs:** Any test or manual QA session where a bot-simulated call (no dashboard context) successfully books a turno less than 60 minutes out.

### Pitfall 2: Reschedule not actually excluding the old slot

**What goes wrong:** If `rescheduleAppointment` calls `computeSlots` with `freshData.turnos` unfiltered, the turno being rescheduled will appear as "busy" against its own old `[inicio, fin)` — meaning the owner can never reschedule a turno to overlap ANY part of its own current slot (e.g., can't shift a turno 15 minutes later if that overlaps the tail of its old slot), which is a nonsensical UX trap even though it's not literally a bug (nothing crashes) — it just makes reschedule feel broken for common "small adjustment" cases.

**Why it happens:** Copy-pasting `bookAppointment`'s freshness-check pattern without adding the filter step that removes the turno's own row from `data.turnos` first.

**How to avoid:** Always build a `dataExcludingSelf` object (`{ ...freshData, turnos: freshData.turnos.filter(t => t.id !== turnoId) }`) before calling `computeSlots` inside `rescheduleAppointment`. Write a unit test with a fixture turno whose new requested time overlaps its own old time — it must succeed.

**Warning signs:** QA manually tries "reschedule this 10:00-10:30 turno to 10:15-10:45" and gets a false `slot_taken`.

### Pitfall 3: `assertScopedToNegocio` throwing on the `dataExcludingSelf` object

**What goes wrong:** `computeSlots.ts`'s `assertScopedToNegocio` checks every row in `data.horarios/bloqueos/turnos/servicios` against `input.negocioId`. Since `dataExcludingSelf` is a spread-and-filter of `freshData` (already negocio-scoped), this should pass cleanly — but if `rescheduleAppointment`'s caller passes a `negocioId` that doesn't match `freshData.negocio.id` (e.g., stale cookie, wrong context), this assertion will throw, which is CORRECT behavior (T-03-09 defense-in-depth) but could look like a mysterious bug if not anticipated.

**Why it happens:** Multi-step Server Action flows (search client → pick slot → confirm) can accumulate stale `negocioId` from an earlier render if the owner switches active negocio mid-flow (D-13, negocio-selector).

**How to avoid:** Always re-derive `negocioId` fresh from `getNegocioActivo()` inside the Server Action at write time, never pass it through client-side form state across the whole multi-step modal flow. Same discipline as `app/actions/servicios.ts` already applies.

**Warning signs:** Intermittent `computeSlots: fila con negocio_id=... no pertenece al negocioId=...` errors during multi-step reschedule flows, especially after switching the active negocio.

### Pitfall 4: Grid showing stale state after a Server Action write

**What goes wrong:** Forgetting `revalidatePath` (or using the wrong path) after `cancelarTurno`/`reagendarTurno`/`crearTurnoManual`/bloqueo actions leaves the grid showing the old state until a manual refresh — directly contradicts ROADMAP Success Criteria #2 ("ese bloqueo se refleja de inmediato en la disponibilidad") and D-06 ("la celda vuelve a verse libre al instante").

**Why it happens:** Easy to forget on a new route (`/turnos`) not yet covered by existing `revalidatePath` calls in `servicios.ts`/`profesionales.ts`.

**How to avoid:** Every write Server Action in `app/actions/turnos.ts`/`bloqueos.ts`/`clientes.ts` must end with `revalidatePath("/turnos")` (or the exact route segment chosen). Since the grid is date-scoped via a search param (`?fecha=...`), confirm `revalidatePath` invalidates correctly across search-param variations (Next.js 16 App Router revalidates the route segment regardless of search params by default — verify this holds for the chosen routing approach at implementation time).

**Warning signs:** Manual QA: cancel a turno, grid cell still shows occupied until browser refresh.

### Pitfall 5: `turno_servicio` join needed for detail panel but not fetched by `buildAvailabilityData`

**What goes wrong:** `AvailabilityData` (the engine's input shape) does NOT include `turno_servicio` — it's not needed for availability computation, only for displaying "which services + snapshot price" in the turno detail panel (APPT-03/D-04). If the grid page only fetches what `buildAvailabilityData` needs, the detail panel will be missing service/price data.

**Why it happens:** Conflating "what `computeSlots` needs" with "what the UI needs to display" — they're different sets of data. CONTEXT.md's own Integration Points section names `turno_servicio` explicitly for this reason ("+turno_servicio para el detalle").

**How to avoid:** Fetch `turno_servicio` (joined or separately) IN ADDITION to the six `AvailabilityData` tables, specifically for rendering the detail panel — this is UI-only data, not engine input. Keep `buildAvailabilityData()` focused strictly on the engine's contract; add a separate query/join for detail-panel display data.

**Warning signs:** Detail panel renders with missing/blank service names or prices.

### Pitfall 6: Reschedule changing `profesional_id` without re-checking `profesional_servicio` (which professionals can perform which services)

**What goes wrong:** PRO-03 (Phase 2) established that not every professional does every service (`profesional_servicio` join table with optional custom price). If reschedule allows moving a turno to a different professional, nothing in the reschedule flow described above checks whether the NEW professional actually offers the services already booked on that turno (frozen in `turno_servicio.nombre_snapshot`/etc, referencing `servicio_id`).

**Why it happens:** `computeSlots`'s candidate-professional resolution (when `professionalId` IS specified, as it always is for reschedule) does not itself validate "does this professional offer these services" — that check lives elsewhere (likely in the original booking flow's professional-selection UI, not in `computeSlots`'s pure availability math). Confirmed by reading `computeSlots.ts`: `serviceIds`/`totalDurationMin` only affects duration sum, not professional eligibility filtering.

**How to avoid:** The reschedule UI (slot-selector, D-13) should restrict the professional-choice step to professionals who actually perform ALL services already on the turno (query `profesional_servicio` for that check) — same as whatever validation the *original* booking flow presumably needs for D-10 (choosing a professional for chosen services). **This is a cross-cutting gap worth flagging to the planner explicitly**, since it also affects D-10 (manual turno creation) — if this validation doesn't already exist as a documented pattern from Phase 2/3, the planner should add a task for it in both the alta-manual and reschedule slot-selector component.

**Warning signs:** Owner reschedules a "corte + barba" turno to a professional who (per `profesional_servicio`) doesn't do barba — turno succeeds with no error, service snapshot silently references a service the new professional doesn't actually perform.

## Code Examples

### D-08 bypass flag propagation (types.ts change)

```typescript
// packages/availability-engine/src/types.ts — ADD to existing interface
export interface ComputeSlotsInput {
  negocioId: string;
  serviceIds: string[];
  professionalId?: string;
  date: string;
  /** D-08 (Fase 4): si true, no aplica la ventana de reserva
   * (BOOKING_MIN_LEAD_MINUTES/BOOKING_MAX_ADVANCE_DAYS). Default false
   * preserva el comportamiento del bot (D-04/D-05, Fase 3). SOLO el
   * dashboard debe pasar true. */
  skipBookingWindow?: boolean;
}

export interface BookAppointmentInput {
  negocioId: string;
  profesionalId: string;
  clienteId: string;
  serviceIds: string[];
  inicio: string;
  fin: string;
  /** D-08: pasado a la revalidación interna de computeSlots. Default false. */
  skipBookingWindow?: boolean;
}
```

### D-08 conditional filter (computeSlots.ts change)

```typescript
// packages/availability-engine/src/computeSlots.ts — line ~134-137, existing code:
// const slotsEnVentana = slotsIntervalos.filter(
//   (slotInterval) => slotInterval.start >= minStart && slotInterval.start <= maxStart,
// );
// BECOMES:
const slotsEnVentana = input.skipBookingWindow
  ? slotsIntervalos
  : slotsIntervalos.filter(
      (slotInterval) => slotInterval.start >= minStart && slotInterval.start <= maxStart,
    );
```
Source: derived directly from reading `packages/availability-engine/src/computeSlots.ts` (this session) — `[VERIFIED: codebase read]`.

### D-14 self-exclusion data prep (booking.ts, new function)

```typescript
// packages/availability-engine/src/booking.ts — new function, sibling to bookAppointment
export const rescheduleAppointmentInputSchema = z.object({
  negocioId: uuidLike,
  turnoId: uuidLike,
  profesionalId: uuidLike,
  inicio: z.iso.datetime(),
  fin: z.iso.datetime(),
});

export async function rescheduleAppointment(
  rawInput: z.infer<typeof rescheduleAppointmentInputSchema>,
  deps: BookAppointmentDeps,
): Promise<BookAppointmentResult> {
  const parsed = rescheduleAppointmentInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      reason: "validation_error",
      issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    };
  }
  const input = parsed.data;
  const { supabase, freshData, now = Date.now() } = deps;

  // Self-exclusion (D-14): the turno being moved must not block its own new slot.
  const dataExcludingSelf: AvailabilityData = {
    ...freshData,
    turnos: freshData.turnos.filter((t) => t.id !== input.turnoId),
  };

  const date = isoDateInZone(input.inicio, freshData.negocio.timezone);
  const computeInput: ComputeSlotsInput = {
    negocioId: input.negocioId,
    serviceIds: [], // see Open Question 2 below — reschedule doesn't change services
    professionalId: input.profesionalId,
    date,
    skipBookingWindow: true, // D-07: owner bypasses the booking window
  };
  // ... revalidate + UPDATE, mirroring bookAppointment's structure (see Pattern 3 above)
}
```
Source: derived directly from reading `packages/availability-engine/src/booking.ts` (this session) — `[VERIFIED: codebase read]`. The `serviceIds: []` placeholder above surfaces Open Question 2 below — resolve before finalizing the plan.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| N/A — this phase extends existing project code, not an external library upgrade | N/A | N/A | N/A |

No external library version churn is relevant to this phase — all core work is internal API extension. Radix/shadcn primitive (`Popover`) confirmed current as of 2026-07-05 `[VERIFIED: npm registry]`.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Postgres re-checks the `EXCLUDE USING gist` constraint on `UPDATE` the same way it does on `INSERT`, triggering the same `23P01` SQLSTATE | Pattern 3 / Code Examples | If wrong, `rescheduleAppointment`'s concurrency handling would silently miss a real double-booking race — MUST be verified with a live smoke test (mirroring `scripts/verify-availability-engine.ts`) before trusting in production, same as Phase 3 did for `bookAppointment`'s INSERT path |
| A2 | Fetching full (unfiltered by date) `turno`/`bloqueo` rows scoped only to `negocio_id` is performant enough for v1 (no date-range narrowing needed yet) | Pattern 1 (`buildAvailabilityData`) | Low risk at current expected scale (few hundred bookings/day per tenant per PROJECT.md), but could need a `.gte/.lt` date-range filter added later if a business accumulates years of turno history |
| A3 | A simple phone-number exact-match search (no typeahead/fuzzy match) satisfies D-09's "input de búsqueda por teléfono/nombre" | Don't Hand-Roll table, Pattern 4 | If the owner expects partial/fuzzy match (e.g., typing partial digits), a plain `.eq()` would feel broken — may need `.ilike()` partial match instead; low implementation cost to fix either way, flagged for planner to confirm exact UX with a quick look at 02-UI-SPEC.md conventions |
| A4 | No existing "which professionals can perform which services" validation gate is enforced anywhere in the current alta-manual or reschedule flow design (Pitfall 6) | Common Pitfalls #6 | If Phase 2's `profesional_servicio` data is meant to gate professional selection during booking and this isn't addressed, turnos could be created/rescheduled to professionals who don't actually perform the booked service — moderate UX/data-integrity risk, should be resolved explicitly in planning, not left implicit |

**If this table is empty:** N/A — see entries above; all four are flagged for planner/discuss-phase confirmation before being treated as locked implementation decisions, though A1 is the only one carrying real correctness risk (the others are UX/performance refinements).

## Open Questions

1. **Does `rescheduleAppointment` need a `serviceIds` field at all?**
   - What we know: D-14 says reschedule overwrites `inicio`/`fin`(/`profesional_id`) only — services stay the same (frozen in `turno_servicio`, unaffected).
   - What's unclear: `computeSlots` needs `serviceIds` to compute `totalDurationMin` for grid-snapping the available slots shown in the reschedule slot-picker (D-13's "misma grilla de disponibilidad"). This means the reschedule Server Action/UI DOES need to know the turno's original services (to pass their IDs into `computeSlots` for correct slot-duration sizing) even though `rescheduleAppointment` itself never rewrites `turno_servicio`.
   - Recommendation: `rescheduleAppointment`'s caller (the Server Action) should fetch the turno's existing `turno_servicio.servicio_id` list and pass those into the `computeSlots` call for slot-picker purposes, but `rescheduleAppointment` itself does not need `serviceIds` as an input field — it only needs `turnoId`/`profesionalId`/`inicio`/`fin`. Planner should decide whether the slot-duration computation happens in the Server Action (fetching turno_servicio first) or whether `rescheduleAppointment` accepts an optional `serviceIds` purely to pass through to its internal `computeSlots` revalidation call. Either works; the second is more consistent with `bookAppointment`'s existing shape.

2. **Exact routing/URL shape for day navigation.**
   - What we know: D-01 requires day-by-day navigation (arrows/date-picker), single day at a time.
   - What's unclear: whether to use a `?fecha=YYYY-MM-DD` search param (simplest, plays well with Server Component fetch + `revalidatePath`) vs. a dynamic route segment (`/turnos/[fecha]`).
   - Recommendation: search param is simpler and consistent with this being a single page with a variable view-state, not a distinct resource per day — but this is genuinely Claude's Discretion per CONTEXT.md and should be decided at planning time, not blocking research.

3. **Professional × service eligibility gate during slot-selection (see Pitfall 6 / A4).**
   - What we know: `profesional_servicio` exists and gates which professional can be assigned which service (Phase 2, PRO-03).
   - What's unclear: whether the ORIGINAL booking flow (bot, Phase 6) or ANY existing Phase 2/3 code already enforces "only show professionals who do this service" as a candidate-filtering step before calling `computeSlots`, or whether this is left entirely to UI-level filtering that hasn't been built yet.
   - Recommendation: planner should explicitly add a task (or confirm it's already covered) for filtering the professional-choice UI in both alta-manual (D-10) and reschedule (D-13) slot-selectors to only offer professionals who have a `profesional_servicio` row for every service on the turno — this is a real correctness gap if left unaddressed, not merely stylistic.

## Environment Availability

Skipped — this phase has no new external service/tool dependencies beyond what Phases 1-3 already established and verified (Node 24, pnpm workspace, Supabase `bdgufnitakelyialjoqg`, Next.js 16 dev/build). The only new package addition is the shadcn `Popover` component, added via the already-installed `shadcn` CLI (`^4.13.0`) — not a new external dependency class.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest `4.1.9` (already configured in `packages/availability-engine/vitest.config.ts` and `apps/dashboard`'s own vitest setup, per Phase 2/3 conventions) |
| Config file | `packages/availability-engine/vitest.config.ts` (engine unit tests); `apps/dashboard/vitest.config.ts` (dashboard-level tests, if any component/action logic needs unit coverage) |
| Quick run command | `pnpm --filter @turnosbot/availability-engine test` |
| Full suite command | `pnpm -r test` (runs every workspace package's `test` script) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| APPT-01 | Grid renders professionals×hours reflecting real computeSlots output | unit (engine) + manual (UI render) | `pnpm --filter @turnosbot/availability-engine test` (computeSlots already covered; grid-consumption is a UI concern needing manual/visual check per Phase 2/3 convention — no automated UI test framework is set up in this repo yet) | ✅ (computeSlots.test.ts exists) / ❌ Wave 0 for UI-level check |
| APPT-02 | Manual bloqueo of a slot reflects immediately in availability | unit (engine: bloqueo subtracted correctly — already covered by AVAIL-01 tests) + manual (grid re-render after Server Action) | `pnpm --filter @turnosbot/availability-engine test -- intervals` | ✅ existing coverage for the subtraction primitive |
| APPT-03 | Turno detail panel shows cliente/servicios/precio/horario | manual (UI) — no pure logic to unit test beyond the `turno_servicio` fetch/join, which is a straightforward Supabase query | N/A (manual QA) | N/A |
| APPT-04 | Cancel sets `estado='cancelado'`, grid frees the cell instantly | unit (Server Action logic, if extracted to a pure function) + manual (grid re-render) | New test file needed | ❌ Wave 0: `apps/dashboard` test for `cancelarTurno` action logic, OR rely on manual QA if the action is thin enough (just an `.update()` call) |
| APPT-05 | Reschedule UPDATEs same turno, excludes own old slot, handles 23P01 | unit (engine: NEW `rescheduleAppointment` — self-exclusion, freshness revalidation, `23P01`→`slot_taken`) | `pnpm --filter @turnosbot/availability-engine test -- booking` | ❌ Wave 0: `booking.test.ts` needs new `describe("rescheduleAppointment")` block, fixtures for a turno being moved to overlap its own old slot |
| APPT-06 | Manual turno creation reuses `bookAppointment` with bypass flag active | unit (engine: `skipBookingWindow` flag — both `true` and default `false` paths) | `pnpm --filter @turnosbot/availability-engine test -- computeSlots` | ❌ Wave 0: `computeSlots.test.ts` needs new cases for `skipBookingWindow: true` (accepts <60min/>30d slots) and omitted/false (unchanged behavior, regression guard) |

### Sampling Rate

- **Per task commit:** `pnpm --filter @turnosbot/availability-engine test` (fast, pure-function unit tests, <5s)
- **Per wave merge:** `pnpm -r test` (full workspace suite) + a live smoke script analogous to `scripts/verify-availability-engine.ts` (Phase 3) extended to cover `rescheduleAppointment`'s UPDATE-triggers-23P01 behavior (A1 above) — this is the one claim in this research that genuinely needs live DB verification, not just unit fixtures
- **Phase gate:** Full suite green + the live reschedule-concurrency smoke check before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `packages/availability-engine/src/computeSlots.test.ts` — add cases for `skipBookingWindow: true`/`false`/omitted (covers APPT-06's bypass requirement and the Pitfall 1 regression guard)
- [ ] `packages/availability-engine/src/booking.test.ts` — add a `describe("rescheduleAppointment")` block: self-exclusion (Pitfall 2's own-slot-overlap case), validation schema, `23P01` handling mirrored from `bookAppointment`'s existing tests
- [ ] A new live verify script (e.g. `scripts/verify-reschedule.ts`, sibling to `scripts/verify-availability-engine.ts`) — gated/manual, to confirm A1 (UPDATE triggers `23P01` on the GiST EXCLUDE the same as INSERT) against the real `bdgufnitakelyialjoqg` database, same pattern as Phase 3's gated live checkpoints
- [ ] No dashboard-level (Next.js) test framework beyond `vitest` is currently configured for component/action-level tests in `apps/dashboard` — confirm at Wave 0 whether Phase 2 set up any component testing (React Testing Library, etc.) or whether this phase continues to rely on manual QA for UI-level behavior (APPT-01/03 grid rendering, detail panel) as Phase 2 apparently did

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | No (new work) | Already covered by Phase 2 (`AUTH-01..04`) — this phase only consumes the existing session |
| V3 Session Management | No (new work) | Same — no new session logic introduced |
| V4 Access Control | Yes | RLS policies (`turno_aislamiento`, `bloqueo_aislamiento`, `cliente_aislamiento` — confirmed present in `0002_rls_policies.sql`) + `requireRole("owner")` defense-in-depth + explicit `.eq("negocio_id", negocio.id)` on every query/mutation, exactly as established in `app/actions/servicios.ts` |
| V5 Input Validation | Yes | `zod` schemas — reuse `bookAppointmentInputSchema`'s `uuidLike` pattern (accepts any well-formed UUID shape, not just RFC4122-strict, per the Phase 3 fix documented in STATE.md) for any new schema (`rescheduleAppointmentInputSchema`, cliente search/create schemas, bloqueo schema) |
| V6 Cryptography | No | Not applicable to this phase — no secrets/tokens introduced |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| Cross-negocio data leakage via a manipulated `negocioId` in a form field passed to a reschedule/cancel/bloqueo Server Action | Information Disclosure / Elevation of Privilege | Always re-derive `negocioId` server-side from `getNegocioActivo()`, never trust a client-submitted `negocioId` for any write — mirrors the existing `T-02-13` anti-pattern already documented in `servicios.ts` |
| Manipulated `turnoId` in a cancel/reschedule request targeting another negocio's turno | Tampering / Elevation of Privilege | RLS (`turno_aislamiento`) blocks this at the DB layer even if a Server Action forgets the explicit `.eq("negocio_id", ...)` — but keep the explicit filter anyway as defense-in-depth (established project convention) |
| Race condition on concurrent reschedule/cancel of the same turno (two browser tabs, or owner + a hypothetical future bot action) | Tampering (double-write race) | Same GiST EXCLUDE + freshness-revalidation-before-write pattern already used by `bookAppointment`; `rescheduleAppointment` must replicate it exactly (Pattern 3) |
| Prompt-injection-adjacent input sanitization for `cliente.nombre`/`bloqueo.motivo` free-text fields | Tampering (stored data used later by BOT-11 context in Phase 6) | Not this phase's direct concern (BOT-11 is Phase 6), but keep free-text fields as plain validated strings (zod `.max()` length caps) — no special escaping needed for Postgres (parameterized via Supabase client), but avoid rendering raw HTML from these fields anywhere in the dashboard UI (React's default escaping already covers this) |

## Sources

### Primary (HIGH confidence)
- `packages/availability-engine/src/computeSlots.ts` (codebase read, this session) — window filter location, candidate professional resolution, `assertScopedToNegocio`
- `packages/availability-engine/src/booking.ts` (codebase read, this session) — `bookAppointment` structure, freshness revalidation pattern, `23P01`/`isSlotTakenConcurrently` handling, snapshot freezing
- `packages/availability-engine/src/types.ts` (codebase read, this session) — `ComputeSlotsInput`/`AvailabilityData`/`BookAppointmentInput` exact shapes
- `packages/availability-engine/src/constants.ts` (codebase read, this session) — `BOOKING_MIN_LEAD_MINUTES`/`BOOKING_MAX_ADVANCE_DAYS`
- `packages/availability-engine/src/grid.ts`, `booking.test.ts` (codebase read, this session)
- `supabase/migrations/0001_schema_core.sql`, `0003_tenant_negocio_split.sql` (codebase read, this session) — `turno`/`bloqueo`/`cliente` exact column shapes, `turno_no_overlap` EXCLUDE constraint, `estado` CHECK values, confirms no cancellation-reason column
- `packages/db-types/src/database.types.ts` (codebase read, this session) — generated row types for `turno`, `bloqueo`, `cliente`, `profesional`
- `apps/dashboard/components/servicio-dialog.tsx`, `app/actions/servicios.ts`, `components/owner-sidebar.tsx`, `components/negocio-selector.tsx`, `app/actions/negocio-activo.ts`, `lib/negocio-context.ts`, `app/(owner)/profesionales/page.tsx` (codebase read, this session) — established Server Action + react-hook-form + RLS pattern
- `ls apps/dashboard/components/ui/` (Bash, this session) — confirmed installed shadcn components, confirmed `Popover` is NOT installed
- `npm view @radix-ui/react-popover version` → `1.1.18` (Bash/npm registry, this session) `[VERIFIED: npm registry]`
- `.planning/phases/03-motor-de-disponibilidad/03-CONTEXT.md`, `.planning/phases/04-grilla-y-turnos-del-dashboard/04-CONTEXT.md`, `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`, `.planning/STATE.md` (all read this session)

### Secondary (MEDIUM confidence)
- Postgres `EXCLUDE USING gist` constraint firing identically on `UPDATE` as on `INSERT` (standard documented Postgres behavior, not re-verified live against `bdgufnitakelyialjoqg` in this research session — flagged as A1/Open Question, recommend a live smoke test at implementation time mirroring Phase 3's own `scripts/verify-availability-engine.ts` checkpoint pattern)

### Tertiary (LOW confidence)
- None — no unverified WebSearch-only claims were needed for this phase; all findings derive from direct codebase reads or the npm registry.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new external libraries beyond one already-compatible shadcn component addition; everything else is already installed and verified in Phases 1-3.
- Architecture: HIGH — directly derived from reading the actual `computeSlots.ts`/`booking.ts`/`types.ts` source, not inferred from documentation or training knowledge.
- Pitfalls: HIGH for engine-extension pitfalls (directly traceable to source code); MEDIUM for the one Postgres UPDATE-vs-EXCLUDE-constraint behavioral claim (A1), which should get a live verification pass at execution time.

**Research date:** 2026-07-05
**Valid until:** No external dependency churn risk for this phase — valid indefinitely for the internal-API portions; the one time-sensitive item (A1, Postgres EXCLUDE-on-UPDATE behavior) should be verified live before Phase 4 is marked complete, not before a fixed calendar date.
