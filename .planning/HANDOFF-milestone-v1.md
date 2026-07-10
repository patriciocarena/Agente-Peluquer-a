# Handoff — TurnosBot, cierre de milestone v1.0 (2026-07-09)

> Pegá este archivo (o su contenido) como contexto inicial en la nueva sesión de Claude Code.
> Rama: `main`. Todo lo de abajo está commiteado y pusheado a `origin/main`.

---

## TL;DR — dónde estamos

- **Fase 7 (Hardening) 100% ejecutada, UAT ✅ (4/4) y seguridad ✅ (`threats_open: 0`).** Las 7 fases del roadmap están ejecutadas.
- **El milestone v1.0 NO está listo para cerrar.** Se intentó `/gsd:complete-milestone` y `/gsd:audit-milestone`; el pre-flight/audit encontró gaps reales. **NADA se archivó** (no hay tag `v1.0`, `REQUIREMENTS.md` intacto, `ROADMAP.md` sin reorganizar).
- **Blocker #1 (crítico): bug de core sin arreglar** — `responder-history-drops-user-messages`. Rompe el flujo conversacional multi-turno (el core value). **Arreglar esto antes de shippear v1.0.**

---

## Qué se hizo esta sesión (ya commiteado + pusheado)

1. **Fase 7 completa:**
   - 07-01: migración `0005` (Vault para `whatsapp_token`) **aplicada en vivo** + db-types regenerados.
   - 07-02: call-sites (`getWhatsappToken.ts`, `admin-tenants.ts`) migrados a los RPC Vault + tests; foldeado el gap (fixture `rows.ts` + 3 scripts).
   - 07-03: `verify-vault-no-plaintext.ts` (SEC-01 live) → PASSED.
   - Bug pre-existente de `main` arreglado: `responder.ts:365` `buildSystemPrompt()` sin args (regresión del gap-nombre de fase 06). Resuelto en `.planning/debug/resolved/responder-buildsystemprompt-missing-args.md`.
2. **UAT fase 7** (`07-UAT.md`): 4/4 passed (Cold-Start, SEC-01, SEC-02, SEC-03), 0 issues.
3. **`/gsd:secure-phase 7` — encontró y cerró un agujero CRÍTICO:**
   - Los wrappers Vault `SECURITY DEFINER` eran ejecutables por la **`anon` key** (pública). Fuga de token en claro **confirmada en vivo**. `REVOKE ALL FROM PUBLIC` de 0005 no revoca de `anon`/`authenticated` (default privileges de Supabase).
   - **Migración `0006`** → REVOKE de anon/authenticated en los wrappers Vault. **Migración `0007`** → corrige una sobre-corrección de 0006 que rompió RLS (revocó de más `auth_negocio_ids`/`auth_tenant_id`, que las policies RLS necesitan).
   - **0006 y 0007 YA están aplicadas** (el usuario las aplicó en el SQL Editor). Re-verificado en vivo: `verify-vault-wrappers-anon-denied.ts` PASSED (anon rechazado), `verify-isolation.ts` PASSED (RLS ok), `negocioScoped.test.ts` PASSED.
   - `07-SECURITY.md` → `status: verified`, `threats_open: 0`.

---

## Hallazgos del audit de milestone (por qué v1.0 no cierra todavía)

### 🔴 Blocker crítico — bug de core abierto
`.planning/debug/responder-history-drops-user-messages.md` (status: **diagnosed, CONFIRMED, SIN arreglar**):
- `responder()` persiste solo `result.response.messages` (que el AI SDK v7 documenta como *solo los mensajes generados por el modelo* — nunca el input del usuario).
- El mensaje `{ role: "user", content: mensajeEntrante }` del turno actual **nunca se agrega a lo que se persiste** (`responder.ts` ~líneas 195, 220 error-path, 246/264/267-270 happy-path).
- Efecto: el modelo nunca ve lo que el cliente dijo en turnos anteriores → **el bot entra en loop pidiendo datos ya contestados.** Golpea directo el core value (agendar conversando).
- **Acción:** `/gsd:debug continue responder-history-drops-user-messages` → arreglar → agregar test que asegure que el mensaje del usuario sobrevive al PRÓXIMO turno persistido (el test actual en `responder.test.ts` ~227-240 codifica el contrato BUGGY como correcto — hay que corregirlo).

### Fases sin verificación formal
- **Fase 06: sin `VERIFICATION.md`** → fase no verificada (blocker del audit). Correr `/gsd:verify-work 6` o `gsd-verifier`.
- **Fase 07: sin `VERIFICATION.md`** → pero UAT (`07-UAT.md`) + `07-SECURITY.md` se hicieron en vivo esta sesión. Falta el artefacto formal.
- **Fase 04: `VERIFICATION.md` status `human_needed`** → resolver el escenario pendiente.

### Requirements (3-source cross-reference)
`REQUIREMENTS.md`: 51 total, **41 checked, 10 unchecked**. Los 10 son en su mayoría **tracking lag** (construidos + listados como completos en el frontmatter de SUMMARYs), NO features faltantes:
- **Solo falta tildar el checkbox** (satisfied): `PRO-01` (02-06), `SVC-01`/`SVC-02` (02-05), `BIZ-01`/`BIZ-02`/`BIZ-03` (02-04), `SEC-03` (07-05, verificado live hoy).
- **Partial (verificar a mano)**: `SADMIN-01`/`SADMIN-02`/`SADMIN-03` — construidos en 02-08, pero su SUMMARY tiene `requirements_completed: []` (frontmatter vacío). Confirmar y tildar.

