# Phase 3: Motor de disponibilidad - Research

**Researched:** 2026-07-05
**Domain:** Deterministic interval-subtraction scheduling engine (TypeScript, monorepo pure package) + timezone-safe date math + atomic booking write with DB-level concurrency guard
**Confidence:** HIGH (schema/live-DB claims verified directly; date library claims verified via npm registry + Context7; a few algorithmic-structure choices are ASSUMED and flagged)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Alineación de slots (grid snapping)
- **D-01:** Los slots ofrecidos arrancan **siempre en múltiplos de la granularidad del negocio** (`negocio.granularidad_min`, 15 o 30 min: 9:00, 9:30, 10:00…). Agenda prolija y legible para el cliente por WhatsApp. Se acepta que pueda quedar algún "hueco muerto" cuando un turno no termina justo en la grilla — se prioriza legibilidad sobre aprovechar cada minuto. (Descartado: encaje libre en cualquier minuto; híbrido.)

#### Buffer entre turnos
- **D-02:** **Sin buffer en v1** — los turnos van back-to-back (el fin de uno habilita el inicio del siguiente). No se agrega ningún campo de schema por esto ahora. (Buffer configurable → Deferred Ideas.)

#### Auto-asignación de profesional (AVAIL-05)
- **D-03:** Cuando el cliente **no** elige profesional, el motor asigna el profesional con el **hueco disponible más temprano** para el horario pedido (maximiza que el cliente consiga turno cuanto antes). (Descartado: orden fijo del dueño; reparto equitativo por carga.)

#### Ventana de reserva
- **D-04:** El motor solo ofrece slots dentro de una ventana: **mínimo 60 min de anticipación** (no se puede reservar para dentro de menos de 1 hora) y **máximo 30 días hacia adelante**.
- **D-05:** Estos dos límites son **constantes hardcodeadas en el motor en v1** (no columnas por negocio todavía) — cero cambios de schema en esta fase. Exponerlos como configurables por negocio se difiere a Fase 4. Definir las constantes en un único lugar del paquete `@turnosbot/availability-engine` para que sean fáciles de promover a config luego.

#### Decididas en fases previas (se arrastran, no se re-discutieron)
- Timezone AR fijo **UTC−3 sin DST**; todo el cálculo de intervalos se hace en la zona del negocio, nunca UTC-naive (Pitfall 4).
- **Granularidad configurable por negocio** (15/30 min, BIZ-03) — el motor la lee de `negocio.granularidad_min`.
- Turnos con estado `pendiente` **y** `confirmado` **bloquean** el slot; `cancelado` lo libera.
- Multi-servicio (ej: corte + barba) **suma las duraciones** y reserva un **único bloque contiguo** (AVAIL-02).
- Al agendar se **congelan snapshots** de nombre/precio/duración por servicio (AVAIL-03) — columnas `turno_servicio.{nombre,precio,duracion}_snapshot` y `turno.precio_total` ya existen; nunca hacer join vivo a `servicio.precio` (Pitfall 3).
- Doble-reserva imposible a nivel DB (constraint `EXCLUDE USING gist` en `turno`) — el motor evita ofrecer solapamientos, pero la DB es la última línea.

### Claude's Discretion
- Estructura interna del algoritmo de intervalos (cómo resta bloqueos/turnos del horario), librería de fechas (date-fns-tz / Temporal / Intl), y forma exacta de la API del paquete más allá del contrato ya existente en `packages/availability-engine/src/index.ts`.
- Si la función de agendado (crear turno + snapshots + suma de duración) vive en el mismo paquete `availability-engine` o en un módulo de booking adyacente — mientras sea el único camino compartido que garantiza AVAIL-04.
- Cómo se resuelve el desempate cuando dos profesionales tienen el mismo "hueco más temprano" (ej: orden estable por id o por orden de carga) — elegir un criterio determinístico y documentarlo.

### Deferred Ideas (OUT OF SCOPE)
- **Buffer configurable entre turnos** (fijo por negocio o por servicio) — requiere campo de schema (`negocio.buffer_min` o por servicio). No en v1; retomar si los negocios lo piden.
- **Ventana de reserva configurable por negocio** (columnas `reserva_min_anticipacion_min` / `reserva_max_dias` + campos en el perfil del negocio) — diferido a Fase 4, cuando se arme la grilla/booking del dashboard. En v1 son constantes hardcodeadas (D-05).
- **Reparto equitativo / balanceo de carga entre profesionales** para la auto-asignación — descartado para v1 (se eligió "hueco más temprano"); podría ser una opción futura.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-------------------|
| AVAIL-01 | El sistema calcula slots libres cruzando horario de trabajo − bloqueos manuales − turnos confirmados/pendientes | Pattern 1 (interval subtraction), Pitfalls 1/2/4/5, Code Examples (day-bounds + horario resolution), verified live schema shape of `horario_trabajo`/`bloqueo`/`turno` |
| AVAIL-02 | El cálculo soporta turnos multi-servicio sumando las duraciones en un solo bloque contiguo | Pattern 2 (grid snapping sized to total duration), Pitfall 5 (trailing partial slot) |
| AVAIL-03 | Al agendar, el sistema congela nombre, precio y duración de cada servicio en ese momento | System Architecture Diagram (`bookAppointment` module), Pitfall 3, Code Example (concurrency handling), Validation Architecture AVAIL-03 row |
| AVAIL-04 | El motor es un módulo único compartido: el bot y la grilla del dashboard nunca discrepan sobre qué está libre | Architectural Responsibility Map, Anti-Patterns (engine must not hold its own DB client), Validation Architecture AVAIL-04 row (structural/import-hygiene check) |
| AVAIL-05 | Cuando el cliente no tiene preferencia de profesional, el sistema auto-asigna el primer profesional disponible para el horario pedido | Pattern 3 (auto-assignment), Pitfall 6 (deterministic tie-break), Assumption A3 |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Project isolation (hard rule):** This project's ONLY database is Supabase `bdgufnitakelyialjoqg`. Never read/write/reference the restaurant project (`hzgunbftloevclkohcdf`). All live-DB verification in this research used `@supabase/supabase-js` with `.env` keys (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`), confirmed to point at `bdgufnitakelyialjoqg` before every query — never the global Supabase MCP (which may still be session-pinned to the restaurant project depending on when Claude Code was last restarted).
- **Greenfield only:** No code, schema, or pattern reuse from other projects. The availability engine is built from scratch against this repo's own schema and existing stub contract.
- **Tech stack locks relevant to this phase:** Node 24.x, TypeScript strict, pnpm monorepo, Vercel AI SDK (consumer-side only, Fase 6 — not this package), Vitest for tests, Supabase (Postgres) with `tenant_id`/`negocio_id`-scoped RLS. Gemini/WhatsApp/Fastify stack items are not directly relevant to this phase's scope (pure compute package).
- **GSD workflow enforcement:** File-changing work in this phase must go through `/gsd-execute-phase` (or another GSD entry point) once planning produces PLAN.md — no direct ad-hoc edits outside the workflow.
- **Timezone rule (repeated, hard requirement):** Never hardcode a `-3` offset anywhere in the engine, even though Argentina has no DST — always resolve via the IANA zone name (`America/Argentina/Buenos_Aires`, read from `negocio.timezone`).

## Summary

