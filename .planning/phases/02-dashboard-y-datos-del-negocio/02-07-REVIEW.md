---
phase: 02-dashboard-y-datos-del-negocio
reviewed: 2026-07-04T00:00:00Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - apps/dashboard/lib/schemas/horario.ts
  - apps/dashboard/lib/schemas/horario.test.ts
  - apps/dashboard/components/horario-editor.tsx
  - apps/dashboard/components/servicios-matrix.tsx
  - apps/dashboard/components/profesional-editar-form.tsx
  - apps/dashboard/app/(owner)/profesionales/[id]/editar/page.tsx
  - apps/dashboard/app/actions/profesionales.ts
findings:
  critical: 0
  warning: 4
  info: 4
  total: 8
status: issues_found
---

# Phase 02-07: Code Review Report

**Reviewed:** 2026-07-04
**Depth:** standard
**Files Reviewed:** 7
**Status:** issues_found

## Summary

Plan 02-07 implements the professional-edit page: weekly schedule editor, services/custom-price matrix, and the three Server Actions that persist them (`updateProfesional`, `updateHorario`, `updateServiciosMatrix`).

**Tenant/negocio isolation is solid.** All three write actions derive `negocio_id` exclusively from `getNegocioActivo()` (server-side, cookie validated against the RLS-scoped negocio list — never from client input), and each performs an explicit T-02-18 membership check before writing: `updateHorario`/`updateServiciosMatrix` confirm the `profesionalId` belongs to the active negocio via a `maybeSingle()` lookup, and `updateServiciosMatrix` additionally rejects any `servicioId` not in the active negocio (`.in("id", servicioIds)` intersection). Every write is further filtered by `.eq("negocio_id", negocio.id)`, and RLS (`auth_negocio_ids()`) is a third barrier. The loader page is likewise scoped. No cross-negocio leak path was found.

**Schema re-validation server-side is present and correct.** `horarioSchema.safeParse` re-runs `hora_fin > hora_inicio` and overlap detection on the server (`updateHorario`), so bypassing the client editor cannot persist invalid/overlapping blocks. `precio_custom < 0` is rejected server-side.

The issues below are real correctness gaps, not style: a `NaN` price can slip past the server's negative-price guard, and the delete+insert / delete+upsert "replace-all" sequences are not transactional, leaving a window where a partial failure orphans or empties data. None reach Critical because none allows a cross-negocio leak or crash; they are data-integrity and robustness concerns.

## Warnings

### WR-01: `NaN` precio_custom bypasses the server-side `< 0` guard and reaches the DB

**File:** `apps/dashboard/app/actions/profesionales.ts:204-209` (with source at `apps/dashboard/components/servicios-matrix.tsx:141-146`)
**Issue:** The client builds `precioCustom` with `Number(nuevoValor)`. `Number()` returns `NaN` for any non-numeric input the browser might let through (or for a bypassed/scripted client). The server's only price check is:
```ts
asignacion.precioCustom !== null && asignacion.precioCustom < 0
```
`NaN < 0` evaluates to `false`, so a `NaN` passes validation and is sent into the `upsert`'s `precio_custom` column. Depending on the column type/driver this either errors opaquely (mapped to `GENERIC_ERROR`) or persists a garbage value that later breaks price display/booking math. The spec (T-02-20) requires `precioCustom` to be `null` or a finite `>= 0`.
**Fix:** Validate finiteness explicitly, ideally with a shared Zod schema mirroring `servicio.ts`:
```ts
const asignacionSchema = z.object({
  servicioId: z.string().uuid(),
  realiza: z.boolean(),
  precioCustom: z.number().finite().min(0).nullable(),
});
const parsed = z.array(asignacionSchema).safeParse(asignaciones);
if (!parsed.success) return { error: SAVE_ERROR_COPY };
```
Or, minimally, change the guard to `precioCustom !== null && !(Number.isFinite(precioCustom) && precioCustom >= 0)`. Also coerce `NaN` to `null` at the client source in `servicios-matrix.tsx`.

### WR-02: `updateHorario` delete+insert is not transactional — a failed insert leaves the schedule empty

**File:** `apps/dashboard/app/actions/profesionales.ts:161-176`
**Issue:** The "replace-all" strategy issues a `DELETE` then a separate `INSERT` as two independent HTTP round-trips through the Supabase JS client — there is no surrounding transaction. If the `INSERT` fails (network blip, transient DB error, constraint), the `DELETE` has already committed, so the professional is left with **zero** schedule rows and the action returns `GENERIC_ERROR`. The owner sees an error, assumes nothing changed, but the previous schedule is gone. This is a data-loss window, not just a retry annoyance.
**Fix:** Make the replace atomic. Preferred: a Postgres RPC (`SECURITY INVOKER` so RLS still applies) that does delete+insert in one transaction, called via `supabase.rpc(...)`. Example function body:
```sql
create or replace function replace_horario(p_profesional_id uuid, p_filas jsonb)
returns void language plpgsql security invoker as $$
begin
  delete from horario_trabajo where profesional_id = p_profesional_id;
  insert into horario_trabajo (negocio_id, profesional_id, dia_semana, hora_inicio, hora_fin)
  select (f->>'negocio_id')::uuid, (f->>'profesional_id')::uuid,
         (f->>'dia_semana')::int, (f->>'hora_inicio')::time, (f->>'hora_fin')::time
  from jsonb_array_elements(p_filas) as f;
end $$;
```
If an RPC is out of scope for this phase, at minimum document the non-atomicity and consider ordering as insert-new-then-delete-old with a discriminator, so a failure never leaves the row set empty.

