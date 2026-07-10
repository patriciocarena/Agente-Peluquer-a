---
phase: 07-hardening-y-listo-para-produccion
plan: 03
subsystem: security
tags: [supabase-vault, whatsapp, rpc, security-definer, live-verification]

# Dependency graph
requires:
  - phase: 07-01
    provides: "migración 0005 aplicada en vivo (whatsapp_token_secret_id, RPCs get_whatsapp_token/set_whatsapp_token_secret)"
  - phase: 07-02
    provides: "call-sites (getWhatsappToken.ts, admin-tenants.ts) migrados a la API de Vault"
provides:
  - "Prueba live de SEC-01 Success Criterion #1: el token de WhatsApp está encriptado en reposo y se resuelve vía Vault"
  - "scripts/verify-vault-no-plaintext.ts — script gated reutilizable para futuras verificaciones live"
affects: [08-produccion, security-hardening]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Script gated live sigue el esqueleto de scripts/verify-reschedule.ts (guard de aislamiento inline, assert() con exit 1, cleanup() idempotente)"

key-files:
  created: [scripts/verify-vault-no-plaintext.ts]
  modified: []

key-decisions:
  - "Invocación correcta en este entorno: node --env-file=.env --import tsx scripts/verify-vault-no-plaintext.ts (pnpm no está en PATH; tsx no autocarga .env) — se documentó como deviation, no como fallo del script"
  - "delete process.env.WHATSAPP_DEV_TOKEN se ejecuta ANTES del import dinámico de getWhatsappToken.ts para que loadEnv() nunca vea la env var (Pitfall 5)"

patterns-established:
  - "Import dinámico cross-workspace desde scripts/ hacia apps/bot/src/*.js (ya establecido por scripts/verify-whatsapp-webhook.ts) — reutilizado para getWhatsappToken.ts"

requirements-completed: [SEC-01]

# Metrics
duration: 12min
completed: 2026-07-10
---

# Phase 07 Plan 03: Verificación live de SEC-01 (Vault, no-plaintext) Summary

**Script gated `verify-vault-no-plaintext.ts` corrido en vivo contra bdgufnitakelyialjoqg: confirma que `negocio` no expone ningún token en claro y que `getWhatsappToken` resuelve el valor real vía el RPC `get_whatsapp_token` (Supabase Vault), con `WHATSAPP_DEV_TOKEN` unset.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-07-10T00:00:00Z (aprox.)
- **Completed:** 2026-07-10T00:12:00Z (aprox.)
- **Tasks:** 2 (1 auto + 1 checkpoint:human-verify, ejecutado por el executor per contexto de sesión)
- **Files modified:** 1

## Accomplishments
- Creado `scripts/verify-vault-no-plaintext.ts`: guard de aislamiento inline, 3 asserts (no-plaintext SELECT, set_whatsapp_token_secret devuelve uuid, getWhatsappToken resuelve el valor real vía Vault), cleanup idempotente.
- Corrida live real contra `bdgufnitakelyialjoqg` (no mockeada): **exit 0, PASSED**.
- Confirmado post-run, con una query independiente, que `negocio.whatsapp_token_secret_id` quedó en `NULL` para el negocio seed (TENANT_A) — la DB quedó limpia.
- SEC-01 Success Criterion #1 ("el token de WhatsApp está encriptado en reposo") queda probado en vivo, no solo por unit tests mockeados de 07-02.

## Task Commits

Cada task se commiteó atómicamente:

1. **Task 1: Escribir scripts/verify-vault-no-plaintext.ts (gated, live)** - `95365dd` (feat)
2. **Task 2: Correr verify-vault-no-plaintext.ts en vivo contra bdgufnitakelyialjoqg** - sin commit de código (el script no cambió; solo se ejecutó). Ver salida completa abajo.

**Plan metadata:** (a agregar tras este commit)

## Live Run Output (Task 2 — real, no simulado)

Comando ejecutado (invocación adaptada al entorno — ver Deviations):
```
node --env-file=.env --import tsx scripts/verify-vault-no-plaintext.ts
```

