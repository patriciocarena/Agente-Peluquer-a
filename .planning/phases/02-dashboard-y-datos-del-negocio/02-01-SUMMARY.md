---
phase: 02-dashboard-y-datos-del-negocio
plan: 01
type: execute
status: complete
completed: 2026-07-04
requirements: [SADMIN-01, SADMIN-02, AUTH-03, BIZ-02]
---

# SUMMARY 02-01 — Split de schema Tenant→Negocio (aplicado en vivo)

## Qué se hizo

Reorganización del schema Postgres del modelo 1:1 `Tenant=Negocio` (Fase 1) al modelo
`Tenant(grupo, solo nombre) → Negocio(1..N con WhatsApp) → 11 tablas operativas por negocio_id`,
**aplicada en vivo contra `bdgufnitakelyialjoqg`** y con tipos regenerados desde el schema live.

### Tareas

| Task | Estado | Commit |
|------|--------|--------|
| 1 — Escribir `0003_tenant_negocio_split.sql` | ✅ | `7507533` (+ fixes en el checkpoint) |
| 2 — Actualizar seeds + `verify-migration-0003.ts` | ✅ | `750b50c` |
| 3 — [checkpoint humano] Aplicar en vivo + regen tipos + reseed + verify | ✅ | este commit |

## Checkpoint humano (Task 3)

Aplicado por el orquestador con credenciales reales del usuario (`.env` local), previa
confirmación explícita del ref `bdgufnitakelyialjoqg` (nunca el proyecto del restaurante).
Ruta de aplicación: Management API (`POST /v1/projects/bdgufnitakelyialjoqg/database/query`
vía curl), sancionada en CLAUDE.md.

### Defectos encontrados y corregidos durante la aplicación en vivo

El SQL original (Task 1) falló dos veces en la DB live; ambos arreglados en el checkpoint:

1. **Orden de drops (2BP01):** el paso 3 dropeaba `<tabla>.tenant_id` antes de que las 11
   policies `<tabla>_aislamiento` (predicado por `tenant_id`) y los 2 uniques
   (`cliente_telefono_unico_por_tenant`, `conversacion_unica_por_cliente`) dejaran de
   referenciar la columna. **Fix:** nuevo paso 2.5 que dropea esos objetos ANTES de la
   cirugía de columnas; las recreaciones quedan en los pasos 4 (uniques) y 6 (policies).
2. **`search_path=''` (42883):** el cuerpo de `auth_negocio_ids()` llamaba a
   `auth_tenant_id()` sin calificar, irresoluble con search_path vacío. **Fix:**
   `public.auth_tenant_id()` (mismo patrón que `auth.uid()`/`public.perfil` en 0002).

Ambos fallos hicieron rollback completo (transacción única `BEGIN/COMMIT`) — verificado
que la DB volvió a estado pre-0003 antes de cada reintento. Nada quedó parcialmente aplicado.

## Verificación (evidencia)

- Migración aplicada: **HTTP 201** contra `bdgufnitakelyialjoqg`.
- `scripts/verify-migration-0003.ts`: **exit 0** — asserta contra la DB live:
  - `tenant` tiene `nombre`+`activo`, NO tiene columnas WhatsApp.
  - `negocio` tiene las 4 columnas WhatsApp + `activo`.
  - Las 11 tablas operativas tienen `negocio_id` NOT NULL y NO tienen `tenant_id`.
  - `auth_negocio_ids()` existe; las 11 policies `*_aislamiento` filtran por `negocio_id`.
- Tipos regenerados (`packages/db-types/src/database.types.ts`): `tenant` sin WhatsApp,
  `negocio` con WhatsApp+`activo`, operativas con `negocio_id`.
- Reseed (`scripts/apply-seed.ts`): OK — TENANT_A con 2 negocios (1:N), TENANT_B con 1,
  owners `owner-norte@` / `owner-sur@` creados. Ningún token real escrito (SEC-01 → Fase 7).

## Artefactos

- `supabase/migrations/0003_tenant_negocio_split.sql` (aplicada)
- `scripts/apply-seed.ts`, `scripts/seed-fixtures.ts` (shape post-0003)
- `scripts/verify-migration-0003.ts` (verificador vivo reutilizable)
- `packages/db-types/src/database.types.ts` (regenerado desde schema live)

## Notas para fases siguientes

- El helper de RLS operativo es `auth_negocio_ids()` (análogo a `auth_tenant_id()`).
- `whatsapp_token` en `negocio` queda nullable, sin escribir, hasta Fase 7.
- El `.env` del usuario tiene `SUPABASE_PROJECT_REF` como placeholder (no usado por estos
  scripts, que derivan el ref de `SUPABASE_URL`); conviene poblarlo si otra herramienta lo pide.
