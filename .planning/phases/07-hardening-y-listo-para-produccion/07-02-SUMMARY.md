---
phase: 07-hardening-y-listo-para-produccion
plan: 02
subsystem: seguridad / hardening (secrets-at-rest, call-site migration)
tags: [sec-01, supabase-vault, security-definer, rpc, zod, vitest]

requires:
  - phase: 07-hardening-y-listo-para-produccion (plan 01)
    provides: "migración 0005 aplicada en vivo (whatsapp_token dropeada, whatsapp_token_secret_id + wrappers RPC get/set_whatsapp_token, db-types regenerado)"
provides:
  - "getWhatsappToken.ts (bot) resuelve el token exclusivamente vía .rpc('get_whatsapp_token')"
  - "admin-tenants.ts (dashboard) gana setWhatsappTokenSecret(negocioId, token) vía .rpc('set_whatsapp_token_secret')"
  - "Fixture + 3 scripts que referenciaban la columna dropeada whatsapp_token migrados a whatsapp_token_secret_id"
affects: [07-03, whatsapp-integration, dashboard-admin-panel]

tech-stack:
  added: []
  patterns:
    - "Ambos call-sites del token de WhatsApp (lectura en el bot, escritura en el dashboard) pasan exclusivamente por wrappers RPC SECURITY DEFINER hacia Supabase Vault -- nunca una columna plana"
    - "Validación de forma de UUID (regex 8-4-4-4-12) en vez de z.uuid() estricto para ids DB-generados que llegan a Server Actions -- mismo fix ya aplicado en uuidLike de @turnosbot/availability-engine/booking.ts (z.uuid() exige version 1-8 + variante 8/9/a/b y rechaza UUIDs reales)"
    - "Mocking del module-boundary local (../db/client.js, @/lib/supabase/admin) en vez del SDK completo de Supabase -- estos módulos tiran en tiempo de import sin env vars reales"

key-files:
  created:
    - apps/bot/src/whatsapp/getWhatsappToken.test.ts
    - apps/dashboard/app/actions/admin-tenants.test.ts
  modified:
    - apps/bot/src/whatsapp/getWhatsappToken.ts
    - apps/dashboard/app/actions/admin-tenants.ts
    - apps/dashboard/vitest.config.ts
    - packages/availability-engine/src/__fixtures__/rows.ts
    - scripts/apply-seed.ts
    - scripts/verify-admin-tenant-lifecycle.ts
    - scripts/verify-migration-0003.ts

key-decisions:
  - "setWhatsappTokenSecret no recibe tenantId en su firma (solo negocioId, per plan) -- revalidatePath usa '/admin' con type 'layout' en vez de adivinar la ruta del tenant."
  - "negocioId se valida con un regex de forma (8-4-4-4-12), no z.uuid() -- reusa el mismo fix de Fase 3 (uuidLike) para no rechazar UUIDs reales generados por Postgres/gen_random_uuid()."
  - "vitest.config.ts del dashboard ampliado de lib/** a también incluir app/**/*.test.ts -- era un blocker real: sin el glob, admin-tenants.test.ts nunca corría pese a existir."

patterns-established:
  - "Server Actions que necesitan tests unitarios mockeados siguen la convención: vi.mock del module-boundary local (createAdminClient / supabaseAdmin), import dinámico de la action, mock de next/cache para revalidatePath."

requirements-completed: [SEC-01]

duration: 18min
completed: 2026-07-09
---

# Phase 7 Plan 02: Call-sites del token de WhatsApp migrados a Vault vía RPC (SEC-01) Summary

**Los dos call-sites del token de la WhatsApp Cloud API (lectura en el bot, escritura en el dashboard) dejan de tocar cualquier columna en claro y pasan exclusivamente por los wrappers RPC `get_whatsapp_token`/`set_whatsapp_token_secret` de la migración 0005, con 7 tests unit mockeados verdes y el fold completo de los 4 sitios que 07-01 dejó rotos por el drop de `negocio.whatsapp_token`.**

