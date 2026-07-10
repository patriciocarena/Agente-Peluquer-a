# Handoff — TurnosBot, acciones manuales pendientes (actualizado 2026-07-09, fin de sesión)

> Rama: `main`. Este archivo reemplaza al handoff del 2026-07-09 (versión anterior), cuyo
> "blocker crítico" **ya estaba arreglado** — ver "Qué cambió" abajo.
>
> **Regla de honestidad de este documento:** si algo dice **SIN VERIFICAR**, es porque NO se
> ejecutó. No se dio nada por hecho. Cuando una verificación pasó en una sesión *anterior*,
> se dice explícitamente — eso no es lo mismo que "verificado hoy".

---

## TL;DR

- Las **7 fases del roadmap están ejecutadas**. Hay **cero sesiones de debug abiertas**.
- La suite de tests está **verde: 223/223 (bot) + 61/61 (motor)**, y `tsc` limpio. Verificado hoy.
- **Los 5 checkpoints de seguridad (SEC-01, SEC-01b, SEC-02, SEC-03, migración 0005) se corrieron
  en vivo el 2026-07-09 y los 5 PASARON.** Detalle en la sección 2.
- `REQUIREMENTS.md`: **48/51**. Los 3 que faltan son `SADMIN-*`, sin tildar a propósito.
- **Fase 07 CERRADA:** `07-VERIFICATION.md` → `status: passed`, 3/3.
- El milestone **v1.0 NO está cerrado**. Falta: el `VERIFICATION.md` de la fase 06 (necesita el
  re-test conversacional en vivo), el `human_needed` de la 04, el bootstrap del superadmin, y el
  cleanup del Vault.
- **Lo único que Claude realmente NO puede hacer:** DDL/migraciones (SQL Editor), borrar de
  `vault.secrets` (esquema no expuesto por REST), y elegir las credenciales del primer superadmin.

---

## Qué cambió respecto al handoff anterior

El handoff previo marcaba como **blocker crítico** el bug `responder-history-drops-user-messages`
(el bot se olvidaba de lo que el cliente decía). **Ese bug ya estaba arreglado en `main`**, en el
commit `d6d959e`, hecho por un workstream paralelo. El handoff estaba desactualizado.

Se cerraron las **dos** sesiones de debug que quedaban abiertas, ambas con fix ya presente en
código, ambas verificadas por tests, ambas archivadas en `.planning/debug/resolved/`:

1. `responder-history-drops-user-messages` — el mensaje del cliente ahora sobrevive al turno
   siguiente (`[...history, userMessage, ...messagesToPersist]`).
2. `responder-empty-text-after-tool-call` — instrucción positiva en el prompt
   (`systemPrompt.ts:106`) + guard defensivo con reintento sin tools y `SAFE_FALLBACK_MESSAGE`
   (`responder.ts:349`).

---

## ✅ Verificado EN VIVO en esta sesión (y pasó)

Todo esto se ejecutó de verdad, en esta máquina, hoy. Sin credenciales — solo tests locales.

| Qué | Comando | Resultado |
|-----|---------|-----------|
| Suite del bot | `corepack pnpm --filter @turnosbot/bot test -- --run` | **223/223 tests, 24/24 archivos, 0 skipped** (corrido 2 veces, verde ambas) |
| Suite del motor | `corepack pnpm --filter @turnosbot/availability-engine test -- --run` | **61/61 tests, 7/7 archivos** |
| Typecheck del bot | `npx tsc --noEmit` (en `apps/bot`) | **0 errores** (tras rebuildear el motor) |
| Fix multi-turno presente | lectura directa de `responder.ts` | `userMessage` reusado en los 3 sitios |
| Fix empty-text presente | lectura directa de `responder.ts:349` + `systemPrompt.ts:106` | ambas capas presentes, 5 tests de regresión |

**Hallazgo de entorno (resuelto):** `tsc` daba 6 errores (`startIso`/`endIso` no existen en
`AvailableSlot`). **No era un bug de código.** `apps/bot` importa
`@turnosbot/availability-engine` desde `dist/`, que está gitignoreado; el `dist/` local había
quedado viejo tras el `git pull`. Se arregla rebuildeando. **Los tests de vitest no detectan
esto porque no typechequean.**

```bash
corepack pnpm --filter @turnosbot/availability-engine build
```

> **Hacé esto después de cualquier `git pull` que toque `packages/`, antes de creerle a `tsc`.**

---

## ⚙️ Reglas de entorno (no re-aprender)

