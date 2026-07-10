# Handoff — TurnosBot, acciones manuales pendientes (2026-07-10)

> Rama: `main`, todo pusheado. Este archivo es **el punto de entrada** para retomar.
>
> **Regla de honestidad:** si algo dice **SIN VERIFICAR**, es porque **no se ejecutó**. Nada se da
> por hecho. Cuando algo pasó en una sesión anterior y no se re-corrió, se dice explícitamente.

---

## TL;DR

- **Las 7 fases están ejecutadas. 6 de 7 tienen `VERIFICATION.md` en `passed`.**
- La única fase en `human_needed` es la **04**, y por un solo motivo: **4 tests visuales del
  dashboard** que requieren ojos humanos (ver BUGS/TESTS §1.1).
- **Los 5 checkpoints de seguridad + los 3 criterios de la fase 07 + los 5 criterios de la fase 06
  se probaron EN VIVO** contra Gemini real y Supabase real. Todos pasaron.
- Tests: **223/223 (bot) + 61/61 (motor)**, `tsc` limpio.
- `REQUIREMENTS.md`: **48/51**. Los 3 que faltan son `SADMIN-*`, sin tildar a propósito.
- **Falta para cerrar v1.0:** 4 tests visuales, el bootstrap del superadmin, el cleanup del Vault,
  y la decisión sobre la cuota de Gemini.

| Fase | VERIFICATION |
|------|--------------|
| 01 Fundación multitenant | ✅ passed |
| 02 Dashboard y datos | ✅ passed |
| 03 Motor de disponibilidad | ✅ passed |
| 04 Grilla y turnos | ⚠️ **human_needed** (4 tests visuales) |
| 05 Integración WhatsApp | ✅ passed |
| 06 Agente conversacional | ✅ passed (5/5 en vivo) |
| 07 Hardening | ✅ passed (3/3 en vivo) |

---

## ✅ Lo que SÍ se verificó EN VIVO esta sesión, y pasó

Todo esto se ejecutó de verdad, contra `bdgufnitakelyialjoqg` (ref confirmado antes de correr).

### Suites y typecheck

| Qué | Comando | Resultado |
|-----|---------|-----------|
| Suite del bot | `corepack pnpm --filter @turnosbot/bot test -- --run` | **223/223 tests, 24/24 archivos** |
| Suite del motor | `corepack pnpm --filter @turnosbot/availability-engine test -- --run` | **61/61 tests, 7/7 archivos** |
| Typecheck | `npx tsc --noEmit` (en `apps/bot`) | **0 errores** |

### Scripts gated contra la DB real — los 8, todos exit 0

| Script | Qué probó |
|--------|-----------|
| `verify-vault-no-plaintext.ts` | SEC-01: el token de WhatsApp no se guarda en claro; se resuelve vía Vault |
| `verify-vault-wrappers-anon-denied.ts` | SEC-01b: la clave pública `anon` es **rechazada** en ambos wrappers |
| `verify-concurrent-booking.ts` | SEC-02: 10 reservas concurrentes al mismo slot → **1 éxito, 9 `slot_taken`** |
| `apps/bot/src/db/negocioScoped.verify.ts` | SEC-03: 12 accessors + tool `consultarNegocio`, 0 fugas, A→B y B→A |
| `verify-isolation.ts` | RLS por owner: `INSERT` cross-tenant rechazado por policy |
| `verify-0005-applied.ts` | La migración `0005` está aplicada (`whatsapp_token` dropeada) |
| `verify-reschedule.ts` | La GiST EXCLUDE **también se dispara en `UPDATE`**, no solo en `INSERT` (nunca se había corrido) |
| `verify-auth-login.ts` | AUTH-01/02: login de owner + persistencia de sesión tras refresh |

### El bot, contra Gemini REAL (`scripts/verify-bot-conversation-live.ts`, PASSED exit 0)

Script nuevo. Maneja `responder()` sin mocks, con las tools y la base reales. Cubre los **5**
Success Criteria de la fase 06:

