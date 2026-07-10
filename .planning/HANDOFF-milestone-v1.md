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
- El milestone **v1.0 NO está cerrado**. Lo que falta es casi todo **verificación en vivo** y
  **deuda de tracking**, no código nuevo.
- **Nada de lo pendiente lo puede hacer Claude**: todo requiere el `.env` (que Claude no puede
  leer) o el SQL Editor de Supabase.

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
- **POR QUÉ NO LO HICE:** correrlo exige `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` del `.env`,
  que Claude no puede leer.
- **PASOS EXACTOS:**
  ```bash
  cd C:/Users/Usuario/Jueves5/AgentePeluqueria
  node --env-file=.env --import tsx apps/bot/src/db/negocioScoped.test.ts
  ```
  Esperado: 26/26 aserciones OK, cero fugas cross-negocio, exit 0.
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

> **Ninguno de estos checkpoints se re-verificó en la sesión del 2026-07-09.**
> Todos PASARON en sesiones anteriores. Eso NO es lo mismo que "verificado hoy".
> Motivo transversal: **Claude no puede leer el `.env`**, y el DDL exige el SQL Editor.

## 2.1 — SEC-01 · Tokens de WhatsApp encriptados (Vault)

- **QUÉ:** confirmar que `negocio` no expone el token en claro, y que `getWhatsappToken` lo
  resuelve vía el RPC de Vault.
