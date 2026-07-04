-- ============================================================================
-- TurnosBot — Migration 0001: Core schema (14 tables)
-- ============================================================================
-- Materializes the COMMITTED reference schema: the user's "16 tables" reduced
-- to 14 in the `public` schema, because ADMIN_USER and SUPER_ADMIN (which
-- hand-managed password_hash) are REPLACED by Supabase Auth (auth.users,
-- Supabase-managed, not created here) + the `perfil` table below (D-01, D-05).
--
-- Project isolation: this file belongs ONLY to the TurnosBot Supabase
-- project. It must NEVER be applied to, or reference, any other unrelated
-- project or its tables/schema. Greenfield, built from REQUIREMENTS.md only.
--
-- Naming convention: Spanish domain names (tenant excepted — "tenant" is the
-- platform/infra concept; all business-domain tables use Spanish: negocio,
-- profesional, servicio, turno, bloqueo, cliente, etc.)
--
-- Scope note (D-02/D-03): conversacion, mensaje, and recordatorio are created
-- now with full structure + tenant_id (RLS wired in migration 0002) but are
-- NOT wired to any application logic yet — that happens in Phase 5 (WA) and
-- Phase 6 (BOT). recordatorio is reserved for v2 (REMIND-01) — no worker.
--
-- Live-DB push is Plan 01-04. This migration only authors SQL.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Extensions
-- ----------------------------------------------------------------------------
-- btree_gist: required for the EXCLUDE USING gist anti-double-booking
-- constraint on turno (equality operator on profesional_id combined with
-- range-overlap operator on tstzrange) — Pitfall 2.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- pgcrypto: gen_random_uuid() for primary keys.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- 1. tenant — WhatsApp/platform-level config per peluquería (Cloud API routing)
-- ============================================================================
CREATE TABLE tenant (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  whatsapp_phone_number_id text UNIQUE,        -- Meta-assigned opaque ID; the ONLY
                                                -- valid webhook routing key (Pitfall 5,
                                                -- never route by display_phone_number).
  waba_id text,                                -- WhatsApp Business Account ID (SADMIN-02).
  -- whatsapp_token: plaintext column for now. Encryption at rest (Supabase Vault
  -- or AES-GCM) is explicitly DEFERRED to Phase 7 / SEC-01. Do NOT wire real
  -- tenant tokens against this column outside of hardening-phase safeguards.
  whatsapp_token text,
  display_phone_number text,                   -- human-readable only (BIZ-02);
                                                 -- NEVER used for routing.
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tenant_whatsapp_phone_number_id ON tenant (whatsapp_phone_number_id);

-- ============================================================================
-- 2. negocio — business profile (1:1 with tenant in v1, D-08)
-- ============================================================================
CREATE TABLE negocio (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant (id) ON DELETE CASCADE,
  nombre text NOT NULL,
  direccion text,
  telefono text,
  -- Per-tenant IANA timezone (D-13). Argentina has no DST (fixed UTC-3), but we
  -- NEVER hardcode the -3 offset — always resolve via this IANA zone name in
  -- application code (Pitfall 4).
  timezone text NOT NULL DEFAULT 'America/Argentina/Buenos_Aires',
  granularidad_min integer NOT NULL DEFAULT 30, -- slot grid granularity (BIZ-03): 15 or 30.
  horario_general jsonb,                        -- general business-hours summary (display only;
                                                 -- authoritative schedule is horario_trabajo).
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_negocio_tenant_id ON negocio (tenant_id);

-- ============================================================================
-- 3. perfil — dashboard user profile keyed to auth.uid() (D-05/D-06/D-08)
-- ============================================================================
-- Replaces the reference schema's ADMIN_USER/SUPER_ADMIN password_hash tables.
-- Supabase Auth (auth.users) owns credentials; perfil links a Supabase Auth
-- user to a tenant + role.
CREATE TABLE perfil (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  -- FORWARD-NOTE (Phase 2 / SADMIN): tenant_id may need to become NULLABLE for
  -- superadmin rows. A superadmin (D-06) is cross-tenant and does not belong
  -- to a single tenant, whereas an owner is 1-user-1-tenant (D-08). In v1 this
  -- column is NOT NULL because only 'owner' rows are created in Phase 1/2;
  -- finalize the nullability + superadmin onboarding flow in Phase 2 (SADMIN).
  tenant_id uuid REFERENCES tenant (id) ON DELETE CASCADE,
  rol text NOT NULL DEFAULT 'owner' CHECK (rol IN ('owner', 'superadmin')),
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_perfil_tenant_id ON perfil (tenant_id);

-- ============================================================================
-- 4. profesional — staff members of a peluquería
-- ============================================================================
CREATE TABLE profesional (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant (id) ON DELETE CASCADE,
  nombre text NOT NULL,
  activo boolean NOT NULL DEFAULT true,          -- soft delete (PRO-01).
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_profesional_tenant_id ON profesional (tenant_id);

-- ============================================================================
-- 5. horario_trabajo — recurring weekly work schedule (PRO-02)
-- ============================================================================
-- Multiple rows per (profesional, dia_semana) allowed — a professional can
-- have multiple work blocks in the same day (e.g. morning + afternoon shift).
CREATE TABLE horario_trabajo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant (id) ON DELETE CASCADE,
  profesional_id uuid NOT NULL REFERENCES profesional (id) ON DELETE CASCADE,
  dia_semana smallint NOT NULL CHECK (dia_semana BETWEEN 0 AND 6), -- 0=domingo..6=sábado
  hora_inicio time NOT NULL,   -- time-of-day recurring rule, NOT a schedule/appointment
  hora_fin time NOT NULL,      -- instant — naive `time` is correct here (no date component).
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT horario_trabajo_rango_valido CHECK (hora_fin > hora_inicio)
);

CREATE INDEX idx_horario_trabajo_tenant_id ON horario_trabajo (tenant_id);
CREATE INDEX idx_horario_trabajo_profesional_id ON horario_trabajo (profesional_id);

-- ============================================================================
-- 6. servicio — services offered by the peluquería (SVC-01/SVC-02)
-- ============================================================================
CREATE TABLE servicio (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant (id) ON DELETE CASCADE,
  nombre text NOT NULL,
  descripcion text,
  precio numeric(10, 2) NOT NULL,
  duracion_min integer NOT NULL CHECK (duracion_min > 0),
  orden integer NOT NULL DEFAULT 0,   -- display order (SVC-02).
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_servicio_tenant_id ON servicio (tenant_id);

-- ============================================================================
-- 7. profesional_servicio — which professional performs which service
--    + optional custom price override (PRO-03/PRO-04)
-- ============================================================================
CREATE TABLE profesional_servicio (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant (id) ON DELETE CASCADE,
  profesional_id uuid NOT NULL REFERENCES profesional (id) ON DELETE CASCADE,
  servicio_id uuid NOT NULL REFERENCES servicio (id) ON DELETE CASCADE,
  precio_custom numeric(10, 2),      -- nullable; overrides servicio.precio when set (PRO-04).
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profesional_servicio_unica UNIQUE (profesional_id, servicio_id)
);

CREATE INDEX idx_profesional_servicio_tenant_id ON profesional_servicio (tenant_id);
CREATE INDEX idx_profesional_servicio_profesional_id ON profesional_servicio (profesional_id);
CREATE INDEX idx_profesional_servicio_servicio_id ON profesional_servicio (servicio_id);

-- ============================================================================
-- 8. cliente — end customers who book via WhatsApp
-- ============================================================================
CREATE TABLE cliente (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant (id) ON DELETE CASCADE,
  telefono text NOT NULL,            -- WhatsApp customer phone (E.164-ish, WA-02/WA-03 context).
  nombre text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cliente_telefono_unico_por_tenant UNIQUE (tenant_id, telefono)
);

CREATE INDEX idx_cliente_tenant_id ON cliente (tenant_id);

-- ============================================================================
-- 9. turno — appointments (CORE-04, CORE-05 — the centerpiece table)
-- ============================================================================
CREATE TABLE turno (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant (id) ON DELETE CASCADE,
  profesional_id uuid NOT NULL REFERENCES profesional (id) ON DELETE CASCADE,
  cliente_id uuid NOT NULL REFERENCES cliente (id) ON DELETE CASCADE,
  -- Schedule timestamps: ALWAYS timestamptz (D-12), stored/interpreted as UTC
  -- internally; conversion to America/Argentina/* happens only at the
  -- presentation layer (dashboard/WhatsApp text), never here (Pitfall 4).
  inicio timestamptz NOT NULL,
  fin timestamptz NOT NULL,
  estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'confirmado', 'cancelado')),
  -- AVAIL-03 freeze: precio_total is a SNAPSHOT summed at booking time from
  -- turno_servicio rows, never a live join to servicio.precio (Pitfall 3).
  precio_total numeric(10, 2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT turno_rango_valido CHECK (fin > inicio),
  -- CORE-05 / D-09 / D-10 / D-11: overlapping ACTIVE turnos for the SAME
  -- profesional are structurally impossible. A 'cancelado' turno frees the
  -- slot instantly (excluded from the constraint via the WHERE filter). No
  -- buffer between consecutive turnos in v1 — [inicio, fin) ranges may touch
  -- at the boundary without overlapping (D-11).
  CONSTRAINT turno_no_overlap EXCLUDE USING gist (
    profesional_id WITH =,
    tstzrange(inicio, fin, '[)') WITH &&
  ) WHERE (estado != 'cancelado')
);

CREATE INDEX idx_turno_tenant_id ON turno (tenant_id);
CREATE INDEX idx_turno_tenant_profesional_inicio ON turno (tenant_id, profesional_id, inicio);
CREATE INDEX idx_turno_cliente_id ON turno (cliente_id);

-- ============================================================================
-- 10. turno_servicio — services attached to a turno, frozen at booking time
--     (AVAIL-03 freeze: nombre/precio/duracion snapshots, Pitfall 3)
-- ============================================================================
CREATE TABLE turno_servicio (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant (id) ON DELETE CASCADE,
  turno_id uuid NOT NULL REFERENCES turno (id) ON DELETE CASCADE,
  servicio_id uuid NOT NULL REFERENCES servicio (id) ON DELETE RESTRICT,
  -- Snapshots: frozen at the moment of booking so later edits to servicio
  -- (price changes, renames) never retroactively alter historical turnos.
  nombre_snapshot text NOT NULL,
  precio_snapshot numeric(10, 2) NOT NULL,
  duracion_snapshot integer NOT NULL CHECK (duracion_snapshot > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_turno_servicio_tenant_id ON turno_servicio (tenant_id);
CREATE INDEX idx_turno_servicio_turno_id ON turno_servicio (turno_id);

-- ============================================================================
-- 11. bloqueo — manual schedule blocks (APPT-02)
-- ============================================================================
CREATE TABLE bloqueo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant (id) ON DELETE CASCADE,
  profesional_id uuid NOT NULL REFERENCES profesional (id) ON DELETE CASCADE,
  inicio timestamptz NOT NULL,
  fin timestamptz NOT NULL,
  motivo text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bloqueo_rango_valido CHECK (fin > inicio),
  -- Same overlap protection as turno (Pitfall 2 — "consider the same EXCLUDE
  -- for bloqueo vs the same profesional"): a professional cannot have two
  -- overlapping manual blocks.
  CONSTRAINT bloqueo_no_overlap EXCLUDE USING gist (
    profesional_id WITH =,
    tstzrange(inicio, fin, '[)') WITH &&
  )
);

CREATE INDEX idx_bloqueo_tenant_id ON bloqueo (tenant_id);
CREATE INDEX idx_bloqueo_tenant_profesional_inicio ON bloqueo (tenant_id, profesional_id, inicio);

-- ============================================================================
-- 12. conversacion — WhatsApp conversation state (WA-05)
-- ============================================================================
-- Created now with full structure + tenant_id + RLS (migration 0002), but
-- left EMPTY / unwired until Phase 5 (WA) and Phase 6 (BOT) — D-02.
CREATE TABLE conversacion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant (id) ON DELETE CASCADE,
  cliente_id uuid NOT NULL REFERENCES cliente (id) ON DELETE CASCADE,
  -- Bot state machine snapshot (stage, pendingBooking, turnCount, etc.) — see
  -- research/ARCHITECTURE.md "Conversation State" for the illustrative shape.
  -- NEVER caches computed availability (Anti-Pattern 3) — only conversational
  -- continuity state; createAppointment always re-validates against the
  -- availability engine before writing.
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- 24h customer-service-window tracker (Pitfall 6): measured from the
  -- customer's last inbound message. Free-form sends are only valid before
  -- this expires; template messages required after.
  ventana_expira_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conversacion_unica_por_cliente UNIQUE (tenant_id, cliente_id)
);

CREATE INDEX idx_conversacion_tenant_id ON conversacion (tenant_id);
CREATE INDEX idx_conversacion_cliente_id ON conversacion (cliente_id);

-- ============================================================================
-- 13. mensaje — individual WhatsApp messages, for audit/debugging (WA-03/WA-05)
-- ============================================================================
-- Created now with full structure + tenant_id + RLS, but left EMPTY / unwired
-- until Phase 5 (WA) — D-02.
CREATE TABLE mensaje (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant (id) ON DELETE CASCADE,
  conversacion_id uuid NOT NULL REFERENCES conversacion (id) ON DELETE CASCADE,
  -- wa_message_id: WhatsApp's own message ID, used as the idempotency key for
  -- webhook-retry deduplication (WA-03, Pitfall 9). UNIQUE prevents double
  -- processing of the same inbound/outbound message.
  wa_message_id text UNIQUE,
  direccion text NOT NULL CHECK (direccion IN ('entrante', 'saliente')),
  contenido jsonb,                    -- raw/structured message payload (empty until Phase 5).
  programado_en timestamptz,          -- for future outbound scheduling (unused until wired).
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_mensaje_tenant_id ON mensaje (tenant_id);
CREATE INDEX idx_mensaje_conversacion_id ON mensaje (conversacion_id);

-- ============================================================================
-- 14. recordatorio — reminders, reserved for v2 (D-03, REMIND-01)
-- ============================================================================
-- Structure only. No worker, no HSM template wiring in v1. Reserved so the
-- v2 reminder feature doesn't require a schema migration to bolt on.
CREATE TABLE recordatorio (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant (id) ON DELETE CASCADE,
  turno_id uuid NOT NULL REFERENCES turno (id) ON DELETE CASCADE,
  programado_en timestamptz NOT NULL,   -- when the reminder should be sent (v2, unused in v1).
  enviado boolean NOT NULL DEFAULT false,
  enviado_en timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_recordatorio_tenant_id ON recordatorio (tenant_id);
CREATE INDEX idx_recordatorio_turno_id ON recordatorio (turno_id);

-- ============================================================================
-- End of migration 0001_schema_core.sql
-- Next: 0002_rls_policies.sql (RLS + tenant-resolver helper on every table above)
-- ============================================================================