## Performance

- **Duration:** ~18 min
- **Completed:** 2026-07-09
- **Tasks:** 3/3 completadas
- **Files modified:** 9 (2 nuevos, 7 modificados)

## Accomplishments

- `getWhatsappToken.ts` (bot) reemplaza `.from("negocio").select("whatsapp_token")` por `supabaseAdmin.rpc("get_whatsapp_token", { p_negocio_id })`; short-circuit `WHATSAPP_DEV_TOKEN` y firma pública intactos. 3 tests unit mockeados (happy/error/short-circuit) verdes.
- `admin-tenants.ts` (dashboard) pierde `whatsapp_token: null` de `negocioInsertPayload` (columna ya no existe) y gana `setWhatsappTokenSecret(negocioId, token)`, que valida y llama `.rpc("set_whatsapp_token_secret", { p_negocio_id, p_token, p_name })` siguiendo el shape `AdminActionResult<T>` del resto del archivo. 4 tests unit mockeados (happy/token vacío/negocioId inválido/error DB) verdes.
- Fold completo del GAP de scope dejado por 07-01: fixture `rows.ts` (rompía `tsc -b` de availability-engine) + 3 scripts (`apply-seed.ts`, `verify-admin-tenant-lifecycle.ts`, `verify-migration-0003.ts`) migrados de `whatsapp_token` a `whatsapp_token_secret_id`, conservando la intención anti-fuga original (D-04/T-02-24) expresada ahora como "el negocio recién creado no tiene un secreto de token asociado".
- `pnpm -r build` (todo el monorepo) compila limpio, incluido `apps/bot` (el TS2554 preexistente en `responder.ts` mencionado en 07-01-SUMMARY.md ya no reproduce -- resuelto en una fase posterior, fuera de scope de este plan).

## Task Commits

1. **Task 1: Migrar getWhatsappToken.ts a .rpc('get_whatsapp_token') + test unit mockeado** - `1f64f3f` (feat)
2. **Task 2: admin-tenants.ts — quitar la columna dropeada + action setWhatsappTokenSecret vía RPC + test mockeado** - `a6dfda4` (feat)
3. **Task 3: Foldeo 07-01 — actualizar fixture + scripts que aún referencian la columna dropeada whatsapp_token** - `0eb98dc` (fix)

_Sin commit de metadata separado en este resumen — se agrega en el paso final de state updates._

## Files Created/Modified

- `apps/bot/src/whatsapp/getWhatsappToken.ts` - lectura del token migrada a `.rpc("get_whatsapp_token", { p_negocio_id })`
- `apps/bot/src/whatsapp/getWhatsappToken.test.ts` - 3 tests unit mockeados (happy, error, short-circuit WHATSAPP_DEV_TOKEN)
- `apps/dashboard/app/actions/admin-tenants.ts` - `negocioInsertPayload` sin la columna dropeada; nueva action `setWhatsappTokenSecret`
- `apps/dashboard/app/actions/admin-tenants.test.ts` - 4 tests unit mockeados (happy, token vacío, negocioId inválido, error DB)
- `apps/dashboard/vitest.config.ts` - glob `include` ampliado a `app/**/*.test.ts` (bloqueaba que el test de arriba corriera)
- `packages/availability-engine/src/__fixtures__/rows.ts` - `makeNegocio()` usa `whatsapp_token_secret_id: null`
- `scripts/apply-seed.ts` - INSERT sin `whatsapp_token: null`; comentarios actualizados
- `scripts/verify-admin-tenant-lifecycle.ts` - INSERT sin `whatsapp_token: null`; chequeo anti-fuga sobre `whatsapp_token_secret_id`
- `scripts/verify-migration-0003.ts` - `verifyNegocio()` espera `whatsapp_token_secret_id`; comentarios notando el drop de 0005

## Decisions Made

