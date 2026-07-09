---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_phase: 07
current_phase_name: hardening-y-listo-para-produccion
status: executing
stopped_at: Phase 7 context gathered
last_updated: "2026-07-09T21:28:23.987Z"
last_activity: 2026-07-09
last_activity_desc: Phase 07 execution started
progress:
  total_phases: 7
  completed_phases: 6
  total_plans: 43
  completed_plans: 40
  percent: 93
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-03)

**Core value:** Un cliente puede agendar un turno real, en un horario realmente disponible, conversando por WhatsApp en lenguaje natural — sin intervención humana de la peluquería.
**Current focus:** Phase 07 — hardening-y-listo-para-produccion

## Current Position

Phase: 07 (hardening-y-listo-para-produccion) — EXECUTING
Status: Executing Phase 07
Last activity: 2026-07-09 — Completado plan 07-05 (SEC-03 negocioScoped isolation, verificado en vivo)

Progress: [█████████░] 93%

## Performance Metrics

**Velocity:**

- Total plans completed: 14
- Average duration: - min
- Total execution time: - hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| Phase 01 P05 | 62 min | 3 tasks | 12 files |
| 02 | 8 | - | - |
| 5 | 6 | - | - |

**Recent Trend:**

- Last 5 plans: -
- Trend: -

*Updated after each plan completion*
| Phase 02 P02 | 35 | 2 tasks | 40 files |
| Phase 02 P03 | 40min | 3 tasks | 12 files |
| Phase 02 P07 | 25min | 3 tasks | 8 files |
| Phase 03 P01 | 12min | 3 tasks | 6 files |
| Phase 03 P03 | 8min | 3 tasks | 6 files |
| Phase 03 P04 | 10min | 3 tasks | 5 files |
| Phase 03-motor-de-disponibilidad P05 | 25min | 3 tasks | 8 files |
| Phase 04 P01 | 15min | 2 tasks | 6 files |
| Phase 04 P03 | 12min | 3 tasks | 3 files |
| Phase 04 P04 | 20min | 2 tasks | 3 files |
| Phase 04 P06 | 15min | 2 tasks | 2 files |
| Phase 04 P05 | 18min | 3 tasks | 4 files |
| Phase 04 P07 | 55min | 3 tasks | 9 files |
| Phase 06 P01 | 12min | 2 tasks | 5 files |
| Phase 06-agente-conversacional-de-agendamiento P02 | 22min | 3 tasks | 6 files |
| Phase 06-agente-conversacional-de-agendamiento P03 | 20min | 2 tasks | 7 files |
| Phase 06-agente-conversacional-de-agendamiento P04 | 15min | 2 tasks | 6 files |
| Phase 06-agente-conversacional-de-agendamiento P05 | 15min | 3 tasks | 6 files |
| Phase 07 P04 | 20min | 1 tasks | 1 files |
| Phase 07 P05 | 15min | 3 tasks | 1 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Roadmap: Vercel AI SDK reemplaza a OpenClaw (incompatible con Cloud API oficial/multitenant)
- Roadmap: Bot service separado del dashboard, unidos solo por Postgres y el paquete compartido `availability-engine`
- Roadmap: Sin seña, sin recordatorios, sin self-service en v1 — reduce superficie a agendar por conversación
- [Phase 01]: tenantScoped(tenantId) established as the only sanctioned service_role query path for the bot; verify scripts prove RLS isolation, timezone round-trip, and GiST double-booking rejection live against bdgufnitakelyialjoqg

