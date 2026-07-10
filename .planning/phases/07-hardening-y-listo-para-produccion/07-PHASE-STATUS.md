---
phase: 07-hardening-y-listo-para-produccion
type: phase-summary
status: plans_complete_criteria_verified_live
plans: 5/5
requirements: [SEC-01, SEC-02, SEC-03]
created: 2026-07-09
updated: 2026-07-09

# Estado de los 3 Success Criteria de la fase
success_criteria:
  - id: SEC-01
    criterion: "Los tokens de acceso de WhatsApp de cada tenant están encriptados en la base (no legibles en una consulta directa a la tabla)"
    code_status: implemented
    live_verification: PASSED_2026-07-09  # exit 0
    script: scripts/verify-vault-no-plaintext.ts
    also: scripts/verify-vault-wrappers-anon-denied.ts  # PASSED — anon rechazado en ambos wrappers
  - id: SEC-02
    criterion: "Un test de carga con reservas concurrentes sobre el mismo slot confirma que solo una tiene éxito y el resto recibe un rechazo controlado"
    code_status: implemented
    live_verification: PASSED_2026-07-09  # 10 concurrentes -> 1 exito, 9 slot_taken via GiST 23P01
    script: scripts/verify-concurrent-booking.ts
  - id: SEC-03
    criterion: "Un test de aislamiento cross-tenant confirma que las consultas del bot (service_role) con el contexto del tenant A nunca devuelven filas del tenant B"
    code_status: implemented
    live_verification: PASSED_2026-07-09  # 12 accessors + tool consultarNegocio, 0 fugas, A->B y B->A
    script: apps/bot/src/db/negocioScoped.verify.ts
    also: scripts/verify-isolation.ts  # PASSED — RLS por owner, INSERT cross-tenant rechazado

verification_artifact: 07-VERIFICATION.md  # status: passed, 3/3 must-haves, 2026-07-09
---

# Fase 07 — Hardening y listo para producción · Resumen de fase

## Estado

**Los 5 planes están ejecutados y commiteados.** El UAT de la fase (`07-UAT.md`) dio 4/4 y
`07-SECURITY.md` quedó en `status: verified`, `threats_open: 0`.

**Los 3 Success Criteria están verificados en vivo** (2026-07-09, contra `bdgufnitakelyialjoqg`,
ref confirmado antes de ejecutar). Los 6 scripts dieron exit 0. Ver el frontmatter.

**`07-VERIFICATION.md` generado → `status: passed`, 3/3 must-haves, 0 behavior_unverified.**
La fase está cerrada. Queda un único ítem de higiene fuera del alcance de la fase: el cleanup de
secretos huérfanos en `vault.secrets`, que solo se puede hacer desde el SQL Editor.

| Plan | Qué entregó | Estado |
|------|-------------|--------|
| 07-01 | Migración `0005` — Vault + 2 wrappers `SECURITY DEFINER` + swap `negocio.whatsapp_token` → `whatsapp_token_secret_id` | Aplicada en vivo (sesión previa) |
| 07-02 | Call-sites (`getWhatsappToken.ts`, `admin-tenants.ts`) migrados a los RPC de Vault | Completo |
| 07-03 | `verify-vault-no-plaintext.ts` — prueba live de SEC-01 SC#1 | PASSED (sesión previa) |
| 07-04 | `verify-concurrent-booking.ts` — SEC-02, 3/3 corridas deterministas | PASSED (sesión previa) |
| 07-05 | `negocioScoped.verify.ts` extendido a los 12 accessors + tool `consultarNegocio` — SEC-03, 26/26 | PASSED (sesión previa) |

## Hallazgo de seguridad crítico de esta fase (ya cerrado)

`/gsd-secure-phase 7` encontró que los wrappers de Vault (`SECURITY DEFINER`) eran
**ejecutables con la clave `anon`**, que es pública. La fuga del token en claro se confirmó
en vivo. Causa: en Supabase, `REVOKE ALL FROM PUBLIC` **no** revoca de `anon`/`authenticated`
— los default privileges se los otorgan explícitamente.