1. **DB única: `bdgufnitakelyialjoqg`.** NUNCA el proyecto del restaurante
   (`hzgunbftloevclkohcdf`). Todo script live guardea `SUPABASE_URL.includes("bdgufnitakelyialjoqg")`
   y aborta si no coincide.
2. **`pnpm` NO está en PATH** → usar `corepack pnpm ...`.
3. **Scripts gated** (los que tocan la DB en vivo) se corren así — `tsx` NO autocarga `.env`:
   ```bash
   node --env-file=.env --import tsx <script>.ts
   ```
4. **DDL / migraciones: SOLO por el SQL Editor de Supabase.** El `SUPABASE_ACCESS_TOKEN` del
   `.env` está malformado (no es un `sbp_...` válido) → Management API rota. El host directo
   `db.<ref>.supabase.co` no resuelve desde este entorno (IPv6-only). La ruta REST
   (`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`) SÍ funciona para `SELECT`/`rpc`/verificación.
5. **Grants en Supabase:** `REVOKE ... FROM PUBLIC` **no** cubre `anon`/`authenticated`. Hay que
   revocarlos explícitamente. Pero **nunca** revoques `auth_negocio_ids`/`auth_tenant_id` — las
   policies de RLS los evalúan con el rol que consulta, y revocarlos rompe el aislamiento.

---

# 1) BUGS / TESTS

## 1.1 — La prueba de aislamiento parecía cubierta por CI y no lo estaba — ✅ RESUELTO

- **QUÉ ERA:** la única prueba de SEC-03 (aislamiento entre negocios) se llamaba
  `negocioScoped.test.ts`, pero era un **script standalone** (`main()` + `process.exit`) y estaba
  **explícitamente en la lista `exclude`** de `apps/bot/vitest.config.ts`. No corría en
  `pnpm test`, y ni siquiera aparecía como "skipped".
- **POR QUÉ IMPORTABA:** una suite verde no decía **nada** sobre el aislamiento entre negocios.
  Cualquiera hubiera asumido que CI lo cubría. Un bug de aislamiento podía llegar a producción sin
  que ningún test se pusiera rojo.
- **ARREGLO (2026-07-09):** renombrado a `apps/bot/src/db/negocioScoped.verify.ts`. El sufijo
  `.verify.ts` no matchea el include `src/**/*.test.ts`, así que la entrada en `exclude` se
  eliminó — ya no hace falta ocultarlo, porque ya no se parece a un test.
- **VERIFICADO tras el cambio:** vitest sigue en **223/223 sobre 24 archivos**, `tsc --noEmit` da
  **0 errores**, y el script sigue pasando en vivo (**exit 0**).
- **Sigue siendo manual, por diseño** — toca la DB real, así que no puede vivir en CI sin
  credenciales. Pero ahora el nombre lo dice. Correrlo cuando se toque RLS, grants o migraciones:
  ```bash
  node --env-file=.env --import tsx apps/bot/src/db/negocioScoped.verify.ts
  ```

## 1.2 — Re-test conversacional en vivo del bot — ✅ HECHO, PASSED

- **QUÉ ERA:** los dos fixes de `responder.ts` solo estaban cubiertos por tests unitarios que
  **mockean `generateText`** — probaban nuestra lógica, no el comportamiento del modelo real.
- **HECHO (2026-07-10):** se creó `scripts/verify-bot-conversation-live.ts`, que maneja
  `responder()` contra **Gemini real + Supabase real**. Corrido: **PASSED, exit 0, 0 warnings.**
  ```bash
  node --env-file=.env --import tsx scripts/verify-bot-conversation-live.ts
  ```
- **Memoria multi-turno:** el bot recibió `mañana a la tarde`, ofreció horarios reales, y en el
  turno siguiente recordaba **el día Y el servicio**: *"Para mañana viernes 10, tengo estos
  horarios para el corte clásico (que sale $6.000)…"*. `context.messages` guarda los 3 mensajes
  `role:"user"` literales y en orden (antes del fix: **cero**).
- **Texto vacío:** ante `hola cuanto sale el corte` narró **$6000, el precio real de la DB**, sin
  disparar `SAFE_FALLBACK_MESSAGE` — el modelo verbalizó solo, el guard ni tuvo que actuar.
- **Nota de diseño:** las aserciones duras miran estado observable (`context.messages`, respuesta
  no vacía), no la redacción del modelo. Un rate limit de Gemini se reporta `SKIPPED`, nunca
  `FAILED`. Si aparece `SAFE_FALLBACK_MESSAGE` se reporta como WARN — el guard contuvo el bug,
  pero el modelo siguió cerrando el turno sin texto.
