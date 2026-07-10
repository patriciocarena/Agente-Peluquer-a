---
phase: 07
slug: hardening-y-listo-para-produccion
status: verified
threats_open: 0
asvs_level: 1
created: 2026-07-09
---

# Phase 07 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> **✅ VERIFIED: threats_open 0. El bypass anon de los wrappers Vault (T-07-01/T-07-02) fue cerrado por 0006, y la regresión RLS que introdujo 0006 fue corregida por 0007 — todo re-verificado en vivo.**

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Dump/SELECT directo a `negocio` → atacante | Post-0005 no hay columna plana de token | solo `whatsapp_token_secret_id` (uuid) |
| anon/authenticated (PostgREST) → RPC Vault wrappers | Restringido a service_role — CERRADO por 0006 (anon RECHAZADO, verificado) | token de WhatsApp en claro (alta sensibilidad) |
| bot (service_role) → RPC get/set_whatsapp_token | Único camino sancionado en runtime | token de WhatsApp |
| bot (service_role, negocioScoped) → tablas por negocio | Aislamiento en app-code (RLS no aplica a service_role) | datos por tenant |
| bookAppointment concurrente → GiST EXCLUDE | Integridad anti-doble-reserva | turnos |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-07-01 | Information Disclosure | camino de lectura del token (get_whatsapp_token) | mitigate | **CERRADO por 0006:** `REVOKE EXECUTE ... FROM anon, authenticated, PUBLIC`. Verificado en vivo: anon → `permission denied for function get_whatsapp_token`. Solo service_role puede leer. | closed |
| T-07-02 | Elevation of Privilege | wrappers `public.get/set_whatsapp_token*` | mitigate | **CERRADO por 0006:** revocado EXECUTE de anon/authenticated en get_ y set_. Verificado en vivo: ambos → `permission denied`. (0007 corrigió la regresión RLS que 0006 introdujo al revocar de más — ver abajo.) | closed |
| T-07-03 | Tampering (integridad) | doble-reserva bajo concurrencia | mitigate | GiST EXCLUDE `turno_no_overlap` (23P01): 10 reservas concurrentes → exactamente 1 gana / 9 slot_taken. Verificado en vivo (verify-concurrent-booking.ts, UAT test 3). | closed |
| T-07-03b | Tampering | falso verde por re-fetch de freshData | mitigate | freshData compartido por referencia (Pitfall 4); corrido 3× determinista. | closed |
| T-07-04 | Information Disclosure | fuga cross-negocio vía service_role (negocioScoped) | mitigate | 12 accessors + consultarNegocioTool sobre 2 tenants seed → cero filas del otro negocio. Verificado en vivo (negocioScoped.test.ts, UAT test 4). | closed |
| T-07-04b | Information Disclosure | extender el script equivocado | mitigate | Se extendió negocioScoped.test.ts (service_role), no verify-isolation.ts (RLS). | closed |
| T-07-01b | Information Disclosure | short-circuit WHATSAPP_DEV_TOKEN | accept | Override de dev intencional; test asserta que no toca el RPC; la verificación live corre con la var unset. | closed |
| T-07-05 | Information Disclosure | statement logging de Postgres al pasar el token a set_whatsapp_token_secret | accept | Diferido a antes del primer token real (Assumption A3). **NOTA: su severidad sube por T-07-02 — mientras anon pueda llamar set_, el token de argumento es aún más expuesto.** | open (accepted, deferred) |
| T-07-SC | Tampering | supply-chain (npm installs) | accept | Cero paquetes nuevos en la fase. | closed |

*Status: open · closed*

---

## ✅ Critical Finding — SEC-01 bypass vía anon (T-07-01 / T-07-02) — RESUELTO

**Resolución (2026-07-09):** migración **0006** revocó EXECUTE de anon/authenticated/PUBLIC
sobre los dos wrappers Vault. Migración **0007** corrigió una sobre-corrección de 0006 (que
había revocado también `auth_negocio_ids`/`auth_tenant_id`, rompiendo RLS — las policies se
evalúan con el rol que consulta, que necesita EXECUTE sobre esos helpers). Re-verificado en vivo:
`scripts/verify-vault-wrappers-anon-denied.ts` PASSED (anon rechazado), `scripts/verify-isolation.ts`
PASSED (RLS restaurada), `apps/bot/src/db/negocioScoped.test.ts` PASSED.