- **[Phase 01 — arm64 re-verify]** ✅ RESOLVED 2026-07-04. The Dockerfile was made pnpm-workspace-aware, closing the `workspace:*` / EUNSUPPORTEDPROTOCOL regression on ROADMAP Success Criteria #5. Re-verified live: installed colima/Docker, arm64 image builds cleanly (`arch=arm64 os=linux`), container `GET /health` → HTTP 200, `docker compose up -d` healthcheck `healthy`. Phase 01 is now 5/5 Success Criteria verified — VERIFICATION.md status flipped to `passed`. Phase 01 ready to close.
- [Phase ?]: [Phase 02-02] Tailwind v4 CSS-first + shadcn base radix: base neutral con acento azul aislado, Inter self-hosted, next-themes class strategy; vitest runner
- [Phase 02-03]: Clientes Supabase dual (server/browser/admin server-only) + middleware con getUser() para el gate owner/superadmin + require-role.ts como capa de defensa en profundidad; login/logout via Server Actions + zod — Cierra AUTH-01..04 y el borde de seguridad dual (RLS owner / service_role aislado admin); zod@4.4.3 y server-only@0.0.1 agregados y verificados contra el registry sin necesitar checkpoint bloqueante (paquetes canonicos ya pre-aprobados en el tech-stack del proyecto)
- [Phase 02]: [Phase 02-07]: Horario semanal multi-bloque (delete+insert por profesional) + matriz de servicios/precio custom (upsert onConflict profesional_id,servicio_id); profesional-editar-form.tsx orquesta 3 Server Actions secuenciales tras un unico 'Guardar cambios' — Cierra PRO-02/03/04
- [Phase 03]: [Phase 03-01] Fundación de @turnosbot/availability-engine: vitest+date-fns/@date-fns/tz/zod instalados, constantes de ventana de reserva (60min/30d, D-05) en un único archivo, types.ts con row aliases type-only desde db-types (motor puro, AVAIL-04) y fixtures deterministas — Wave 0 que desbloquea el algoritmo — AVAIL-04: un único paquete puro con contratos únicos que bot y dashboard importan sin drift
- [Phase ?]: [Phase 03-03] Tres primitivos del motor de intervalos (subtractIntervals half-open, snapToGrid anclado a medianoche-en-zona con gate Pitfall 5, resolveWorkIntervalsForDate via TZDate sin offset -3) con TDD RED-GREEN, 20 tests verdes — AVAIL-01/AVAIL-02
- [Phase 03]: [Phase 03-04] Orquestación pura de computeSlots (schedule-bloqueos-turnos->grid->ventana->auto-assign) + autoAssign con tie-break estable por professionalId + index.ts como barrel público
- [Phase 03-05]: bookAppointment congela snapshots de nombre/precio/duracion por servicio (Pitfall 3, AVAIL-03) y traduce el 23P01 de la GiST EXCLUDE en un resultado de dominio slot_taken (CORE-05); cliente Supabase inyectado, sin dependencia runtime de @supabase/supabase-js en el paquete; checkpoint: scripts/verify-availability-engine.ts escrito pero no ejecutado (falta .env real)
- [Phase ?]: [Phase 04-01] Extendido @turnosbot/availability-engine con skipBookingWindow (D-08, bypass opt-in de la ventana 60min/30d) y rescheduleAppointment (D-14, UPDATE con self-exclusion + traduccion 23P01->slot_taken) -- Cierra APPT-05/APPT-06 en el motor compartido bot/dashboard
- [Phase 04-03]: buscarClientePorTelefono usa .ilike con match parcial para búsqueda incremental por dígitos (D-09, resuelve A3 de 04-RESEARCH.md)
- [Phase 04-03]: crearClienteInline no llama revalidatePath — crear un cliente no altera la grilla de turnos; el clienteId se pasa directo al flujo del modal
- [Phase ?]: [Phase 04-04]: crearTurnoManual delega en bookAppointment(skipBookingWindow:true) + UPDATE solo-de-estado a confirmado; cancelarTurno hace UPDATE estado=cancelado (nunca DELETE); reagendarTurno delega en rescheduleAppointment con serviceIds via fetchTurnoServicios -- cierra APPT-04/05/06 en el dashboard
- [Phase ?]: [Phase 04-04]: profesionalesElegibles exige elegibilidad de un profesional para TODOS los serviceIds pedidos (Set + every), cerrando Pitfall 6/Open Question 3 de 04-RESEARCH.md
- [Phase ?]: [Phase 04-04]: Rule 3 fix -- BookAppointmentDeps/BookAppointmentResult exportados desde el barrel de @turnosbot/availability-engine (faltaban pese a que bookAppointment/rescheduleAppointment ya los devolvian/recibian)
- [Phase 04-06]: Offset fijo -03:00 (Argentina, sin DST desde 2009) hardcodeado en bloqueo-form-dialog.tsx para convertir hora local a UTC sin agregar @date-fns/tz al dashboard
- [Phase 04-06]: granularidadMin agregada como prop opcional (default 30) en BloqueoFormDialog para la duracion del bloqueo, resolviendo la guia del plan sin romper el contrato minimo de props
- [Phase 04-05]: TurnoFormDialog agrega prop servicios (Tables<servicio>[]) para las checkboxes del modo alta, requerido por la prosa del Task 2 aunque no listado en el resumen artifacts_produced
- [Phase 04-05]: slot-selector.tsx reusa el offset fijo -03:00 (Argentina, sin DST) ya establecido por bloqueo-form-dialog.tsx para convertir HH:mm local a ISO, en vez de agregar @date-fns/tz al dashboard
- [Phase 04-07]: BloqueoPopover gana prop opcional anchor (PopoverAnchor asChild) para resolver el anclaje visual dejado abierto por Plan 06 -- retrocompatible
- [Phase 04-07]: @turnosbot/availability-engine cambia main/types de src/index.ts a dist/ compilado (prepare: tsc -b) -- Turbopack no resuelve especificadores NodeNext .js internos que tsc/vitest si resuelven; cero cambios al codigo fuente del motor
- [Phase 04-07]: computeSlots dimensionado con un servicio sintetico local (id grid-slot, nunca persistido) para calcular libre a granularidad de UN slot, en vez de la duracion de un servicio real
- [Phase 06-01]: cancelAppointment agregado a @turnosbot/availability-engine como tercer camino de escritura compartido (BOT-09); already_cancelled tratado como estado benigno idempotente (success), no error, en el dashboard, misma semantica que debera adoptar la tool del bot en 06-04
- [Phase 06-02]: buildBotAvailabilityData toma negocioRes.data?.[0] porque negocioScoped().negocio() filtra por tenant_id (no negocio_id); systemPrompt.ts nunca interpola negocioId ni ids internos (D-13) — Guardrails D-01/05/06/08/12/13 del system prompt implementados con 3 few-shots inline; base pura para tools 06-03/06-04 y responder 06-05
- [Phase 06-03]: autoAssign se reexporta desde el barrel de @turnosbot/availability-engine (antes solo interno) — asignarProfesionalTool lo importa del barrel per el plan, delegando 100% en el desempate puro sin heuristica propia
- [Phase 06-03]: buscarHorarios devuelve TODOS los slots dentro de la ventana de reserva (no trunca a 2-3) — el filtrado de opciones concretas para el cliente queda del lado del prompt/modelo, la tool sigue siendo la unica fuente de verdad sin post-proceso (D-12)
- [Phase 06-04]: confirmarTurno/reagendarTurno/cancelarTurno envuelven exclusivamente bookAppointment/rescheduleAppointment/cancelAppointment del motor compartido, con negocioId/clienteId closure-captured (D-13) y turnoId real surfaceado en el caso ok (base del gate D-12 de 06-05)
- [Phase 06-04]: reagendarTurno/cancelarTurno reciben clienteId en la factory solo por paridad de firma (Pattern 1) -- el scoping real de la mutacion lo hace la funcion de dominio via negocioId+turnoId, mismo modelo de confianza que el dashboard
- [Phase 06-05]: responder.ts ensamblado como tool-loop generateText(stopWhen isStepCount(6)) con las 5 tools de 06-03/06-04; gate D-12 escanea result.steps (nunca result.text) por confirmarTurno/reagendarTurno con turno_id real vía closingLanguage.ts (léxico único, compartido con la eval offline 06-06)
- [Phase 06-05]: inboundWorker.ts lee needsHuman de conversacion.context ANTES de invocar responder (D-11) — el handoff a humano queda fuera del control del modelo, saltando responder+sendWhatsappMessage sin regresión del dedup 23505 ni del gate de ventana 24h
- [Phase 07]: [Phase 07-04]: verify-concurrent-booking.ts probo en vivo SEC-02 Success Criterion #2 -- 3/3 corridas deterministas, exactamente 1 exito y N-1 slot_taken via bookAppointment (GiST EXCLUDE, no chequeo en memoria)
- [Phase 07-05]: negocioScoped.test.ts extendido a los 12 accessors de lectura + chequeo a nivel tool consultarNegocioTool -- SEC-03 Success Criterion #3 probado en vivo contra bdgufnitakelyialjoqg, 26/26 aserciones OK, cero fugas cross-negocio

