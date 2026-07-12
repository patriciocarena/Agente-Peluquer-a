# Deferred Items — 260712-g2y

Items discovered during execution that are out of scope for this quick task
(alcance estricto: solo `servicio-dialog.tsx` y `servicios-table.tsx`).

## Pre-existing typecheck error in `app/(owner)/turnos/page.tsx`

- **Found during:** running `cd apps/dashboard && pnpm typecheck` before Task 1.
- **Error:** `app/(owner)/turnos/page.tsx(250,30): error TS2345: Argument of type 'number | null' is not assignable to parameter of type 'number'.` — `fmtPrecio(n: number)` called with `t.precio_total` (typed `number | null`).
- **Confirmed pre-existing:** reproduced with `git status --short` showing zero changes to that file (only `apps/dashboard/components/servicio-dialog.tsx` modified at the time). Introduced by the vista-Semana work (`728cffe` / `83cb5ad`), unrelated to servicios.
- **Not fixed:** out of scope per CLAUDE.md hard constraint ("Alcance estricto: SÓLO los dos componentes del dashboard. No tocar ... nada fuera de los dos componentes de servicios") and the plan's `<files_modified>` list.
- **Verification impact:** `pnpm typecheck` for the whole `apps/dashboard` package cannot reach zero errors until this is fixed separately. Both tasks in this plan were verified by confirming their edits introduce zero *new* errors (the only line in `tsc` output is this pre-existing one, in an untouched file).
