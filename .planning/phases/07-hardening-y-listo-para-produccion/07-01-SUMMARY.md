---
phase: 07-hardening-y-listo-para-produccion
plan: 01
subsystem: seguridad / hardening (secrets-at-rest)
tags: [sec-01, supabase-vault, security-definer, ddl-destructivo, db-types, live-db]
dependency-graph:
  requires: []
  provides: [SEC-01]
  affects:
    - packages/db-types/src/database.types.ts
    - apps/bot/src/whatsapp/getWhatsappToken.ts
    - apps/dashboard/app/actions/admin-tenants.ts
    - packages/availability-engine/src/__fixtures__/rows.ts
tech-stack:
  added:
    - "supabase_vault (extensión) habilitada en bdgufnitakelyialjoqg"
  patterns:
    - "wrappers public SECURITY DEFINER (set/get_whatsapp_token) como ÚNICO acceso a schema vault desde app-code"
    - "hardening idéntico a auth_negocio_ids() 0003: SET search_path='', REVOKE ALL FROM PUBLIC, GRANT EXECUTE TO service_role"
key-files:
  created:
    - scripts/sanity-whatsapp-token-predrop.ts
    - scripts/verify-0005-applied.ts
  modified:
    - packages/db-types/src/database.types.ts
decisions:
  - "0005 se aplicó a mano en el SQL Editor de Supabase (no vía Management API): el SUPABASE_ACCESS_TOKEN del .env está malformado (9 espacios internos, no es un sbp_...) y el host Postgres directo db.<ref>.supabase.co no resuelve desde este entorno (ENOTFOUND, IPv6-only). La única vía viable fue el SQL Editor."
  - "db-types se regeneró por edición quirúrgica manual del delta de 0005 (no vía `supabase gen types typescript`): no hay CLI de Supabase instalado y las dos vías de auth automáticas (PAT / host directo) están rotas. El delta es acotado y conocido: whatsapp_token→whatsapp_token_secret_id en negocio + 2 funciones (get/set_whatsapp_token) en Functions."
  - "No se agregó Relationship a vault.secrets en los tipos: `supabase gen types` no emite FKs hacia schemas no expuestos como vault."
metrics:
  duration: "sesión de destrabado (checkpoint humano)"
  completed: 2026-07-09
status: complete
---

# Phase 7 Plan 01: WhatsApp token en Supabase Vault (SEC-01) Summary

Blinda el token de larga duración de la WhatsApp Cloud API de cada negocio: se dropea la columna en texto plano `negocio.whatsapp_token` y se reemplaza por `whatsapp_token_secret_id uuid` (referencia a `vault.secrets`), con dos wrappers `SECURITY DEFINER` (`set_whatsapp_token_secret`, `get_whatsapp_token`) como único acceso sancionado al schema `vault` desde app-code. Mitiga T-07-01 (Information Disclosure) y T-07-02 (Elevation of Privilege).

## What Was Built / Applied

- **Migración `0005_whatsapp_token_vault.sql`** (ya commiteada en `09f65c4`) — **aplicada en vivo** contra `bdgufnitakelyialjoqg` vía SQL Editor ("Success. No rows returned").
- **`packages/db-types/src/database.types.ts`** — regenerado (delta manual): `negocio.whatsapp_token` → `whatsapp_token_secret_id: string | null` (Row/Insert/Update) y dos entradas nuevas en `Functions` (`get_whatsapp_token`, `set_whatsapp_token_secret`).
- **`scripts/sanity-whatsapp-token-predrop.ts`** — sanity-check read-only pre-DROP (vía REST/service_role).
- **`scripts/verify-0005-applied.ts`** — verificación post-migración vía REST (columna dropeada + wrapper `rpc`).

## Checkpoint Live Results

**Sanity pre-DROP** (contra `bdgufnitakelyialjoqg`, read-only):

| total negocios | con whatsapp_token != null |
|---|---|
| 3 | 0 |

