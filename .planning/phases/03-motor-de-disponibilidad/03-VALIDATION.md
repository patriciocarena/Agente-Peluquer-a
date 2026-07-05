---
phase: 3
slug: motor-de-disponibilidad
status: ready
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-04
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (a agregar a `packages/availability-engine` — hoy tiene 0 deps) |
| **Config file** | `packages/availability-engine/vitest.config.ts` (Wave 0 lo crea) |
| **Quick run command** | `pnpm --filter @turnosbot/availability-engine exec vitest run` |
| **Full suite command** | `pnpm -w exec vitest run` (todo el workspace) |
| **Estimated runtime** | ~5–15 s (unit puros con fixtures) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @turnosbot/availability-engine exec vitest run`
- **After every plan wave:** Run `pnpm -w exec vitest run` + `pnpm -w exec tsc -b`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| computeSlots núcleo | TBD | 1 | AVAIL-01 | — | slots = horario − bloqueos − turnos activos, half-open `[)` | unit | `pnpm --filter @turnosbot/availability-engine exec vitest run` | ❌ W0 | ⬜ pending |
| multi-servicio contiguo | TBD | 1 | AVAIL-02 | — | suma de duraciones en un único bloque | unit | idem | ❌ W0 | ⬜ pending |
| snapshots al agendar | TBD | 2 | AVAIL-03 | T-03 | congela nombre/precio/duración; nunca join vivo | unit + live | idem + tsx script | ❌ W0 | ⬜ pending |
| módulo único compartido | TBD | 1 | AVAIL-04 | — | `computeSlots` pura sin dep de DB; ambos apps la importan | unit + grep | idem | ❌ W0 | ⬜ pending |
| auto-asignación hueco temprano | TBD | 1 | AVAIL-05 | — | elige profesional con hueco más temprano; tie-break estable | unit | idem | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/availability-engine/vitest.config.ts` — runner para el paquete (hoy sin tests)
- [ ] `packages/availability-engine/package.json` — agregar `vitest`, `date-fns`, `@date-fns/tz`
- [ ] Fixtures deterministas de `horario_trabajo` / `bloqueo` / `turno` (la DB live tiene esas tablas VACÍAS — los unit tests con fixtures son la estrategia primaria)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Verificación live contra bdgufnitakelyialjoqg (round-trip real de slots) | AVAIL-01/03 | Requiere seed de horario/bloqueo/turnos en la DB live | Correr un script `tsx` que siembre datos y compare `computeSlots` contra la agenda esperada |
