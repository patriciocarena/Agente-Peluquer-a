-- ============================================================================
-- TurnosBot — Migration 0003: Tenant/Negocio split (D-09..D-12, SADMIN-01/02)
-- ============================================================================
-- Reorganiza el modelo de datos: pasa de Tenant 1:1 Negocio (Fase 1) a
-- Tenant(grupo, solo `nombre`) -> Negocio(1..N sucursales, cada una con su
-- propio WhatsApp) -> tablas operativas colgando de `negocio_id` (no ya de
-- `tenant_id`). Habilita: SADMIN-01 (superadmin administra Tenants), SADMIN-02
-- (superadmin administra Negocios + su WhatsApp dentro de un Tenant), BIZ-02
-- (perfil del negocio, incl. display_phone_number, vive en `negocio`) y AUTH-03
-- (aislamiento operativo del owner por "el negocio pertenece a mi tenant").
--
-- Motivo del cambio (D-09..D-12): un dueño puede operar varias sucursales
-- (Negocios) bajo un mismo Tenant/grupo; cada sucursal tiene su propio número
-- de WhatsApp Cloud API, profesionales, servicios, clientes y turnos. El
-- Tenant deja de ser la unidad operativa y pasa a ser un contenedor de
-- identidad/agrupación (D-09); el WhatsApp se re-scopea a Negocio (D-10); se
-- agrega `negocio.activo` para soft-delete de sucursal (D-11); el owner sigue
-- ligado a un único Tenant vía `perfil.tenant_id` (sin cambios), pero ahora
-- alcanza N negocios de ese tenant (D-12).
--
-- Threat model (T-02-01..T-02-03): T-02-01 mitigado por el hardening
-- idéntico a auth_tenant_id() en el nuevo helper auth_negocio_ids()
-- (SECURITY DEFINER, STABLE, search_path vacío, REVOKE ALL + GRANT solo a
-- authenticated — previene search_path hijacking). T-02-02 mitigado
-- ejecutando todo backfill de negocio_id ANTES de SET NOT NULL y antes de
-- recrear las policies, dentro de una única transacción con service_role
-- (bypassa RLS, sin ventana de filas inalcanzables). T-02-03 (aplicar al
-- proyecto Supabase equivocado) se mitiga fuera de este archivo: el guard de
-- aislamiento en scripts/apply-seed.ts y la confirmación explícita del ref
-- bdgufnitakelyialjoqg en el checkpoint humano que aplica esta migración.
--
-- NOTA de token (D-04/SEC-01): esta migración NO escribe ningún token real.
-- `negocio.whatsapp_token` queda como columna nullable, sin uso hasta la
-- Fase 7 (encriptación en Vault/AES-GCM).
--
-- Project isolation: este archivo pertenece SOLO al proyecto Supabase de
-- TurnosBot (bdgufnitakelyialjoqg). Nunca debe aplicarse a, ni referenciar,
-- ningún otro proyecto no relacionado (p. ej. el proyecto del restaurante).
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 0. Captura previa (tabla temporal, vive solo dentro de esta transacción):
--    los 4 valores WhatsApp de `tenant`, ANTES de tocar nada, para poder
--    backfillear `negocio` después de que `tenant` ya los haya dropeado
--    (el orden textual del archivo dropea tenant antes de popular negocio;
--    esta captura desacopla ambos pasos sin depender de columnas ya
--    eliminadas).
-- ----------------------------------------------------------------------------
CREATE TEMP TABLE _tenant_whatsapp_backfill ON COMMIT DROP AS
SELECT
  id AS tenant_id,
  whatsapp_phone_number_id,
  waba_id,
  whatsapp_token,
  display_phone_number
FROM tenant;

-- ----------------------------------------------------------------------------
-- 1. tenant: agregar `nombre`, backfill desde negocio (hoy 1:1), y dropear
--    las columnas de WhatsApp (D-09/D-10: el Tenant deja de tener WhatsApp).
-- ----------------------------------------------------------------------------
ALTER TABLE tenant ADD COLUMN nombre text;

-- Backfill 1:1: hoy cada tenant tiene exactamente un negocio (Fase 1). El
-- nombre del negocio se convierte en el nombre del grupo/Tenant.
UPDATE tenant
SET nombre = negocio.nombre
FROM negocio
WHERE negocio.tenant_id = tenant.id
  AND tenant.nombre IS NULL;

ALTER TABLE tenant ALTER COLUMN nombre SET NOT NULL;

DROP INDEX IF EXISTS idx_tenant_whatsapp_phone_number_id;

