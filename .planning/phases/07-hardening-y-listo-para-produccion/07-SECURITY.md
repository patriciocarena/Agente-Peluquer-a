---
phase: 07
slug: hardening-y-listo-para-produccion
status: blocked
threats_open: 2
asvs_level: 1
created: 2026-07-09
---

# Phase 07 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> **⚠️ BLOCKED: 2 threats OPEN — critical anon-executable Vault wrappers (SEC-01 defeated).**

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Dump/SELECT directo a `negocio` → atacante | Post-0005 no hay columna plana de token | solo `whatsapp_token_secret_id` (uuid) |
| **anon/authenticated (PostgREST) → RPC Vault wrappers** | **DEBE estar restringido a service_role — HOY NO LO ESTÁ** | **token de WhatsApp en claro (alta sensibilidad)** |
| bot (service_role) → RPC get/set_whatsapp_token | Único camino sancionado en runtime | token de WhatsApp |
| bot (service_role, negocioScoped) → tablas por negocio | Aislamiento en app-code (RLS no aplica a service_role) | datos por tenant |
| bookAppointment concurrente → GiST EXCLUDE | Integridad anti-doble-reserva | turnos |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-07-01 | Information Disclosure | camino de lectura del token (get_whatsapp_token) | mitigate | **FALLA: el wrapper es SECURITY DEFINER y `anon` puede ejecutarlo → devuelve el token en claro. Fuga CONFIRMADA en vivo (anon leyó un SENTINEL token).** | **open** |
| T-07-02 | Elevation of Privilege | wrappers `public.get/set_whatsapp_token*` | mitigate | **FALLA: `REVOKE ALL FROM PUBLIC` no revoca de los roles `anon`/`authenticated` (default privileges de Supabase los GRANTean). Anon ejecutó get_ (lectura) Y set_ (creó un secreto). Falta `REVOKE EXECUTE ... FROM anon, authenticated`.** | **open** |
| T-07-03 | Tampering (integridad) | doble-reserva bajo concurrencia | mitigate | GiST EXCLUDE `turno_no_overlap` (23P01): 10 reservas concurrentes → exactamente 1 gana / 9 slot_taken. Verificado en vivo (verify-concurrent-booking.ts, UAT test 3). | closed |
| T-07-03b | Tampering | falso verde por re-fetch de freshData | mitigate | freshData compartido por referencia (Pitfall 4); corrido 3× determinista. | closed |
| T-07-04 | Information Disclosure | fuga cross-negocio vía service_role (negocioScoped) | mitigate | 12 accessors + consultarNegocioTool sobre 2 tenants seed → cero filas del otro negocio. Verificado en vivo (negocioScoped.test.ts, UAT test 4). | closed |
| T-07-04b | Information Disclosure | extender el script equivocado | mitigate | Se extendió negocioScoped.test.ts (service_role), no verify-isolation.ts (RLS). | closed |
| T-07-01b | Information Disclosure | short-circuit WHATSAPP_DEV_TOKEN | accept | Override de dev intencional; test asserta que no toca el RPC; la verificación live corre con la var unset. | closed |
| T-07-05 | Information Disclosure | statement logging de Postgres al pasar el token a set_whatsapp_token_secret | accept | Diferido a antes del primer token real (Assumption A3). **NOTA: su severidad sube por T-07-02 — mientras anon pueda llamar set_, el token de argumento es aún más expuesto.** | open (accepted, deferred) |
| T-07-SC | Tampering | supply-chain (npm installs) | accept | Cero paquetes nuevos en la fase. | closed |

*Status: open · closed*

---

## 🔴 Critical Finding — SEC-01 bypass vía anon (T-07-01 / T-07-02)

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
- [ ] `threats_open: 0` confirmed — **NO: 2 open (T-07-01, T-07-02)**
- [ ] `status: verified` set in frontmatter — **blocked**

**Approval:** BLOCKED — fix T-07-01/T-07-02 (migración 0006: REVOKE de anon/authenticated) y re-correr /gsd:secure-phase 7.