### WR-03: `updateServiciosMatrix` delete+upsert is not transactional — partial failure leaves an inconsistent matrix

**File:** `apps/dashboard/app/actions/profesionales.ts:252-282`
**Issue:** Same class of problem as WR-02. The unchecked-services `DELETE` (lines 252-266) and the checked-services `UPSERT` (lines 268-282) are two separate non-transactional statements. If the `DELETE` succeeds and the `UPSERT` then fails, the professional loses the services they *deselected* but keeps the old state of the ones they meant to keep/add — a torn write that neither matches the submitted matrix nor the prior state. Returns `GENERIC_ERROR`, so the owner has no idea the DB is now in a mixed state.
**Fix:** Wrap both operations in a single transaction via an RPC (same pattern as WR-02), or restructure as a full replace-all inside one transactional function. At this row volume the simplest correct approach is: in one RPC, delete all `profesional_servicio` rows for the professional, then insert only the `realiza: true` set.

### WR-04: `updateHorario` overlap validation is per-block-pair O(n²) but ignores DB-level ordering/granularity assumptions silently

**File:** `apps/dashboard/app/actions/profesionales.ts:129-159` and `apps/dashboard/lib/schemas/horario.ts:70-86`
**Issue:** The server re-validates overlap and `hora_fin > hora_inicio` (good), but the inserted `hora_inicio`/`hora_fin` are the raw `"HH:mm"` strings from the client with no enforcement that they align to the negocio's `granularidad_min` grid (BIZ-03). The editor sets `step` on the `<input type="time">`, but that is a client-only affordance — a bypassed client can submit `09:07`. Times off the grid will later be mishandled by the availability engine (a classic scheduling bug called out in the stack notes). Not a leak, but a correctness gap the "re-validate everything server-side" mandate implies should be closed.
**Fix:** Add a server-side check that every `hora_inicio`/`hora_fin` minute value is a multiple of `negocio.granularidad_min` before inserting, returning `SAVE_ERROR_COPY` otherwise. This can live in a refined schema variant that receives the granularity, or as an explicit loop in `updateHorario`.

## Info

### IN-01: `.update()`/`delete()` matching zero rows reports success on a non-existent id

**File:** `apps/dashboard/app/actions/profesionales.ts:96-110` (`updateProfesional`), `289-310` (`toggleProfesionalActivo`)
**Issue:** `updateProfesional` and `toggleProfesionalActivo` do not perform the explicit membership pre-check that `updateHorario`/`updateServiciosMatrix` do; they rely solely on the `.eq("negocio_id", ...)` filter. A Supabase `update` that matches zero rows returns `{ error: null }`, so passing a `profesionalId` from another negocio (or a deleted one) returns success with no effect. This is not a security leak (nothing is written cross-negocio), but it is a silent no-op reported as success, inconsistent with the stricter T-02-18 pattern used two functions down.
**Fix:** For consistency, add `.select("id")` to the update and check the returned row count, or do the same `maybeSingle()` membership pre-check used in `updateHorario`.

### IN-02: React list keyed by array `index` in the schedule editor

**File:** `apps/dashboard/components/horario-editor.tsx:163-164`
**Issue:** Block rows use `key={index}`. Removing a middle block (`quitarBloque`) reindexes subsequent items, which can cause React to reconcile inputs incorrectly (focus/value flicker on the wrong row). Blocks have no stable id in local state, so index is the current fallback.
**Fix:** Give each block a stable client-side id when created (e.g. `crypto.randomUUID()`) and key on it, stripping the id before submitting to the action.

### IN-03: Non-null column `activo` on `horario_trabajo` never set on insert; relies on DB default

**File:** `apps/dashboard/app/actions/profesionales.ts:151-159`
**Issue:** Inserted `horario_trabajo` rows omit `activo` (type shows `activo?: boolean`, so a DB default exists). This is fine today, but if the default is ever `false` or dropped, inserted schedule blocks would be silently inactive. Worth an explicit `activo: true` for intent clarity given schedule rows are meaningless when inactive.
**Fix:** Set `activo: true` explicitly in the inserted row objects.

### IN-04: `DIA_SEMANA_INDEX` aliasing and the 0=lunes contract are load-bearing but only asserted by a comment

**File:** `apps/dashboard/app/(owner)/profesionales/[id]/editar/page.tsx:21,61-70` and `apps/dashboard/app/actions/profesionales.ts:151`
**Issue:** The mapping "array index 0..6 == `dia_semana` in DB, 0=lunes" is duplicated across the loader (`filter((fila) => fila.dia_semana === index)`) and the writer (`DIAS_SEMANA.flatMap((dia, diaSemana) => ...)`). Both depend on `DIAS_SEMANA` order matching the DB's integer convention. If someone reorders `DIAS_SEMANA` (e.g. to make Sunday first), read and write silently corrupt every schedule with no test catching it. `horario.test.ts` does not cover this index mapping.
**Fix:** Add a small test asserting the round-trip (DB integer -> editor day -> DB integer) for at least lunes(0) and domingo(6), and/or centralize the mapping in one exported constant/function used by both files.

---

_Reviewed: 2026-07-04_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
