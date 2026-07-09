-- ============================================================================
-- TurnosBot — Migration 0005: WhatsApp token en Supabase Vault (SEC-01)
-- ============================================================================
-- Blinda el token de acceso de larga duración de la WhatsApp Cloud API de cada
-- negocio, hoy guardado en texto plano en `negocio.whatsapp_token`. Ese token
-- puede enviar mensajes como ese negocio y generar cargos en Meta; la columna
-- plana es superficie de fuga vía cualquier dump/backup/réplica de la DB, o un
-- SELECT directo con el service_role del bot (07-SEC-01-DECISION.md, LOCKED
-- D-01/D-02).
--
-- Threat model (T-07-01, T-07-02):
-- T-07-01 (Information Disclosure — negocio.whatsapp_token en claro) se mitiga
-- dropeando la columna plana y guardando en su lugar solo
-- `whatsapp_token_secret_id uuid`, una referencia al secreto real en
-- `vault.secrets` (cifrado autenticado, gestionado por la extensión
-- supabase_vault — nunca se persiste texto plano fuera de Vault).
-- T-07-02 (Elevation of Privilege — acceso a vault.* sin gate) se mitiga con
-- dos wrappers `public` SECURITY DEFINER (`set_whatsapp_token_secret`,
-- `get_whatsapp_token`) que son el ÚNICO acceso sancionado al schema `vault`
-- desde app-code (el schema `vault` nunca se expone vía PostgREST). El
-- hardening es idéntico al de auth_negocio_ids() en 0003
-- (SET search_path='', REVOKE ALL FROM PUBLIC, GRANT EXECUTE solo a
-- service_role — NUNCA a authenticated/anon, ver Pitfall 2 de
-- 07-RESEARCH.md).
--
-- Rationale de transacción única: todo el DDL (extensión + wrappers + swap de
-- columna) corre en un único BEGIN/COMMIT para que un fallo a mitad de camino
-- (p. ej. permisos faltantes sobre el schema vault) haga rollback completo, sin
-- dejar la tabla `negocio` en un estado intermedio con ambas columnas o
-- ninguna — mismo patrón que 0001/0003.
--
-- Sin backfill: hoy `negocio.whatsapp_token` es NULL en toda fila de
-- bdgufnitakelyialjoqg (admin-tenants.ts hardcodea `whatsapp_token: null` al
-- crear un negocio — ver Runtime State Inventory de 07-RESEARCH.md, Assumption
-- A4). El DROP COLUMN es seguro sin riesgo de pérdida de datos; la
-- sanity-check pre-DROP (SELECT count(*) FROM negocio WHERE whatsapp_token IS
-- NOT NULL = 0) se corre a mano en el checkpoint humano de la Task 2 antes de
-- aplicar este archivo.
--
-- Project isolation: este archivo pertenece SOLO al proyecto Supabase de
-- TurnosBot (bdgufnitakelyialjoqg). Nunca debe aplicarse a, ni referenciar,
-- ningún otro proyecto no relacionado (p. ej. el proyecto del restaurante).
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Habilitar la extensión Vault (idempotente).
-- ----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS supabase_vault;

-- ----------------------------------------------------------------------------
-- 2. Wrapper de escritura: crea el secreto en Vault y guarda su id en negocio.
--    SECURITY DEFINER corre con los privilegios de quien aplica la migración
--    (acceso al schema vault); el único gate real es el GRANT EXECUTE de
--    abajo, restringido a service_role.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_whatsapp_token_secret(
  p_negocio_id uuid,
  p_token text,
  p_name text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_secret_id uuid;
BEGIN
  v_secret_id := vault.create_secret(p_token, p_name, 'WhatsApp Cloud API token');

  UPDATE public.negocio
  SET whatsapp_token_secret_id = v_secret_id
  WHERE id = p_negocio_id;

  RETURN v_secret_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_whatsapp_token_secret(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_whatsapp_token_secret(uuid, text, text) TO service_role;

-- ----------------------------------------------------------------------------
-- 3. Wrapper de lectura: resuelve el token en claro desde Vault vía
--    vault.decrypted_secrets, uniendo por whatsapp_token_secret_id.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_whatsapp_token(p_negocio_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_token text;
BEGIN
  SELECT decrypted_secret INTO v_token
  FROM vault.decrypted_secrets ds
  JOIN public.negocio n ON n.whatsapp_token_secret_id = ds.id
  WHERE n.id = p_negocio_id;

  RETURN v_token;
END;
$$;

REVOKE ALL ON FUNCTION public.get_whatsapp_token(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_whatsapp_token(uuid) TO service_role;

-- ----------------------------------------------------------------------------
-- 4. Swap de columna: agrega whatsapp_token_secret_id (FK a vault.secrets),
--    dropea whatsapp_token (texto plano). Sin backfill — ver header.
-- ----------------------------------------------------------------------------
ALTER TABLE negocio ADD COLUMN whatsapp_token_secret_id uuid REFERENCES vault.secrets (id);

ALTER TABLE negocio DROP COLUMN whatsapp_token;

COMMIT;

-- ============================================================================
-- End of migration 0005_whatsapp_token_vault.sql
--
-- Post-condición: negocio.whatsapp_token_secret_id (uuid, FK -> vault.secrets)
-- reemplaza a negocio.whatsapp_token (texto plano, dropeada). Los dos wrappers
-- public.set_whatsapp_token_secret / public.get_whatsapp_token son el único
-- acceso sancionado al schema vault desde app-code, restringido a
-- service_role. Next: Task 2 — aplicar en vivo contra bdgufnitakelyialjoqg y
-- regenerar packages/db-types/src/database.types.ts.
-- ============================================================================