### Blockers/Concerns

- La verificación de Meta Business/Tech Provider puede tardar 2-7+ días hábiles — no debe bloquear el desarrollo de fases no relacionadas con WhatsApp (Fases 1-4 pueden avanzar en paralelo a ese trámite).
- Confirmar límites de rate del tier gratuito de Gemini 2.5 Flash-Lite en Google AI Studio antes de planificar capacidad para Phase 6.
- ✅ RESUELTO: Plan 02-01 (migración 0003) fue aplicada en vivo contra bdgufnitakelyialjoqg (ver 02-01-SUMMARY.md) — este blocker quedó obsoleto.
- **Plan 02-08 pausado en Task 3** (checkpoint:human-action, gate=blocking-human): Tasks 1-2 (Server Actions superadmin + panel /admin completo) commiteadas (`4c60ac9`, `7f6fcb6`, `fbe2b5e`). Falta ejecutar `scripts/bootstrap-superadmin.ts` + `scripts/verify-admin-tenant-lifecycle.ts` contra bdgufnitakelyialjoqg — requiere `.env` (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) + credenciales reales de email/password para el primer superadmin (nunca committear). Ver `02-08-SUMMARY.md` para el detalle exacto de cómo retomar.
- ✅ RESUELTO (2026-07-05): los 2 checkpoints live de la Fase 03 se ejecutaron con .env real contra bdgufnitakelyialjoqg y PASARON — `apps/bot/src/db/negocioScoped.test.ts` (aislamiento cross-negocio) y `scripts/verify-availability-engine.ts` (bookAppointment round-trip + snapshot congelado AVAIL-03 + 23P01→slot_taken). Fix aplicado: `booking.ts` `z.uuid()` estricto → `uuidLike` (forma 8-4-4-4-12). Fase 03 100% verificada.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260704-jb5 | Terminar de actualizar 02-UI-SPEC.md y 02-RESEARCH.md de la Fase 2 (dashboard-y-datos-del-negocio) reflejando el cambio de modelo Tenant->Negocio(s), y commitear | 2026-07-04 | 591ad17 | [260704-jb5-terminar-de-actualizar-02-ui-spec-md-y-0](./quick/260704-jb5-terminar-de-actualizar-02-ui-spec-md-y-0/) |

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| *(none)* | | | |