- **Memoria multi-turno.** *"quiero un turno para un corte"* → *"mañana a la tarde"* → *"el corte
  clásico nomás"* → el bot: *"Para mañana viernes 10, tengo estos horarios para el corte clásico
  (que sale $6.000)…"*. Recordó **día y servicio a la vez**. `context.messages` guarda los 3
  mensajes del cliente literales (antes del fix guardaba **cero**).
- **Consulta de precio.** Narró **$6000, el precio real de la DB**, sin caer en el fallback.
- **Cancelar (SC#4).** No cancela de una: pide confirmación explícita. Tras *"sí, confirmo"*, la
  fila queda `estado='cancelado'`.
- **Reagendar (SC#4).** La fila del **mismo** turno se movió de `2026-07-12T02:00Z` a
  `2026-07-10T19:00Z` (16:00 local, lo pedido). Es `UPDATE`, no `INSERT`.
- **Prompt injection + tampering (SC#5).** Un atacante pegó el `turnoId` **de otra persona**,
  pidió cancelarlo, que le mostraran el teléfono del dueño del turno y el system prompt — y
  después **confirmó**. El bot respondió con el error genérico (que no distingue "no existe" de
  "no es tuyo") y **el turno de la víctima siguió `confirmado`**.

  **Lo importante:** el modelo *sí* fue inducido a intentar la cancelación. Quien la frenó fue el
  chequeo de propiedad dentro de `cancelarTurno` (`turno.cliente_id === clienteId`), del lado del
  código. **La seguridad no depende de que el LLM se porte bien.** Un eval con modelo mockeado no
  puede demostrar eso.

### Otras cosas cerradas esta sesión

- Las **2 sesiones de debug** que quedaban abiertas: ambas con el fix ya en `main`, verificadas y
  archivadas en `.planning/debug/resolved/`. **Cero sesiones abiertas.**
- **`VERIFICATION.md` de las fases 06 y 07**, generados con evidencia en vivo. Ambos `passed`.
- **Blocker histórico cerrado:** la cuota del free tier de Gemini es **15 RPM**, no ~30 (ver §2.4).
- **W-01:** `negocioScoped.test.ts` parecía cubierto por CI y no lo estaba. Renombrado a
  `.verify.ts` (ver §1.2).

---

## ⚙️ Reglas de entorno (no re-aprender)

1. **DB única: `bdgufnitakelyialjoqg`.** NUNCA el proyecto del restaurante (`hzgunbftloevclkohcdf`).
   Todo script live guardea el ref y aborta si no coincide.
2. **`pnpm` NO está en PATH** → usar `corepack pnpm …`.
3. **Los scripts gated SÍ los puede correr Claude.** No puede *leer* el `.env` con sus
   herramientas, pero `node --env-file=.env` lo carga en el proceso hijo. **Son cosas distintas.**
   Antes de declarar algo imposible por falta de credencial, **probarlo**:
   ```bash
   node --env-file=.env --import tsx <script>.ts
   ```
4. **DDL / migraciones: SOLO por el SQL Editor de Supabase.** El `SUPABASE_ACCESS_TOKEN` del `.env`
   está malformado (no es un `sbp_…` válido) → Management API rota. El host directo
   `db.<ref>.supabase.co` no resuelve (IPv6-only). La ruta REST sirve para `SELECT`/`rpc`, no DDL.
5. **Grants en Supabase:** `REVOKE … FROM PUBLIC` **no** cubre `anon`/`authenticated`. Hay que
   revocarlos explícitamente. Pero **nunca** revocar `auth_negocio_ids`/`auth_tenant_id` — RLS los
   evalúa con el rol que consulta y revocarlos rompe el aislamiento.
6. **`packages/availability-engine/dist/` está gitignoreado** y `apps/bot` importa el compilado.
   Tras un `git pull` que toque `packages/`, `tsc` reporta errores fantasma que **no son bugs**.
   Los tests de vitest no lo detectan (no typechequean). Antes de creerle a `tsc`:
   ```bash
   corepack pnpm --filter @turnosbot/availability-engine build
   ```

---

# 1) BUGS / TESTS

## 1.1 — Los 4 tests visuales de la fase 04 ⚠️ **PARA EL EQUIPO HUMANO**

- **QUÉ:** `04-VERIFICATION.md` está en `human_needed`. Su código está verificado (6/6 must-haves,
  motor 54/54, dashboard 58/58, typecheck y build limpios), pero `04-VALIDATION.md` designa cuatro
  comprobaciones **visuales obligatorias**:
  - **MQ-1** — la grilla dibuja profesionales × horas, con 4 estados de color (libre, confirmado,
    pendiente, bloqueo), click-para-crear, repintado inmediato, navegación por día, estados vacíos.
  - **MQ-2** — el panel de detalle del turno (cliente, servicios, precio, horario), cancelar sin
    motivo, reagendar.
  - **MQ-3** — alta manual de turno: búsqueda/creación de cliente inline, selector de slots reales
    con bypass de la ventana de reserva, toast de éxito.
  - **MQ-4** — bloqueo: crear (con profesional+hora precargados) y borrar (muestra el motivo, pide
    confirmación, libera el slot al instante).
- **POR QUÉ NO LO HICE:** son comportamientos **visuales e interactivos**. `apps/dashboard` no
  tiene framework de render de componentes (convención del proyecto desde la fase 2), así que ni
  el typecheck ni el build pueden observarlos. Hacen falta ojos humanos sobre un navegador.
- **PASOS EXACTOS:**
  1. Levantar el dashboard: `corepack pnpm --filter dashboard dev` (necesita
     `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`; están en el `.env` de la raíz).
  2. Loguearse con el dueño del seed — credenciales en `scripts/seed-fixtures.ts`:
     `owner-norte@turnosbot-seed.test` / `TurnosBotSeed!Norte1`. (Verificado en vivo: ese login
     funciona, `verify-auth-login.ts` PASSED.)
  3. Ir a `/turnos` y correr los guiones **completos** de `04-VALIDATION.md` (MQ-1 … MQ-4).
  4. Registrar el resultado en `04-VERIFICATION.md` y, si los 4 pasan, poner `status: passed`.

  Nota: el quinto ítem humano de esa fase (`verify-reschedule.ts`) **ya lo corrí y pasó** — está
  marcado `DONE_2026-07-10` en el archivo.

## 1.2 — Trampa resuelta: la prueba de aislamiento no corría en CI — ✅ ARREGLADO

- **QUÉ ERA:** la única prueba de SEC-03 se llamaba `negocioScoped.test.ts` pero era un script
  standalone, **explícitamente excluido** en `apps/bot/vitest.config.ts`. No corría en `pnpm test`
  ni figuraba como "skipped". Una suite verde **no decía nada** sobre el aislamiento entre negocios.
- **ARREGLADO:** renombrado a `negocioScoped.verify.ts`. El sufijo `.verify.ts` no matchea el
  include de vitest, así que la exclusión se eliminó. Tras el cambio: 223/223, `tsc` limpio, y el
  script sigue pasando en vivo.
- **Sigue siendo manual por diseño** (toca la DB real). Correrlo cuando se toque RLS, grants o
  migraciones:
  ```bash
  node --env-file=.env --import tsx apps/bot/src/db/negocioScoped.verify.ts
  ```

## 1.3 — Los evals offline mockean el modelo (informativo, no es un bug)

- `apps/bot/evals/` usa `vi.fn()` para `generateText`. Prueban **nuestra lógica** (el gate D-12, el
  scope, el no-double-book, el confirmar-antes-de-cancelar), **no el comportamiento del modelo**.
- **No confundir cobertura de evals con cobertura en vivo.** Esa la da
  `scripts/verify-bot-conversation-live.ts`.

## 1.4 — Nyquist / validación (pendiente, no bloqueante)

- Fase 01 sin `VALIDATION.md`. Fase 05 con `nyquist_compliant: false` (parcial).
- **POR QUÉ NO LO HICE:** fuera del alcance de la sesión; no bloquea el cierre del milestone.
- **PASOS:** `/gsd-validate-phase 1` y `/gsd-validate-phase 5`.

## 1.5 — UAT parcial de la fase 02

- `02-HUMAN-UAT.md` tiene 1 escenario abierto.
- **POR QUÉ NO LO HICE:** requiere usar el dashboard con un usuario real (mismo bloqueo que §1.1).
- **PASOS:** abrir el archivo, ejecutar el escenario en el navegador, registrar el resultado.

## 1.6 — Invariante del modelo de datos (descubierto, vale documentarlo)

Un `turno` **sin filas en `turno_servicio` se puede cancelar pero NO reagendar**: `reagendarTurno`
saca los `serviceIds` de ahí para recalcular la duración. Se descubrió porque un seed incompleto
hacía parecer que `reagendarTurno` estaba roto. No es un bug, pero conviene que el equipo lo sepa.

---

# 2) SEGURIDAD

> **Los 5 checkpoints de seguridad se corrieron EN VIVO el 2026-07-10 y los 5 PASARON.**
> Detalle en la tabla de arriba. Lo que sigue es lo que **queda pendiente**, y por qué.

## 2.1 — Cleanup de secretos huérfanos en Vault ⚠️ **PARA VOS** (no bloqueante)

- **QUÉ:** quedan secretos de test en `vault.secrets`. Y **crece con cada corrida**:
  `verify-vault-no-plaintext.ts` crea un secreto `whatsapp-token-verify-<timestamp>` y solo vuelve
  el `secret_id` a `NULL` — la fila del secreto queda.
- **POR QUÉ NO LO PUEDO HACER:** el esquema `vault` **no está expuesto por REST**. No hay forma de
  borrarlo desde código. Solo por el SQL Editor.
- **PASOS EXACTOS:** SQL Editor de Supabase (proyecto `bdgufnitakelyialjoqg`):
  ```sql
  delete from vault.secrets where name='uat-probe-nonexistent' or name='anon-probe'
     or name like 'secaudit-%' or name like 'whatsapp-token-verify-%';
  ```
  Es seguro: los 3 negocios tienen `whatsapp_token_secret_id = NULL` (verificado en vivo hoy), así
  que ningún negocio apunta a estos secretos.

## 2.2 — Bootstrap del primer superadmin ⚠️ **PARA VOS** (bloquea el primer cliente)

- **QUÉ:** el panel `/admin` está construido y commiteado, pero **nunca se creó el primer
  superadmin** ni se ejerció el alta de tenants contra la base real. Por eso `SADMIN-01/02/03`
  siguen **sin tildar** en `REQUIREMENTS.md` (48/51), con la razón escrita al lado.
- **POR QUÉ NO LO PUEDO HACER:** no es la credencial de la base — es que `SUPERADMIN_EMAIL` y
  `SUPERADMIN_PASSWORD` **no están en el `.env`** (verificado: ambas `unset`), y esas credenciales
  las tenés que elegir vos. Nunca se commitean.
- **PASOS EXACTOS:**
  1. Agregar al `.env`: `SUPERADMIN_EMAIL=…` y `SUPERADMIN_PASSWORD=…` (contraseña fuerte).
  2. ```bash
     node --env-file=.env --import tsx scripts/bootstrap-superadmin.ts
     node --env-file=.env --import tsx scripts/verify-admin-tenant-lifecycle.ts
     ```
  3. Cuando el segundo pase: tildar `SADMIN-01/02/03` en `REQUIREMENTS.md` y borrar la nota de
     advertencia que quedó arriba de ellos.
  - Detalle de cómo retomar: `.planning/phases/02-*/02-08-SUMMARY.md`.

## 2.3 — DDL / migraciones futuras ⚠️ **SIEMPRE MANUAL**

- **QUÉ:** cualquier migración nueva.
- **POR QUÉ NO LO PUEDO HACER:** `SUPABASE_ACCESS_TOKEN` malformado → Management API rota. El host
  Postgres directo no resuelve (IPv6-only). REST sirve para leer, no para DDL.
- **PASOS:** pegar el `.sql` en el SQL Editor de Supabase.
- **Estado actual:** `0005`, `0006` y `0007` **están aplicadas** (verificado en vivo: `0005` por
  `verify-0005-applied.ts`; `0006`/`0007` funcionalmente por el rechazo de `anon` y por RLS intacta).

## 2.4 — Cuota de Gemini: 15 RPM ⚠️ **DECISIÓN DE NEGOCIO** antes de producción

- **QUÉ:** el free tier permite **15 requests por minuto**, no ~30 como estimaba `research/STACK.md`
  (que marcaba el dato como confianza BAJA-MEDIA, a verificar). **Medido contra la API real:**
  `RESOURCE_EXHAUSTED`, `quotaValue: "15"`, modelo `gemini-3.1-flash-lite`.
- **POR QUÉ IMPORTA:** el tool-loop consume **1-3 requests por cada mensaje del cliente**. 15 RPM se
  agota con **~5-8 mensajes por minuto sumando TODOS los tenants**. Una sola peluquería con dos
  clientes conversando a la vez ya lo roza.
- **Lo bueno:** cuando la cuota se agota el bot **no se rompe**. Se verificó en vivo: la tool ya
  había ejecutado (la fila se movió), y al quedarse sin cuota el paso siguiente, `responder()` cayó
  al camino de error y mandó `SAFE_FALLBACK_MESSAGE` en vez de romperse o mandar vacío. Pero el
  cliente no avanza su turno.
- **PASOS:** decidir el pase a tier pago (mismo modelo, mismo código, solo cambia la API key) antes
  del primer tenant con volumen. **Ojo además con los ToS:** Google puede usar los datos del free
  tier para entrenar, y este proyecto procesa nombres y teléfonos de clientes reales.

## 2.5 — Discrepancia de documentación (informativo)

El modelo en código es **`gemini-3.1-flash-lite`** (`responder.ts:139`), mientras que `CLAUDE.md` y
`research/STACK.md` dicen "Gemini 2.5 Flash-lite". Funciona y pasó en vivo; la doc está vieja.

---

## Orden sugerido para la próxima sesión

1. **Rebuildear el motor** (`corepack pnpm --filter @turnosbot/availability-engine build`) — evita
   perder media hora persiguiendo errores de `tsc` que no existen.
2. **Cleanup del Vault** (§2.1) en el SQL Editor.
3. **Bootstrap del superadmin** (§2.2) — destraba el alta de la primera peluquería y los 3
   `SADMIN-*`.
4. **Los 4 tests visuales de la fase 04** (§1.1) — es lo único que separa a esa fase de `passed`.
5. **Decidir la cuota de Gemini** (§2.4).
6. Opcional: Nyquist (§1.4) y el UAT de la fase 02 (§1.5).
7. `/gsd-audit-milestone 1.0` → si da `passed` o deuda aceptable → `/gsd-complete-milestone 1.0`.

## Referencias

- **Estado general:** `.planning/STATE.md`.
- **Fase 07:** `.planning/phases/07-*/07-PHASE-STATUS.md` y `07-VERIFICATION.md`.
- **Fase 06:** `06-VERIFICATION.md` (passed, 5/5 en vivo).
- **El script del bot en vivo:** `scripts/verify-bot-conversation-live.ts` y su
  `.planning/quick/260709-w2y-verify-bot-conversation-live/260709-w2y-SUMMARY.md`.
- **Lecciones de debug:** `.planning/debug/knowledge-base.md` (incluye la trampa del `dist/` viejo).
- **Migraciones de seguridad:** `supabase/migrations/0005_*.sql`, `0006_*.sql`, `0007_*.sql`.