Phase 3 implements `@turnosbot/availability-engine`, replacing the stub `computeSlots` in `packages/availability-engine/src/index.ts` with a real, pure, deterministic function. The algorithm is a classic **interval subtraction** problem: for a given professional and day, take the recurring `horario_trabajo` blocks (already resolved to that day-of-week), subtract `bloqueo` intervals, subtract active `turno` intervals (`pendiente`/`confirmado`; `cancelado` is excluded from the subtraction), and emit grid-aligned slots sized to the requested service duration(s). This must run identically whether called from the bot (service_role, Fase 6) or the dashboard grid (RLS, Fase 4) — the shared package guarantees AVAIL-04 by construction, provided it stays pure (data in, slots out) and does not embed its own Supabase client.

The most consequential finding from this research is **not** algorithmic — it's a live schema drift bug: migration `0003_tenant_negocio_split.sql` (already applied to the live `bdgufnitakelyialjoqg` project, verified by direct query) renamed every operational table's tenant column from `tenant_id` to `negocio_id`, but `apps/bot/src/db/tenantScoped.ts` was never updated and still queries `.eq("tenant_id", tenantId)` against `turno`, `bloqueo`, `horario_trabajo`, `servicio`, `profesional_servicio`, `cliente`, `conversacion`, `mensaje`, `recordatorio`. A live query against `turno.tenant_id` was executed during this research and returned `column turno.tenant_id does not exist`. Any plan for this phase MUST budget a task to fix or bypass `tenantScoped.ts` before the bot-side data-fetching layer that feeds `computeSlots` can work — this is a blocking pre-existing defect, not new phase scope, but it sits directly in this phase's critical path since the engine's bot-side data access depends on it.

