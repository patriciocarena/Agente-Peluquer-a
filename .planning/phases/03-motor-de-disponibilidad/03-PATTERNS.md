# Phase 3: Motor de disponibilidad - Pattern Map

**Mapped:** 2026-07-05
**Files analyzed:** 15 (new package internals + 1 config + 1 fix + 1 fix-test)
**Analogs found:** 15 / 15 (all role-matched or better; no "no analog" files)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|-----------------|----------------|
| `packages/availability-engine/package.json` | config | — | `apps/dashboard/package.json` (deps block) + current stub `packages/availability-engine/package.json` | role-match |
| `packages/availability-engine/vitest.config.ts` | config | — | `apps/dashboard/vitest.config.ts` | exact |
| `packages/availability-engine/src/constants.ts` | utility | transform | `apps/dashboard/lib/schemas/horario.ts` (top-level exported constants: `DIAS_SEMANA`, `HORA_REGEX`) | role-match |
| `packages/availability-engine/src/intervals.ts` | utility | transform | `apps/dashboard/lib/reorder.ts` (pure function, no I/O, exported helper + type) | role-match |
| `packages/availability-engine/src/intervals.test.ts` | test | transform | `apps/dashboard/lib/reorder.test.ts` | exact |
| `packages/availability-engine/src/grid.ts` | utility | transform | `apps/dashboard/lib/reorder.ts` | role-match |
| `packages/availability-engine/src/grid.test.ts` | test | transform | `apps/dashboard/lib/reorder.test.ts` | exact |
| `packages/availability-engine/src/schedule.ts` | utility | transform | `apps/dashboard/lib/schemas/horario.ts` (reads `dia_semana`/`hora_inicio`/`hora_fin` shape, converts HH:mm to minutes) | role-match |
| `packages/availability-engine/src/schedule.test.ts` | test | transform | `apps/dashboard/lib/schemas/horario.test.ts` | exact |
| `packages/availability-engine/src/computeSlots.ts` | service | CRUD (read-shaped, pure) | `packages/availability-engine/src/index.ts` (existing stub — same file, replace `throw`) | exact |
| `packages/availability-engine/src/computeSlots.test.ts` | test | CRUD (read-shaped, pure) | `apps/dashboard/lib/schemas/horario.test.ts` (multi-scenario `describe`/`it` fixture style) | role-match |
| `packages/availability-engine/src/booking.ts` (`bookAppointment`) | service | event-driven (atomic write + conflict signal) | `scripts/verify-double-booking.ts` (insert + `23P01` handling against `turno`) | role-match |
| `packages/availability-engine/src/booking.test.ts` | test | event-driven | `apps/dashboard/lib/schemas/horario.test.ts` (unit, fixture-driven) + `scripts/verify-double-booking.ts` (concurrency-signal assertions, informs the fixture design) | partial-match |
| `packages/availability-engine/src/types.ts` | model | — | `packages/availability-engine/src/index.ts` (existing `ComputeSlotsInput`/`AvailableSlot` interfaces) + `packages/db-types/src/database.types.ts` (Row/Insert shapes to alias) | exact |
| `packages/availability-engine/src/index.ts` | service (barrel) | — | itself (current stub — becomes the public-export barrel) | exact |
| `apps/bot/src/db/tenantScoped.ts` (FIX) | utility (data-access layer) | request-response | itself (pre-existing file, in-place rename/fix) | exact (self-fix) |
| `apps/bot/src/db/tenantScoped.test.ts` (FIX) | test | request-response | itself (pre-existing smoke test, in-place fix) | exact (self-fix) |

## Pattern Assignments

### `packages/availability-engine/package.json` (config)

**Analog:** `apps/dashboard/package.json` (dependency block) + the package's own current stub

**Current stub** (`packages/availability-engine/package.json`, full file):
```json
{
  "name": "@turnosbot/availability-engine",
  "version": "0.0.0",
  "private": true,
  "description": "Pure TS engine: horario - bloqueos - turnos confirmados = slots reales (stub, sin lógica de negocio aún)",
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "build": "tsc -b",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.7.3"
  }
}
```