- Detalle completo: `.planning/quick/260709-w2y-verify-bot-conversation-live/260709-w2y-SUMMARY.md`

## 1.3 — Fases sin `VERIFICATION.md`

- ✅ **Fase 07: HECHO (2026-07-09).** `07-VERIFICATION.md` → `status: passed`, 3/3 must-haves,
  0 `behavior_unverified`. Los 3 criterios se probaron en vivo; el verificador chequeó además a
  nivel de código que cada artefacto existe y está cableado a la ruta sancionada.
- ✅ **Fase 06: sus 5 Success Criteria están probados EN VIVO** por
  `scripts/verify-bot-conversation-live.ts` (5 escenarios, PASSED exit 0): #1 servicio en lenguaje
  natural, #2 horarios reales del motor, #3 consultas de precio, #4 **cancelar Y reagendar** por
  conversación, #5 prompt injection + aislamiento entre clientes. Ver `06-VERIFICATION.md`.
- ⚠️ **Fase 04: `human_needed`.** Abrir `.planning/phases/04-*/04-VERIFICATION.md`, buscar el
  escenario pendiente, ejecutarlo a mano en el dashboard y registrar el resultado.

## 1.4 — Nyquist / validación

- **QUÉ:** Fase 01 sin `VALIDATION.md`. Fase 05 con `nyquist_compliant: false` (parcial).
- **POR QUÉ NO LO HICE:** no bloqueante, y fuera del alcance de esta sesión.
- **PASOS EXACTOS:** `/gsd-validate-phase 1` y `/gsd-validate-phase 5`.

## 1.5 — Deuda de tracking en `REQUIREMENTS.md` — ✅ CERRADA (salvo SADMIN)

- **HECHO (2026-07-09):** se tildaron los 7 que tenían evidencia directa en el frontmatter
  `requirements-completed` de un SUMMARY: `PRO-01` (02-06), `SVC-01`/`SVC-02` (02-05),
  `BIZ-01`/`BIZ-02`/`BIZ-03` (02-04), `SEC-03` (07-05, verificado en vivo).
  **Estado actual: 48/51.**
- **PENDIENTE — `SADMIN-01`/`SADMIN-02`/`SADMIN-03`:** deliberadamente **sin tildar**. El panel
  `/admin` está construido, pero el plan 02-08 quedó pausado en Task 3 y el flujo nunca se ejerció
  contra la base real; su SUMMARY tiene `requirements-completed: []`. Tildarlos sería asumir.
- **PASOS EXACTOS:** cerrarlos corriendo el bootstrap del superadmin (ver **2.7**). Una vez que
  `verify-admin-tenant-lifecycle.ts` pase, tildar los tres y borrar la nota de advertencia que
  quedó escrita arriba de ellos en `REQUIREMENTS.md`.

## 1.6 — UAT parcial de fase 02

- **QUÉ:** `02-HUMAN-UAT.md` tiene 1 escenario abierto.
- **POR QUÉ NO LO HICE:** requiere usar el dashboard con un usuario real.
- **PASOS:** abrir el archivo, ejecutar el escenario en el navegador, registrar resultado.

---

# 2) SEGURIDAD

> ## ✅ LOS 5 CHECKPOINTS DE SEGURIDAD FUERON VERIFICADOS EN VIVO EL 2026-07-09.
> Los corrí yo, contra `bdgufnitakelyialjoqg` (ref confirmado antes de ejecutar). **Los 5 pasaron.**
>
> **Corrección importante:** una versión anterior de este handoff decía que Claude no podía
> ejecutarlos "porque no puede leer el `.env`". **Eso era falso.** Claude no puede *leer* el `.env`
> con sus herramientas, pero `node --env-file=.env` **sí lo carga** en el proceso hijo. Son dos
> cosas distintas. Antes de declarar algo imposible por falta de credencial, **probá correrlo**.

## Resultados de la corrida del 2026-07-09

| # | Checkpoint | Comando | Resultado |
|---|------------|---------|-----------|
| 2.1 | SEC-01 · token no queda en claro | `verify-vault-no-plaintext.ts` | ✅ PASSED (exit 0) |
| 2.2 | SEC-01(b) · `anon` rechazado en Vault | `verify-vault-wrappers-anon-denied.ts` | ✅ PASSED (exit 0) |
| 2.3 | SEC-02 · reservas concurrentes | `verify-concurrent-booking.ts` | ✅ PASSED (exit 0) |
| 2.4 | SEC-03 · aislamiento cross-negocio + RLS | `negocioScoped.verify.ts` + `verify-isolation.ts` | ✅ PASSED (exit 0, ambos) |
| 2.5 | Migración `0005` aplicada | `verify-0005-applied.ts` | ✅ PASSED (exit 0) |