**Primary recommendation:** Build `computeSlots` as a pure function operating on plain data (arrays of already-fetched rows, not a DB client), using `@date-fns/tz`'s `TZDate` for all timezone-aware arithmetic (never native `Date`/UTC-naive math), with a small internal interval-subtraction utility (`subtractIntervals`), a grid-snapping pass, and a separate `bookAppointment` function (same package, adjacent module) that performs the atomic insert (turno + turno_servicio snapshots + precio_total) and treats Postgres `23P01` (exclusion_violation) as the expected concurrency-loss signal, not an unhandled error.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Slot computation (horario − bloqueos − turnos) | Shared pure package (`@turnosbot/availability-engine`) | — | AVAIL-04 requires exactly one implementation; must not live in bot or dashboard individually |
| Data fetching (rows for horario/bloqueo/turno/servicio) | Consumer (bot's `tenantScoped`, dashboard's RLS client) | — | Keeps the engine free of DB clients/auth context so it works under both service_role and RLS without duplicating query logic |
| Grid alignment / slot duration sizing | Shared pure package | — | Pure math (D-01), no I/O, belongs with the algorithm |
| Booking window enforcement (60min/30d) | Shared pure package | — | Constants per D-05; single place to promote to config later |
| Auto-assignment (earliest professional) | Shared pure package | — | Pure decision over already-computed per-professional slots |
| Atomic booking write (turno + turno_servicio + precio_total) | Shared pure package (adjacent module) or Database/Storage tier via function | API / Backend (bot tool layer, Fase 6) and Dashboard server actions (Fase 4) as callers | Must be the single write path for AVAIL-04 parity; DB's GiST EXCLUDE is the last line of defense, not the primary mechanism |
| Concurrency conflict handling (23P01 retry/surface) | Database / Storage (constraint) + caller (catch + retry-or-report) | — | Postgres enforces; caller decides UX (re-offer slots) |
| Timezone conversion (IANA-aware) | Shared pure package | — | Must be identical in both consumers; centralizing avoids drift between bot's and dashboard's date math |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|---------------|
| `date-fns` | `^4.4.0` (verified via `npm view`, 2026-07-05) | Base date arithmetic (add/subtract minutes, compare, format) | Already the ecosystem default for immutable, tree-shakeable date math in this stack's TypeScript codebases; v4 is current major. `[VERIFIED: npm registry]` |
| `@date-fns/tz` | `^1.5.0` (verified via `npm view`, 2026-07-05) | `TZDate` class — construct/convert dates in `America/Argentina/Buenos_Aires` without ever hardcoding a `-3` offset | Official first-class timezone integration for date-fns v4 (replaces the older standalone `date-fns-tz` package's role for new v4 projects — see Alternatives below). `[VERIFIED: Context7 /date-fns/tz docs]` |
| `zod` | `^4.4.3` (verified via `npm view`, matches project-wide pin in CLAUDE.md) | Runtime validation of `ComputeSlotsInput` / booking input at the package boundary | Already the project-standard validation library (dashboard schemas, AI SDK tool params); reuse rather than hand-roll input checks. `[VERIFIED: npm registry + project CLAUDE.md]` |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `vitest` | `^4.1.9` (already pinned in `apps/dashboard/package.json`) | Unit tests for the engine (deterministic, no I/O) | Every pure function in `computeSlots`/`subtractIntervals`/grid-snapping — this is the primary verification method for AVAIL-01/02/05 (see Validation Architecture). `[VERIFIED: apps/dashboard/package.json]` |
| `@supabase/supabase-js` | `^2.110.0` (already pinned workspace-wide) | Only used by the **consumers** (bot, dashboard) to fetch rows and call the booking function — NOT a dependency of `availability-engine` itself | Keep the engine package dependency-free of any DB client so it stays pure/portable and testable without network access. `[VERIFIED: root package.json]` |
| `@turnosbot/db-types` | workspace (already exists, generated 2026-07 after migration 0003) | Row types for `turno`, `horario_trabajo`, `bloqueo`, `servicio`, `turno_servicio`, `negocio` | Use `Database["public"]["Tables"]["turno"]["Row"]` etc. as the engine's input types instead of hand-declaring parallel shapes — avoids drift if the schema changes again. `[VERIFIED: packages/db-types/src/database.types.ts, read directly]` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@date-fns/tz` (`TZDate`) | `date-fns-tz@3.2.0` (older standalone package) | `date-fns-tz@3.2.0`'s peer deps do accept `date-fns ^3.0.0 \|\| ^4.0.0` (verified via `npm view date-fns-tz peerDependencies` — this contradicts a WebSearch summary claiming v3/v4 incompatibility, so treat that summary as wrong), but the date-fns team's own v4 migration guidance points new projects at `@date-fns/tz`'s `TZDate` as the integrated, forward path. For a greenfield v1 package, prefer `@date-fns/tz`. `[VERIFIED: npm registry peerDependencies + Context7]` |
| `@date-fns/tz` | `luxon@3.7.2` | Luxon has excellent IANA timezone support and is arguably more ergonomic for "wall-clock time in zone X" reasoning, but it's a second, unrelated date library the project doesn't otherwise use — pulling it in alongside `date-fns` (which the dashboard likely wants for lightweight formatting) means two date libraries in one monorepo. Valid fallback if `@date-fns/tz`'s API proves awkward during implementation. `[ASSUMED — not benchmarked against this specific algorithm]` |
| `@date-fns/tz` | Native `Temporal` (TC39 built-in) | **Not available** — verified live on this machine: `node --version` → `v24.13.1`; `node -e "console.log(typeof Temporal)"` → `undefined`; `node --experimental-temporal` → `bad option` (flag doesn't exist in this Node build). Temporal is not shipped in Node 24 at all (V8 has not stabilized it yet as of this date). Do not plan around native `Temporal` for this phase. `[VERIFIED: local Node 24.13.1 runtime test]` |
| `@date-fns/tz` | `temporal-polyfill@1.0.1` | Viable but adds a third-party polyfill for an unshipped TC39 API purely to get `Temporal.ZonedDateTime` semantics — unnecessary complexity vs. the well-established `date-fns`+`@date-fns/tz` pairing for a project already using date-fns-adjacent tooling. Reconsider only if/when Node ships Temporal natively. `[ASSUMED]` |
| Engine doing its own DB reads | Engine as pure function (data in, slots out) | Locked by CONTEXT.md discretion note + AVAIL-04 requirement: a DB-coupled engine would need two Supabase client configurations (service_role vs RLS-cookie) baked into one "pure" package, defeating the "single source of truth, testable in isolation" goal. Pure function is the only approach consistent with the phase's own stated boundary ("cómputo puro"). `[CITED: 03-CONTEXT.md domain/decisions]` |

**Installation:**
```bash
pnpm --filter @turnosbot/availability-engine add date-fns @date-fns/tz zod
pnpm --filter @turnosbot/availability-engine add -D vitest
```

**Version verification:** Confirmed live via `npm view <pkg> version` on 2026-07-05: `date-fns@4.4.0`, `@date-fns/tz@1.5.0`, `zod@4.4.3`, `vitest@4.1.9` (already used in `apps/dashboard`), `@supabase/supabase-js@2.110.0` (already pinned workspace-root). No package in this list is newly introduced to the workspace except `date-fns` and `@date-fns/tz`, which have zero existing usages in the repo (`grep` found none) — this is a clean net-new addition, not an upgrade.

## Architecture Patterns

### System Architecture Diagram

```
                     ┌───────────────────────────────────────────┐
                     │   Consumer (bot tool layer / dashboard)     │
                     │   - fetches rows via tenantScoped()/RLS     │
                     │   - resolves professional_id candidates     │
                     └───────────────────┬─────────────────────────┘
                                         │  (plain arrays: HorarioRow[],
                                         │   BloqueoRow[], TurnoRow[],
                                         │   ServicioRow[], negocio row)
                                         ▼
        ┌────────────────────────────────────────────────────────────────┐
        │        @turnosbot/availability-engine  (PURE, no I/O)          │
        │                                                                │
        │  computeSlots(input, data)                                    │
        │   1. Resolve requested date → day-of-week in negocio.timezone │
        │      (TZDate, IANA zone — never UTC-naive)                    │
        │   2. Sum service durations → totalDurationMin (AVAIL-02)      │
        │   3. For each candidate professional:                        │
        │        a. horario_trabajo rows for that dia_semana            │
        │           → work-hour interval(s) for the date                │
        │        b. subtractIntervals(workIntervals, bloqueos)          │
        │        c. subtractIntervals(result, activeTurnos)             │
        │           (estado IN pendiente,confirmado; cancelado excluded)│
        │        d. snapToGrid(remaining, granularidad_min, totalDur)   │
        │        e. filterBookingWindow(slots, now, +60min, +30d) (D-04)│
        │   4. If no professionalId given → auto-assign (D-03):         │
        │        pick professional with the single earliest start      │
        │        across all professionals' slot lists; tie-break        │
        │        deterministically (see Pitfall/Open Question below)   │
        │   5. Return AvailableSlot[] (grid-aligned, tz-local HH:mm)    │
        └───────────────────────────┬──────────────────────────────────┘
                                     │  AvailableSlot[] chosen by user/bot
                                     ▼
        ┌────────────────────────────────────────────────────────────────┐
        │   bookAppointment(input) — adjacent module, SAME package       │
        │   1. Re-validate chosen slot against fresh computeSlots()      │
        │      (never trust a slot computed >N seconds ago — Anti-       │
        │      Pattern: caching computed availability)                  │
        │   2. INSERT turno (estado='pendiente'|'confirmado', inicio/fin)│
        │   3. INSERT turno_servicio rows: freeze nombre/precio/duracion │
        │      snapshots from servicio (AVAIL-03) — never live join      │
        │   4. SUM precio_snapshot → turno.precio_total                  │
        │   5. Steps 2-4 in ONE transaction; catch SQLSTATE 23P01        │
        │      (EXCLUDE violation) as "slot taken concurrently" —        │
        │      surface as re-offer-slots, not a 500                     │
        └────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
                     ┌───────────────────────────────────────────┐
                     │   Postgres: turno_no_overlap EXCLUDE       │
                     │   USING gist (last line of defense,        │
                     │   CORE-05, already live)                   │
                     └───────────────────────────────────────────┘
```

### Recommended Project Structure

```
packages/availability-engine/
├── src/
│   ├── index.ts              # public exports: computeSlots, bookAppointment, types, constants
│   ├── constants.ts           # BOOKING_MIN_LEAD_MINUTES=60, BOOKING_MAX_ADVANCE_DAYS=30 (D-05)
│   ├── intervals.ts           # subtractIntervals(), mergeIntervals() — pure interval math
│   ├── grid.ts                # snapToGrid() — align to granularidad_min multiples (D-01)
│   ├── schedule.ts            # resolveWorkIntervalsForDate() — horario_trabajo + dia_semana → date-scoped interval
│   ├── computeSlots.ts         # orchestrates: schedule − bloqueos − turnos → grid → window filter → auto-assign
│   ├── booking.ts              # bookAppointment() — atomic insert + snapshot freeze + 23P01 handling
│   ├── types.ts                # ComputeSlotsInput, AvailableSlot, BookAppointmentInput, row-shape aliases from @turnosbot/db-types
│   └── *.test.ts               # colocated vitest unit tests per module
├── vitest.config.ts            # new — Wave 0 gap, mirrors apps/dashboard/vitest.config.ts pattern
└── package.json                 # add date-fns, @date-fns/tz, zod, vitest
```

### Pattern 1: Interval Subtraction (core algorithm)

**What:** Given a sorted list of "free" intervals and a sorted list of "busy" intervals (bloqueos + active turnos merged), produce the remaining free intervals.
**When to use:** This is the single core primitive for AVAIL-01. Implement once, reuse for both the "subtract bloqueos" and "subtract turnos" passes (or merge busy intervals first, then subtract once — simpler and avoids double interval-splitting bugs).
**Example:**
```typescript
// Pure interval subtraction — half-open intervals [start, end), matching
// the DB's own tstzrange(inicio, fin, '[)') semantics (Pitfall: boundary
// consistency — see Common Pitfalls).
interface Interval { start: number; end: number } // epoch ms, half-open [start, end)

function subtractIntervals(free: Interval[], busy: Interval[]): Interval[] {
  const sortedBusy = [...busy].sort((a, b) => a.start - b.start);
  let result: Interval[] = [...free];

  for (const b of sortedBusy) {
    const next: Interval[] = [];
    for (const f of result) {
      if (b.end <= f.start || b.start >= f.end) {
        // no overlap
        next.push(f);
        continue;
      }
      if (b.start > f.start) next.push({ start: f.start, end: Math.min(b.start, f.end) });
      if (b.end < f.end) next.push({ start: Math.max(b.end, f.start), end: f.end });
    }
    result = next.filter((i) => i.end > i.start);
  }
  return result;
}
```
Source pattern: standard sweep-line interval subtraction — this is textbook algorithm design, not from a specific library doc. `[ASSUMED — standard CS pattern, not sourced from a library; verify with unit tests covering every boundary case listed in Common Pitfalls]`

### Pattern 2: Grid Snapping Sized to Multi-Service Duration (D-01, AVAIL-02)

**What:** After subtraction, only emit slot *start* times that are multiples of `granularidad_min` from the work-block's own start, AND where `start + totalDurationMin <= freeIntervalEnd`.
**When to use:** Every remaining free interval, after the subtraction pass.
**Example:**
```typescript
function snapToGrid(
  freeIntervals: Interval[],
  granularidadMin: number,
  totalDurationMin: number,
  workBlockStart: number, // anchor for grid alignment — grid is relative to
                            // the professional's shift start, per D-01 intent
                            // ("9:00, 9:30, 10:00…"), not relative to midnight.
): Interval[] {
  const granMs = granularidadMin * 60_000;
  const durMs = totalDurationMin * 60_000;
  const slots: Interval[] = [];

  for (const free of freeIntervals) {
    // First grid-aligned instant >= free.start, anchored to workBlockStart
    const offset = Math.ceil((free.start - workBlockStart) / granMs) * granMs;
    let candidate = workBlockStart + offset;
    while (candidate + durMs <= free.end) {
      slots.push({ start: candidate, end: candidate + durMs });
      candidate += granMs;
    }
  }
  return slots;
}
```
**Anchor choice matters (ASSUMED, flag for planner/user):** D-01's example ("9:00, 9:30, 10:00…") implies the grid is anchored to a clean wall-clock boundary (likely midnight or the shift start — both coincide when shifts start on :00/:30). If a professional's `horario_trabajo.hora_inicio` is itself off-grid (e.g., `09:05`), anchoring to `workBlockStart` vs. anchoring to midnight produces different slot sets. Recommend anchoring to **midnight in the negocio's timezone** (so slots always land on absolute clock marks like 9:00, 9:30 regardless of shift start) rather than to shift start — this matches the "agenda prolija" (tidy calendar) intent better. `[ASSUMED — not explicitly disambiguated in CONTEXT.md; surface as an open question]`

### Pattern 3: Auto-Assignment — Earliest Slot Across Professionals (D-03, AVAIL-05)

**What:** Compute slots per-candidate-professional independently, then pick the professional whose earliest available slot start is lowest.
**When to use:** Only when `professionalId` is omitted from `ComputeSlotsInput` (or a new `preferredProfessionalId?` field, since the current stub's `professionalId` is used both as filter-if-given and as absent-triggers-auto-assign).
**Example:**
```typescript
function autoAssign(
  slotsByProfessional: Map<string, AvailableSlot[]>,
): { professionalId: string; slot: AvailableSlot } | null {
  let best: { professionalId: string; slot: AvailableSlot } | null = null;
  // Map iteration order = insertion order in JS — insert professionals in a
  // STABLE order (e.g., sorted by profesional.id or profesional.created_at)
  // upstream, so tie-breaks are deterministic run-to-run (see Open Questions).
  for (const [professionalId, slots] of slotsByProfessional) {
    if (slots.length === 0) continue;
    const earliest = slots[0]; // slots assumed pre-sorted ascending by start
    if (!best || earliest.start < best.slot.start) {
      best = { professionalId, slot: earliest };
    }
  }
  return best;
}
```

### Anti-Patterns to Avoid

- **Engine holding its own Supabase client:** Defeats AVAIL-04's guarantee and CONTEXT.md's explicit discretion note. Keep `computeSlots`/`bookAppointment` as functions that accept already-fetched rows (or, for `bookAppointment`, accept an injected query executor — see Open Questions) — never `import { createClient } from "@supabase/supabase-js"` inside `packages/availability-engine`.
- **Caching computed availability:** `apps/bot`'s existing schema comment on `conversacion.context` explicitly warns against this ("NEVER caches computed availability... createAppointment always re-validates"). `bookAppointment` MUST re-run `computeSlots` (or an equivalent narrow existence check) immediately before the insert, inside the same logical operation, not trust a slot object handed in from a prior turn of conversation.
- **Doing interval math in UTC-naive `Date` arithmetic:** Argentina has no DST, so naive UTC-3 offset math will *usually* work by coincidence — but this masks day-boundary bugs (a date string like `"2026-07-10"` must resolve to midnight **in `America/Argentina/Buenos_Aires`**, not midnight UTC, or slots can shift by 3 hours / land on the wrong calendar day near midnight). Always construct via `TZDate` with the explicit IANA zone.
- **Reading `servicio.precio` at booking time for `precio_total`:** Schema comment on `turno.precio_total` is explicit: "never a live join to servicio.precio." Always sum `turno_servicio.precio_snapshot` rows written in the same transaction.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Timezone-aware "what day/hour is this instant, in zone X" | A manual `+/- 3 hours` offset function | `TZDate` from `@date-fns/tz` | Even though AR has no DST, hand-rolled offset math has historically been the #1 source of off-by-N-hours scheduling bugs industry-wide; `TZDate` uses `Intl`'s IANA tz database under the hood, correctly reproducing wall-clock semantics. |
| Double-booking prevention | An application-level "check then insert" race-prone guard | Postgres `EXCLUDE USING gist` (already live, CORE-05) | The constraint is already the source of truth; the engine's job is to avoid *offering* overlapping slots as a UX nicety, not to be the concurrency guarantee. Re-implementing locking in app code (e.g., `SELECT ... FOR UPDATE` loops) adds complexity the DB already solves atomically. |
| Interval overlap/merge logic | A bespoke ad-hoc "is this the same day" / "does this touch that" set of if-statements sprinkled across the codebase | One `subtractIntervals`/`mergeIntervals` pair in `intervals.ts`, unit-tested exhaustively | `apps/dashboard/lib/schemas/horario.ts` already has its own tiny overlap-check reimplementation (`bloquesSolapan`) for a *different* purpose (validating input blocks don't overlap each other) — do not extend that function's scope into the availability engine; it solves a narrower problem (same-day block validation, HH:mm strings) and is not built for timestamptz/multi-day interval subtraction. |

**Key insight:** This domain (recurring-schedule minus exceptions minus bookings) is exactly the "calendar availability" problem every scheduling SaaS solves — the failure mode is never "the algorithm is hard," it's "boundary conditions were handled inconsistently between the two call sites." Concentrating all interval math in one small, heavily-unit-tested module is the entire risk mitigation.

## Common Pitfalls

### Pitfall 1: Half-open interval boundary inconsistency ([start, end) vs [start, end])
**What goes wrong:** A turno ending at 10:00 and another starting at 10:00 look "adjacent" to a human but if the subtraction logic uses closed intervals `[start, end]`, the algorithm will incorrectly treat 10:00 as unavailable for the second turno (or worse, allow a 1-instant overlap).
**Why it happens:** The DB's own `turno_no_overlap` constraint uses `tstzrange(inicio, fin, '[)')` — explicitly half-open — precisely so back-to-back turnos (D-02: no buffer) are valid. If the engine's interval math doesn't mirror `[)` semantics exactly, it will either falsely reject legitimate back-to-back bookings or falsely allow instant-overlaps the DB will then reject at insert time (bad UX: slot looked free, booking failed).
**How to avoid:** Use `end <= start_next` (not `<`) as the "no overlap" test everywhere (`Pattern 1` code above uses `b.end <= f.start || b.start >= f.end`, matching `[)` semantics). Unit test explicitly: a turno ending exactly at a bloqueo's start must NOT create a gap-of-zero that gets filtered out incorrectly, and must NOT be treated as overlapping.
**Warning signs:** Off-by-one slot counts in tests where two busy intervals touch exactly at a grid boundary.

### Pitfall 2: DST-style traps despite AR having no DST
**What goes wrong:** Developers reason "AR has no DST, so `Date.now() - 3*3600*1000` is always correct" and hardcode the offset, which happens to produce correct results in manual testing — until a `date` string is parsed as UTC midnight instead of Buenos Aires midnight, silently shifting an entire day's slot list by 3 hours (early-morning slots vanish or appear on the wrong day near month/day boundaries).
**Why it happens:** `ComputeSlotsInput.date` is `"YYYY-MM-DD ... interpreted in the tenant's timezone"` per the existing stub's own doc comment — but `new Date("2026-07-10")` in Node parses as UTC midnight, not Buenos Aires midnight. The difference (3 hours) is small enough to pass casual manual testing but wrong for slots near the day boundary.
**How to avoid:** Always construct the day-start as `new TZDate(year, month, day, negocio.timezone)` (or equivalent `@date-fns/tz` API), never `new Date(dateString)`. Unit test a date where a work block starts at 00:00–02:00 to catch this.
**Warning signs:** Tests pass with granularidad/negocio timezone matching system timezone (developer's machine set to `America/Argentina/*`) but fail in CI (UTC) — a classic "works on my machine" timezone bug.

### Pitfall 3: `precio_total` computed as a live join instead of summed snapshots
**What goes wrong:** A later `servicio.precio` edit (owner changes price next week) silently rewrites historical `turno.precio_total` if it's computed via a join at read time instead of frozen at write time.
**Why it happens:** It's tempting to compute price on-the-fly since `servicio` is right there — but AVAIL-03 and the schema comment are explicit that snapshots must freeze at booking time.
**How to avoid:** `bookAppointment` sums `precio_snapshot` values it is about to insert into `turno_servicio`, and writes that sum into `turno.precio_total` in the same transaction. Never re-derive `precio_total` from `servicio` after the fact (e.g., in a repair script or migration).
**Warning signs:** A report or test where changing a service's price retroactively changes a historical appointment's total.

### Pitfall 4: `pendiente` treated as "not really blocking"
**What goes wrong:** A common instinct is "only `confirmado` turnos should block a slot, `pendiente` ones are just tentative" — but CONTEXT.md and REQUIREMENTS.md both explicitly state `pendiente` AND `confirmado` block; only `cancelado` frees.
**Why it happens:** The word "pendiente" (pending) linguistically suggests "not yet real," inviting the wrong assumption.
**How to avoid:** Filter clause is `estado IN ('pendiente', 'confirmado')` for "busy," matching the DB's own `turno_no_overlap` constraint's `WHERE (estado != 'cancelado')` predicate — the engine's definition of "busy" must be the logical inverse of the DB's definition of "not excluded from the overlap check," or the engine will offer slots the DB then rejects.
**Warning signs:** A slot is offered, booking attempt gets a `23P01` even with no concurrent user — sign the engine's "busy" filter diverged from the DB constraint's `WHERE` clause.

### Pitfall 5: Trailing partial slot that doesn't fit before the work block ends
**What goes wrong:** A work block ends at 18:00, granularidad is 30 min, requested service duration is 45 min. A naive grid walk might offer a slot starting at 17:30 (17:30–18:15) that runs past the work block end.
**Why it happens:** Forgetting the `candidate + durationMs <= free.end` check (Pattern 2 above enforces this) — easy to drop when duration isn't a clean multiple of granularidad.
**How to avoid:** Always gate slot emission on `candidate + totalDurationMin <= freeIntervalEnd`, never just `candidate < freeIntervalEnd`. Per D-01, this legitimately produces a "dead gap" (17:30–18:00 offered nothing, which is correct and accepted per the locked decision) — don't try to "fix" this by allowing off-grid starts.
**Warning signs:** A booked multi-service appointment that ends after the professional's shift end in test fixtures.

### Pitfall 6: Auto-assignment tie-break is non-deterministic
**What goes wrong:** Two professionals both have their earliest available slot at exactly 10:00. If tie-break order depends on object/array iteration order that isn't explicitly fixed (e.g., depends on DB row-return order, which Postgres does not guarantee without `ORDER BY`), two runs with identical data could auto-assign different professionals.
**Why it happens:** JS `Map`/array iteration order is insertion-order-stable, but *insertion* order is only as deterministic as the upstream query — if the consumer's fetch of `profesional` rows has no `ORDER BY`, insertion order (and therefore the tie-break) is technically unstable across Postgres query plans.
**How to avoid:** CONTEXT.md explicitly defers this exact decision to Claude's discretion ("elegir un criterio determinístico y documentarlo"). Recommend: sort candidate professionals by `profesional.id` (stable, always available, no extra column needed) before iterating in `autoAssign`. Document this choice in the engine's code comments and in the plan.
**Warning signs:** Flaky auto-assignment tests where the "expected" professional changes between runs without input data changing.

### Pitfall 7: `tenantScoped.ts` / bot data-access layer references a column that no longer exists (BLOCKING, pre-existing)
**What goes wrong:** `apps/bot/src/db/tenantScoped.ts` builds every accessor (`turnos()`, `bloqueos()`, `horariosTrabajo()`, `servicios()`, `profesionalServicios()`, `clientes()`, `conversaciones()`, `mensajes()`, `recordatorios()`) with `.eq("tenant_id", tenantId)`. Migration `0003_tenant_negocio_split.sql` dropped `tenant_id` from every one of those tables and replaced it with `negocio_id`. **Verified live** against `bdgufnitakelyialjoqg`: `supabase.from("turno").select("*").eq("tenant_id", ...)` returns the Postgres error `column turno.tenant_id does not exist`.
**Why it happens:** `tenantScoped.ts` was written in Phase 1 (before migration 0003 existed) and was never updated when Phase 2's migration 0003 landed — the file predates the negocio split and nothing in Phase 2's scope touched `apps/bot`.
**How to avoid:** This phase's plan MUST include a task to either (a) fix `tenantScoped.ts` to scope by `negocioId` instead of `tenantId` (rename the function/param accordingly, matching the dashboard's `auth_negocio_ids()` mental model), or (b) introduce a parallel `negocioScoped(negocioId)` helper in `apps/bot/src/db/` for the availability engine's data-fetching needs, leaving the old (broken) `tenantScoped` for a separate cleanup. Given the bot doesn't yet consume `tenantScoped` for anything shipped (Fase 6 is still Pending), option (a) — fix it in place, rename to reflect `negocio_id` — is cleaner and avoids two divergent helpers. This is NOT new phase scope (AVAIL-01..05 don't mention this), but it blocks writing any bot-side integration test or live-verification script for the engine, so it must be scheduled as an early task.
**Warning signs:** Any bot-side script/test that calls `tenantScoped(...).turnos()`, `.bloqueos()`, `.horariosTrabajo()`, `.servicios()`, or `.profesionalServicios()` will throw `column ... does not exist` immediately — this is not a rare edge case, it fails on the very first call.

### Pitfall 8: Missing test fixtures for `horario_trabajo` and `bloqueo` in the live seed
**What goes wrong:** Verified live: `horario_trabajo` and `bloqueo` both return **zero rows** in the current seed data (only `turno` and `negocio` are populated). Any live/integration-style verification of `computeSlots` will show "fully available all day" for every professional because there's no work schedule to intersect against — masking real bugs in the schedule-resolution and bloqueo-subtraction logic.
**Why it happens:** Phase 1/2 seed fixtures were built to exercise CORE/AUTH/PRO/SVC features, not availability computation — `horario_trabajo` rows exist as a *type* in the schema since Phase 1, but Phase 2's `PRO-02` UI work (weekly schedule editor) operates on a per-tenant dashboard flow that wasn't necessarily exercised against these exact seed professionals with saved data before this research.
**How to avoid:** This phase's Wave 0 must seed (or the plan must add a seeding/fixture task for) `horario_trabajo` rows and at least one `bloqueo` row for the test professionals, OR rely entirely on unit tests with in-memory fixture data (recommended primary strategy — see Validation Architecture) and treat any live-DB check as a secondary smoke test only, explicitly expecting to seed fresh rows for it.
**Warning signs:** A live verification script reports "10 slots available all day 00:00–24:00" — sign that no `horario_trabajo` exists for the queried professional/day, not that the algorithm is broken.

## Code Examples

### Constructing a timezone-aware day boundary (D-01 grid anchor, Pitfall 2)

```typescript
// Source: Context7 /date-fns/tz docs (TZDate constructor patterns)
import { TZDate } from "@date-fns/tz";

function dayBoundsInZone(dateStr: string, timezone: string): { start: TZDate; end: TZDate } {
  const [year, month, day] = dateStr.split("-").map(Number);
  // TZDate constructor mirrors native Date but resolves in the given IANA zone —
  // NEVER new Date(dateStr), which parses as UTC.
  const start = new TZDate(year, month - 1, day, 0, 0, 0, timezone);
  const end = new TZDate(year, month - 1, day, 23, 59, 59, timezone);
  return { start, end };
}
```

### Resolving `horario_trabajo` for a given date (dia_semana → date-scoped interval)

```typescript
// dia_semana: 0=domingo..6=sábado (per migration 0001 CHECK constraint comment)
// TZDate exposes .getDay() resolved in its own zone, matching native Date's
// 0=Sunday..6=Saturday convention — same numbering as the DB CHECK, no
// remapping needed if constructed correctly.
function diaSemanaFor(date: TZDate): number {
  return date.getDay();
}

function resolveWorkIntervalsForDate(
  horarios: Array<{ dia_semana: number; hora_inicio: string; hora_fin: string }>,
  dateStr: string,
  timezone: string,
): Interval[] {
  const [year, month, day] = dateStr.split("-").map(Number);
  const anchor = new TZDate(year, month - 1, day, 0, 0, 0, timezone);
  const dow = diaSemanaFor(anchor);

  return horarios
    .filter((h) => h.dia_semana === dow)
    .map((h) => {
      const [hIni, mIni] = h.hora_inicio.split(":").map(Number);
      const [hFin, mFin] = h.hora_fin.split(":").map(Number);
      const start = new TZDate(year, month - 1, day, hIni, mIni, 0, timezone);
      const end = new TZDate(year, month - 1, day, hFin, mFin, 0, timezone);
      return { start: start.getTime(), end: end.getTime() };
    });
}
```

### Catching the concurrency-loss signal in `bookAppointment`

```typescript
// Source: Postgres docs (exclusion_violation = SQLSTATE 23P01) — WebSearch,
// cross-referenced against PostgreSQL 13.5/13.2 documentation pages.
import type { PostgrestError } from "@supabase/supabase-js";

const EXCLUSION_VIOLATION = "23P01";

function isSlotTakenConcurrently(error: PostgrestError | null): boolean {
  return error?.code === EXCLUSION_VIOLATION;
}
// Caller (bot tool / dashboard action) on true: re-run computeSlots and
// either re-offer fresh slots (bot) or show a toast + refresh grid (dashboard).
// Do NOT silently retry the same insert — the slot really is gone.
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `date-fns-tz` standalone package for timezone math | `@date-fns/tz`'s `TZDate` class, integrated into date-fns v4 core | date-fns v4.0 release (per date-fns blog, "v4.0 is out with first-class time zones support") | New projects on date-fns v4 should reach for `@date-fns/tz` first; `date-fns-tz@3.x` still works (peer deps allow v4) but is the older pattern, not the one date-fns' own docs lead with going forward. `[CITED: date-fns blog + Context7 /date-fns/tz]` |
| Native `Temporal` expected "soon" | Still not shipped in Node 24 (verified `typeof Temporal === "undefined"`, no `--experimental-temporal` flag exists) | N/A — ongoing | Do not design this phase around Temporal; revisit if/when a future Node LTS ships it. `[VERIFIED: local runtime test]` |

**Deprecated/outdated:**
- Hand-rolled `-3` hour offset arithmetic for Argentina: never was correct practice, explicitly called out as Pitfall 4 in the project's own established patterns (`03-CONTEXT.md` "Decididas en fases previas") — carried forward, not new.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Grid alignment (D-01) should anchor to midnight in the negocio's timezone, not to each professional's individual shift start time | Architecture Patterns, Pattern 2 | If the planner/user actually intended grid-relative-to-shift-start, a professional whose shift starts at an off-grid time (e.g. 09:05) would get a different (and arguably more "wrong-looking") slot list than assumed here. Low risk in practice since Phase 2's schedule editor UI likely encourages on-grid shift starts, but worth a one-line confirmation before locking the plan. |
| A2 | `bookAppointment` belongs in the same `@turnosbot/availability-engine` package (adjacent module) rather than a separate `booking` package | Architecture Patterns, System Diagram | CONTEXT.md explicitly leaves this to Claude's discretion "mientras sea el único camino compartido" — low risk either way as long as the plan documents the choice and both consumers import from the same place. |
| A3 | Auto-assignment tie-break should sort by `profesional.id` (stable UUID sort) rather than some other stable key (e.g. `created_at`, or an explicit `orden` column like `servicio.orden`) | Common Pitfalls, Pitfall 6 | If the business would prefer ties broken by, e.g., "who has fewer bookings today" (load-based), this reintroduces the explicitly-descoped-for-v1 "reparto equitativo" idea (Deferred Ideas) through the back door via tie-breaking — worth flagging so the plan states explicitly this is a pure tie-break of last resort, not a load-balancing feature. |
| A4 | The correct fix for the `tenantScoped.ts` drift (Pitfall 7) is to rename/rescope it to `negocio_id` in place, rather than leave it untouched and build a parallel accessor | Common Pitfalls, Pitfall 7 | If some other in-flight or planned work depends on `tenantScoped`'s current (broken) shape/name, an in-place rename could conflict. No evidence of such dependency was found (grep shows only the file itself + its own test import it), so risk is assessed low, but this touches code outside AVAIL-01..05's literal scope and should be called out explicitly to the planner as a necessary adjacent fix. |

**If this table is empty:** N/A — see rows above for the 4 assumptions requiring lightweight confirmation before/during planning.

## Open Questions

1. **Grid anchor: midnight vs. shift-start (see A1)**
   - What we know: D-01 says slots always land on granularidad multiples ("9:00, 9:30, 10:00…"), with dead gaps accepted.
   - What's unclear: whether the multiples are relative to midnight (absolute clock marks) or relative to each shift's own start (which could itself be off-grid).
   - Recommendation: Default to midnight-anchored (absolute clock marks) in the plan; this is very likely what "agenda prolija" means in practice, and Phase 2's schedule editor almost certainly nudges owners toward on-grid shift starts anyway, making the two approaches converge in the common case.

2. **Where does `bookAppointment`'s re-validation draw its "fresh" data from?**
   - What we know: The anti-pattern section (and the existing `conversacion` schema comment) mandates re-validating against the engine immediately before booking, never trusting a stale slot.
   - What's unclear: Whether re-validation re-fetches rows from the DB inside the same call (making `bookAppointment` itself need *some* data access, contradicting the "pure function" framing) or whether the caller is responsible for re-fetching and re-calling `computeSlots` right before invoking `bookAppointment`.
   - Recommendation: Keep `bookAppointment` itself DB-access-free for the "compute" half (accept the already-fetched fresh rows as parameters, same as `computeSlots`) but let it own the actual `INSERT` transaction (which necessarily needs a Supabase client — likely injected as a parameter, e.g. `bookAppointment(input, { supabase, freshData })`, so the pure/impure boundary is explicit and the package still has zero *default* DB dependency, only an injected one at the booking call site). This preserves testability (fresh data can be fixture data in tests) while keeping the real insert transactional.

3. **Should `computeSlots`'s public signature change from the current stub (`professionalId?: string`) to distinguish "filter to this professional" from "no preference, auto-assign"?**
   - What we know: The stub's `ComputeSlotsInput.professionalId` is already optional, and its absence is the natural trigger for auto-assignment (D-03).
   - What's unclear: Nothing structurally blocking — this is a fine signal as-is. Flagging only because AVAIL-05's "return which professional got assigned" implies `AvailableSlot.professionalId` (already in the stub) is the right place to surface the auto-assignment result, which confirms the existing type contract doesn't need changes, just an implementation.
   - Recommendation: No signature change needed; implement against the existing stub contract as-is.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Runtime for the engine + tests | ✓ | v24.13.1 | — |
| pnpm | Monorepo package manager | ✓ (implied by `packageManager: pnpm@9.15.0` and existing workspace) | 9.15.0 (pinned) | — |
| `date-fns` | Interval/date arithmetic | ✗ (not yet installed in `packages/availability-engine`) | `4.4.0` available on registry | Install as part of this phase's first task — no fallback needed, this is a planned addition |
| `@date-fns/tz` | Timezone-aware `TZDate` | ✗ (not yet installed) | `1.5.0` available on registry | Same — planned addition |
| `vitest` | Unit test runner for the new package | ✗ (not yet configured in `packages/availability-engine`, though used elsewhere in the monorepo) | `4.1.9` (matches `apps/dashboard`) | Install + add `vitest.config.ts` mirroring the dashboard's pattern (Wave 0 gap) |
| Live Supabase project `bdgufnitakelyialjoqg` | Any live-DB verification/smoke script for this phase | ✓ (reachable; verified via direct query during this research using `.env` `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` + `@supabase/supabase-js`) | Postgres via Supabase (project confirmed live, `negocio`/`turno` tables queried successfully) | — |
| `horario_trabajo` / `bloqueo` seed data | Live/integration-style verification of the full subtraction pipeline | ✗ (both tables return 0 rows in current live seed — verified) | — | Rely primarily on unit tests with fixture data (see Validation Architecture); add a seeding task if live verification of the full pipeline is desired for this phase |

**Missing dependencies with no fallback:**
- None — all missing items are planned additions with no blocking risk.

**Missing dependencies with fallback:**
- `horario_trabajo`/`bloqueo` live seed data — fallback is unit-test-first verification (primary strategy regardless), with live seeding as an optional secondary task.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.9 (already used in `apps/dashboard`; not yet configured in `packages/availability-engine` — Wave 0 gap) |
| Config file | `packages/availability-engine/vitest.config.ts` — does not exist yet, mirror `apps/dashboard/vitest.config.ts` (environment: "node", `include: ["src/**/*.test.ts"]`, `globals: true`) |
| Quick run command | `pnpm --filter @turnosbot/availability-engine exec vitest run` |
| Full suite command | `pnpm -r --filter @turnosbot/availability-engine... test` (or add a `"test": "vitest run"` script to the package's `package.json`, currently missing) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AVAIL-01 | `computeSlots` correctly subtracts bloqueos and active turnos from work hours; `cancelado` turnos do not block | unit | `pnpm --filter @turnosbot/availability-engine exec vitest run src/computeSlots.test.ts` | ❌ Wave 0 |
| AVAIL-01 | Interval subtraction boundary correctness ([) semantics, touching intervals, Pitfall 1/4/5) | unit | `pnpm --filter @turnosbot/availability-engine exec vitest run src/intervals.test.ts` | ❌ Wave 0 |
| AVAIL-02 | Multi-service duration sums correctly into one contiguous block; slot rejected if it doesn't fit before work-block end (Pitfall 5) | unit | `pnpm --filter @turnosbot/availability-engine exec vitest run src/grid.test.ts` | ❌ Wave 0 |
| AVAIL-03 | `bookAppointment` freezes nombre/precio/duracion snapshots and sums `precio_total`; a subsequent `servicio.precio` change does not alter a past `turno.precio_total` | unit (with fixture "before/after price change" data) + one live/manual smoke test against `bdgufnitakelyialjoqg` | `pnpm --filter @turnosbot/availability-engine exec vitest run src/booking.test.ts` | ❌ Wave 0 |
| AVAIL-04 | Both `apps/bot` and `apps/dashboard` import and call the exact same `computeSlots`/`bookAppointment` exports (no local reimplementation) | static/manual — grep-based check, not a runtime test | `grep -rn "computeSlots\|bookAppointment" apps/bot/src apps/dashboard --include="*.ts" -l` (manual review: confirm only imports from `@turnosbot/availability-engine`, zero local reimplementations) | manual-only, justified: this is a structural/import-hygiene property, not a runtime behavior |
| AVAIL-05 | Auto-assignment picks the professional with the earliest available slot; deterministic tie-break (Pitfall 6) | unit | `pnpm --filter @turnosbot/availability-engine exec vitest run src/autoAssign.test.ts` | ❌ Wave 0 |
| D-04/D-05 | Booking window constants (60min lead / 30 days max) correctly filter slots at both edges | unit | `pnpm --filter @turnosbot/availability-engine exec vitest run src/constants.test.ts` (or folded into `computeSlots.test.ts`) | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm --filter @turnosbot/availability-engine exec vitest run` (fast, no I/O, should run in well under a second per the pure-function design)
- **Per wave merge:** Same command (full suite = quick suite here, since this package has zero integration/E2E tests by design — it's pure)
- **Phase gate:** Full suite green before `/gsd-verify-work`; additionally, per Pitfall 7, confirm `tenantScoped.ts` (or its replacement) compiles and its own smoke test (`apps/bot/src/db/tenantScoped.test.ts`, currently also stale — asserts on `tenant_id` in returned rows) is updated to match `negocio_id`, since that test will now also fail against live data (`(t as {tenant_id: string}).tenant_id` will be `undefined` for every row).

### Wave 0 Gaps
- [ ] `packages/availability-engine/vitest.config.ts` — does not exist; mirror `apps/dashboard/vitest.config.ts`
- [ ] `packages/availability-engine/package.json` — needs `date-fns`, `@date-fns/tz`, `zod` deps; `vitest` devDep; a `"test": "vitest run"` script (currently only has `build`/`typecheck`)
- [ ] Fixture data module (e.g. `src/__fixtures__/`) — deterministic `horario_trabajo`/`bloqueo`/`turno`/`servicio` row fixtures for unit tests, since live seed data for `horario_trabajo`/`bloqueo` is empty (Pitfall 8)
- [ ] `apps/bot/src/db/tenantScoped.ts` + `tenantScoped.test.ts` — both reference the dropped `tenant_id` column (Pitfall 7); must be fixed as an early task in this phase's plan, not deferred, since it blocks any bot-side data-fetching code this phase might also want to sanity-check

*(No gaps found in the general test-runner setup at the monorepo root — `vitest` itself is already a proven pattern via `apps/dashboard`.)*

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | No | Out of scope — this package has no auth surface; callers (bot/dashboard) already handle auth upstream |
| V3 Session Management | No | Same as above |
| V4 Access Control | Indirect — yes | The engine itself does not enforce tenant/negocio isolation (it operates on whatever rows the caller passes in); it is the CALLER's responsibility (via `tenantScoped`/`negocioScoped` for the bot, RLS for the dashboard) to only ever pass in rows already scoped to the correct `negocio_id`. This must be documented clearly in the engine's public API doc comments so a future maintainer doesn't assume the engine does its own scoping. |
| V5 Input Validation | Yes | Use `zod` to validate `ComputeSlotsInput`/`BookAppointmentInput` shapes at the package boundary (date format, non-empty serviceId(s), UUID shape for tenantId/professionalId) — catches malformed input from either caller early with a clear error rather than a confusing downstream `NaN`/`Invalid Date`. |
| V6 Cryptography | No | Not applicable to this phase |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| Cross-negocio data leakage via engine misuse (caller accidentally passes rows from the wrong negocio) | Information Disclosure | Not something the engine can prevent structurally since it's pure — mitigate via strong typing (require a `negocioId` field in the input and consider an internal assertion, e.g., `assert(row.negocio_id === input.negocioId)` on every input row, to fail loudly rather than silently compute cross-tenant availability if a caller bug ever passes mixed data) |
| Race condition double-booking (two customers grab the same slot near-simultaneously via bot + dashboard) | Tampering (data integrity) | Postgres `EXCLUDE USING gist` (already live, CORE-05) is the authoritative mitigation; `bookAppointment` must catch `23P01` and never suppress/retry-blindly (Pitfall 4 in threat terms: retrying an exclusion violation without re-checking availability just produces the same failure or, worse, a subtly different slot the user didn't agree to) |
| Booking window bypass (client-supplied date manipulated to book outside 60min/30day window) | Tampering | D-04/D-05 constants enforced inside `computeSlots`/`bookAppointment` itself (not just as a UI-layer suggestion) — since the bot's LLM-driven input could plausibly be manipulated via prompt injection (BOT-11, future phase) to request an out-of-window date, the engine must be the enforcement point, not a client-side/prompt-side convention |

## Sources

### Primary (HIGH confidence)
- `packages/availability-engine/src/index.ts` — read directly, existing type contract (`ComputeSlotsInput`, `AvailableSlot`, `computeSlots` stub)
- `supabase/migrations/0001_schema_core.sql` — read directly, full schema incl. `horario_trabajo`, `turno`, `turno_servicio`, `bloqueo`, `negocio`, GiST EXCLUDE constraints
- `supabase/migrations/0003_tenant_negocio_split.sql` — read directly, confirms `tenant_id` → `negocio_id` rescoping across all operational tables
- `packages/db-types/src/database.types.ts` — read directly, confirms live-generated types match migration 0003 (post-split), not migration 0001 (pre-split)
- Live query against `bdgufnitakelyialjoqg` via `@supabase/supabase-js` + `.env` service role key (per CLAUDE.md isolation rule — never the global MCP, never the restaurant project) — confirmed: 3 `negocio` rows across 2 `tenant`s, `turno` rows use `negocio_id` not `tenant_id`, `horario_trabajo`/`bloqueo` are empty, and `.eq("tenant_id", ...)` against `turno` throws `column turno.tenant_id does not exist`
- `npm view <package> version` / `peerDependencies` (executed 2026-07-05) — `date-fns@4.4.0`, `@date-fns/tz@1.5.0`, `date-fns-tz@3.2.0` (peer deps `^3.0.0 || ^4.0.0`), `zod@4.4.3`, `vitest@4.1.9`, `@supabase/supabase-js@2.110.0`
- Local Node runtime test (`node -e "console.log(typeof Temporal)"`, `node --experimental-temporal`) — confirms Node 24.13.1 has no native or flagged `Temporal` support
- `/date-fns/tz` via Context7 CLI fallback (`npx ctx7@latest docs`) — `TZDate` constructor API, timezone-aware construction patterns

### Secondary (MEDIUM confidence)
- [PostgreSQL 13.2 Transaction Isolation](https://www.postgresql.org/docs/current/transaction-iso.html) / [13.5 Serialization Failure Handling](https://www.postgresql.org/docs/current/mvcc-serialization-failure-handling.html) — WebSearch-surfaced, cross-referenced with the general community consensus that `23P01` (exclusion_violation) is the SQLSTATE for EXCLUDE constraint violations; not independently re-verified by directly triggering the error in this research session (no live concurrent-write test was run)
- [date-fns v4.0 timezone announcement](https://blog.date-fns.org/v40-with-time-zone-support/) — WebSearch summary, directionally consistent with Context7's `@date-fns/tz` documentation

### Tertiary (LOW confidence)
- WebSearch summary claiming `date-fns-tz` is incompatible with `date-fns` v4 — contradicted by directly checking `npm view date-fns-tz peerDependencies` (which shows `^3.0.0 || ^4.0.0`); flagged and corrected in the Alternatives Considered table rather than treated as fact

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions verified directly via `npm view`, Temporal absence verified via local runtime test, `@date-fns/tz` API verified via Context7
- Architecture: HIGH for the pure-function/shared-package structure (directly required by CONTEXT.md + AVAIL-04); MEDIUM for the specific grid-anchor and auto-assign-tie-break choices (flagged as ASSUMED, A1/A3)
- Pitfalls: HIGH — Pitfall 7 (tenantScoped drift) and Pitfall 8 (empty seed data) are both directly verified against the live database in this session, not inferred

**Research date:** 2026-07-05
**Valid until:** 30 days (stable domain — pure algorithm + a schema that is not expected to change again before this phase lands; re-verify sooner only if migration 0003's follow-up work, mentioned in its own trailing comment as "Next: regenerar packages/db-types y re-aplicar el seed," introduces further schema changes before this phase starts)
