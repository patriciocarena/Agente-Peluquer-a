# Phase 7: Hardening y listo para producción - Context

**Gathered:** 2026-07-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Blindar los tres puntos de mayor riesgo antes de que entre el primer tenant real a
producción, sin agregar capacidades de producto nuevas:

- **SEC-01** — encriptar en reposo los tokens de acceso de WhatsApp de cada negocio.
- **SEC-02** — probar con un test de carga concurrente que la constraint anti-doble-reserva
  (GiST `23P01`) se sostiene bajo reservas simultáneas al mismo slot.
- **SEC-03** — probar con un test de aislamiento cross-tenant que las queries `service_role`
  del bot (que bypassan RLS) nunca devuelven datos de otro negocio.

Fuera de scope: montar CI (`.github/workflows`), rate-limiting adicional, rotación
automatizada de secretos, y cualquier feature de producto. Ver Deferred Ideas.
</domain>

<decisions>
## Implementation Decisions

### SEC-01 — Encriptación de tokens de WhatsApp (Supabase Vault)
- **D-01:** El mecanismo es **Supabase Vault** (`vault.create_secret` / `vault.decrypted_secrets`),
  NO AES-GCM a nivel app. Decisión LOCKED — ver `07-SEC-01-DECISION.md` para rationale.
- **D-02:** Implementar el **flujo Vault completo ahora** (no solo el mecanismo + test).
  Como hoy no hay tokens reales (todos `null`/placeholder), no hay datos que migrar → bajo
  riesgo y deja el sistema production-ready. Incluye:
  (a) migración: `negocio` deja de tener el token en claro; se guarda un
      `whatsapp_token_secret_id` (uuid) que referencia el secreto en Vault; deprecar/dropear
      la columna plana `whatsapp_token`;
  (b) escritura: el panel superadmin (`admin-tenants.ts`) crea el secreto vía
      `vault.create_secret` y guarda el `secret_id`;
  (c) lectura: el bot (`getWhatsappToken.ts`) resuelve el token vía `vault.decrypted_secrets`
      con el service_role;
  (d) verificación: test que confirme que un `SELECT` directo a `negocio` NO devuelve el
      token en claro (solo el `secret_id`).

### SEC-02 — Test de concurrencia anti-doble-reserva
- **D-03:** Script **Node/TS con `Promise.all`** que dispara N reservas concurrentes al MISMO
  slot contra `bookAppointment` real (DB live), asertando **exactamente 1 éxito** y el resto
  `slot_taken` (camino `23P01` → `isSlotTakenConcurrently`). Ejercita directo la GiST
  existente; sin tooling externo (no k6/pgbench — el objetivo es correctitud bajo
  concurrencia, no throughput).

### SEC-03 — Test de aislamiento cross-tenant
- **D-04:** Test de **integración contra la DB live** con los 2 negocios/tenants seed:
  ejercita `negocioScoped` + las tools de lectura del bot con el contexto del negocio A y
  asserta **cero filas** del negocio B. Un unit mockeado NO sirve (mockearía la capa misma
  bajo prueba); como el service_role bypassa RLS, solo un test LIVE prueba el aislamiento.
  Extiende el patrón de `scripts/verify-isolation.ts` (fase 1).

### Ejecución de los tests (CI)
- **D-05:** SEC-02 y SEC-03 corren como **scripts `verify-*.ts` gated, a mano** (mismo patrón
  que fases previas: `verify-isolation.ts`, `verify-reschedule.ts`, `verify-whatsapp-webhook.ts`),
  contra la DB live usando las credenciales del `.env`, FUERA de la suite vitest mockeada.
  Cada script lleva el guard de aislamiento que aborta si `SUPABASE_URL` no apunta a
  `bdgufnitakelyialjoqg`. No se crea CI en esta fase.

### Claude's Discretion
- Nombres exactos de archivos/columnas, forma de la migración SQL, y detalles de cómo se
  parametriza N en el test de concurrencia — a criterio del planner/executor, respetando los
  patrones existentes.