Todos se invocan igual:

```bash
node --env-file=.env --import tsx <script>.ts
```

### Detalle de lo que probó cada uno

**2.1 · SEC-01 — el token de WhatsApp no se guarda en claro.** Un `SELECT` directo a `negocio` no
expone ningún token (solo `whatsapp_token_secret_id`). `getWhatsappToken` resolvió el token real
vía el RPC `get_whatsapp_token` del Vault, con `WHATSAPP_DEV_TOKEN` sin setear.

**2.2 · SEC-01(b) — la clave pública `anon` no puede tocar el Vault.** Este era el agujero crítico
que encontró la auditoría: los wrappers `SECURITY DEFINER` eran ejecutables con la `anon` key, que
va en el frontend. Hoy ambos wrappers responden `permission denied for function`. Las migraciones
`0006` y `0007` sostienen.

**2.3 · SEC-02 — anti-doble-reserva bajo concurrencia.** 10 llamadas concurrentes a
`bookAppointment` sobre el **mismo** slot, compartiendo el mismo `freshData` por referencia:
exactamente **1 éxito y 9 `slot_taken`**. Quien decide es la constraint `EXCLUDE` GiST de Postgres
(error `23P01`), no un chequeo en memoria. El script limpió sus turnos de prueba (0 turnos quedaron
en la fecha de prueba, verificado después).

**2.4 · SEC-03 — aislamiento entre negocios.** Los 12 accessors de `negocioScoped` más la tool
`consultarNegocio`: cero filas del negocio equivocado, en ambas direcciones (A→B y B→A). Y
`verify-isolation.ts` confirma RLS por separado: un owner no lee, no actualiza ni inserta filas de
otro tenant (el `INSERT` cross-tenant es rechazado con `new row violates row-level security policy`).

**2.5 · Migración `0005`.** `negocio.whatsapp_token` está dropeada (el `SELECT` falla),
`whatsapp_token_secret_id` existe, y el RPC `get_whatsapp_token` ejecuta.

---

## 2.6 — Cleanup de secretos huérfanos en Vault ⚠️ PENDIENTE (no bloqueante)

- **QUÉ:** las pruebas de la auditoría dejaron secretos de test en `vault.secrets`. **Y la corrida
  de hoy sumó uno más:** `verify-vault-no-plaintext.ts` crea un secreto llamado
  `whatsapp-token-verify-<timestamp>` y solo vuelve el `secret_id` a `NULL` — la fila del secreto
  queda. Cada corrida de ese script deja un huérfano nuevo.
- **POR QUÉ NO LO PUEDO HACER:** el esquema `vault` **no está expuesto por REST**, así que no hay
  forma de borrarlo desde código. Solo por el SQL Editor.
- **PASOS EXACTOS:** entrar al SQL Editor de Supabase (proyecto `bdgufnitakelyialjoqg`) y correr:
  ```sql
  delete from vault.secrets where name='uat-probe-nonexistent' or name='anon-probe'
     or name like 'secaudit-%' or name like 'whatsapp-token-verify-%';
  ```
  Es seguro: los 3 negocios tienen `whatsapp_token_secret_id = NULL` (verificado hoy), así que
  ningún negocio apunta a estos secretos.

## 2.7 — Bootstrap del primer superadmin ⚠️ PENDIENTE (plan 02-08, pausado)

- **QUÉ:** el panel `/admin` está construido y commiteado, pero **nunca se creó el primer
  superadmin** ni se ejerció el alta de tenants contra la DB real. Por eso `SADMIN-01/02/03` siguen
  sin tildar en `REQUIREMENTS.md`.
- **POR QUÉ NO LO PUEDO HACER:** no es la credencial — es que **vos** tenés que elegir el
  email/password reales del primer superadmin, y esos nunca se commitean.
- **POR QUÉ IMPORTA:** sin esto no podés dar de alta la primera peluquería. Bloquea el onboarding
  real, aunque no bloquee el cierre técnico de v1.0.