**What to add** (per RESEARCH.md Standard Stack + Installation):
- `dependencies`: `date-fns@^4.4.0`, `@date-fns/tz@^1.5.0`, `zod@^4.4.3` (matches project-wide zod pin from `apps/dashboard/package.json` — do not introduce a second zod version).
- `devDependencies`: add `vitest@4.1.9` (exact pin used in `apps/dashboard/package.json` devDependencies).
- `scripts`: add `"test": "vitest run"` (missing today; every other Wave-0-gap package in this monorepo that has tests defines this — mirror `apps/dashboard`'s implicit vitest invocation via `pnpm --filter ... exec vitest run`, but add the script directly here since `03-RESEARCH.md`'s Wave 0 gap list calls it out explicitly).
- Keep `description` mentioning the package is no longer a stub once implemented (update text, don't leave "stub, sin lógica de negocio aún").
- Do NOT add `@supabase/supabase-js` or `@turnosbot/db-types` as a runtime dependency of the compute path — only `types.ts` may import `type { Database } from "@turnosbot/db-types"` for row aliasing (type-only import, zero runtime coupling, matches how `apps/bot/src/db/client.ts` imports `type { Database }`).

---

### `packages/availability-engine/vitest.config.ts` (config)

**Analog:** `apps/dashboard/vitest.config.ts` (exact structural match — this is the literal template to copy and adapt)

**Full source** (`apps/dashboard/vitest.config.ts`):
```typescript
import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "lib/**/__*__.test.ts"],
    globals: true,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
})
```

**Adaptation for this package:**
- `environment: "node"` — keep as-is (pure compute, no DOM).
- `include: ["src/**/*.test.ts"]` — this package colocates tests under `src/`, not `lib/`, per RESEARCH.md's Recommended Project Structure (`src/*.test.ts` colocated per module).
- `globals: true` — keep (matches project-wide vitest convention, avoids importing `describe`/`it`/`expect` in every test file — though note the dashboard's own test files DO import them explicitly from `"vitest"` regardless of `globals: true`; follow that same explicit-import style for consistency, see test excerpts below).
- The `resolve.alias` block is dashboard-specific (Next.js `@/*` import alias) — **omit it** for this package; the engine has no path-alias convention today (its `tsconfig.json` extends `../../tsconfig.base.json` with plain relative imports only).

---

### `packages/availability-engine/src/constants.ts` (utility, transform)

**Analog:** `apps/dashboard/lib/schemas/horario.ts` lines 20-32 (top-of-file exported constants + doc comment explaining *why* they exist and where they're consumed)

**Pattern to copy** (constants-with-rationale-comment style):
```typescript
// apps/dashboard/lib/schemas/horario.ts, lines 20-31
export const DIAS_SEMANA = [
  "lunes",
  "martes",
  "miercoles",
  "jueves",
  "viernes",
  "sabado",
  "domingo",
] as const;

export type DiaSemana = (typeof DIAS_SEMANA)[number];

const HORA_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;
```

**Apply to `constants.ts` as:**
```typescript
/**
 * constants.ts — single source of truth for the two v1-hardcoded booking
 * window limits (D-04/D-05). Deferred to per-negocio config in Fase 4;
 * defining them here (not inline in computeSlots.ts) makes that promotion a
 * one-file change later.
 */
export const BOOKING_MIN_LEAD_MINUTES = 60;
export const BOOKING_MAX_ADVANCE_DAYS = 30;
```
Follow the same doc-comment convention: explain the *why* (D-04/D-05, future promotion to config) directly above the export, same as `horario.ts`'s file-level comment explains PRO-02/02-UI-SPEC.md provenance.

---

### `packages/availability-engine/src/intervals.ts` (utility, transform)

**Analog:** `apps/dashboard/lib/reorder.ts` (full file — pure function, no I/O, typed input/output, exported helper type)

**Full source** (`apps/dashboard/lib/reorder.ts`):
```typescript
import { arrayMove } from "@dnd-kit/sortable";

export type ServicioOrdenable = {
  id: string;
  orden: number;
};

export function reorder<T extends ServicioOrdenable>(
  items: T[],
  fromId: string,
  toId: string,
): T[] {
  if (fromId === toId) return items;

  const fromIndex = items.findIndex((item) => item.id === fromId);
  const toIndex = items.findIndex((item) => item.id === toId);
  if (fromIndex === -1 || toIndex === -1) return items;

  const moved = arrayMove(items, fromIndex, toIndex);
  return moved.map((item, index) => ({ ...item, orden: index }));
}
```

**Pattern to replicate in `intervals.ts`:**
- File-level doc comment stating what problem this solves and which module calls it (mirrors `reorder.ts` lines 1-12: names the caller, names the exact behavior, cites the decision/requirement ID).
- A plain exported `interface`/`type` for the core data shape (here: `Interval { start: number; end: number }`, epoch ms, half-open `[start, end)` — see RESEARCH.md Pattern 1) — same role as `ServicioOrdenable` in `reorder.ts`.
- One focused exported function (`subtractIntervals`), no class, no internal state — same shape as `reorder()`.
- Early-return guard clauses for degenerate input (reorder.ts: `if (fromId === toId) return items;`) — mirror with `if (busy.length === 0) return free;` as a fast path in `subtractIntervals`.

Use RESEARCH.md's own `subtractIntervals` code (Pattern 1, lines 209-227 of 03-RESEARCH.md) as the algorithm body; the `reorder.ts` analog governs *file shape and doc-comment style*, not the algorithm itself (no existing codebase file does interval math).

---

### `packages/availability-engine/src/intervals.test.ts` (test, transform)

**Analog:** `apps/dashboard/lib/reorder.test.ts` (full file — exact structural match for a pure-function unit test: import target + type, small fixture array, one `describe` block per behavior, helper assertion function for a repeated invariant check)

**Pattern to copy** (fixture + repeated-invariant-helper style, lines 1-26 of `reorder.test.ts`):
```typescript
import { describe, expect, it } from "vitest";

import { reorder, type ServicioOrdenable } from "./reorder";

const items: ServicioOrdenable[] = [
  { id: "a", orden: 0 },
  { id: "b", orden: 1 },
  { id: "c", orden: 2 },
  { id: "d", orden: 3 },
];

function assertOrdenContiguoSinDuplicados(result: ServicioOrdenable[]) {
  const ordenes = result.map((item) => item.orden).sort((x, y) => x - y);
  const esperado = result.map((_, index) => index);
  expect(ordenes).toEqual(esperado);
  const idsUnicos = new Set(result.map((item) => item.id));
  expect(idsUnicos.size).toBe(result.length);
}
```
**Apply to `intervals.test.ts`:** define a small fixture set of `Interval[]` (free + busy), and a repeated-invariant helper like `assertNoOverlappingIntervals(result)` or `assertHalfOpenBoundaries(result)`, reused across the boundary-case tests demanded by RESEARCH.md Pitfall 1 (touching intervals must NOT create a false gap or false overlap). Explicitly test: touching intervals (`b.end === f.start`), zero-length resulting intervals filtered out, and multiple busy intervals subtracted from one free interval.

---

### `packages/availability-engine/src/grid.ts` / `grid.test.ts` (utility, transform)

**Analog:** same as `intervals.ts`/`intervals.test.ts` — `apps/dashboard/lib/reorder.ts` + `reorder.test.ts` (pure function file shape, no additional analog needed; algorithm body comes from RESEARCH.md Pattern 2 `snapToGrid`).

**Key behavior to unit-test** (per RESEARCH.md Pitfall 5, "trailing partial slot"): a free interval that is longer than `granularidad_min` but shorter than `totalDurationMin` after the last full grid step must emit **zero** slots for that dead gap — write this as an explicit `it("no emite un slot que no entra antes del fin del bloque de trabajo (Pitfall 5)", ...)`, following the same one-behavior-per-`it` granularity seen in `horario.test.ts` (e.g. "rechaza hora_fin igual a hora_inicio en un bloque").

---

### `packages/availability-engine/src/schedule.ts` (utility, transform)

**Analog:** `apps/dashboard/lib/schemas/horario.ts` lines 41-44 (the `minutosDesdeMedianoche` HH:mm parsing helper) — same raw-data shape (`dia_semana`, `hora_inicio`/`hora_fin` as `"HH:mm"` strings) that `horario_trabajo` rows carry.

**Pattern to copy:**
```typescript
// apps/dashboard/lib/schemas/horario.ts, lines 41-44
function minutosDesdeMedianoche(hora: string): number {
  const [horas, minutos] = hora.split(":").map(Number);
  return horas * 60 + minutos;
}
```
`resolveWorkIntervalsForDate` (RESEARCH.md Code Examples) needs the same `"HH:mm".split(":").map(Number)` parsing idiom before constructing `TZDate` instances — reuse this exact parsing idiom rather than inventing a new one, since it is the established, already-tested way this codebase parses `horario_trabajo.hora_inicio`/`hora_fin` (both `time` columns serialize as `"HH:mm:ss"` from Postgrest — confirm trailing `:00` seconds are handled or stripped; `horario.ts`'s regex is `HH:mm` only, so schedule.ts must tolerate the extra `:ss` from live rows, which the dashboard schema does not need to since it only validates user-typed input).

**Row shape source** (`packages/db-types/src/database.types.ts`, `horario_trabajo.Row`): use `Database["public"]["Tables"]["horario_trabajo"]["Row"]` (fields include `dia_semana: number`, `hora_inicio: string`, `hora_fin: string`, `negocio_id`, `profesional_id`, `activo`) as the input type alias in `types.ts`, per RESEARCH.md's Standard Stack row on `@turnosbot/db-types`.

---

### `packages/availability-engine/src/computeSlots.ts` (service, orchestration)

**Analog:** `packages/availability-engine/src/index.ts` (the file being replaced — this IS the existing contract, not a different file to imitate)

**Current stub, full file** (this is the exact contract to preserve and implement against):
```typescript
export interface ComputeSlotsInput {
  tenantId: string;
  serviceId: string;
  professionalId?: string;
  /** ISO date, YYYY-MM-DD, interpreted in the tenant's timezone (America/Argentina/*) */
  date: string;
}

export interface AvailableSlot {
  /** ISO time, HH:mm, tenant-local timezone */
  start: string;
  /** ISO time, HH:mm, tenant-local timezone */
  end: string;
  professionalId: string;
}

export async function computeSlots(_input: ComputeSlotsInput): Promise<AvailableSlot[]> {
  throw new Error("computeSlots: not implemented yet (stub — see packages/availability-engine)");
}
```

**Implementation notes (bridging stub → real, per RESEARCH.md Open Question 3 and CONTEXT.md discretion):**
- `ComputeSlotsInput.tenantId` is a naming leftover from the pre-migration-0003 stub — per RESEARCH.md's schema findings this should become `negocioId` to match the live schema (`negocio_id` everywhere) and the fixed `tenantScoped`/`negocioScoped` naming. Confirm/rename in `types.ts`, and treat this as one field rename, not a contract redesign (Open Question 3 confirms no other signature change is needed).
- `serviceId: string` should likely become `serviceIds: string[]` to support AVAIL-02 (multi-service sum) — the stub's singular `serviceId` predates that requirement being locked in CONTEXT.md D-01/AVAIL-02. Since the stub is pre-schema and explicitly says "real implementation lands in a later plan," this is an expected signature evolution, not contract drift.
- `professionalId?: string` stays exactly as-is — its optionality is already the correct trigger for auto-assignment (D-03), confirmed by RESEARCH.md Open Question 3.
- Since `computeSlots` must now accept **already-fetched rows** (per Anti-Patterns: "Engine must not hold its own DB client"), the signature grows a second parameter carrying the plain-array data (`horarios`, `bloqueos`, `turnos`, `servicios`, `negocio`) — keep `computeSlots(input, data)` as RESEARCH.md's System Architecture Diagram names it.
- Preserve the file's doc-comment convention (JSDoc-style block above each exported type/function explaining the field's meaning) — the stub's `/** ISO time, HH:mm, tenant-local timezone */` inline comments on `AvailableSlot` fields are the exact convention to keep for any new fields.

---

### `packages/availability-engine/src/computeSlots.test.ts` (test)

**Analog:** `apps/dashboard/lib/schemas/horario.test.ts` (full file — multi-scenario fixture style: helper functions to build variant inputs, one `describe` per unit-under-test, granular `it` blocks each asserting exactly one behavior/requirement)

**Pattern to copy** (helper-function-for-fixture-variants style, lines 20-30):
```typescript
function horarioConDia(dia: { bloques: { hora_inicio: string; hora_fin: string }[] }) {
  return {
    lunes: dia,
    martes: diaVacio,
    miercoles: diaVacio,
    jueves: diaVacio,
    viernes: diaVacio,
    sabado: diaVacio,
    domingo: diaVacio,
  };
}
```
**Apply to `computeSlots.test.ts`:** build a helper like `fixtureFor({ horarios, bloqueos, turnos })` that fills in sensible defaults for the untested fields, so each `it` only overrides the one dimension it's testing (mirrors how `horarioConDia` only varies `lunes` and defaults every other day to `diaVacio`). Map each `it` directly to one row of RESEARCH.md's Phase Requirements → Test Map table (AVAIL-01 subtraction correctness, AVAIL-02 multi-service sum, D-04/D-05 window filtering, Pitfall 4's `pendiente` blocks / `cancelado` frees) — one behavior per `it`, same granularity as `horario.test.ts`'s "rechaza hora_fin igual a hora_inicio" / "rechaza hora_fin menor a hora_inicio" (two separate `it`s for two closely related boundary conditions, not combined into one).

---

### `packages/availability-engine/src/booking.ts` (`bookAppointment`) (service, event-driven/atomic-write)

**Analog:** `scripts/verify-double-booking.ts` (the closest existing code that inserts into `turno` and explicitly branches on the DB's concurrency-violation signal)

**Insert pattern to copy** (lines 67-78 of `scripts/verify-double-booking.ts`, adapted to the negocio_id-scoped shape):
```typescript
function insertTurno(id: string, inicio: string, fin: string, estado: "pendiente" | "confirmado" | "cancelado" = "confirmado") {
  return supabaseAdmin.from("turno").insert({
    id,
    tenant_id: TENANT_ID,          // NOTE: this script predates migration 0003's
                                    // rename too — real `turno.Insert` shape is
                                    // `negocio_id`, not `tenant_id` (verified live
                                    // against packages/db-types/src/database.types.ts).
                                    // bookAppointment.ts MUST use `negocio_id`.
    profesional_id: PROFESIONAL_ID,
    cliente_id: CLIENTE_ID,
    inicio,
    fin,
    estado,
    precio_total: 6000.0,
  });
}
```

**Concurrency-signal handling to copy** (lines 91-101, the exclusion-violation branch):
```typescript
const { error: yErr } = await insertTurno(IDS.y, "2026-09-01T13:15:00Z", "2026-09-01T13:45:00Z");
if (!yErr) {
  console.error("FAIL: turno Y superpuesto debería ser rechazado por la constraint, pero se insertó.");
  process.exit(1);
}
if (!yErr.message.match(/exclu|conflict|overlap/i) && yErr.code !== "23P01") {
  // treat 23P01 as the expected "slot taken concurrently" signal
}
```
Adapt this into `bookAppointment`'s production code path (not a test/verify script): after the transactional insert of `turno` + `turno_servicio` rows, catch `error.code === "23P01"` and return a typed "slot taken" result rather than throwing — exactly the `isSlotTakenConcurrently` helper already sketched in RESEARCH.md's Code Examples section (`03-RESEARCH.md` lines 404-419), which should be treated as the primary source for this function's body; `verify-double-booking.ts` is the analog for *how this codebase already proves the DB-level behavior exists*, giving confidence the `23P01` catch is correct.

**Snapshot-freeze pattern:** no existing code in this repo performs the actual `turno_servicio` snapshot insert yet (Phase 2 only touches `servicio`/`profesional_servicio` CRUD, not booking) — follow RESEARCH.md's Pitfall 3 guidance directly: sum `precio_snapshot` values about to be inserted, write that sum as `turno.precio_total` in the same transaction, never re-derive from `servicio.precio`.

**Re-validation anti-pattern note:** `apps/bot`'s `conversacion.context` schema comment (cited in RESEARCH.md Anti-Patterns) already establishes the "never cache computed availability" rule for this codebase — `bookAppointment` must re-run an equivalent freshness check immediately before insert, consistent with that existing documented constraint.

---

### `packages/availability-engine/src/booking.test.ts` (test)

**Analog (primary, unit structure):** `apps/dashboard/lib/schemas/horario.test.ts` (fixture/describe/it granularity)
**Analog (secondary, scenario source):** `scripts/verify-double-booking.ts` (which exact scenarios to encode as fixtures — base insert succeeds, overlapping insert conflicts, boundary-touching insert succeeds, cancelled-then-reinsert succeeds)

Since `bookAppointment`'s actual DB write can't be unit-tested without a live Supabase call, structure `booking.test.ts` as: (a) unit tests for the pure pre-insert logic (snapshot summation math, precio_total calculation, input validation via zod) using fixture data, following the `horario.test.ts` describe/it style; (b) a thin `isSlotTakenConcurrently(error)` unit test (pure function, trivial fixture: `{ code: "23P01" }` → true, `{ code: "other" }` → false) — mirrors RESEARCH.md's own code example almost verbatim. Do NOT attempt to unit-test the actual live INSERT/EXCLUDE-constraint behavior here — that is already covered by `scripts/verify-double-booking.ts` at the DB level and re-testing it in `booking.test.ts` would duplicate a live-DB-dependent test in a package meant to be I/O-free per AVAIL-04's constraints.

---

### `packages/availability-engine/src/types.ts` (model)

**Analog:** `packages/availability-engine/src/index.ts` (current stub interfaces) + `packages/db-types/src/database.types.ts` (Row/Insert shapes for `turno`, `turno_servicio`, `horario_trabajo`, `bloqueo`, `servicio`, `negocio`)

**Row shapes confirmed live** (via direct read of `packages/db-types/src/database.types.ts`):
```typescript
// turno.Row (excerpt) — negocio_id, NOT tenant_id:
{
  cliente_id: string
  estado: string
  fin: string
  id: string
  inicio: string
  negocio_id: string
  precio_total: number | null
  profesional_id: string
}

// turno_servicio.Row (excerpt) — also negocio_id:
{
  duracion_snapshot: number
  id: string
  negocio_id: string
  nombre_snapshot: string
  precio_snapshot: number
  servicio_id: string
  turno_id: string
}
```

**Pattern:** alias these via `Database["public"]["Tables"]["turno"]["Row"]` etc. (type-only import from `@turnosbot/db-types`) rather than hand-declaring parallel interfaces — this is RESEARCH.md's explicit recommendation and avoids the exact kind of drift that caused Pitfall 7. Keep the existing stub's inline JSDoc convention (`/** ISO time, HH:mm, tenant-local timezone */`) for any newly introduced fields on `AvailableSlot`/`ComputeSlotsInput`/`BookAppointmentInput`.

---

### `packages/availability-engine/src/index.ts` (barrel/public exports)

**Analog:** itself — the current stub already IS the barrel (single file with everything). When the implementation splits into `constants.ts`/`intervals.ts`/`grid.ts`/`schedule.ts`/`computeSlots.ts`/`booking.ts`/`types.ts`, `index.ts` becomes a re-export barrel:
```typescript
export * from "./types.js";
export * from "./constants.js";
export { computeSlots } from "./computeSlots.js";
export { bookAppointment } from "./booking.js";
```
This is the file both `apps/bot` and `apps/dashboard` already import from (`"@turnosbot/availability-engine"` in `apps/dashboard/package.json` dependencies) — preserve the public import path exactly; only the internals move.

---

### `apps/bot/src/db/tenantScoped.ts` (FIX — blocking pre-existing defect, Pitfall 7)

**Analog:** itself (in-place fix) — full current file already read above.

**Current (broken) pattern** (every accessor):
```typescript
export function tenantScoped(tenantId: string) {
  return {
    negocio: () => supabaseAdmin.from("negocio").select("*").eq("tenant_id", tenantId),
    profesionales: () => supabaseAdmin.from("profesional").select("*").eq("tenant_id", tenantId),
    horariosTrabajo: () => supabaseAdmin.from("horario_trabajo").select("*").eq("tenant_id", tenantId),
    servicios: () => supabaseAdmin.from("servicio").select("*").eq("tenant_id", tenantId),
    profesionalServicios: () =>
      supabaseAdmin.from("profesional_servicio").select("*").eq("tenant_id", tenantId),
    clientes: () => supabaseAdmin.from("cliente").select("*").eq("tenant_id", tenantId),
    turnos: () => supabaseAdmin.from("turno").select("*").eq("tenant_id", tenantId),
    turnoServicios: () => supabaseAdmin.from("turno_servicio").select("*").eq("tenant_id", tenantId),
    bloqueos: () => supabaseAdmin.from("bloqueo").select("*").eq("tenant_id", tenantId),
    conversaciones: () => supabaseAdmin.from("conversacion").select("*").eq("tenant_id", tenantId),
    mensajes: () => supabaseAdmin.from("mensaje").select("*").eq("tenant_id", tenantId),
    recordatorios: () => supabaseAdmin.from("recordatorio").select("*").eq("tenant_id", tenantId),
  } as const;
}
```

**Fix per RESEARCH.md Pitfall 7 recommendation (option a, "fix in place"):**
- Rename `tenantScoped(tenantId)` → `negocioScoped(negocioId)`.
- Replace every `.eq("tenant_id", tenantId)` with `.eq("negocio_id", negocioId)`.
- **Verified live column presence** (confirmed by reading `packages/db-types/src/database.types.ts` directly in this pattern-mapping pass): `negocio`, `profesional`, `horario_trabajo`, `servicio`, `profesional_servicio`, `cliente`, `turno`, `turno_servicio`, `bloqueo` all carry `negocio_id` (not `tenant_id`) post-migration-0003. Note: `negocio` itself is keyed by `tenant_id` referencing its PARENT `tenant` row (that FK is correct and unrelated to this bug — see `negocio.Row.tenant_id` in the schema, migration 0003 lines 61-78) — do NOT rename `negocio()`'s own filter, since `negocio` legitimately still has a `tenant_id` column (it's the negocio→tenant parent link, not an operational-table drift). Only the tables that were migrated from `tenant_id` to `negocio_id` (everything except `negocio` and `perfil`/`tenant` themselves) need the rename.
- `conversacion`/`mensaje`/`recordatorio` — confirm their post-migration column name the same way before fixing (RESEARCH.md's Pitfall 7 list includes them; the same migration section listed them as migrated tables, so treat consistently unless a targeted read of `database.types.ts` for those three tables shows otherwise).
- Preserve the file's existing doc-comment structure and its "ONLY sanctioned way" framing (lines 1-23) — update the prose to say `negocio_id` instead of `tenant_id` throughout, and update the Scope note to mention this phase (03) as the one that finally consumes this layer (superseding the "Scope note: ... Phase 6" comment, since the availability engine's bot-side data-fetching, not Phase 6's agent, is the first real consumer).

---

### `apps/bot/src/db/tenantScoped.test.ts` (FIX — companion smoke test)

**Analog:** itself (in-place fix) — full current file already read above.

**Current pattern to fix** (lines 38-57, the tenant-id assertions):
```typescript
const { data: turnosA, error: errA } = await tenantScoped(TENANT_A_ID).turnos().select("*");
...
assert(
  (turnosA ?? []).every((t) => (t as { tenant_id: string }).tenant_id === TENANT_A_ID),
  "tenantScoped(A).turnos() devolvió una fila que NO pertenece al tenant A.",
);
```

**Fix:** rename `tenantScoped` → `negocioScoped`, rename `TENANT_A_ID`/`TENANT_B_ID` constants to `NEGOCIO_A_ID`/`NEGOCIO_B_ID` (and source fresh live UUIDs for actual `negocio` rows, since the current constants are `tenant`-level fixture IDs from `scripts/seed-fixtures.ts` predating the split — verify against the live seed which `negocio.id` values exist under each tenant), change the row assertion to check `(t as { negocio_id: string }).negocio_id === NEGOCIO_A_ID`. Preserve the file's "functional smoke test, run via `pnpm exec tsx`" framing and its `assert()`-based (non-vitest) pattern exactly — this file is intentionally not migrated to vitest, matching its own header comment ("no test framework wired yet for apps/bot").

---

## Shared Patterns

### Pure-function-with-doc-comment file shape
**Source:** `apps/dashboard/lib/reorder.ts`, `apps/dashboard/lib/schemas/horario.ts`
**Apply to:** every `.ts` module in `packages/availability-engine/src/` (`intervals.ts`, `grid.ts`, `schedule.ts`, `computeSlots.ts`)
```typescript
/**
 * <file path> — <one-line purpose>, <which module/consumer calls this>
 * (<requirement/decision ID reference, e.g. AVAIL-01, D-01>).
 *
 * <2-4 sentences of context: what data shape it expects, what invariant it
 * maintains, why this exact approach vs. an alternative>.
 */
```
Every existing pure-logic file in this codebase (`reorder.ts`, `horario.ts`, `servicio.ts`) opens with this exact style of comment — the new engine files must follow it for consistency, and it materially helps future maintainers understand *why* (e.g. half-open interval semantics, grid anchor choice) without re-deriving it from RESEARCH.md.

### Vitest test file shape (fixture + describe/it granularity)
**Source:** `apps/dashboard/lib/schemas/horario.test.ts`, `apps/dashboard/lib/reorder.test.ts`
**Apply to:** all `*.test.ts` files in `packages/availability-engine/src/`
```typescript
import { describe, expect, it } from "vitest";
import { <fn>, type <Type> } from "./<module>";

// small fixture(s) at module scope, reused across `it`s
const <fixture> = ...;

// optional: helper function asserting a repeated invariant
function assert<Invariant>(result: ...) { ... }

describe("<functionName>", () => {
  it("<one specific behavior in plain Spanish>", () => {
    const result = <fn>(...);
    expect(result).<matcher>(...);
  });
  // one it() per requirement/pitfall/boundary case
});
```
Both existing test files import `describe`/`it`/`expect` explicitly from `"vitest"` even though `globals: true` is set in the vitest config — replicate this explicit-import style rather than relying on globals, for consistency with the rest of the codebase.

### Row-type sourcing from `@turnosbot/db-types` (never hand-declare parallel shapes)
**Source:** `apps/bot/src/db/client.ts` line 19 (`import type { Database } from "@turnosbot/db-types";`)
**Apply to:** `packages/availability-engine/src/types.ts`
```typescript
import type { Database } from "@turnosbot/db-types";

export type TurnoRow = Database["public"]["Tables"]["turno"]["Row"];
export type HorarioTrabajoRow = Database["public"]["Tables"]["horario_trabajo"]["Row"];
export type BloqueoRow = Database["public"]["Tables"]["bloqueo"]["Row"];
export type ServicioRow = Database["public"]["Tables"]["servicio"]["Row"];
export type NegocioRow = Database["public"]["Tables"]["negocio"]["Row"];
```
This is a **type-only** import — confirmed safe for a "no DB client" pure package since it adds zero runtime dependency on `@supabase/supabase-js` (the type package has no runtime code of its own beyond generated type declarations).

### Live-schema verification before trusting any column name
**Source:** `scripts/verify-timezone.ts`, `scripts/verify-double-booking.ts` (both guard `SUPABASE_URL.includes("bdgufnitakelyialjoqg")` before touching the DB, per CLAUDE.md's hard isolation rule)
**Apply to:** any new live-verification script this phase might add (e.g., a `scripts/verify-availability-engine.ts` smoke test, if the plan includes one per RESEARCH.md's "optional secondary task" for Pitfall 8's empty `horario_trabajo`/`bloqueo` seed data)
```typescript
if (!SUPABASE_URL.includes("bdgufnitakelyialjoqg")) {
  console.error(`SUPABASE_URL no apunta al proyecto TurnosBot. Abortando.`);
  process.exit(1);
}
```
Copy this guard verbatim into any new script under `scripts/` that touches the live DB for this phase — it is the established, non-negotiable isolation check in every existing verify script.

### `23P01` exclusion-violation handling
**Source:** `scripts/verify-double-booking.ts` lines 97-101 (assertion-style) + RESEARCH.md Code Examples (production-style `isSlotTakenConcurrently`)
**Apply to:** `packages/availability-engine/src/booking.ts`
```typescript
const EXCLUSION_VIOLATION = "23P01";

function isSlotTakenConcurrently(error: PostgrestError | null): boolean {
  return error?.code === EXCLUSION_VIOLATION;
}
```
This is the single place this signal should be interpreted; `bookAppointment`'s caller (bot tool layer, Fase 6; dashboard server action, Fase 4) branches on this boolean to decide UX (re-offer slots) rather than surfacing a raw 500.

## No Analog Found

None. Every file in this phase's scope has at least a role-matched analog in the existing codebase (see table above); the closest thing to a gap is the interval-subtraction *algorithm itself* (no existing file does timestamptz interval math), which RESEARCH.md already supplies as a fully-worked, ready-to-adapt code example (Pattern 1/2/3) — the pattern-file-shape analogs above (`reorder.ts`, `horario.ts`) govern structure/style, RESEARCH.md governs algorithm body.

## Metadata

**Analog search scope:** `apps/dashboard/lib/`, `apps/dashboard/lib/schemas/`, `apps/bot/src/db/`, `packages/availability-engine/`, `packages/db-types/`, `scripts/`, root/package-level `package.json`/`vitest.config.ts` files
**Files scanned:** ~25 (all `*.ts`/`*.test.ts` under the above paths, plus 3 migration SQL files, plus `database.types.ts` for live row shapes)
**Pattern extraction date:** 2026-07-05