- Si Vault requiere habilitar la extensión `supabase_vault` en `bdgufnitakelyialjoqg`, incluir
  ese paso (gated, ver 07-SEC-01-DECISION.md nota).
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### SEC-01 — Vault + wiring de tokens
- `.planning/phases/07-hardening-y-listo-para-produccion/07-SEC-01-DECISION.md` — decisión LOCKED (Vault) + esqueleto de implementación
- `apps/bot/src/whatsapp/getWhatsappToken.ts` — lectura actual del token (a migrar a Vault)
- `apps/dashboard/app/actions/admin-tenants.ts` — escritura del token desde el panel superadmin (a migrar a `vault.create_secret`)
- `CLAUDE.md` (secciones STACK "What NOT to Use" / Supabase Vault) — guía del proyecto sobre Vault vs pgsodium/TCE
- `supabase/migrations/` — ubicación de las migraciones (patrón para la migración de columna)

### SEC-02 — Concurrencia anti-doble-reserva
- `packages/availability-engine/src/booking.ts` — `bookAppointment` + `isSlotTakenConcurrently` (mapeo `23P01`→`slot_taken`)
- `scripts/verify-reschedule.ts` — patrón de script `verify-*.ts` gated contra DB live

### SEC-03 — Aislamiento cross-tenant
- `scripts/verify-isolation.ts` — patrón base del test de aislamiento (fase 1) a extender
- `apps/bot/src/db/negocioScoped.ts` — capa negocio-scoped que se ejercita (service_role, bypassa RLS)
- `apps/bot/src/db/client.ts` — cliente service_role del bot
- `.planning/phases/06-agente-conversacional-de-agendamiento/06-SECURITY.md` — verificación de amenazas de la fase 6 (T-06-05/08/14/17 tocan este aislamiento)

### Guardrail de proyecto
- `CLAUDE.md` — AISLAMIENTO DE PROYECTO: única DB es `bdgufnitakelyialjoqg`; nunca el restaurante `hzgunbftloevclkohcdf`
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `scripts/verify-isolation.ts` (fase 1): base directa para SEC-03 — ya carga env, tiene el
  guard de aislamiento a `bdgufnitakelyialjoqg`, y usa los 2 tenants seed.
- `scripts/verify-reschedule.ts` / `verify-whatsapp-webhook.ts`: patrón de script gated
  (exit 0/1 con detalle) para SEC-02.
- `bookAppointment` + `isSlotTakenConcurrently` (`booking.ts`): el camino `23P01` ya existe y
  está mapeado — SEC-02 solo tiene que ejercitarlo bajo concurrencia real.
- `negocioScoped(negocioId)` (`negocioScoped.ts`): la superficie exacta que SEC-03 debe probar.
- Seed de 2 tenants (fase 1, `scripts/apply-seed.ts` / `seed-fixtures.ts`) + owners seed.

### Established Patterns
- **verify-*.ts gated**: scripts que corren contra la DB live con guard de aislamiento
  (abortan si `SUPABASE_URL` no contiene `bdgufnitakelyialjoqg`), fuera de la suite vitest.
- **service_role bypassa RLS**: el aislamiento vive 100% en app-code (`negocioScoped`) — por
  eso SEC-03 tiene que ser live, no mockeado.

### Integration Points
- `negocio.whatsapp_token` (columna plana actual) → `negocio.whatsapp_token_secret_id` (ref a Vault).
- Escritura: `admin-tenants.ts` → `vault.create_secret`. Lectura: `getWhatsappToken.ts` → `vault.decrypted_secrets`.
</code_context>

<specifics>
## Specific Ideas

- SEC-02 debe asertar EXACTAMENTE 1 éxito bajo N reservas concurrentes al mismo slot (no
  "al menos 1"): el punto es que la GiST rechaza a todos menos uno.
- SEC-03 debe cubrir tanto lectura directa vía `negocioScoped` como al menos una tool de
  lectura del bot (ej. `consultarNegocio`/`buscarHorarios`) con contexto del negocio equivocado.
</specifics>

<deferred>
## Deferred Ideas

- **Montar CI (`.github/workflows`)** para correr los 220+ unit tests y los verify-*.ts
  automáticamente — infra nueva, su propio trabajo, fuera del scope de las 3 SEC. (Relacionado:
  el gating "nightly/on-change" de promptfoo/judge de la fase 6 también es hoy solo por
  convención por la falta de CI.)
- **Rotación automatizada de secretos** de WhatsApp — Vault soporta rotación (nuevo secreto +
  update del id), pero automatizarla es post-v1.
- **Rate-limiting adicional / hardening del webhook** más allá de lo ya hecho en la fase 5.

### Reviewed Todos (not folded)
None — discussion stayed within phase scope.
</deferred>

---

*Phase: 07-hardening-y-listo-para-produccion*
*Context gathered: 2026-07-09*