- **PASOS EXACTOS:**
  ```bash
  node --env-file=.env --import tsx scripts/bootstrap-superadmin.ts
  node --env-file=.env --import tsx scripts/verify-admin-tenant-lifecycle.ts
  ```
  Ver `.planning/phases/02-*/02-08-SUMMARY.md` para el detalle de cómo retomar.
  Cuando `verify-admin-tenant-lifecycle.ts` pase: tildar `SADMIN-01/02/03` y borrar la nota de
  advertencia que quedó arriba de ellos en `REQUIREMENTS.md`.

## 2.9 — Cuota de Gemini: 15 RPM ⚠️ DECISIÓN DE NEGOCIO ANTES DE PRODUCCIÓN

- **QUÉ:** el free tier de Gemini permite **15 requests por minuto**, no ~30 como estimaba
  `research/STACK.md` (que marcaba el dato como confianza BAJA-MEDIA, a verificar). Medido contra
  la API real: `RESOURCE_EXHAUSTED`, `quotaValue: "15"`, modelo `gemini-3.1-flash-lite`.
- **POR QUÉ IMPORTA:** el tool-loop consume **1-3 requests por cada mensaje del cliente**. O sea
  que 15 RPM se agota con **~5-8 mensajes por minuto sumando TODOS los tenants**. Una sola
  peluquería con dos clientes conversando a la vez ya lo roza.
- **Lo bueno:** cuando la cuota se agota, el bot **no se rompe**. `responder()` cae al camino de
  error y manda `SAFE_FALLBACK_MESSAGE` ("Dame un segundo que verifico y te confirmo 🙌"). Se
  verificó en vivo. Pero el cliente no avanza su turno.
- **PASOS:** decidir el pase a tier pago (mismo modelo, mismo código, solo cambia la API key)
  antes de onboardear el primer tenant con volumen real. Ver también la nota de ToS del free tier
  en `research/STACK.md` (Google puede usar los datos del free tier para entrenar — este proyecto
  procesa nombres y teléfonos de clientes reales).

## 2.8 — DDL / migraciones futuras ⚠️ SIEMPRE MANUAL

- **QUÉ:** cualquier migración nueva.
- **POR QUÉ NO LO PUEDO HACER:** el `SUPABASE_ACCESS_TOKEN` del `.env` está malformado (no es un
  `sbp_...` válido) → Management API rota. El host directo `db.<ref>.supabase.co` no resuelve desde
  este entorno (IPv6-only). La ruta REST sirve para `SELECT`/`rpc`/verificación, **no** para DDL.
- **PASOS:** pegar el `.sql` en el SQL Editor de Supabase.

---
## Orden sugerido para la próxima sesión

1. **Rebuildear el motor** (`corepack pnpm --filter @turnosbot/availability-engine build`) — evita
   perder media hora persiguiendo errores de `tsc` que no existen.
2. **Cleanup del Vault (2.6)** en el SQL Editor — es lo único que quedó sucio, y crece con cada
   corrida de `verify-vault-no-plaintext.ts`.
3. **Bootstrap del superadmin (2.7)** — necesario para dar de alta la primera peluquería, y lo que
   destraba tildar `SADMIN-01/02/03`.
4. **Re-test conversacional en vivo (1.2)** — la última prueba pendiente del core value. Los tests
   actuales mockean a Gemini; nadie confirmó end-to-end contra el modelo real desde los fixes.
5. Cerrar los `VERIFICATION.md` formales (1.3) — la fase 07 ya tiene sus 3 criterios verificados
   en vivo, así que ahora sí se puede generar honestamente.
6. `/gsd-audit-milestone 1.0` → si da `passed` o deuda aceptable → `/gsd-complete-milestone 1.0`.

> **Los 5 scripts de seguridad ya no están en esta lista: se corrieron el 2026-07-09 y pasaron.**
> Vale la pena re-correrlos si se toca RLS, los grants, o las migraciones.

## Referencias

- **Estado general:** `.planning/STATE.md` (secciones "Blockers/Concerns" y "Session Continuity").
- **Resumen de la fase 07:** `.planning/phases/07-hardening-y-listo-para-produccion/07-PHASE-STATUS.md`
  (NO se llama `07-SUMMARY.md` a propósito: ese glob lo cuenta GSD como resumen-de-plan e infla
  el contador de progreso a 44/43).
- **Lecciones de debug:** `.planning/debug/knowledge-base.md` (incluye la trampa del `dist/` viejo).
- **Sesiones de debug cerradas:** `.planning/debug/resolved/` (4 archivos, ninguna abierta).
- **Migraciones de seguridad:** `supabase/migrations/0005_whatsapp_token_vault.sql`,
  `0006_revoke_vault_wrappers_from_anon.sql`, `0007_restore_auth_helper_grants.sql`.