### Evidencia original del agujero (histórico)

**Evidencia live (2026-07-09, contra bdgufnitakelyialjoqg):**
- Con la `anon` key (pública, embebida en el bundle del dashboard como `NEXT_PUBLIC_SUPABASE_ANON_KEY`):
  - `anon.rpc("get_whatsapp_token", { p_negocio_id })` → **ejecutó** y, con un secreto seteado, **devolvió el token en claro** (`SENTINEL-TOKEN-…`).
  - `anon.rpc("set_whatsapp_token_secret", …)` → **ejecutó**, creó un secreto en `vault.secrets` y mutó `negocio.whatsapp_token_secret_id`.
- `anon.from("negocio").select()` → 0 filas (RLS sí protege las tablas). El agujero es exclusivamente el EXECUTE de las funciones.

**Causa raíz:** en Supabase, `anon`/`authenticated` reciben `EXECUTE` sobre funciones nuevas de `public` vía default privileges. `REVOKE ALL ON FUNCTION ... FROM PUBLIC` (lo que hizo 0005) **no** revoca de esos roles nombrados. El pattern es sistémico: `auth_negocio_ids`/`auth_tenant_id` (0003) también son anon-callable, pero son caller-scoped y devuelven vacío/null para anon (sin fuga) — riesgo bajo. El crítico son los wrappers Vault SECURITY DEFINER.

**Fix requerido (migración nueva, p. ej. 0006):**
```sql
REVOKE EXECUTE ON FUNCTION public.get_whatsapp_token(uuid) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_whatsapp_token_secret(uuid, text, text) FROM anon, authenticated, PUBLIC;
-- (service_role conserva su GRANT del 0005)
-- Defensa en profundidad (opcional, no filtran hoy):
REVOKE EXECUTE ON FUNCTION public.auth_negocio_ids() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.auth_tenant_id()  FROM anon, authenticated, PUBLIC;
```
Re-verificar con el probe anon (debe dar RECHAZADO en ambos wrappers) y re-correr `/gsd:secure-phase 7`.

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-01 | T-07-01b | Short-circuit WHATSAPP_DEV_TOKEN es override de dev documentado; verificaciones live corren con la var unset. | (plan 07-02, LOCKED) | 2026-07-09 |
| AR-02 | T-07-05 | Statement logging del token al llamar set_whatsapp_token_secret; diferido a antes del primer token real (A3). **Revisar junto con el fix de T-07-02.** | (plan 07-01) | 2026-07-09 |
| AR-03 | T-07-SC | Sin paquetes nuevos en la fase → sin superficie supply-chain. | (auto) | 2026-07-09 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-07-09 | 9 | 7 | 2 | secure-phase (live probe: anon token disclosure confirmada) |
| 2026-07-09 | 9 | 9 | 0 | secure-phase re-run tras 0006+0007 (anon rechazado + RLS restaurada, 3 verificaciones live PASSED) |

---

## Residuos de la auditoría (limpiar en SQL Editor)

Las pruebas live crearon secretos en `vault.secrets` (no borrables vía REST — vault no está expuesto):
```sql
delete from vault.secrets
 where name = 'uat-probe-nonexistent'
    or name = 'anon-probe'
    or name like 'secaudit-%'
    or name like 'whatsapp-token-verify-%';
```
Ningún `negocio.whatsapp_token_secret_id` quedó apuntando a estos (todos nulos tras cleanup).

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed — T-07-01/T-07-02 cerrados por 0006+0007, re-verificados en vivo
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-07-09 (tras 0006 + 0007). Pendiente operativo no bloqueante: aplicar el cleanup de secretos huérfanos de Vault (arriba) y, antes del primer token real, revisar T-07-05 (statement logging).