- `setWhatsappTokenSecret` usa `revalidatePath("/admin", "layout")` en vez de `/admin/${tenantId}` porque la firma de la action (per plan) solo recibe `negocioId`, no `tenantId` — revalidar todo el árbol `/admin` es la opción segura sin adivinar la ruta exacta.
- Validación de `negocioId` con un regex de forma UUID (8-4-4-4-12) en vez de `z.uuid()` estricto de Zod — mismo fix ya aplicado en `uuidLike` (`@turnosbot/availability-engine/booking.ts`, Fase 3/T-03-15): `z.uuid()` exige versión 1-8 + variante 8/9/a/b y rechazaría negocioIds reales generados por `gen_random_uuid()` de Postgres que no calcen ese patrón exacto.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `z.uuid()` estricto rechazaba negocioId real de test en `setWhatsappTokenSecret`**
- **Found during:** Task 2 (test happy path de `admin-tenants.test.ts`)
- **Issue:** La validación inicial usaba `z.uuid("negocioId inválido.")`, que exige version 1-8 + variante 8/9/a/b en el UUID. El id de prueba `11111111-1111-1111-1111-111111111111` (mismo estilo que otros fixtures del repo) no cumple la variante, y el test happy-path fallaba con `{ error: "Revisá el token de WhatsApp." }` en vez de llamar al RPC.
- **Fix:** Reemplazado por un regex de forma-only (8-4-4-4-12), mismo patrón que `uuidLike` de `booking.ts` (ya establecido en el repo para este exacto problema, T-03-15).
- **Files modified:** `apps/dashboard/app/actions/admin-tenants.ts`
- **Verification:** Los 4 tests de `admin-tenants.test.ts` pasan.
- **Committed in:** `a6dfda4` (Task 2 commit)

**2. [Rule 3 - Blocking] `vitest.config.ts` del dashboard no incluía `app/**`**
- **Found during:** Task 2 (primer intento de correr `admin-tenants.test.ts`)
- **Issue:** El glob `include` de `apps/dashboard/vitest.config.ts` solo cubría `lib/**/*.test.ts` — el nuevo test bajo `app/actions/` nunca sería descubierto por `vitest run`, bloqueando la verificación del plan (`pnpm --filter @turnosbot/dashboard test -- admin-tenants`).
- **Fix:** Se agregó `"app/**/*.test.ts"` al array `include`.
- **Files modified:** `apps/dashboard/vitest.config.ts`
- **Verification:** `pnpm --filter @turnosbot/dashboard test -- admin-tenants` descubre y corre el archivo; suite completa del dashboard (`pnpm --filter @turnosbot/dashboard test`) sigue en 62/62 verdes.
- **Committed in:** `a6dfda4` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** Ambos fixes eran necesarios para que la Task 2 cumpliera su propio criterio de verificación tal como está escrito en el plan. Sin scope creep — ningún cambio arquitectónico ni de alcance.

## Issues Encountered

None — los 2 puntos arriba se resolvieron inline dentro del límite de auto-fix de las Reglas 1/3, sin necesidad de checkpoint.

## User Setup Required

None - no se requiere configuración externa. La verificación *en vivo* de Vault (que el RPC realmente decripta/encripta contra `bdgufnitakelyialjoqg`) queda para el script gated de 07-03, tal como especifica el `<objective>` del plan.

## Next Phase Readiness

- Los dos call-sites de SEC-01 quedan 100% en el camino RPC/Vault, con cobertura unit mockeada del wiring (call-site → `.rpc` con los args correctos).
- El comportamiento *live* (que el RPC realmente resuelva/rote un secreto real contra Vault) no fue ejercitado acá — es explícitamente el alcance de 07-03 (`scripts/verify-vault-no-plaintext.ts`, ya referenciado en 07-PATTERNS.md).
- Sin blockers para 07-03.

---
*Phase: 07-hardening-y-listo-para-produccion*
*Completed: 2026-07-09*
