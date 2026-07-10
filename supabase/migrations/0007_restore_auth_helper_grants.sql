-- ============================================================================
-- TurnosBot — Migration 0007: restaurar EXECUTE de auth_negocio_ids/auth_tenant_id
-- ============================================================================
-- CORRECCIÓN de una sobre-corrección introducida en 0006. La parte de "defensa
-- en profundidad" de 0006 revocó EXECUTE de anon/authenticated sobre los helpers
-- SECURITY DEFINER public.auth_negocio_ids() y public.auth_tenant_id() (de 0003).
-- Eso ROMPIÓ RLS: las expresiones de las policies RLS se evalúan CON EL ROL QUE
-- CONSULTA (authenticated), no con privilegios del sistema — así que ese rol
-- NECESITA EXECUTE sobre esas funciones. Post-0006, un SELECT autenticado sobre
-- `negocio` fallaba con `permission denied for function auth_tenant_id`
-- (confirmado en vivo con scripts/verify-isolation.ts).
--
-- Estas funciones NO eran el vector de ataque: son caller-scoped (devuelven solo
-- el tenant/negocio del propio JWT; vacío/null para anon), no exponen datos de
-- otros tenants. Restaurar su EXECUTE a anon/authenticated repone el estado
-- pre-0006 y arregla RLS.
--
-- IMPORTANTE: esto NO toca los wrappers Vault (get/set_whatsapp_token). El fix
-- crítico de 0006 sobre ESOS sigue en pie — anon/authenticated siguen sin poder
-- ejecutarlos (verificado: scripts/verify-vault-wrappers-anon-denied.ts).
--
-- REVOKE/GRANT idempotentes. Project isolation: SOLO bdgufnitakelyialjoqg.
-- ============================================================================

BEGIN;

GRANT EXECUTE ON FUNCTION public.auth_negocio_ids() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_tenant_id()  TO anon, authenticated;

COMMIT;

-- ============================================================================
-- Post-condición: RLS del dashboard vuelve a funcionar (verify-isolation.ts
-- PASSED), y los wrappers Vault siguen bloqueados para anon/authenticated
-- (verify-vault-wrappers-anon-denied.ts PASSED).
-- ============================================================================