ALTER TABLE tenant
  DROP COLUMN whatsapp_phone_number_id,
  DROP COLUMN waba_id,
  DROP COLUMN whatsapp_token,
  DROP COLUMN display_phone_number;

-- ----------------------------------------------------------------------------
-- 2. negocio: agregar las columnas de WhatsApp (D-10) + `activo` (D-11,
--    soft-delete de sucursal). Backfill de WhatsApp DESDE el tenant padre
--    (capturado en el paso 0, ANTES del DROP de tenant en el paso 1).
--    negocio ya trae nombre/direccion/telefono/timezone/granularidad_min/
--    horario_general desde la Fase 1 (0001_schema_core.sql) — no se tocan.
-- ----------------------------------------------------------------------------
ALTER TABLE negocio
  ADD COLUMN whatsapp_phone_number_id text,
  ADD COLUMN waba_id text,
  ADD COLUMN whatsapp_token text,
  ADD COLUMN display_phone_number text,
  ADD COLUMN activo boolean NOT NULL DEFAULT true;

UPDATE negocio
SET
  whatsapp_phone_number_id = backfill.whatsapp_phone_number_id,
  waba_id = backfill.waba_id,
  whatsapp_token = backfill.whatsapp_token,
  display_phone_number = backfill.display_phone_number
FROM _tenant_whatsapp_backfill backfill
WHERE backfill.tenant_id = negocio.tenant_id;

ALTER TABLE negocio
  ADD CONSTRAINT negocio_whatsapp_phone_number_id_unique UNIQUE (whatsapp_phone_number_id);

CREATE INDEX idx_negocio_whatsapp_phone_number_id ON negocio (whatsapp_phone_number_id);

-- ----------------------------------------------------------------------------
-- 2.5. Dropear los objetos que dependen de <tabla>.tenant_id ANTES de la
--      cirugía de columnas del paso 3 (Postgres rechaza DROP COLUMN si una
--      policy o constraint aún referencia la columna):
--        - las 11 policies <tabla>_aislamiento (predicado por tenant_id;
--          se RECREAN por negocio_id en el paso 6, tras crear negocio_id);
--        - los 2 uniques que incluyen tenant_id (se RECREAN por negocio_id
--          en el paso 4).
--      Ventana intra-transacción con RLS habilitada y sin policy = deny-all,
--      irrelevante: la migración corre como rol que bypassa RLS y nadie ve el
--      estado intermedio (todo dentro del mismo BEGIN/COMMIT).
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS profesional_aislamiento ON profesional;
DROP POLICY IF EXISTS horario_trabajo_aislamiento ON horario_trabajo;
DROP POLICY IF EXISTS servicio_aislamiento ON servicio;
DROP POLICY IF EXISTS profesional_servicio_aislamiento ON profesional_servicio;
DROP POLICY IF EXISTS cliente_aislamiento ON cliente;
DROP POLICY IF EXISTS turno_aislamiento ON turno;
DROP POLICY IF EXISTS turno_servicio_aislamiento ON turno_servicio;
DROP POLICY IF EXISTS bloqueo_aislamiento ON bloqueo;
DROP POLICY IF EXISTS conversacion_aislamiento ON conversacion;
DROP POLICY IF EXISTS mensaje_aislamiento ON mensaje;
DROP POLICY IF EXISTS recordatorio_aislamiento ON recordatorio;

ALTER TABLE cliente DROP CONSTRAINT cliente_telefono_unico_por_tenant;
ALTER TABLE conversacion DROP CONSTRAINT conversacion_unica_por_cliente;

-- ----------------------------------------------------------------------------
-- 3. Tablas operativas: agregar negocio_id, backfillear, SET NOT NULL,
--    dropear tenant_id (FK + índice), agregar idx_<tabla>_negocio_id.
--    Padres directos primero (backfill desde negocio via tenant_id de la
--    fila); hijas después, derivando negocio_id del padre YA migrado (no de
--    su propio tenant_id) para no depender de una relación 1:1 futura.
-- ----------------------------------------------------------------------------

-- 3a. profesional (padre directo)
ALTER TABLE profesional ADD COLUMN negocio_id uuid REFERENCES negocio (id) ON DELETE CASCADE;

UPDATE profesional
SET negocio_id = negocio.id
FROM negocio
WHERE negocio.tenant_id = profesional.tenant_id;

ALTER TABLE profesional ALTER COLUMN negocio_id SET NOT NULL;

ALTER TABLE profesional DROP CONSTRAINT profesional_tenant_id_fkey;
DROP INDEX IF EXISTS idx_profesional_tenant_id;
ALTER TABLE profesional DROP COLUMN tenant_id;