### Nyquist
- Fase 01: sin `VALIDATION.md` (missing).
- Fase 05: `nyquist_compliant: false` (partial).
- Considerar `/gsd:validate-phase 1` y `/gsd:validate-phase 5`.

### Artefactos abiertos menores (`gsd-sdk query audit-open`)
- Debug `responder-empty-text-after-tool-call`: diagnosed; **el fix ya está en código** (`responder.ts` ~línea 349, guard de empty-text), pero la sesión no está marcada `resolved`. Marcarla resolved.
- UAT parcial fase 02 (`02-HUMAN-UAT.md`, 1 escenario abierto).
- Quick-task huérfano `260704-jb5-terminar-de-actualizar-02-ui-spec-md-y-0` (status: missing).

---

## ⚠️ Reglas de entorno (hard-won esta sesión — NO reaprender)

1. **DB única: `bdgufnitakelyialjoqg`.** NUNCA el restaurante `hzgunbftloevclkohcdf`. Todo script live debe guardear `SUPABASE_URL.includes("bdgufnitakelyialjoqg")`.
2. **`pnpm` NO está en PATH.** Usar `corepack pnpm ...` para scripts de package, y para scripts gated:
   ```
   node --env-file=.env --import tsx <script>.ts
   ```
   (hay `tsx` local en `node_modules`; `tsx` NO auto-carga `.env`; Node 24 soporta `--env-file`).
3. **DDL/migraciones: SOLO por el SQL Editor de Supabase.** El `SUPABASE_ACCESS_TOKEN` del `.env` está **malformado** (no es un `sbp_...` válido) → Management API rota. El host Postgres directo `db.<ref>.supabase.co` **no resuelve** desde el entorno (IPv6-only). La ruta REST/service_role (`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`) **sí funciona** para SELECT/rpc/verificación. Ver `.claude` memory `db-ddl-apply-path`.
4. **Grants de funciones en Supabase:** `REVOKE ... FROM PUBLIC` NO cubre `anon`/`authenticated` (default privileges los GRANTean). Revocá esos roles explícitamente. Pero NUNCA revoques los helpers que usan las policies RLS (`auth_negocio_ids`/`auth_tenant_id`) — RLS los evalúa con el rol que consulta y se rompe. Ver memory `supabase-function-grants`.

---

## Pendientes operativos (no bloqueantes)

1. **Cleanup de secretos huérfanos de Vault** (creados por probes de la auditoría; no borrables por REST porque `vault` no está expuesto). Correr en el **SQL Editor**:
   ```sql
   delete from vault.secrets where name='uat-probe-nonexistent' or name='anon-probe'
      or name like 'secaudit-%' or name like 'whatsapp-token-verify-%';
   ```
   (Ningún `negocio.whatsapp_token_secret_id` apunta a estos — todos quedaron NULL.)
2. **Stash trivial pendiente**: `stash@{0}` (un newline en `config.json` de cuando se cambió de rama). Inofensivo — `git stash drop` cuando quieras.

---

## Plan sugerido para la próxima sesión (en orden)

1. **Arreglar el bug core**: `/gsd:debug continue responder-history-drops-user-messages` → fix + test que verifique persistencia del mensaje del usuario. **(Máxima prioridad — rompe el core value.)**
2. Marcar `resolved` la sesión `responder-empty-text-after-tool-call` (el fix ya está en código).
3. Cerrar verificaciones de fase: `/gsd:verify-work 6`, resolver fase 04 `human_needed`, y generar/registrar verificación de fase 07 (UAT + SECURITY ya hechos).
4. (Opcional) `/gsd:validate-phase 1` y `/gsd:validate-phase 5` para Nyquist.
5. Tildar los 10 requirements en `REQUIREMENTS.md` (tracking lag; confirmar SADMIN de 02-08).
6. Re-correr `/gsd:audit-milestone 1.0` → cuando dé `passed`/`tech_debt` aceptable → `/gsd:complete-milestone 1.0`.
7. Correr el cleanup de Vault (SQL de arriba).

---

## Referencias rápidas
- Scripts de verificación live: `scripts/verify-vault-no-plaintext.ts`, `scripts/verify-vault-wrappers-anon-denied.ts`, `scripts/verify-concurrent-booking.ts`, `scripts/verify-isolation.ts`, `apps/bot/src/db/negocioScoped.test.ts`.
- Migraciones de seguridad: `supabase/migrations/0005_whatsapp_token_vault.sql`, `0006_revoke_vault_wrappers_from_anon.sql`, `0007_restore_auth_helper_grants.sql` (las tres aplicadas).
- Seguridad fase 7: `.planning/phases/07-hardening-y-listo-para-produccion/07-SECURITY.md`.
- Memorias relevantes: `db-ddl-apply-path`, `supabase-function-grants`, `client-search-ux-concern`.