## Session Continuity

Last session: 2026-07-09T21:24:46Z
Stopped at: Completado plan 07-05 (SEC-03 negocioScoped isolation)
Resume file: .planning/phases/07-hardening-y-listo-para-produccion/07-05-SUMMARY.md

**HANDOFF NOTE (2026-07-05):** Phase 4 has 7 plans planned across 5 waves (see 04-*-PLAN.md). Wave 1 = 04-01 + 04-02 in parallel worktrees.

- 04-02 (dashboard foundation: popover, sidebar nav, zod schemas) — DONE, merged to main.
- 04-01 (availability-engine: skipBookingWindow + rescheduleAppointment) — was STILL RUNNING when this session ended (out of tokens). Its worktree branch `worktree-agent-a53d00a653b8bb78d` at `.claude/worktrees/agent-a53d00a653b8bb78d` has 5 commits (both tasks appear code-complete: skipBookingWindow + rescheduleAppointment + gated verify script) but had NOT yet committed 04-01-SUMMARY.md as of handoff.

**Next teammate — before running `/gsd-execute-phase 4`:**

1. `git worktree list` — check if `agent-a53d00a653b8bb78d` still exists.
2. `git -C .claude/worktrees/agent-a53d00a653b8bb78d log --oneline -3` — if a `docs(04-01): add plan summary` commit is now present, the agent finished on its own: merge it manually first — `git merge --no-ff worktree-agent-a53d00a653b8bb78d -m "chore: merge executor worktree (worktree-agent-a53d00a653b8bb78d)"`, then remove the worktree (`git worktree remove .claude/worktrees/agent-a53d00a653b8bb78d --force`) and delete the branch (`git branch -D worktree-agent-a53d00a653b8bb78d`).
3. If no SUMMARY commit and the worktree seems stalled (no new commits in a while), it's safe to remove the worktree/branch and let `/gsd-execute-phase 4` redispatch 04-01 fresh.
4. Once 04-01 is merged (or redispatched and complete), run `/gsd-execute-phase 4` — it will detect 04-02 (and 04-01, once merged) as done via their SUMMARY.md files and continue with Wave 2 (plan 04-03) onward.

Last activity: 2026-07-04 - Completed quick task 260704-jb5: Terminar de actualizar 02-UI-SPEC.md y 02-RESEARCH.md de la Fase 2 (dashboard-y-datos-del-negocio) reflejando el cambio de modelo Tenant->Negocio(s), y commitear