CREATE INDEX idx_profesional_negocio_id ON profesional (negocio_id);

-- 3b. horario_trabajo (hija de profesional)
ALTER TABLE horario_trabajo ADD COLUMN negocio_id uuid REFERENCES negocio (id) ON DELETE CASCADE;

UPDATE horario_trabajo
SET negocio_id = profesional.negocio_id
FROM profesional
WHERE profesional.id = horario_trabajo.profesional_id;

ALTER TABLE horario_trabajo ALTER COLUMN negocio_id SET NOT NULL;

ALTER TABLE horario_trabajo DROP CONSTRAINT horario_trabajo_tenant_id_fkey;
DROP INDEX IF EXISTS idx_horario_trabajo_tenant_id;
ALTER TABLE horario_trabajo DROP COLUMN tenant_id;

CREATE INDEX idx_horario_trabajo_negocio_id ON horario_trabajo (negocio_id);

-- 3c. servicio (padre directo)
ALTER TABLE servicio ADD COLUMN negocio_id uuid REFERENCES negocio (id) ON DELETE CASCADE;

UPDATE servicio
SET negocio_id = negocio.id
FROM negocio
WHERE negocio.tenant_id = servicio.tenant_id;

ALTER TABLE servicio ALTER COLUMN negocio_id SET NOT NULL;

ALTER TABLE servicio DROP CONSTRAINT servicio_tenant_id_fkey;
DROP INDEX IF EXISTS idx_servicio_tenant_id;
ALTER TABLE servicio DROP COLUMN tenant_id;

CREATE INDEX idx_servicio_negocio_id ON servicio (negocio_id);

-- 3d. profesional_servicio (hija de profesional/servicio; usa profesional_id)
ALTER TABLE profesional_servicio ADD COLUMN negocio_id uuid REFERENCES negocio (id) ON DELETE CASCADE;

UPDATE profesional_servicio
SET negocio_id = profesional.negocio_id
FROM profesional
WHERE profesional.id = profesional_servicio.profesional_id;

ALTER TABLE profesional_servicio ALTER COLUMN negocio_id SET NOT NULL;

ALTER TABLE profesional_servicio DROP CONSTRAINT profesional_servicio_tenant_id_fkey;
DROP INDEX IF EXISTS idx_profesional_servicio_tenant_id;
ALTER TABLE profesional_servicio DROP COLUMN tenant_id;

CREATE INDEX idx_profesional_servicio_negocio_id ON profesional_servicio (negocio_id);

-- 3e. cliente (padre directo)
ALTER TABLE cliente ADD COLUMN negocio_id uuid REFERENCES negocio (id) ON DELETE CASCADE;

UPDATE cliente
SET negocio_id = negocio.id
FROM negocio
WHERE negocio.tenant_id = cliente.tenant_id;

ALTER TABLE cliente ALTER COLUMN negocio_id SET NOT NULL;

ALTER TABLE cliente DROP CONSTRAINT cliente_tenant_id_fkey;
DROP INDEX IF EXISTS idx_cliente_tenant_id;
ALTER TABLE cliente DROP COLUMN tenant_id;

CREATE INDEX idx_cliente_negocio_id ON cliente (negocio_id);

-- 3f. turno (padre directo; también re-scopea el índice compuesto)
ALTER TABLE turno ADD COLUMN negocio_id uuid REFERENCES negocio (id) ON DELETE CASCADE;

UPDATE turno
SET negocio_id = negocio.id
FROM negocio
WHERE negocio.tenant_id = turno.tenant_id;

ALTER TABLE turno ALTER COLUMN negocio_id SET NOT NULL;

ALTER TABLE turno DROP CONSTRAINT turno_tenant_id_fkey;
DROP INDEX IF EXISTS idx_turno_tenant_id;
DROP INDEX IF EXISTS idx_turno_tenant_profesional_inicio;
ALTER TABLE turno DROP COLUMN tenant_id;

CREATE INDEX idx_turno_negocio_id ON turno (negocio_id);
CREATE INDEX idx_turno_negocio_profesional_inicio ON turno (negocio_id, profesional_id, inicio);

-- 3g. turno_servicio (hija de turno)
ALTER TABLE turno_servicio ADD COLUMN negocio_id uuid REFERENCES negocio (id) ON DELETE CASCADE;

UPDATE turno_servicio
SET negocio_id = turno.negocio_id
FROM turno
WHERE turno.id = turno_servicio.turno_id;

ALTER TABLE turno_servicio ALTER COLUMN negocio_id SET NOT NULL;

