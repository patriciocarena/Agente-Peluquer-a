# Deferred Items — 260712-gnl

Items discovered during execution that are out of scope for this quick task
(alcance estricto: solo los 7 archivos listados en `<files_modified>` del plan).

## Pre-existing typecheck error in `app/(owner)/turnos/page.tsx`

- **Found during:** baseline `cd apps/dashboard && corepack pnpm typecheck` run before Task 1.
- **Error:** `app/(owner)/turnos/page.tsx(250,30): error TS2345: Argument of type 'number | null' is not assignable to parameter of type 'number'.` — `fmtPrecio(t.precio_total)` called with `precio_total` typed `number | null` (vista Semana).
- **Confirmed pre-existing:** same error as logged in `260712-g2y-deferred-items.md` and in `STATE.md` ("queda un error preexistente ajeno en `turnos/page.tsx:250`"). The plan's `<verification>` note claimed this was "ya resuelto en un commit posterior" — that claim did not hold for this worktree's base (`6dd705c`, which includes `728cffe`/`83cb5ad`, the vista-Semana commits that introduced the error); still present, still unrelated to any of the 7 target files.
- **Not fixed:** out of scope per the plan's hard constraint ("Alcance duro: SOLO estos archivos del dashboard... NO tocar... nada fuera de los 7 archivos listados") and the orchestrator's execution constraints (strict scope: only the 7 dashboard files).
- **Verification impact:** `corepack pnpm typecheck` for the whole `apps/dashboard` package cannot reach zero total errors until this is fixed separately (tracked already via the g2y deferred item and STATE.md). Each task in this plan was verified by confirming zero *new* errors — the only line in `tsc` output before and after every task is this single pre-existing one, in an untouched file.
