-- ============================================================================
-- TurnosBot — Seed data: two isolated test tenants (D-16, Plan 01-05)
-- ============================================================================
-- Purpose: materialize at least TWO fake/sandbox tenants with owners, so that
-- cross-tenant RLS isolation (CORE-01/CORE-02), timezone round-trip (CORE-04),
-- and DB-level double-booking rejection (CORE-05) can be verified against the
-- LIVE database, not just structurally reviewed.
--
-- Project isolation: this file targets ONLY the TurnosBot Supabase project
-- (bdgufnitakelyialjoqg). It must NEVER reference or be applied to any other,
-- unrelated Supabase project or its tables. See ./CLAUDE.md for the full
-- project-isolation rule.
--
-- Data is 100% fake/sandbox:
--   - whatsapp_phone_number_id values are synthetic (fake-*), NOT real Meta IDs.
--   - whatsapp_token is NULL for both tenants (SEC-01 encryption is Phase 7;
--     no real WhatsApp token is ever seeded here).
--
-- Execution note: this environment has no psql / Supabase CLI / SUPABASE_DB_URL
-- access. This SQL is the canonical, reviewable seed definition. It is applied
-- to the live DB via the equivalent supabase-js (service_role) script at
-- scripts/apply-seed.ts, which performs the same inserts through the
-- `@supabase/supabase-js` client (see Plan 01-05 environment adaptations).
-- Two Supabase Auth users (the owners) are created via
-- `supabaseAdmin.auth.admin.createUser(...)` in that script, since Auth users
-- cannot be created via plain SQL INSERT against auth.users.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Tenant A — "Barbería Norte"
-- ----------------------------------------------------------------------------
INSERT INTO tenant (id, whatsapp_phone_number_id, waba_id, whatsapp_token, display_phone_number, activo)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  'fake-phone-number-id-norte',
  'fake-waba-id-norte',
  NULL,
  '+54 9 11 0000-0001',
  true
);

INSERT INTO negocio (id, tenant_id, nombre, direccion, telefono, timezone, granularidad_min)
VALUES (
  '21111111-1111-1111-1111-111111111111',
  '11111111-1111-1111-1111-111111111111',
  'Barbería Norte',
  'Av. Siempre Viva 123, CABA',
  '+54 9 11 0000-0001',
  'America/Argentina/Buenos_Aires',
  30
);

-- perfil row for the owner is inserted by scripts/apply-seed.ts once the
-- Supabase Auth user is created (id = auth user id, cannot be predicted here).

INSERT INTO profesional (id, tenant_id, nombre, activo)
VALUES (
  '31111111-1111-1111-1111-111111111111',
  '11111111-1111-1111-1111-111111111111',
  'Fede (Norte)',
  true
);

INSERT INTO servicio (id, tenant_id, nombre, descripcion, precio, duracion_min, orden, activo)
VALUES
  ('41111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'Corte clásico', 'Corte de pelo estándar', 6000.00, 30, 0, true),
  ('42111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'Corte + Barba', 'Corte y arreglo de barba', 9000.00, 45, 1, true);

INSERT INTO cliente (id, tenant_id, telefono, nombre)
VALUES (
  '51111111-1111-1111-1111-111111111111',
  '11111111-1111-1111-1111-111111111111',
  '+5491100000010',
  'Cliente Norte'
);

-- turno at 15:00 America/Argentina/Buenos_Aires (fixed UTC-3) == 18:00Z (CORE-04).
INSERT INTO turno (id, tenant_id, profesional_id, cliente_id, inicio, fin, estado, precio_total)
VALUES (
  '61111111-1111-1111-1111-111111111111',
  '11111111-1111-1111-1111-111111111111',
  '31111111-1111-1111-1111-111111111111',
  '51111111-1111-1111-1111-111111111111',
  '2026-07-10T18:00:00Z',
  '2026-07-10T18:30:00Z',
  'confirmado',
  6000.00
);

-- ----------------------------------------------------------------------------
-- Tenant B — "Barbería Sur"
-- ----------------------------------------------------------------------------
INSERT INTO tenant (id, whatsapp_phone_number_id, waba_id, whatsapp_token, display_phone_number, activo)
VALUES (
  '12222222-2222-2222-2222-222222222222',
  'fake-phone-number-id-sur',
  'fake-waba-id-sur',
  NULL,
  '+54 9 11 0000-0002',
  true
);

INSERT INTO negocio (id, tenant_id, nombre, direccion, telefono, timezone, granularidad_min)
VALUES (
  '22222222-2222-2222-2222-222222222222',
  '12222222-2222-2222-2222-222222222222',
  'Barbería Sur',
  'Calle Falsa 456, CABA',
  '+54 9 11 0000-0002',
  'America/Argentina/Buenos_Aires',
  30
);

INSERT INTO profesional (id, tenant_id, nombre, activo)
VALUES (
  '32222222-2222-2222-2222-222222222222',
  '12222222-2222-2222-2222-222222222222',
  'Gonzalo (Sur)',
  true
);

INSERT INTO servicio (id, tenant_id, nombre, descripcion, precio, duracion_min, orden, activo)
VALUES
  ('42222222-2222-2222-2222-222222222222', '12222222-2222-2222-2222-222222222222', 'Corte clásico', 'Corte de pelo estándar', 6500.00, 30, 0, true),
  ('43222222-2222-2222-2222-222222222222', '12222222-2222-2222-2222-222222222222', 'Perfilado de barba', 'Perfilado y arreglo de barba', 4000.00, 20, 1, true);

INSERT INTO cliente (id, tenant_id, telefono, nombre)
VALUES (
  '52222222-2222-2222-2222-222222222222',
  '12222222-2222-2222-2222-222222222222',
  '+5491100000020',
  'Cliente Sur'
);

INSERT INTO turno (id, tenant_id, profesional_id, cliente_id, inicio, fin, estado, precio_total)
VALUES (
  '62222222-2222-2222-2222-222222222222',
  '12222222-2222-2222-2222-222222222222',
  '32222222-2222-2222-2222-222222222222',
  '52222222-2222-2222-2222-222222222222',
  '2026-07-10T18:00:00Z',
  '2026-07-10T18:30:00Z',
  'confirmado',
  6500.00
);

-- ============================================================================
-- End of supabase/seed.sql
-- Owners (Supabase Auth users + matching `perfil` rows, rol='owner') are
-- created by scripts/apply-seed.ts, which applies this exact seed live via
-- @supabase/supabase-js (service_role), since Auth users cannot be created by
-- plain SQL INSERT and this environment has no direct Postgres/psql access.
-- ============================================================================
