---
phase: 05-integraci-n-whatsapp-cloud-api
plan: 04
subsystem: api
tags: [supabase, negocioScoped, whatsapp, conversation, tdd, vitest]

# Dependency graph
requires:
  - phase: 05-integraci-n-whatsapp-cloud-api (plan 05-01)
    provides: negocioScoped(negocioId) write accessors (insertCliente, insertConversacion, updateConversacion)
provides:
  - findOrCreateCliente(negocioId, waId) — exact wa_id-based cliente identity resolution (WA-02, D-08)
  - findOrCreateConversacion(negocioId, clienteId) — conversacion find-or-create with 24h window refresh (WA-05, D-09, D-10)
  - responder(conversacion, mensajeEntrante) — deterministic Phase 5 stub, the single Phase 6 swap point (D-02)
affects: [05-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Conversation/persistence helpers under apps/bot/src/conversation/ go exclusively through negocioScoped(negocioId) — no direct supabaseAdmin.from(...) calls"
    - "Exact .eq() lookups for identity resolution (cliente.telefono) vs. .ilike() reserved for dashboard live-search UX only"

key-files:
  created:
    - apps/bot/src/conversation/findOrCreateCliente.ts
    - apps/bot/src/conversation/findOrCreateConversacion.ts
    - apps/bot/src/conversation/responder.ts
    - apps/bot/src/conversation/responder.test.ts
  modified: []

key-decisions:
  - "findOrCreateConversacion's refresh-existing path returns a locally-merged { ...existing, ventana_expira_at } object rather than re-querying the DB after updateConversacion, since the write accessor's update() call does not chain .select() — avoids an unnecessary extra round trip while still returning the caller-visible refreshed value"
  - "Avoided the literal substring '.ilike' anywhere in findOrCreateCliente.ts (including comments) to keep the plan's grep-based acceptance criterion ('the file does NOT contain .ilike') unambiguous"

patterns-established:
  - "Doc-comment-first module header citing D-xx/WA-xx/Pitfall-N identifiers, matching negocioScoped.ts/booking.ts house style"

requirements-completed: [WA-02, WA-05]

coverage:
  - id: D1
    description: "findOrCreateCliente resolves an existing cliente by exact telefono==wa_id match, or creates one scoped to the negocio, entirely via negocioScoped write/read accessors"
    requirement: "WA-02"
    verification:
      - kind: unit
        ref: "pnpm --filter @turnosbot/bot exec tsc -p tsconfig.json --noEmit"
        status: pass
      - kind: other
        ref: "grep confirms .eq(\"telefono\" present and no .ilike( / supabaseAdmin.from( in findOrCreateCliente.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "findOrCreateConversacion finds-or-creates the (negocio, cliente) conversacion, always refreshing ventana_expira_at to now()+24h, writing minimal context: {} on create"
    requirement: "WA-05"
    verification:
      - kind: unit
        ref: "pnpm --filter @turnosbot/bot exec tsc -p tsconfig.json --noEmit"
        status: pass
      - kind: other
        ref: "grep confirms no direct supabaseAdmin.from( in findOrCreateConversacion.ts (only negocioScoped accessors)"
        status: pass
    human_judgment: false
  - id: D3
    description: "responder(conversacion, mensajeEntrante) returns a deterministic Spanish placeholder reply containing 'Recibimos tu mensaje', documented as the sole Phase 6 swap point"
    verification:
      - kind: unit
        ref: "apps/bot/src/conversation/responder.test.ts — responder (D-02 stub) > returns the deterministic placeholder reply regardless of input"
        status: pass
    human_judgment: false

duration: 20min
completed: 2026-07-06
status: complete
---

# Phase 5 Plan 04: Conversation Persistence Helpers Summary

**findOrCreateCliente (exact wa_id match), findOrCreateConversacion (24h window refresh + minimal context contract), and the responder() deterministic stub — the Phase 6 swap point — for WA-02/WA-05.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-07-06T17:00:00-03:00
- **Completed:** 2026-07-06T17:14:00-03:00
- **Tasks:** 3 completed
- **Files modified:** 4 (all created)

## Accomplishments
- `findOrCreateCliente(negocioId, waId)` resolves client identity by an EXACT `.eq("telefono", waId)` match (never `.ilike`), creating a new cliente scoped to the negocio when absent — prevents duplicate cliente rows (Pitfall 7)
- `findOrCreateConversacion(negocioId, clienteId)` finds or creates the conversacion for a (negocio, cliente) pair, always refreshing `ventana_expira_at` to now()+24h, and documents the minimal `context: {}` contract Phase 6 owns extending (Pitfall 8)
- `responder(conversacion, mensajeEntrante)` implemented via full TDD RED→GREEN cycle as the deterministic, single swappable seam Phase 6 replaces (D-02)
- All three helpers go exclusively through `negocioScoped(negocioId)` write/read accessors — zero direct `supabaseAdmin.from(...)` calls in these files (D-11)

## Task Commits

Each task was committed atomically:

1. **Task 1: findOrCreateCliente (exact wa_id match, D-08)** - `94dcae1` (feat)
2. **Task 2: findOrCreateConversacion + 24h window refresh (D-09, D-10)** - `d39fd9d` (feat)
3. **Task 3: responder stub — the Phase 6 swap point (D-02)** - TDD: `d25997a` (test, RED) → `dc6afac` (feat, GREEN)

**Plan metadata:** (this SUMMARY commit, following)

## Files Created/Modified
- `apps/bot/src/conversation/findOrCreateCliente.ts` (NEW) - exact-match cliente identity resolution, digits-only-no-`+` phone contract documented inline
- `apps/bot/src/conversation/findOrCreateConversacion.ts` (NEW) - find-or-create conversacion + 24h window refresh, minimal `context: {}` contract
- `apps/bot/src/conversation/responder.ts` (NEW) - deterministic Spanish placeholder reply, Phase 6 swap point
- `apps/bot/src/conversation/responder.test.ts` (NEW) - asserts placeholder reply contains "Recibimos tu mensaje"

## Decisions Made
- `findOrCreateConversacion`'s refresh-existing branch returns a locally-merged object (`{ ...existing, ventana_expira_at: ventanaExpiraIso }`) instead of re-querying after `updateConversacion`, since the `negocioScoped` write accessor's `updateConversacion` does not chain `.select()` back — this avoids an unnecessary extra DB round trip while still returning the caller-visible refreshed row.
- Rewrote `findOrCreateCliente.ts`'s doc-comments to avoid the literal substring `.ilike` anywhere in the file (including prose), so the plan's grep-based acceptance criterion ("the file does NOT contain `.ilike`") holds unambiguously even in comments, not just in executable code.

## Deviations from Plan

None - plan executed exactly as written. The two doc-comment adjustments above were made proactively during authoring (not post-hoc fixes to broken behavior) to satisfy the plan's own stated acceptance criteria precisely, so they are not tracked as Rule 1-4 deviations.

## Issues Encountered
- The worktree had no `node_modules` installed at session start (`vitest`/`tsc` binaries missing). Ran `pnpm install` at the workspace root (lockfile was up to date, no dependency changes) before any verification command — a one-time environment bootstrap, not a plan deviation.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All three conversation helpers are ready for plan 05-05 (the pg-boss worker, `inboundWorker.ts`) to orchestrate: `findOrCreateCliente` → `findOrCreateConversacion` → `responder`, exactly per the `inboundWorker.ts` pattern already specified in 05-PATTERNS.md.
- No blockers identified.

---
*Phase: 05-integraci-n-whatsapp-cloud-api*
*Completed: 2026-07-06*

## Self-Check: PASSED

All four created files verified present on disk; all commit hashes (`d25997a`, `94dcae1`, `d39fd9d`, `dc6afac`, `1e6fbe2`) verified present in git log.
