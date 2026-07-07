---
phase: 6
slug: agente-conversacional-de-agendamiento
status: ready
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-06
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Transcribed from `06-RESEARCH.md` § Validation Architecture and `06-AI-SPEC.md` § 5 (Evaluation Strategy).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest `4.1.9` (ya instalado en `apps/bot` y `packages/availability-engine`) |
| **Config file** | `apps/bot/vitest.config.ts` — Wave 0 (plan 06-06) debe ampliar `include` a `["src/**/*.test.ts", "evals/**/*.test.ts"]` para que el directorio `evals/` sea descubrible |
| **Quick run command** | `pnpm --filter @turnosbot/bot exec vitest run src/conversation/` |
| **Full suite command** | `pnpm --filter @turnosbot/bot test` + `pnpm --filter @turnosbot/availability-engine test` |
| **Estimated runtime** | ~15–30 s (suite mockeada, sin llamadas a Gemini) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @turnosbot/bot exec vitest run <archivo tocado>` — las evals code-based (tools mockeadas, sin llamar a Gemini real) corren sin costo de API (AI-SPEC § 5 "CI/CD Integration").
- **After every plan wave:** Run `pnpm --filter @turnosbot/bot test` + `pnpm --filter @turnosbot/availability-engine test` (full suite de ambos paquetes tocados).
- **Before `/gsd-verify-work`:** Full suite verde + al menos una corrida manual del dataset de 20 conversaciones (AI-SPEC § 5). La corrida con LLM judge real contra Gemini respeta el rate limit del free tier (~30 RPM / 1500 RPD) — nightly / on-change, no en cada PR.
- **Max feedback latency:** ~30 s para la suite mockeada por commit.

---

## Per-Task Verification Map

| Req ID | Plan | Wave | Behavior | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|--------|------|------|----------|------------|-----------------|-----------|-------------------|-------------|--------|
| BOT-09 | 06-01 | 1 | `cancelAppointment` compartido (misma lógica que dashboard) | — | Scope por `negocio_id`+`turnoId`, nunca DELETE; UPDATE `estado='cancelado'` | unit | `pnpm --filter @turnosbot/availability-engine test` | ❌ W0 (ampliar `booking.test.ts`) | ⬜ pending |
| BOT-01 | 06-02 | 1 | Parseo de estado conversacional, defaults seguros | T-06 injection | `parseConversationContext` nunca lanza ante `context` vacío/malformado | unit | `pnpm --filter @turnosbot/bot exec vitest run src/conversation/conversationState.test.ts` | ❌ W0 | ⬜ pending |
| BOT-11 | 06-02 | 1 | System prompt con framing anti-injection D-13 | T-06 injection | Boundary de dominio + regla D-12 + `negocioId` fijo por conversación | unit | `pnpm --filter @turnosbot/bot exec vitest run src/conversation/` | ❌ W0 | ⬜ pending |
| BOT-01/02 | 06-03 | 2 | Extrae servicio(s)/profesional; "sin preferencia" vía `autoAssign` | — | Ninguna tool recibe `negocioId` como input del modelo (closure) | unit | `pnpm --filter @turnosbot/bot exec vitest run src/conversation/tools/` | ❌ W0 | ⬜ pending |
| BOT-03/07 | 06-03 | 2 | Propone slots reales de `computeSlots` | — | Disponibilidad real inyectada, nunca inventada (D-12) | unit | `pnpm --filter @turnosbot/bot exec vitest run src/conversation/tools/buscarHorarios.test.ts` | ❌ W0 | ⬜ pending |
| BOT-05/06/08 | 06-03 | 2 | Precio/horario/estado de turno reales | — | Lectura vía `negocioScoped(negocioId)` | unit | `pnpm --filter @turnosbot/bot exec vitest run src/conversation/tools/consultarNegocio.test.ts` | ❌ W0 | ⬜ pending |
| BOT-04 | 06-04 | 2 | Confirma con `turno_id` real de `bookAppointment` (D-12) | T-06 phantom-confirm | Nunca id inventado; respeta ventana 60min/30d | unit | `pnpm --filter @turnosbot/bot exec vitest run src/conversation/tools/confirmarTurno.test.ts` | ❌ W0 | ⬜ pending |
| BOT-10 | 06-04 | 2 | Reagenda vía `rescheduleAppointment` (misma lógica que dashboard) | — | Misma forma de input que dashboard (D-09) | unit | `pnpm --filter @turnosbot/bot exec vitest run src/conversation/tools/reagendarTurno.test.ts` | ❌ W0 | ⬜ pending |
| BOT-09 | 06-04 | 2 | Cancela vía `cancelAppointment` compartido (bot) | — | Nunca `estado='cancelado'` inline (AVAIL-04) | unit | `pnpm --filter @turnosbot/bot exec vitest run src/conversation/tools/cancelarTurno.test.ts` | ❌ W0 | ⬜ pending |
| BOT-03/04 | 06-05 | 3 | Tool-loop `generateText` + gate D-12 sobre `result.steps` | T-06 phantom-confirm | Texto de cierre bloqueado salvo `turno_id` real en el trace | unit | `pnpm --filter @turnosbot/bot exec vitest run src/conversation/responder.test.ts` | ❌ W0 | ⬜ pending |
| BOT-11 | 06-05 | 3 | Skip por `needsHuman` fuera del control del modelo (D-11) | T-06 injection | `inboundWorker` salta el agente si `needsHuman` en `context` | unit | `pnpm --filter @turnosbot/bot exec vitest run src/queue/inboundWorker.test.ts` | ❌ W0 | ⬜ pending |
| BOT-04 | 06-06 | 4 | Aserción determinista confirmación-fantasma (E1) | T-06-21/22 | Assert sobre `result.steps`, nunca sobre `result.text` | unit (mock) | `pnpm --filter @turnosbot/bot exec vitest run evals/traceAssertions.test.ts` | ❌ W0 | ⬜ pending |
| BOT-11 | 06-06 | 4 | Aserción estructural de aislamiento + adversarial (E3) | T-06-21 | Ninguna tool `execute` recibe scope ≠ conversación | unit (mock) + eval | `pnpm --filter @turnosbot/bot exec vitest run evals/` | ❌ W0 | ⬜ pending |
| BOT-05/06/07 | 06-06 | 4 | Fidelidad de dominio (E2) vía LLM judge | — | Afirmaciones factuales rastreables a tool-results | eval (judge, gated) | `pnpm --filter @turnosbot/bot exec promptfoo eval -c evals/promptfooconfig.yaml` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/bot/vitest.config.ts` — ampliar `include` a `["src/**/*.test.ts", "evals/**/*.test.ts"]` (plan 06-06, prerequisito de todos los comandos `vitest run evals/`)
- [ ] `apps/bot/package.json` — instalar `ai`, `@ai-sdk/google`, `@turnosbot/availability-engine` (deps) y `promptfoo` (devDependency)
- [ ] `apps/bot/src/conversation/tools/*.test.ts` — un archivo de test por tool nueva, mockeando `db`/`computeSlots`/`bookAppointment` (sin llamar a Gemini)
- [ ] `apps/bot/src/conversation/conversationState.test.ts` — cubre BOT-01/02 (parseo de `context`, defaults seguros)
- [ ] `packages/availability-engine/src/booking.test.ts` — agregar casos de `cancelAppointment` (BOT-09), siguiendo el patrón existente de `bookAppointment`/`rescheduleAppointment`
- [ ] `apps/bot/evals/` — directorio nuevo completo (dataset de 20 conversaciones, `judge.ts`, `traceAssertions.ts`, `responder.eval.test.ts`, `promptfooconfig.yaml`) per AI-SPEC § 5

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Calibración del LLM judge ≥ 0.7 vs. etiquetas humanas | BOT-04, BOT-11 | Requiere `GOOGLE_GENERATIVE_AI_API_KEY` real y consume free tier de Gemini (rate-limited) | Checkpoint del plan 06-06 (task `autonomous: false`): correr dataset de 20 casos con el judge real, comparar contra labels del product owner, confirmar correlación ≥ 0.7 antes de confiar en el judge |
| Smoke run live del agente contra Gemini real | BOT-01..BOT-04 | El tool-loop real necesita un API key vivo; el resto de la suite corre mockeada | Enviar una conversación de agendamiento end-to-end por el worker con key real, verificar `turno_id` real persistido |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags (todos los comandos usan `vitest run`, no `vitest` watch)
- [x] Feedback latency < 30s (suite mockeada por commit)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-07-06
