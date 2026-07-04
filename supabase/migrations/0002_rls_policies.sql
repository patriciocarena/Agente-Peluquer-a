-- ============================================================================
-- TurnosBot — Migration 0002: RLS policies (dashboard tenant isolation)
-- ============================================================================
-- Enables Row Level Security on every tenant-scoped table created in
-- 0001_schema_core.sql, with ONE identical-shape policy per table (D-04).
--
-- CORE-01/CORE-02: no dashboard query can read/write another tenant's rows.
-- D-05/D-07: the tenant is resolved by reading the CALLER'S OWN `perfil` row
--   (id = auth.uid()), never from a token-embedded claim (avoids stale/
--   forgeable claims).
-- D-06: the elevated cross-tenant platform-operator role gets NO relaxed-RLS
--   branch anywhere in this file. Cross-tenant access for that role is
--   exclusively an app-gated service_role route (Phase 2) — service_role
--   bypasses RLS entirely by Postgres/Supabase design, so no policy is
--   needed (or wanted) for it here.
--
-- Threat model (T-03-01..T-03-04): this migration is the mitigation for
-- cross-tenant information disclosure and tenant-identity spoofing via the
-- dashboard path. The bot service's service_role path is NOT protected by
-- RLS at all (by design — see PITFALLS.md Pitfall 7); its isolation is
-- code-enforced in Plan 01-05 (tenantScoped helper), not here.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Tenant-resolver helper: SECURITY DEFINER, reads the caller's OWN perfil row
-- ----------------------------------------------------------------------------
-- Why SECURITY DEFINER over a raw subquery in every policy (Claude's
-- Discretion, D-07): a plain `tenant_id = (SELECT tenant_id FROM perfil WHERE
-- id = auth.uid())` subquery embedded in perfil's OWN policy would recurse
-- (a policy on perfil that queries perfil to evaluate itself). A SECURITY
-- DEFINER function sidesteps that self-reference cleanly and centralizes the
-- resolution logic in one place instead of duplicating the subquery across
-- 13+ policies.
--
-- Hardening: STABLE (same result within a statement, allows the planner to
-- cache it), a locked/empty search_path (prevents search_path hijacking of
-- this SECURITY DEFINER function — a classic Postgres privilege-escalation
-- vector, T-03-02), and EXECUTE granted only to `authenticated` (never to
-- `anon` or `public`).
CREATE OR REPLACE FUNCTION auth_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT tenant_id FROM public.perfil WHERE id = auth.uid();
$$;

REVOKE ALL ON FUNCTION auth_tenant_id() FROM public;
GRANT EXECUTE ON FUNCTION auth_tenant_id() TO authenticated;

-- ----------------------------------------------------------------------------
-- perfil — base case: a user may only read/write their OWN profile row.
-- This is the row auth_tenant_id() reads from, so it must be resolvable
-- directly from auth.uid() without depending on auth_tenant_id() itself.
-- ----------------------------------------------------------------------------
ALTER TABLE perfil ENABLE ROW LEVEL SECURITY;

CREATE POLICY perfil_propio ON perfil
  FOR ALL
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- ----------------------------------------------------------------------------
-- tenant — dashboard owners may only see/edit their own tenant row.
-- (Cross-tenant tenant management for the platform operator role is a
-- service_role app route, Phase 2 SADMIN — no RLS branch here per D-06.)
-- ----------------------------------------------------------------------------
ALTER TABLE tenant ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_aislamiento ON tenant
  FOR ALL
  TO authenticated
  USING (id = auth_tenant_id())
  WITH CHECK (id = auth_tenant_id());

-- ----------------------------------------------------------------------------
-- negocio
-- ----------------------------------------------------------------------------
ALTER TABLE negocio ENABLE ROW LEVEL SECURITY;

CREATE POLICY negocio_aislamiento ON negocio
  FOR ALL
  TO authenticated
  USING (tenant_id = auth_tenant_id())
  WITH CHECK (tenant_id = auth_tenant_id());

-- ----------------------------------------------------------------------------
-- profesional
-- ----------------------------------------------------------------------------
ALTER TABLE profesional ENABLE ROW LEVEL SECURITY;

CREATE POLICY profesional_aislamiento ON profesional
  FOR ALL
  TO authenticated
  USING (tenant_id = auth_tenant_id())
  WITH CHECK (tenant_id = auth_tenant_id());

-- ----------------------------------------------------------------------------
-- horario_trabajo
-- ----------------------------------------------------------------------------
ALTER TABLE horario_trabajo ENABLE ROW LEVEL SECURITY;

CREATE POLICY horario_trabajo_aislamiento ON horario_trabajo
  FOR ALL
  TO authenticated
  USING (tenant_id = auth_tenant_id())
  WITH CHECK (tenant_id = auth_tenant_id());