ALTER TABLE turno_servicio DROP CONSTRAINT turno_servicio_tenant_id_fkey;
DROP INDEX IF EXISTS idx_turno_servicio_tenant_id;
ALTER TABLE turno_servicio DROP COLUMN tenant_id;

CREATE INDEX idx_turno_servicio_negocio_id ON turno_servicio (negocio_id);

-- 3h. bloqueo (padre directo; también re-scopea el índice compuesto)
ALTER TABLE bloqueo ADD COLUMN negocio_id uuid REFERENCES negocio (id) ON DELETE CASCADE;

UPDATE bloqueo
SET negocio_id = negocio.id
FROM negocio
WHERE negocio.tenant_id = bloqueo.tenant_id;

ALTER TABLE bloqueo ALTER COLUMN negocio_id SET NOT NULL;

ALTER TABLE bloqueo DROP CONSTRAINT bloqueo_tenant_id_fkey;
DROP INDEX IF EXISTS idx_bloqueo_tenant_id;
DROP INDEX IF EXISTS idx_bloqueo_tenant_profesional_inicio;
ALTER TABLE bloqueo DROP COLUMN tenant_id;

CREATE INDEX idx_bloqueo_negocio_id ON bloqueo (negocio_id);
CREATE INDEX idx_bloqueo_negocio_profesional_inicio ON bloqueo (negocio_id, profesional_id, inicio);

-- 3i. conversacion (padre directo; unwired hasta Fase 5/6, D-02)
ALTER TABLE conversacion ADD COLUMN negocio_id uuid REFERENCES negocio (id) ON DELETE CASCADE;

UPDATE conversacion
SET negocio_id = negocio.id
FROM negocio
WHERE negocio.tenant_id = conversacion.tenant_id;

ALTER TABLE conversacion ALTER COLUMN negocio_id SET NOT NULL;

ALTER TABLE conversacion DROP CONSTRAINT conversacion_tenant_id_fkey;
DROP INDEX IF EXISTS idx_conversacion_tenant_id;
ALTER TABLE conversacion DROP COLUMN tenant_id;

CREATE INDEX idx_conversacion_negocio_id ON conversacion (negocio_id);

-- 3j. mensaje (hija de conversacion; unwired hasta Fase 5, D-02)
ALTER TABLE mensaje ADD COLUMN negocio_id uuid REFERENCES negocio (id) ON DELETE CASCADE;

UPDATE mensaje
SET negocio_id = conversacion.negocio_id
FROM conversacion
WHERE conversacion.id = mensaje.conversacion_id;

ALTER TABLE mensaje ALTER COLUMN negocio_id SET NOT NULL;

ALTER TABLE mensaje DROP CONSTRAINT mensaje_tenant_id_fkey;
DROP INDEX IF EXISTS idx_mensaje_tenant_id;
ALTER TABLE mensaje DROP COLUMN tenant_id;

CREATE INDEX idx_mensaje_negocio_id ON mensaje (negocio_id);

-- 3k. recordatorio (hija de turno; reservado v2, D-03)
ALTER TABLE recordatorio ADD COLUMN negocio_id uuid REFERENCES negocio (id) ON DELETE CASCADE;

UPDATE recordatorio
SET negocio_id = turno.negocio_id
FROM turno
WHERE turno.id = recordatorio.turno_id;

ALTER TABLE recordatorio ALTER COLUMN negocio_id SET NOT NULL;

ALTER TABLE recordatorio DROP CONSTRAINT recordatorio_tenant_id_fkey;
DROP INDEX IF EXISTS idx_recordatorio_tenant_id;
ALTER TABLE recordatorio DROP COLUMN tenant_id;

CREATE INDEX idx_recordatorio_negocio_id ON recordatorio (negocio_id);

-- ----------------------------------------------------------------------------
-- 4. Uniques re-scopeados: cliente(tenant_id,telefono) -> (negocio_id,telefono);
--    conversacion(tenant_id,cliente_id) -> (negocio_id,cliente_id).
-- ----------------------------------------------------------------------------
-- (los DROP CONSTRAINT de los uniques viejos se hicieron en el paso 2.5)
ALTER TABLE cliente ADD CONSTRAINT cliente_telefono_unico_por_negocio UNIQUE (negocio_id, telefono);

ALTER TABLE conversacion ADD CONSTRAINT conversacion_unica_por_cliente UNIQUE (negocio_id, cliente_id);

