-- ============================================================================
-- TurnosBot — Migration 0006: REVOKE EXECUTE de los wrappers Vault de anon/authenticated
-- ============================================================================
-- FIX de un agujero CRÍTICO detectado en la auditoría de seguridad de la Fase 7
-- (07-SECURITY.md, T-07-01 / T-07-02): los wrappers SECURITY DEFINER creados en
-- 0005 (public.get_whatsapp_token / public.set_whatsapp_token_secret) resultaron
-- EJECUTABLES por los roles `anon` y `authenticated` — probado en vivo: con la
-- anon key (pública, embebida en el bundle del dashboard) un atacante podía
-- llamar get_whatsapp_token(negocio_id) y recibir el token de WhatsApp EN CLARO
-- de cualquier negocio (fuga confirmada con un token SENTINEL), y set_..._secret
-- para crear/rotar secretos. Esto anulaba por completo SEC-01.
--
-- CAUSA RAÍZ: en Supabase, `anon`/`authenticated` reciben EXECUTE sobre las
-- funciones nuevas de `public` vía DEFAULT PRIVILEGES. El `REVOKE ALL ON
-- FUNCTION ... FROM PUBLIC` de 0005 NO revoca de esos roles nombrados (PUBLIC es
-- el pseudo-rol, distinto de anon/authenticated). Había que revocar de los roles
-- explícitamente.
--
-- Este archivo REVOCA EXECUTE de anon/authenticated/PUBLIC sobre los dos wrappers
-- Vault (el único acceso sancionado sigue siendo service_role, cuyo GRANT del
-- 0005 se preserva). Como defensa en profundidad, también revoca de los helpers
-- SECURITY DEFINER de 0003 (auth_negocio_ids/auth_tenant_id): hoy no filtran
-- (son caller-scoped, devuelven vacío/null para anon) pero comparten el mismo
-- default-privilege y no tienen razón de ser anon-callable.
--
-- REVOKE es idempotente: re-aplicar este archivo es seguro.
--
-- Project isolation: SOLO para bdgufnitakelyialjoqg. Nunca otro proyecto.
-- ============================================================================

BEGIN;

-- 1. Wrappers Vault (los críticos).
REVOKE EXECUTE ON FUNCTION public.get_whatsapp_token(uuid)
  FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_whatsapp_token_secret(uuid, text, text)
  FROM anon, authenticated, PUBLIC;

-- Re-afirmar el único acceso sancionado (idempotente; ya venía de 0005).
GRANT EXECUTE ON FUNCTION public.get_whatsapp_token(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_whatsapp_token_secret(uuid, text, text) TO service_role;

-- 2. Defensa en profundidad: helpers SECURITY DEFINER de 0003 (no filtran hoy,
--    pero no deben ser anon-callable). Se usan dentro de las policies RLS, que
--    corren con los privilegios del sistema, no del rol del cliente — revocarlos
--    de anon/authenticated NO rompe RLS.
REVOKE EXECUTE ON FUNCTION public.auth_negocio_ids() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.auth_tenant_id()  FROM anon, authenticated, PUBLIC;

COMMIT;

-- ============================================================================
-- Post-condición: anon/authenticated NO pueden ejecutar get/set_whatsapp_token
-- (ni auth_negocio_ids/auth_tenant_id). Solo service_role. Verificar con
-- scripts/verify-vault-wrappers-anon-denied.ts (debe salir 0 = anon RECHAZADO).
-- ============================================================================
