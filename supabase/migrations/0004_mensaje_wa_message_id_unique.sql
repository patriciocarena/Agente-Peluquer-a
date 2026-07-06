-- ============================================================================
-- TurnosBot — Migration 0004: mensaje.wa_message_id dedup backstop (WA-03)
-- ============================================================================
-- Project isolation: este archivo pertenece SOLO al proyecto Supabase de
-- TurnosBot (bdgufnitakelyialjoqg). Nunca debe aplicarse a, ni referenciar,
-- ningún otro proyecto no relacionado (p. ej. el proyecto del restaurante).
--
-- Contexto (05-PATTERNS.md, resolviendo RESEARCH.md Open Question 2 / A2 por
-- inspección directa del archivo de migración): `0001_schema_core.sql` línea
-- 308 ya define `wa_message_id text UNIQUE` sobre `mensaje`, y
-- `0003_tenant_negocio_split.sql` NO tocó esa columna ni su constraint (solo
-- agregó `negocio_id` y dropeó `tenant_id` de las tablas operativas). Existe
-- entonces, en el schema ya aplicado, un `UNIQUE (wa_message_id)` PLANO
-- (global, no un compuesto `(negocio_id, wa_message_id)`) — más fuerte, en
-- rigor, que el compuesto que RESEARCH.md había asumido, ya que los IDs de
-- mensaje de WhatsApp son globalmente únicos en toda la Cloud API de Meta,
-- no solo por-negocio.
--
-- Este archivo NO crea ninguna constraint nueva — es un no-op idempotente
-- (`CREATE UNIQUE INDEX IF NOT EXISTS`) que documenta esa garantía existente
-- como el backstop durable de deduplicación para WA-03 (dedup de dos capas:
-- pg-boss `singletonKey` en la cola + este UNIQUE en la base como respaldo
-- permanente, incluso ante reinicios de proceso o expiración de la ventana
-- del singleton). Seguro de correr contra bdgufnitakelyialjoqg en cualquier
-- momento, incluso si 0001/0003 ya fueron aplicadas en vivo.
--
-- Verificación en vivo (merge-time check, NO parte de la suite automatizada):
-- confirmar que la constraint existe realmente en bdgufnitakelyialjoqg usando
-- la misma técnica de Management API que scripts/verify-migration-0003.ts
-- (query de solo-lectura contra pg_constraint/pg_indexes vía POST
-- https://api.supabase.com/v1/projects/bdgufnitakelyialjoqg/database/query),
-- gateada por un .env real con SUPABASE_ACCESS_TOKEN — no se ejecuta acá.
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS mensaje_wa_message_id_key
  ON public.mensaje (wa_message_id);

-- ============================================================================
-- End of migration 0004_mensaje_wa_message_id_unique.sql
-- ============================================================================
