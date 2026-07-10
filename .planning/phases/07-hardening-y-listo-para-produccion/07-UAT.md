---
status: complete
phase: 07-hardening-y-listo-para-produccion
source:
  - 07-01-SUMMARY.md
  - 07-02-SUMMARY.md
  - 07-03-SUMMARY.md
  - 07-04-SUMMARY.md
  - 07-05-SUMMARY.md
started: 2026-07-09T00:00:00Z
updated: 2026-07-09T00:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: Con 0005 aplicada, el bot arranca sin errores desde cero y una query primaria a bdgufnitakelyialjoqg devuelve datos; negocio ya no tiene whatsapp_token (solo whatsapp_token_secret_id) y existen los 2 wrappers RPC.
result: pass
note: |
  Verificado vía REST/service_role: primary query OK (3 negocios vivos), schema correcto
  (whatsapp_token dropeada, whatsapp_token_secret_id presente), ambos RPC existen.
  Side-effect: el probe de existencia de set_whatsapp_token_secret (llamado con negocio_id
  inexistente) creó un secreto huérfano en vault.secrets llamado "uat-probe-nonexistent"
  (no linkeado a ningún negocio, inofensivo). Cleanup pendiente en SQL Editor:
  `delete from vault.secrets where name = 'uat-probe-nonexistent';`

### 2. SEC-01 — Token de WhatsApp cifrado en reposo (Vault)
expected: |
  `node --env-file=.env --import tsx scripts/verify-vault-no-plaintext.ts` termina en
  exit 0 (PASSED): un SELECT directo a `negocio` NO expone ningún token en claro (solo
  whatsapp_token_secret_id); tras setear un secreto vía set_whatsapp_token_secret, el bot
  resuelve el valor real vía el RPC get_whatsapp_token (con WHATSAPP_DEV_TOKEN unset); deja
  la DB limpia.
result: pass
note: |
  Corrido en vivo → exit 0 PASSED, whatsapp_token_secret_id vuelto a NULL. Hygiene menor
  (no bloqueante): el script deja el secreto que crea en vault.secrets (whatsapp-token-verify-<ts>)
  sin borrar — el cleanup solo nulea el FK. Cada corrida acumula un huérfano inofensivo.

### 3. SEC-02 — Anti-doble-reserva concurrente (GiST EXCLUDE)
expected: |
  `node --env-file=.env --import tsx scripts/verify-concurrent-booking.ts` → de 10 reservas
  concurrentes al MISMO slot, exactamente 1 gana y 9 devuelven slot_taken (23P01), decidido
  por la exclusión GiST, no por el chequeo en memoria. Determinista en corridas repetidas.
result: pass
note: Corrido en vivo → exit 0 PASSED (1 éxito / 9 slot_taken vía 23P01). Script re-seedeable, deja estado limpio.

### 4. SEC-03 — Aislamiento cross-negocio (negocioScoped)
expected: |
  Los 12 accessors negocio-scoped + consultarNegocioTool nunca devuelven filas de otro
  negocio (cero fugas cross-negocio).
result: pass
note: |
  Comando correcto es `node --env-file=.env --import tsx apps/bot/src/db/negocioScoped.test.ts`
  (NO vitest — está excluido a propósito del runner por ser smoke test live con main()/process.exit,
  documentado en apps/bot/vitest.config.ts). Corrido en vivo → exit 0 PASSED, los 12 accessors de
  A y B + consultarNegocio(A) sin ninguna fila del otro negocio.

## Summary

total: 4
passed: 4
issues: 0
pending: 0
skipped: 0

## Gaps

[none yet]
