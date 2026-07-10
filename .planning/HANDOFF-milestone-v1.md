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
- El milestone **v1.0 NO está cerrado**. Falta: los `VERIFICATION.md` formales de las fases 06/07,
  el `human_needed` de la 04, el bootstrap del superadmin, y el cleanup del Vault.
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

## 1.1 — `negocioScoped.test.ts` NO es un test de vitest (trampa activa) ⚠️

- **QUÉ:** el archivo `apps/bot/src/db/negocioScoped.test.ts` tiene un `main()` y es un **script
  standalone**, pese a la extensión `.test.ts`. **No corre** en `pnpm test`: no está entre los 24
  archivos de la suite, y **no aparece como "skipped"** — vitest simplemente no lo levanta.
- **POR QUÉ IMPORTA:** es la única prueba de SEC-03 (aislamiento entre negocios). Una suite verde
  **no dice nada** sobre el aislamiento. Es fácil creer que está cubierto cuando no lo está.
- **ESTADO:** ✅ **corrido en vivo el 2026-07-09 — PASSED** (exit 0, cero fugas cross-negocio en
  los 12 accessors + la tool `consultarNegocio`, en ambas direcciones A→B y B→A).
- **PERO la trampa sigue viva:** el archivo **no corre** en `pnpm test`. Cada vez que alguien vea
  la suite en verde va a creer que el aislamiento está cubierto, y no lo está. Hay que correrlo
  aparte, a mano:
  ```bash
  node --env-file=.env --import tsx apps/bot/src/db/negocioScoped.test.ts
  ```
- **ARREGLO SUGERIDO (opcional, 2 min):** renombrarlo a `negocioScoped.verify.ts` o moverlo a
  `scripts/` para que el nombre deje de mentir.

## 1.2 — Re-test conversacional en vivo del bot (Gemini + Supabase reales)

- **QUÉ:** confirmar end-to-end que los dos fixes de `responder.ts` eliminan los síntomas
  originales: (a) que el bot recuerda lo que dijiste en turnos anteriores, y (b) que nunca
  responde vacío tras consultar un precio.
- **POR QUÉ NO LO HICE:** requiere `.env` con la API key de Gemini y credenciales de Supabase,
  además de un número de WhatsApp de prueba.
- **ESTADO:** **SIN VERIFICAR.** La cobertura actual es de tests unitarios que **mockean**
  `generateText` — prueban nuestra lógica, no el comportamiento del modelo real.
- **PASOS EXACTOS:** reproducir el Test 2 de
  `.planning/phases/06-agente-conversacional-de-agendamiento/06-UAT.md`:
  1. Mandale al bot: `hola quiero sacar un turno para un corte`
  2. Después: `mañana a la tarde`
  3. Después: `el corte clásico nomás`
  4. **Esperado:** NO vuelve a preguntar el día. Debe avanzar a proponer horarios reales.
  5. En una conversación nueva: `hola cuanto sale el corte` → **esperado:** responde el precio
     en texto (no se queda mudo).

## 1.3 — Fases sin `VERIFICATION.md`

- **QUÉ:** Fases **06** y **07** no tienen `VERIFICATION.md`. Fase **04** lo tiene en estado
  `human_needed` (hay un escenario sin resolver).
- **POR QUÉ NO LO HICE:** generar la verificación de una fase requiere ejecutar sus criterios de
  éxito en vivo, que caen en el mismo bloqueo de credenciales.
- **PASOS EXACTOS:**
  ```
  /gsd-verify-work 6
  /gsd-verify-work 7
  ```
  Para la fase 04, abrir `.planning/phases/04-*/04-VERIFICATION.md`, buscar el escenario en
  `human_needed`, ejecutarlo a mano en el dashboard y registrar el resultado.

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
| 2.4 | SEC-03 · aislamiento cross-negocio + RLS | `negocioScoped.test.ts` + `verify-isolation.ts` | ✅ PASSED (exit 0, ambos) |
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