-- ----------------------------------------------------------------------------
-- 5. EXCLUDE constraints (turno_no_overlap, bloqueo_no_overlap): keyean por
--    profesional_id, NO se tocan (un profesional pertenece a un único
--    negocio; el aislamiento por negocio ya está implícito vía profesional).
-- ----------------------------------------------------------------------------
-- (sin cambios — ver 0001_schema_core.sql)

-- ----------------------------------------------------------------------------
-- 6. RLS: helper auth_negocio_ids() (hardening idéntico a auth_tenant_id())
--    + recrear las 11 policies <tabla>_aislamiento con predicado por
--    negocio_id. Las policies de perfil/tenant/negocio NO se tocan (siguen
--    por auth_tenant_id(); negocio sigue tenant_id = auth_tenant_id()).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION auth_negocio_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT id FROM public.negocio WHERE tenant_id = public.auth_tenant_id();
$$;

REVOKE ALL ON FUNCTION auth_negocio_ids() FROM public;
GRANT EXECUTE ON FUNCTION auth_negocio_ids() TO authenticated;

-- profesional
CREATE POLICY profesional_aislamiento ON profesional
  FOR ALL
  TO authenticated
  USING (negocio_id IN (SELECT auth_negocio_ids()))
  WITH CHECK (negocio_id IN (SELECT auth_negocio_ids()));

-- horario_trabajo
CREATE POLICY horario_trabajo_aislamiento ON horario_trabajo
  FOR ALL
  TO authenticated
  USING (negocio_id IN (SELECT auth_negocio_ids()))
  WITH CHECK (negocio_id IN (SELECT auth_negocio_ids()));

-- servicio
CREATE POLICY servicio_aislamiento ON servicio
  FOR ALL
  TO authenticated
  USING (negocio_id IN (SELECT auth_negocio_ids()))
  WITH CHECK (negocio_id IN (SELECT auth_negocio_ids()));

-- profesional_servicio
CREATE POLICY profesional_servicio_aislamiento ON profesional_servicio
  FOR ALL
  TO authenticated
  USING (negocio_id IN (SELECT auth_negocio_ids()))
  WITH CHECK (negocio_id IN (SELECT auth_negocio_ids()));

-- cliente
CREATE POLICY cliente_aislamiento ON cliente
  FOR ALL
  TO authenticated
  USING (negocio_id IN (SELECT auth_negocio_ids()))
  WITH CHECK (negocio_id IN (SELECT auth_negocio_ids()));

-- turno
CREATE POLICY turno_aislamiento ON turno
  FOR ALL
  TO authenticated
  USING (negocio_id IN (SELECT auth_negocio_ids()))
  WITH CHECK (negocio_id IN (SELECT auth_negocio_ids()));

-- turno_servicio
CREATE POLICY turno_servicio_aislamiento ON turno_servicio
  FOR ALL
  TO authenticated
  USING (negocio_id IN (SELECT auth_negocio_ids()))
  WITH CHECK (negocio_id IN (SELECT auth_negocio_ids()));

-- bloqueo
CREATE POLICY bloqueo_aislamiento ON bloqueo
  FOR ALL
  TO authenticated
  USING (negocio_id IN (SELECT auth_negocio_ids()))
  WITH CHECK (negocio_id IN (SELECT auth_negocio_ids()));

-- conversacion
CREATE POLICY conversacion_aislamiento ON conversacion
  FOR ALL
  TO authenticated
  USING (negocio_id IN (SELECT auth_negocio_ids()))
  WITH CHECK (negocio_id IN (SELECT auth_negocio_ids()));

-- mensaje
CREATE POLICY mensaje_aislamiento ON mensaje
  FOR ALL
  TO authenticated
  USING (negocio_id IN (SELECT auth_negocio_ids()))
  WITH CHECK (negocio_id IN (SELECT auth_negocio_ids()));

-- recordatorio
CREATE POLICY recordatorio_aislamiento ON recordatorio
  FOR ALL
  TO authenticated
  USING (negocio_id IN (SELECT auth_negocio_ids()))
  WITH CHECK (negocio_id IN (SELECT auth_negocio_ids()));

COMMIT;

-- ============================================================================
-- End of migration 0003_tenant_negocio_split.sql
--
-- Post-condición: tenant(nombre, sin WhatsApp) -> negocio(1..N por tenant,
-- con WhatsApp + activo) -> 11 tablas operativas con negocio_id NOT NULL
-- (sin tenant_id), RLS por auth_negocio_ids(). perfil/tenant/negocio no
-- cambian su predicado RLS. Next: regenerar packages/db-types y re-aplicar
-- el seed (Task 3, checkpoint humano — requiere credenciales live).
-- ============================================================================