- **Migración `0006`** → `REVOKE` de `anon`/`authenticated` sobre los wrappers de Vault.
- **Migración `0007`** → corrige una sobre-corrección de `0006`, que había revocado de más
  (`auth_negocio_ids` / `auth_tenant_id`) y roto las policies de RLS. **Nunca** revocar los
  helpers que RLS evalúa con el rol que consulta.

Ambas fueron aplicadas por el usuario en el SQL Editor y re-verificadas en la sesión previa.

## Sesión 2026-07-09 — qué se hizo sobre esta fase

**Verificado en vivo acá (pasó):**

- `corepack pnpm --filter @turnosbot/bot test -- --run` → **223/223 tests, 24/24 archivos, 0 skipped**.
- `corepack pnpm --filter @turnosbot/availability-engine test -- --run` → **61/61 tests, 7/7 archivos**.
- `npx tsc --noEmit` en `apps/bot` → **0 errores**, tras rebuildear el motor.

**También verificado acá (segunda tanda):** los 6 scripts gated, todos exit 0 — SEC-01,
SEC-01b (`anon` rechazado), SEC-02 (10 concurrentes → exactamente 1 éxito), SEC-03, RLS, y la
migración `0005` aplicada. Se confirmó además que el script de concurrencia limpia sus turnos.

**Corrección:** una versión previa de este archivo decía que Claude no podía correrlos "porque no
puede leer el `.env`". Falso: `node --env-file=.env --import tsx <script>.ts` los corre sin
problema. Lo que Claude no puede es DDL (SQL Editor) ni borrar de `vault.secrets` (no expuesto).

**Trampa de entorno descubierta:** `apps/bot` importa `@turnosbot/availability-engine` desde
`dist/`, que está gitignoreado. Tras un `git pull` que toque `packages/`, `tsc` reporta errores
fantasma (`startIso` no existe en `AvailableSlot`) que **no son bugs de código**. Los tests de
vitest no lo detectan porque no typechequean. Rebuildear antes de creerle a `tsc`:

```
corepack pnpm --filter @turnosbot/availability-engine build
```

## Trampa resuelta: la prueba de aislamiento parecía cubierta por CI y no lo estaba

El verificador de fase (W-01 de `07-VERIFICATION.md`) encontró que `negocioScoped.test.ts` —la
única prueba de SEC-03— era un script standalone (`main()` + `process.exit`) **explícitamente
excluido** en `apps/bot/vitest.config.ts`. No corría en `pnpm test` ni figuraba como "skipped".
Una suite verde no decía nada sobre el aislamiento entre negocios.

**Arreglado (2026-07-09):** renombrado a `apps/bot/src/db/negocioScoped.verify.ts`. El sufijo
`.verify.ts` no matchea el include `src/**/*.test.ts`, así que la entrada en `exclude` se eliminó.
Tras el cambio: vitest 223/223 sobre 24 archivos, `tsc` 0 errores, y el script pasa en vivo
(exit 0). Sigue siendo manual por diseño (toca la DB real), pero el nombre ya no miente:

```
node --env-file=.env --import tsx apps/bot/src/db/negocioScoped.verify.ts
```

## Para cerrar la fase formalmente

1. ~~Correr los scripts gated de SEC-01/02/03~~ → ✅ **hecho el 2026-07-09, los 6 pasaron.**
2. Generar `07-VERIFICATION.md` (`/gsd-verify-work 7`), apoyándose en `07-UAT.md` (4/4),
   `07-SECURITY.md` (`threats_open: 0`) y la evidencia en vivo del frontmatter de este archivo.
3. Correr el cleanup de secretos huérfanos de Vault en el SQL Editor (único ítem sucio;
   ver `HANDOFF-milestone-v1.md` sección 2.6).