→ Confirma Assumption A4 (admin-tenants.ts siempre escribía `whatsapp_token: null`). DROP COLUMN seguro, sin pérdida de datos.

**Verificación post-migración** (REST, service_role):

- ✅ `negocio.whatsapp_token` dropeada — `column negocio.whatsapp_token does not exist`.
- ✅ `negocio.whatsapp_token_secret_id` existe (select ok).
- ✅ `rpc get_whatsapp_token` ejecuta (devuelve null sin secreto) — al ser la transacción atómica, prueba que TODO 0005 commiteó (incluida la extensión Vault y el wrapper `set_whatsapp_token_secret`).

Los 3 `must_haves.truths` del plan quedan satisfechos.

## Deviations from Plan

### 1. [Blocking → resuelto] Aplicación por SQL Editor, no por Management API
- **Issue:** El plan asumía aplicar 0005 vía Management API con `SUPABASE_ACCESS_TOKEN` (mismo patrón que 0003). Ese PAT en `.env` está **malformado** (9 espacios internos, no empieza con `sbp_`) → la API responde `{"message":"Format is Authorization: Bearer [token]"}`. El fallback por Postgres directo (`SUPABASE_DB_URL`) tampoco sirve: `db.<ref>.supabase.co` **no resuelve** desde este entorno (`ENOTFOUND`, host IPv6-only; el IPv4 iría por el pooler, cuyo string no está en `.env`).
- **Fix:** El usuario pegó el SQL en el SQL Editor de `bdgufnitakelyialjoqg` ("Success. No rows returned"). Verificado por REST (única vía de auth funcionante desde acá).

### 2. db-types regenerado por edición manual, no por `supabase gen types`
- **Issue:** No hay CLI de Supabase instalado, y las dos vías de auth (PAT / host directo) están rotas (ver #1). `supabase gen types typescript` no es corrible desde este entorno.
- **Fix:** Delta aplicado a mano sobre `database.types.ts`. Es acotado y verificable 1:1 contra el SQL de 0005.

## Handoff a 07-02 — breaks de tipo ESPERADOS

La regeneración de tipos rompe el build en los sitios que aún referencian la columna dropeada (esto es la señal de qué migrar; lo arregla 07-02):

- ✅ **Cubiertos por 07-02** (files_modified declarados):
  - `apps/bot/src/whatsapp/getWhatsappToken.ts:30,33` (choke point D-04)
  - `apps/dashboard/app/actions/admin-tenants.ts:160,238`

- ⚠️ **GAP de scope — NO cubiertos por 07-02:**
  - `packages/availability-engine/src/__fixtures__/rows.ts:54` (`whatsapp_token: null`) — **rompe el build de availability-engine** (`tsc -b`).
  - Scripts que aún referencian la columna (rompen solo al correrse, no en `pnpm -r build`): `scripts/apply-seed.ts:177`, `scripts/verify-admin-tenant-lifecycle.ts:111,130`, `scripts/verify-migration-0003.ts:113,122`.
  - **Acción requerida:** decidir si se expande 07-02, se agrega un plan, o se folda en el cierre de fase.

## Threat Flags / Otros hallazgos

- **[PRE-EXISTENTE, ajeno a 0005]** `apps/bot/src/conversation/responder.ts:365` — `error TS2554: Expected 4 arguments, but got 0` (`buildSystemPrompt()` llamado sin args en el path de retry de empty-text). Confirmado que ya estaba roto en `main` (35172ef) antes de tocar los tipos (stash de mis edits → el error persiste). `apps/bot` **no typechequea limpio en main** por esto, independientemente de SEC-01. Requiere un fix propio (¿arrastre de fase 05/06?).
- **Operativo:** el `.env` de este entorno tiene el PAT roto y el host directo inalcanzable → toda migración/DDL futura va por SQL Editor + verificación REST hasta que se arregle `SUPABASE_ACCESS_TOKEN`.