- **ESTADO:** **SIN VERIFICAR en esta sesión.** PASSED en la sesión previa (plan 07-03).
- **POR QUÉ NO LO HICE:** el script exige `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, y que
  `WHATSAPP_DEV_TOKEN` esté **sin** setear.
- **PASOS EXACTOS:**
  ```bash
  node --env-file=.env --import tsx scripts/verify-vault-no-plaintext.ts
  ```
  Esperado: exit 0. Si falla, el token está guardándose en claro → **no salir a producción**.

## 2.2 — SEC-01 (b) · Los wrappers de Vault deben rechazar la clave `anon`

- **QUÉ:** este es el agujero **crítico** que encontró la auditoría: los wrappers
  `SECURITY DEFINER` eran ejecutables con la clave `anon`, que es **pública** (va en el frontend).
  La fuga del token en claro se confirmó en vivo. Se tapó con las migraciones `0006` y `0007`.
- **ESTADO:** **SIN VERIFICAR en esta sesión.** PASSED en la sesión previa, tras aplicar `0006`+`0007`.
- **POR QUÉ IMPORTA:** si una regresión vuelve a otorgar `EXECUTE` a `anon`, cualquiera con la
  clave pública del dashboard puede leer los tokens de WhatsApp de **todos** los negocios.
- **PASOS EXACTOS:**
  ```bash
  node --env-file=.env --import tsx scripts/verify-vault-wrappers-anon-denied.ts
  ```
  Esperado: exit 0 (el rol `anon` es rechazado). Necesita `SUPABASE_ANON_KEY` en el `.env`.

## 2.3 — SEC-02 · Reservas concurrentes al mismo slot

- **QUÉ:** N reservas simultáneas al mismo horario → exactamente **1** éxito y N−1 rechazos
  controlados (`slot_taken`), garantizado por el `EXCLUDE` GiST de Postgres, **no** por lógica de
  aplicación.
- **ESTADO:** **SIN VERIFICAR en esta sesión.** PASSED en la sesión previa (3/3 corridas, plan 07-04).
- **PASOS EXACTOS:**
  ```bash
  node --env-file=.env --import tsx scripts/verify-concurrent-booking.ts
  ```
  Esperado: exit 0, "exactamente 1 éxito".

## 2.4 — SEC-03 · Aislamiento entre negocios (service_role) + RLS

- **QUÉ:** dos chequeos distintos y complementarios:
  - `negocioScoped.test.ts` → el bot (que usa `service_role`, **que saltea RLS**) nunca devuelve
    filas de otro negocio. Este es el cinturón.
  - `verify-isolation.ts` → las policies de RLS siguen aislando correctamente. Estos son los
    tirantes. Importa especialmente porque la migración `0007` tocó los helpers que RLS usa.
- **ESTADO:** **SIN VERIFICAR en esta sesión.** Ambos PASSED en sesiones previas.
- **PASOS EXACTOS:**
  ```bash
  node --env-file=.env --import tsx apps/bot/src/db/negocioScoped.test.ts
  node --env-file=.env --import tsx scripts/verify-isolation.ts
  ```
  Esperado: ambos exit 0. Ver también 1.1 — este script **no** corre en `pnpm test`.

## 2.5 — Migraciones aplicadas · `0005`, `0006`, `0007`

- **QUÉ:** confirmar contra la DB en vivo que las tres migraciones de seguridad están aplicadas.
- **ESTADO:** **SIN VERIFICAR en esta sesión.** Según el handoff previo, el usuario las aplicó en
  el SQL Editor y se re-verificaron entonces. Hoy solo se confirmó que **los archivos `.sql`
  existen en el repo** — lo cual no prueba que estén aplicadas en la base.
- **POR QUÉ NO LO HICE:** requiere `.env`.
- **PASOS EXACTOS:**
  ```bash
  node --env-file=.env --import tsx scripts/verify-0005-applied.ts
  ```
  Y para `0006`/`0007`, el chequeo funcional es el de 2.2 (anon rechazado) + 2.4 (RLS intacta).

## 2.6 — Cleanup de secretos huérfanos en Vault (no bloqueante)

- **QUÉ:** las pruebas de la auditoría dejaron secretos de test en `vault.secrets`.
- **POR QUÉ NO LO HICE:** el esquema `vault` no está expuesto por REST → no se puede borrar desde
  código. **Solo** por el SQL Editor.
- **PASOS EXACTOS:** entrar al SQL Editor de Supabase (proyecto `bdgufnitakelyialjoqg`) y correr:
  ```sql
  delete from vault.secrets where name='uat-probe-nonexistent' or name='anon-probe'
     or name like 'secaudit-%' or name like 'whatsapp-token-verify-%';
  ```
  Es seguro: ningún `negocio.whatsapp_token_secret_id` apunta a estos (todos quedaron `NULL`).

## 2.7 — Bootstrap del primer superadmin (plan 02-08, pausado hace tiempo)

- **QUÉ:** el panel `/admin` está construido y commiteado, pero **nunca se creó el primer
  superadmin** ni se ejerció el alta de tenants contra la DB real.
- **POR QUÉ NO LO HICE:** requiere `.env` **y** que vos elijas email/password reales del primer
  superadmin (nunca se commitean).
- **POR QUÉ IMPORTA:** sin esto no podés dar de alta la primera peluquería. Bloquea el onboarding
  real, aunque no bloquee el cierre técnico de v1.0.
- **PASOS EXACTOS:**
  ```bash
  node --env-file=.env --import tsx scripts/bootstrap-superadmin.ts
  node --env-file=.env --import tsx scripts/verify-admin-tenant-lifecycle.ts
  ```
  Ver `.planning/phases/02-*/02-08-SUMMARY.md` para el detalle de cómo retomar.

---

## Orden sugerido para la próxima sesión

1. **Rebuildear el motor** (`corepack pnpm --filter @turnosbot/availability-engine build`) — evita
   perder media hora persiguiendo errores de `tsc` que no existen.
2. Correr los 5 scripts gated de la sección **SEGURIDAD** (2.1 → 2.5). Si alguno falla, **frená**:
   es un problema real de seguridad, no de tracking.
3. Correr el cleanup de Vault (2.6) en el SQL Editor.
4. Bootstrap del superadmin (2.7) — necesario para el primer cliente real.
5. Re-test conversacional en vivo (1.2) — la última prueba del core value.
6. Cerrar verificaciones formales (1.3) y tildar requirements (1.5).
7. `/gsd-audit-milestone 1.0` → si da `passed` o deuda aceptable → `/gsd-complete-milestone 1.0`.

## Referencias

- **Estado general:** `.planning/STATE.md` (secciones "Blockers/Concerns" y "Session Continuity").
- **Resumen de la fase 07:** `.planning/phases/07-hardening-y-listo-para-produccion/07-PHASE-STATUS.md`
  (NO se llama `07-SUMMARY.md` a propósito: ese glob lo cuenta GSD como resumen-de-plan e infla
  el contador de progreso a 44/43).
- **Lecciones de debug:** `.planning/debug/knowledge-base.md` (incluye la trampa del `dist/` viejo).
- **Sesiones de debug cerradas:** `.planning/debug/resolved/` (4 archivos, ninguna abierta).
- **Migraciones de seguridad:** `supabase/migrations/0005_whatsapp_token_vault.sql`,
  `0006_revoke_vault_wrappers_from_anon.sql`, `0007_restore_auth_helper_grants.sql`.