Salida completa:
```
OK: el SELECT directo a negocio no expone ningún token en claro (solo whatsapp_token_secret_id).
OK: set_whatsapp_token_secret devolvió un uuid de secret (790522ef-2de4-4533-a6d2-411a48198353).
OK: getWhatsappToken resolvió el token real vía Vault (RPC get_whatsapp_token), con WHATSAPP_DEV_TOKEN unset.
OK: whatsapp_token_secret_id vuelto a NULL para el negocio de prueba.

verify-vault-no-plaintext.ts: PASSED
```

**Exit code: 0** (confirmado con `echo "EXIT_CODE=$?"` inmediatamente después de la corrida).

Verificación independiente post-run (query separada, fuera del script) confirma DB limpia:
```json
{"data":{"id":"21111111-1111-1111-1111-111111111111","whatsapp_token_secret_id":null},"error":null}
```

## Files Created/Modified
- `scripts/verify-vault-no-plaintext.ts` - Script gated live: no-plaintext SELECT assert + set_whatsapp_token_secret + resolución real vía getWhatsappToken/Vault + cleanup.

## Decisions Made
- Invocación real usada: `node --env-file=.env --import tsx scripts/verify-vault-no-plaintext.ts`, no el `pnpm exec tsx ...` documentado en el plan — porque en este entorno `pnpm` no está en PATH y `tsx` no autocarga `.env`. Documentado en el header-comment del propio script para futuras corridas.
- `delete process.env.WHATSAPP_DEV_TOKEN` se ejecuta antes del `await import(...)` dinámico de `getWhatsappToken.ts` (no solo antes de invocarlo), para que ni `loadEnv()` ni ningún código de módulo top-level llegue a ver la env var seteada — más estricto que el mínimo pedido por el plan, sin cambiar el comportamiento esperado.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Invocación de ejecución distinta a la documentada en el plan**
- **Found during:** Task 2 (correspondería a la corrida live)
- **Issue:** El plan documenta `pnpm exec tsx scripts/verify-vault-no-plaintext.ts`. En este entorno `pnpm` no está en PATH y `tsx` standalone no carga `.env` automáticamente — esa invocación habría fallado con env vars faltantes, no por un bug del script.
- **Fix:** Se usó `node --env-file=.env --import tsx scripts/verify-vault-no-plaintext.ts` (Node 24 soporta `--env-file` nativo; hay un `tsx` local en `node_modules`). Documentado en el header-comment del script.
- **Files modified:** scripts/verify-vault-no-plaintext.ts (solo el comment de invocación)
- **Verification:** Corrida real con esa invocación → exit 0, PASSED (ver Live Run Output arriba).
- **Committed in:** 95365dd (parte del commit de Task 1, el comment ya incluía la invocación correcta desde el principio)

---

**Total deviations:** 1 auto-fixed (1 blocking, sobre cómo invocar el script — no sobre su lógica)
**Impact on plan:** Ninguno sobre el resultado; el script funcionó exactamente como estaba escrito. Solo cambió el comando de invocación documentado, por restricciones del entorno de ejecución (no de `.env`, que sí existe y está correctamente configurado).

## Issues Encountered
None - el script pasó en la primera corrida real, sin necesidad de debugging.

## User Setup Required
None - no se requiere configuración de servicio externo adicional (el `.env` con `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` ya existía y apunta correctamente a `bdgufnitakelyialjoqg`).

## Next Phase Readiness
- SEC-01 Success Criterion #1 queda probado en vivo — no quedan checkpoints pendientes de esta plan.
- El script `scripts/verify-vault-no-plaintext.ts` queda disponible como smoke test repetible para futuras verificaciones de regresión sobre el camino Vault.
- Ningún blocker para continuar con el resto de Phase 07.

---
*Phase: 07-hardening-y-listo-para-produccion*
*Completed: 2026-07-10*

## Self-Check: PASSED
- FOUND: scripts/verify-vault-no-plaintext.ts
- FOUND: commit 95365dd
- FOUND: .planning/phases/07-hardening-y-listo-para-produccion/07-03-SUMMARY.md
