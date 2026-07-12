---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: "Completado plan 07-03 (SEC-01 SC#1 verificado en vivo, script gated PASSED exit 0) -- Phase 07 100% completa (5/5 plans)"
last_updated: "2026-07-10T00:13:37.467Z"
last_activity: 2026-07-10 — Completado plan 07-03 (SEC-01 SC#1 verificado en vivo) -- Phase 07 100% completa (5/5 plans)
progress:
  total_phases: 7
  completed_phases: 7
  total_plans: 43
  completed_plans: 43
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-03)

**Core value:** Un cliente puede agendar un turno real, en un horario realmente disponible, conversando por WhatsApp en lenguaje natural — sin intervención humana de la peluquería.
**Current focus:** Phase 07 — hardening-y-listo-para-produccion

## Current Position

Phase: 07 (hardening-y-listo-para-produccion) — COMPLETE (5/5 plans)
Status: Phase 07 completa
Last activity: 2026-07-10 — Completado plan 07-03 (SEC-01 SC#1 verificado en vivo) -- Phase 07 100% completa (5/5 plans)

Progress: [██████████] 100%

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
| Phase 07 P02 | 18min | 3 tasks | 9 files |
| Phase 07 P03 | 12min | 2 tasks | 1 files |

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
- [Phase 07-05]: negocioScoped.verify.ts extendido a los 12 accessors de lectura + chequeo a nivel tool consultarNegocioTool -- SEC-03 Success Criterion #3 probado en vivo contra bdgufnitakelyialjoqg, 26/26 aserciones OK, cero fugas cross-negocio
- [Phase 07-02]: negocioId se valida con regex de forma (8-4-4-4-12), no z.uuid() estricto -- mismo fix que uuidLike en booking.ts (z.uuid() rechaza UUIDs reales sin variante 8/9/a/b)
- [Phase 07-02]: Ambos call-sites del token de WhatsApp (getWhatsappToken.ts lectura, admin-tenants.ts setWhatsappTokenSecret escritura) pasan exclusivamente por RPC Vault -- cierra el wiring de SEC-01, verificacion live queda para 07-03
- [Phase ?]: [Phase 07-03]: SEC-01 Success Criterion #1 probado en vivo contra bdgufnitakelyialjoqg -- verify-vault-no-plaintext.ts confirma que negocio no expone token en claro y que getWhatsappToken resuelve el valor real via Vault (RPC get_whatsapp_token), con WHATSAPP_DEV_TOKEN unset; invocacion en este entorno: node --env-file=.env --import tsx (no pnpm exec tsx)

### Blockers/Concerns

> **ESTADO AL 2026-07-10 (fin de sesión).** Las 7 fases están ejecutadas y **6 de 7 tienen
> `VERIFICATION.md` en `passed`**. La única en `human_needed` es la 04, por 4 tests visuales.
> El milestone v1.0 NO está cerrado. **Cero sesiones de debug abiertas.**
> Detalle completo de acciones manuales pendientes, con pasos exactos:
> **`.planning/HANDOFF-milestone-v1.md`** ← archivo de referencia para retomar.

**✅ VERIFICADO EN VIVO (2026-07-10) contra `bdgufnitakelyialjoqg` — los 8 scripts exit 0:**

| Script | Qué probó |
|---|---|
| `verify-vault-no-plaintext.ts` | SEC-01: token no en claro, se resuelve vía Vault |
| `verify-vault-wrappers-anon-denied.ts` | SEC-01b: la clave pública `anon` es **rechazada** |
| `verify-concurrent-booking.ts` | SEC-02: 10 concurrentes → 1 éxito, 9 `slot_taken` |
| `negocioScoped.verify.ts` | SEC-03: 12 accessors + tool, 0 fugas, A→B y B→A |
| `verify-isolation.ts` | RLS por owner: INSERT cross-tenant rechazado |
| `verify-0005-applied.ts` | Migración `0005` aplicada |
| `verify-reschedule.ts` | GiST EXCLUDE también dispara en `UPDATE` (nunca se había corrido) |
| `verify-auth-login.ts` | AUTH-01/02: login owner + persistencia de sesión |

**✅ EL BOT, CONTRA GEMINI REAL** — `scripts/verify-bot-conversation-live.ts`, PASSED exit 0.
Cubre los **5** Success Criteria de la fase 06: memoria multi-turno, consulta de precio, cancelar,
reagendar, y prompt injection + cross-client tampering. En el escenario de injection el modelo
**sí** fue inducido a intentar cancelar el turno de otro cliente; lo frenó el ownership check de
`cancelarTurno` del lado del código. **La seguridad no depende de que el LLM se porte bien.**

**Suites:** 223/223 (bot), 61/61 (motor), `tsc --noEmit` 0 errores.

**CORRECCIÓN de una creencia falsa que costó un handoff mal escrito:** Claude **sí puede**
correr los scripts gated. No puede *leer* el `.env` con sus herramientas, pero
`node --env-file=.env --import tsx <script>.ts` lo carga en el proceso hijo. Antes de
declarar algo imposible por falta de credencial, **probarlo**.

**Lo que Claude realmente NO puede hacer:**

- **DDL / migraciones → SQL Editor de Supabase.** El `SUPABASE_ACCESS_TOKEN` del `.env` está
  malformado (no es un `sbp_...` válido) → Management API rota. El host directo
  `db.<ref>.supabase.co` no resuelve (IPv6-only). La ruta REST sirve para SELECT/rpc, no DDL.
- **Borrar de `vault.secrets`** → el esquema `vault` no está expuesto por REST.
- **Elegir credenciales del primer superadmin** → decisión del usuario, nunca se commitean.
- **Los 4 tests visuales de la fase 04** → comportamientos visuales/interactivos; `apps/dashboard`
  no tiene framework de render de componentes. Requieren ojos humanos sobre un navegador.

**Pendientes reales (los 4, con pasos exactos en el HANDOFF):**

- ⚠️ **4 tests visuales de la fase 04** (MQ-1..MQ-4, ver `04-VALIDATION.md`) — es lo único que
  separa a esa fase de `passed`. Login del seed: `owner-norte@turnosbot-seed.test` /
  `TurnosBotSeed!Norte1` (verificado en vivo hoy). **Para el equipo humano.**
- ⚠️ **Cleanup de secretos huérfanos en Vault** (SQL Editor). Crece con cada corrida de
  `verify-vault-no-plaintext.ts`, que crea `whatsapp-token-verify-<ts>` y no lo borra.
- ✅ **RESUELTO (2026-07-10): bootstrap del primer superadmin ejecutado en vivo.**
  `scripts/bootstrap-superadmin.ts` creó el `perfil` superadmin (`auth.users.id=f66ffbaf-6141-4441-87bd-543faea1c2f9`,
  `phono4884@gmail.com`, `tenant_id=NULL`) y `scripts/verify-admin-tenant-lifecycle.ts` pasó
  **exit 0** contra `bdgufnitakelyialjoqg`. `SADMIN-01/02/03` tildados en `REQUIREMENTS.md`
  (quick 260710-jgn). Único pendiente: confirmación *visual* del gate `/admin` por la UI
  (superadmin lo ve, owner no) — cae en los tests visuales de la fase 04.
- ⚠️ **Cuota de Gemini: 15 RPM** — decisión de negocio antes del primer tenant con volumen.

**Invariante del modelo de datos (descubierto hoy):** un `turno` **sin filas en `turno_servicio`
se puede cancelar pero NO reagendar** — `reagendarTurno` saca de ahí los `serviceIds` para
recalcular la duración.

**Trampa de entorno (descubierta y resuelta ESTA sesión — no re-aprender):**

- `packages/availability-engine/dist/` está gitignoreado, y `apps/bot` importa el compilado,
  no el fuente (decisión de fase 04-07). Tras un `git pull` que toque `packages/`, el `dist/`
  local queda viejo y `tsc --noEmit` reporta errores fantasma (ej. `startIso` no existe en
  `AvailableSlot`) que NO son bugs de código. Los tests de vitest NO lo detectan porque no
  typechequean. **Siempre** correr, después de un pull:
  `corepack pnpm --filter @turnosbot/availability-engine build`
- `pnpm` no está en PATH → usar `corepack pnpm ...`. Scripts gated:
  `node --env-file=.env --import tsx <script>.ts` (tsx no autocarga `.env`).

**Deuda de tracking:**

- ✅ `REQUIREMENTS.md`: **51/51** tildados (2026-07-10). Los últimos 3 (`SADMIN-01/02/03`) se
  cerraron tras ejercer el flujo superadmin en vivo (bootstrap + lifecycle verify PASSED contra
  `bdgufnitakelyialjoqg`, quick 260710-jgn). Único resto: confirmación visual del gate `/admin`.
- ✅ **Fases 06 y 07: `VERIFICATION.md` generados, ambos `passed`** (2026-07-10). La 07 con 3/3
  criterios probados en vivo; la 06 con 5/5, `behavior_unverified: 0`.
- ⚠️ **Fase 04: `human_needed`** — solo por los 4 tests visuales (MQ-1..MQ-4). Su quinto ítem
  humano (`verify-reschedule.ts`) **ya se corrió y pasó**, marcado `DONE_2026-07-10` en el archivo.
- Estado por fase: 01 ✅ · 02 ✅ · 03 ✅ · 04 ⚠️ human_needed · 05 ✅ · 06 ✅ · 07 ✅
- ⚠️ **No crear `07-SUMMARY.md`.** GSD cuenta `*-SUMMARY.md` como resumen-de-plan e infla el
  progreso a 44/43. El resumen de fase vive en `07-PHASE-STATUS.md`.
- Nota: `gsd query progress` reporta "1 sesión de debug activa", pero es un falso positivo —
  el glob `.planning/debug/*.md` levanta `knowledge-base.md`. **Hay 0 sesiones abiertas.**
- Nyquist: fase 01 sin `VALIDATION.md`; fase 05 con `nyquist_compliant: false`.
- UAT parcial fase 02 (`02-HUMAN-UAT.md`, 1 escenario abierto).

**Concerns de negocio (preexistentes, siguen vigentes):**

- La verificación de Meta Business/Tech Provider puede tardar 2-7+ días hábiles — no debe bloquear el desarrollo de fases no relacionadas con WhatsApp (Fases 1-4 pueden avanzar en paralelo a ese trámite).
- ✅ RESUELTO (2026-07-10): **el free tier de Gemini permite 15 requests/minuto**, no ~30 como
  estimaba `research/STACK.md` (que marcaba el dato como confianza BAJA-MEDIA). Medido contra la
  API real: `RESOURCE_EXHAUSTED`, `quotaId: GenerateRequestsPerMinutePerProjectPerModel-FreeTier`,
  `quotaValue: "15"`, modelo `gemini-3.1-flash-lite`. Una conversación de agendamiento consume
  ~1-3 requests por mensaje del cliente (el tool-loop hace varios pasos), así que **15 RPM se
  agota con ~5-8 mensajes por minuto entre TODOS los tenants**. Planificar el pase a tier pago
  antes del primer cliente real con volumen.
- ⚠️ El modelo por defecto en código es **`gemini-3.1-flash-lite`** (`responder.ts:139`), no el
  `2.5` que dicen `CLAUDE.md` y `research/STACK.md`. Funciona; la doc está desactualizada.
- ✅ RESUELTO: Plan 02-01 (migración 0003) fue aplicada en vivo contra bdgufnitakelyialjoqg (ver 02-01-SUMMARY.md) — este blocker quedó obsoleto.
- ✅ **RESUELTO (2026-07-10): Plan 02-08 Task 3 completado.** Tasks 1-2 (Server Actions superadmin + panel /admin) ya estaban commiteadas (`4c60ac9`, `7f6fcb6`, `fbe2b5e`). El 2026-07-10 se ejecutaron `scripts/bootstrap-superadmin.ts` + `scripts/verify-admin-tenant-lifecycle.ts` contra bdgufnitakelyialjoqg con credenciales reales (nunca committeadas): bootstrap OK (`auth.users.id=f66ffbaf-6141-4441-87bd-543faea1c2f9`) y lifecycle verify PASSED exit 0. `SADMIN-01/02/03` tildados (quick 260710-jgn). Resto: confirmación visual del gate /admin por la UI (dentro de los tests visuales de fase 04).
- ✅ RESUELTO (2026-07-05): los 2 checkpoints live de la Fase 03 se ejecutaron con .env real contra bdgufnitakelyialjoqg y PASARON — `apps/bot/src/db/negocioScoped.verify.ts` (aislamiento cross-negocio) y `scripts/verify-availability-engine.ts` (bookAppointment round-trip + snapshot congelado AVAIL-03 + 23P01→slot_taken). Fix aplicado: `booking.ts` `z.uuid()` estricto → `uuidLike` (forma 8-4-4-4-12). Fase 03 100% verificada.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260704-jb5 | Terminar de actualizar 02-UI-SPEC.md y 02-RESEARCH.md de la Fase 2 (dashboard-y-datos-del-negocio) reflejando el cambio de modelo Tenant->Negocio(s), y commitear | 2026-07-04 | 591ad17 | [260704-jb5-terminar-de-actualizar-02-ui-spec-md-y-0](./quick/260704-jb5-terminar-de-actualizar-02-ui-spec-md-y-0/) |
| 260709-w2y | verify-bot-conversation-live.ts — script gated que maneja responder() contra Gemini real + Supabase real; probó en vivo los 2 fixes de la fase 06 (memoria multi-turno + texto vacío tras tool-result). PASSED, exit 0 | 2026-07-10 | — | [260709-w2y-verify-bot-conversation-live](./quick/260709-w2y-verify-bot-conversation-live/) |
| 260710-jgn | Cerrar SADMIN-01/02/03 tras ejecutar en vivo el bootstrap del superadmin + lifecycle verify (PASSED exit 0) contra bdgufnitakelyialjoqg. REQUIREMENTS 51/51. Solo docs. | 2026-07-10 | — | [260710-jgn-cerrar-sadmin-superadmin-live](./quick/260710-jgn-cerrar-sadmin-superadmin-live/) |
| 260711-gos | Fix landing en blanco tras login del owner: app/page.tsx (stub `<main/>`) → `redirect("/turnos")`. Verificado en vivo en :5202, cero errores de consola. | 2026-07-11 | — | [260711-gos-fix-landing-owner-turnos](./quick/260711-gos-fix-landing-owner-turnos/) |
| 260712-g2y | Servicios dashboard: (1) inputs precio/duración del diálogo dejan de renderizar `value={NaN}` (warning React) y guardan `undefined` al vaciarse; (2) `ServiciosTable` re-sincroniza su estado local con las props revalidadas (patrón "ajustar estado en render"), así editar un precio se refleja al instante en vez de quedar pegado hasta un remonte. Typecheck: 0 errores nuevos. | 2026-07-12 | 7952cb7 / b51c5e3 | [260712-g2y-corregir-nan-en-inputs-de-precio-duracio](./quick/260712-g2y-corregir-nan-en-inputs-de-precio-duracio/) |
| 260712-gnl | Auditoría UX proactiva del dashboard (no solo build/typecheck) — 3 bugs confirmados EN VIVO y corregidos: (1) `TurnoDetailSheet` quedaba con el horario viejo tras un reagendado exitoso hasta cerrarlo a mano (ahora se cierra solo, mismo patrón que "Cancelar turno"); (2) `DiaPicker` (`type=date`) se desincronizaba al navegar Día anterior/siguiente — `defaultValue` no reacciona a props, fix con `key={fecha}` para forzar remount; (3) `UserMenu` tenía `<AvatarFallback>OW</AvatarFallback>` hardcodeado, nunca conectado a la sesión real — ahora deriva iniciales del email real (`requireRole()` expone `email`) y lo muestra en el dropdown. Los 3 verificados en vivo en :5202 tras limpiar una caché `.next` corrupta (ver Trampas de entorno). Typecheck + 62 tests: 0 errores. | 2026-07-12 | 07cb6b3 / a8a0955 / fdd46f9 | [260712-gnl-fix-3-bugs-ux-confirmados-en-dashboard-t](./quick/260712-gnl-fix-3-bugs-ux-confirmados-en-dashboard-t/) |

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| *(none)* | | | |

## Session Continuity

Last session: 2026-07-10 (cont.)
Stopped at: Bootstrap del superadmin ejecutado en vivo (lifecycle PASSED, `SADMIN-01/02/03` → 51/51, quick 260710-jgn). Milestone v1.0 NO cerrado — quedan **3** acciones humanas: (1) tests visuales de la fase 04 (MQ-1..4 + confirmación visual del gate `/admin`), (2) cleanup del Vault vía SQL Editor, (3) decisión de cuota de Gemini (dejada pendiente a pedido del usuario).
Resume file: **`.planning/HANDOFF-milestone-v1.md`** ← empezar acá

### Qué pasó en la sesión del 2026-07-09/10

1. **`git pull`** trajo la Fase 07 completa desde `origin/main` (el ROADMAP local decía 2/5;
   en realidad estaba 5/5, con UAT 4/4 y `07-SECURITY.md` en `threats_open: 0`).
2. **`responder-history-drops-user-messages`** — el "blocker crítico" del handoff anterior
   **ya estaba arreglado en `main`** (commit `d6d959e`, workstream paralelo). Verificado y
   archivado en `.planning/debug/resolved/`.
3. **`responder-empty-text-after-tool-call`** — fix presente en ambas capas
   (`systemPrompt.ts:106` instrucción positiva + `responder.ts:349` guard con reintento sin
   tools + `SAFE_FALLBACK_MESSAGE`). Verificado y archivado. **Cero sesiones de debug abiertas.**
4. **Corrección de una creencia falsa:** el handoff anterior decía que Claude no podía correr los
   scripts gated "porque no puede leer el `.env`". **Falso.** `node --env-file=.env` los corre.
   Se corrieron los 8 y pasaron todos.
5. **`scripts/verify-bot-conversation-live.ts` (nuevo, quick 260709-w2y):** maneja `responder()`
   contra Gemini real. 5 escenarios, PASSED. Cubre los 5 Success Criteria de la fase 06.
6. **`VERIFICATION.md` de las fases 06 y 07**, generados con evidencia en vivo. Ambos `passed`.
7. **W-01 arreglado:** `negocioScoped.test.ts` parecía cubierto por CI y estaba excluido de vitest.
   Renombrado a `.verify.ts`; el nombre ya no miente.
8. **Blocker histórico cerrado:** la cuota del free tier de Gemini es **15 RPM**, no ~30.
9. **`verify-reschedule.ts`** (ítem humano de la fase 04, nunca ejecutado) corrido y PASSED.

### Trampas de entorno descubiertas (no re-aprender)

- `packages/availability-engine/dist/` está gitignoreado y `apps/bot` importa el compilado. Tras un
  `git pull` que toque `packages/`, `tsc` da errores fantasma que **no son bugs**. Rebuildear.
- **No crear `07-SUMMARY.md`** ni ningún `*-SUMMARY.md` a nivel de fase: GSD los cuenta como
  resumen-de-plan e infla el progreso (44/43). El de fase vive en `07-PHASE-STATUS.md`.
- `gsd query progress` reporta "1 sesión de debug activa": es un falso positivo, el glob levanta
  `knowledge-base.md`. **Hay 0 abiertas.**
- Un `turno` sin filas en `turno_servicio` **se puede cancelar pero no reagendar**.
- **Nunca correr `pnpm build` en `apps/dashboard` mientras un `next dev --port 5202` está corriendo** —
  ambos comparten `apps/dashboard/.next/`; el build de producción pisa el cache/manifests del dev
  server y lo deja sirviendo código viejo indefinidamente (sobrevive a reiniciar el proceso). Si el
  dashboard en vivo no refleja un cambio ya committeado, primero sospechar de esto: `rm -rf
  apps/dashboard/.next` y reiniciar el dev server antes de asumir que el fix no funcionó.

### Verificado EN VIVO en esta sesión (pasó)

- `corepack pnpm --filter @turnosbot/bot test -- --run` → **223/223 tests, 24/24 archivos,
  0 skipped**. Corrido dos veces (antes y después del rebuild), verde ambas.
- `corepack pnpm --filter @turnosbot/availability-engine test -- --run` → **61/61 tests, 7/7 archivos**.
- `npx tsc --noEmit` en `apps/bot` → **0 errores** (después del rebuild del motor).
- Presencia en código de ambos fixes, confirmada por lectura directa (no por confianza en
  el reporte de un subagente).

### También verificado en vivo acá (tras descubrir que los scripts SÍ corren)

- Los **8 scripts gated** contra `bdgufnitakelyialjoqg` (ref confirmado antes de ejecutar), todos
  exit 0. Ver la tabla en Blockers/Concerns.
- Confirmado que `verify-concurrent-booking.ts` limpia sus turnos y que los 3 negocios tienen
  `whatsapp_token_secret_id = NULL`. La base quedó igual que antes de la sesión (7 turnos).

### Re-test conversacional en vivo — ✅ PASSED (2026-07-10)

`scripts/verify-bot-conversation-live.ts` maneja `responder()` contra **Gemini real + Supabase
real**, sin mocks. Exit 0. Cubre los **5** Success Criteria de la fase 06:

- **Memoria multi-turno:** recordó día Y servicio a la vez; `context.messages` guarda los 3
  mensajes `role:"user"` literales (antes del fix: cero).
- **Texto vacío:** narró el precio real ($6000, leído de la DB) sin disparar el fallback.
- **Cancelar:** pide confirmación explícita; tras confirmar, la fila queda `cancelado`.
- **Reagendar:** la fila del mismo turno se movió al horario pedido. Es `UPDATE`, no `INSERT`.
- **Prompt injection + cross-client tampering:** un atacante pegó el `turnoId` de otro cliente,
  pidió cancelarlo + el teléfono de la víctima + el system prompt, y **confirmó**. El bot devolvió
  el error genérico y el turno de la víctima siguió `confirmado`. El modelo **sí** fue inducido a
  intentarlo; lo frenó el ownership check del código. **La seguridad no depende del LLM.**

### SIN VERIFICAR (no ejecutado — **no asumir que pasa**)

- **Los 4 tests visuales de la fase 04** (MQ-1..MQ-4). Comportamientos visuales/interactivos;
  `apps/dashboard` no tiene framework de render de componentes. **Requieren ojos humanos.**
  Guiones completos en `04-VALIDATION.md`.
- ~~**El flujo de superadmin**~~ ✅ **YA EJERCIDO EN VIVO (2026-07-10).** `bootstrap-superadmin.ts`
  + `verify-admin-tenant-lifecycle.ts` corridos contra `bdgufnitakelyialjoqg`, lifecycle PASSED
  exit 0. Lo único que sigue requiriendo ojos humanos es la confirmación *visual* del gate `/admin`
  (superadmin lo ve, owner no) — parte de los tests visuales de la fase 04, abajo.
- **El cleanup de `vault.secrets`.** El esquema `vault` no se expone por REST; solo SQL Editor.
- **El escenario abierto del UAT de la fase 02** (`02-HUMAN-UAT.md`) — mismo bloqueo visual.
- **Nyquist:** fase 01 sin `VALIDATION.md`; fase 05 `nyquist_compliant: false`.

Last activity: 2026-07-12 — Auditoría UX proactiva del dashboard (quick 260712-gnl): 3 bugs confirmados en vivo y corregidos (Sheet de turno stale tras reagendar, DiaPicker desincronizado al navegar días, UserMenu con "OW" hardcodeado). Antes: fix Servicios dashboard (quick 260712-g2y), NaN en inputs + re-sync de `ServiciosTable`. Nota: el fix de `turnos/page.tsx:250` (`fmtPrecio(precio_total)` con `number | null`) quedó aplicado en el working tree pero **sin commitear** — pendiente de confirmación del usuario. Antes: Fix del landing en blanco tras login del owner (`app/page.tsx` → `redirect("/turnos")`, quick 260711-gos, verificado en vivo). Antes: bootstrap del superadmin en vivo + `SADMIN-01/02/03` → REQUIREMENTS 51/51 (quick 260710-jgn). Quedan 3 acciones humanas: tests visuales fase 04, cleanup Vault, decisión cuota Gemini. Handoff en `.planning/HANDOFF-milestone-v1.md`