-- ----------------------------------------------------------------------------
-- servicio
-- ----------------------------------------------------------------------------
ALTER TABLE servicio ENABLE ROW LEVEL SECURITY;

CREATE POLICY servicio_aislamiento ON servicio
  FOR ALL
  TO authenticated
  USING (tenant_id = auth_tenant_id())
  WITH CHECK (tenant_id = auth_tenant_id());

-- ----------------------------------------------------------------------------
-- profesional_servicio
-- ----------------------------------------------------------------------------
ALTER TABLE profesional_servicio ENABLE ROW LEVEL SECURITY;

CREATE POLICY profesional_servicio_aislamiento ON profesional_servicio
  FOR ALL
  TO authenticated
  USING (tenant_id = auth_tenant_id())
  WITH CHECK (tenant_id = auth_tenant_id());

-- ----------------------------------------------------------------------------
-- cliente
-- ----------------------------------------------------------------------------
ALTER TABLE cliente ENABLE ROW LEVEL SECURITY;

CREATE POLICY cliente_aislamiento ON cliente
  FOR ALL
  TO authenticated
  USING (tenant_id = auth_tenant_id())
  WITH CHECK (tenant_id = auth_tenant_id());

-- ----------------------------------------------------------------------------
-- turno
-- ----------------------------------------------------------------------------
ALTER TABLE turno ENABLE ROW LEVEL SECURITY;

CREATE POLICY turno_aislamiento ON turno
  FOR ALL
  TO authenticated
  USING (tenant_id = auth_tenant_id())
  WITH CHECK (tenant_id = auth_tenant_id());

-- ----------------------------------------------------------------------------
-- turno_servicio
-- ----------------------------------------------------------------------------
ALTER TABLE turno_servicio ENABLE ROW LEVEL SECURITY;

CREATE POLICY turno_servicio_aislamiento ON turno_servicio
  FOR ALL
  TO authenticated
  USING (tenant_id = auth_tenant_id())
  WITH CHECK (tenant_id = auth_tenant_id());

-- ----------------------------------------------------------------------------
-- bloqueo
-- ----------------------------------------------------------------------------
ALTER TABLE bloqueo ENABLE ROW LEVEL SECURITY;

CREATE POLICY bloqueo_aislamiento ON bloqueo
  FOR ALL
  TO authenticated
  USING (tenant_id = auth_tenant_id())
  WITH CHECK (tenant_id = auth_tenant_id());

-- ----------------------------------------------------------------------------
-- conversacion — RLS enabled now though the table is unwired (D-02).
-- ----------------------------------------------------------------------------
ALTER TABLE conversacion ENABLE ROW LEVEL SECURITY;

CREATE POLICY conversacion_aislamiento ON conversacion
  FOR ALL
  TO authenticated
  USING (tenant_id = auth_tenant_id())
  WITH CHECK (tenant_id = auth_tenant_id());

-- ----------------------------------------------------------------------------
-- mensaje — RLS enabled now though the table is unwired (D-02).
-- ----------------------------------------------------------------------------
ALTER TABLE mensaje ENABLE ROW LEVEL SECURITY;

CREATE POLICY mensaje_aislamiento ON mensaje
  FOR ALL
  TO authenticated
  USING (tenant_id = auth_tenant_id())
  WITH CHECK (tenant_id = auth_tenant_id());

-- ----------------------------------------------------------------------------
-- recordatorio — RLS enabled now though the table is reserved for v2 (D-03).
-- ----------------------------------------------------------------------------
ALTER TABLE recordatorio ENABLE ROW LEVEL SECURITY;

CREATE POLICY recordatorio_aislamiento ON recordatorio
  FOR ALL
  TO authenticated
  USING (tenant_id = auth_tenant_id())
  WITH CHECK (tenant_id = auth_tenant_id());

-- ============================================================================
-- End of migration 0002_rls_policies.sql
--
-- Summary: RLS is enabled on all 14 tables from 0001_schema_core.sql. Every
-- tenant-scoped table (all except perfil, which uses id = auth.uid() as its
-- base case) shares the byte-for-byte identical predicate
-- `tenant_id = auth_tenant_id()` for both USING and WITH CHECK, FOR ALL,
-- role authenticated. No policy anywhere references a token-embedded claim
-- or an elevated-role branch — cross-tenant access for the platform
-- operator role is exclusively a service_role-gated application route
-- (Phase 2), never a relaxed RLS path.
--
-- The bot service's tenant isolation (service_role, bypasses RLS entirely)
-- is NOT covered by this file — it is enforced in application code via a
-- shared tenantScoped(tenantId) query layer (Plan 01-05, CORE-03).
-- ============================================================================
