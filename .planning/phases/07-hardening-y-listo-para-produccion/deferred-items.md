# Deferred Items — Phase 07 (hardening-y-listo-para-produccion)

Items discovered during plan execution that are out of scope for the current
task (pre-existing, unrelated to the files being modified) — logged per the
executor's scope-boundary rule, not fixed.

## From Plan 07-05 (SEC-03 negocioScoped isolation test)

**Pre-existing `apps/bot` typecheck failures, unrelated to `negocioScoped.test.ts`**

Discovered while running `pnpm --filter @turnosbot/bot typecheck` to validate
this plan's changes. Confirmed pre-existing via `git stash` + re-run (same 7
errors present on `main` before this plan's commits):

```
src/conversation/responder.ts(365,17): error TS2554: Expected 4 arguments, but got 0.
src/conversation/tools/confirmarTurno.test.ts(52,39): error TS2353: Object literal may only specify known properties, and 'startIso' does not exist in type 'AvailableSlot'.
src/conversation/tools/confirmarTurno.ts(147,24): error TS2339: Property 'startIso' does not exist on type 'AvailableSlot'.
src/conversation/tools/confirmarTurno.ts(148,21): error TS2339: Property 'endIso' does not exist on type 'AvailableSlot'.
src/conversation/tools/reagendarTurno.test.ts(53,32): error TS2353: Object literal may only specify known properties, and 'startIso' does not exist in type 'AvailableSlot'.
src/conversation/tools/reagendarTurno.ts(165,29): error TS2339: Property 'startIso' does not exist on type 'AvailableSlot'.
src/conversation/tools/reagendarTurno.ts(166,26): error TS2339: Property 'endIso' does not exist on type 'AvailableSlot'.
```

Looks like `AvailableSlot` (from `@turnosbot/availability-engine`) dropped or
renamed `startIso`/`endIso`, and `responder.ts` calls something with an
outdated arity — likely drift from a prior phase's refactor of the shared
`availability-engine` package that never got propagated to these bot-side
call sites. Not touched by Plan 07-05 (only `apps/bot/src/db/
negocioScoped.test.ts` was in scope). Needs its own fix pass — recommend a
quick task or a dedicated plan before shipping, since it currently breaks
`pnpm --filter @turnosbot/bot typecheck` on `main`.
