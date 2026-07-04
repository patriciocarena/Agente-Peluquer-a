---
phase: quick
plan: 260704-jb5
subsystem: planning-docs
tags: [docs, phase-02, data-model, tenant-negocio]
status: complete
dependency-graph:
  requires: []
  provides:
    - "02-UI-SPEC.md reflecting Tenant -> Negocio(s) model"
    - "02-RESEARCH.md reflecting migration 0003 requirement"
  affects:
    - .planning/phases/02-dashboard-y-datos-del-negocio/02-UI-SPEC.md
    - .planning/phases/02-dashboard-y-datos-del-negocio/02-RESEARCH.md
tech-stack:
  added: []
  patterns:
    - "Tenant (grupo) -> Negocio(s) (sucursales) data model reflected in planning docs"
key-files:
  created: []
  modified:
    - .planning/phases/02-dashboard-y-datos-del-negocio/02-UI-SPEC.md
    - .planning/phases/02-dashboard-y-datos-del-negocio/02-RESEARCH.md
decisions: []
metrics:
  duration: ~25 min
  completed: 2026-07-04
---

# Phase quick Plan 260704-jb5: Terminar de actualizar 02-UI-SPEC.md y 02-RESEARCH.md (Tenant -> Negocio(s)) Summary

Sincronizados `02-UI-SPEC.md` y `02-RESEARCH.md` de la Fase 2 con el modelo de datos revisado **Tenant (grupo) → Negocio(s) (sucursales)**, ya reflejado en `02-CONTEXT.md` (D-09..D-13) y `02-HANDOFF.md` §3/§4, dejando ambos documentos listos para retomar `/gsd-plan-phase 2`.

## What Was Built

### Task 1 — 02-UI-SPEC.md actualizado al modelo Tenant → Negocio(s)

- **Scope:** ahora describe explícitamente el modelo Tenant (grupo) → Negocio(s), con el CRUD de Profesionales/Servicios/Negocio operando sobre el negocio seleccionado, y el panel superadmin gestionando Tenants (solo `nombre`) y, dentro de cada uno, sus Negocios (datos generales + WhatsApp no-secreta).
- **Layout & Navigation:**
  - Owner shell: agregado el **selector de negocio** en el topbar (dropdown que fija el `negocio_id` activo para todo el CRUD de la sesión; colapsa a etiqueta fija si el tenant tiene un único negocio).
  - Superadmin shell: navegación jerárquica **Grupos (Tenants) → Negocios** dentro de cada grupo, con breadcrumb/back-link.
- **Copywriting Contract:** separados `+ Nuevo grupo` (Tenant) de `+ Nueva peluquería` (Negocio); dos pares de empty states (lista de Grupos vs lista de Negocios dentro de un grupo); destructivos separados — desactivar un Negocio afecta solo su WhatsApp/turnos, desactivar un Tenant afecta el login del owner.
- **CRUD Interaction Pattern:** la fila única "Superadmin Tenant" reemplazada por dos filas — Tenant (Dialog con solo `nombre`) y Negocio (Dialog con datos generales + WhatsApp no-secreta).
- **Perfil del negocio (BIZ):** aclarado que todo el CRUD de perfil opera sobre el negocio seleccionado.
- También se actualizó el bloque de "Visual Hierarchy" (focal points) que aún mencionaba la navegación vieja de `/admin`.

### Task 2 — 02-RESEARCH.md actualizado: migración 0003 requerida

- Reemplazada la conclusión "Phase 2 needs ZERO schema migrations" (Summary + Schema Readiness Audit + "Key insight") por: **se requiere la migración `0003_tenant_negocio_split.sql`**, resumiendo (no rediseñando) el spec de 8 pasos ya definido en `02-HANDOFF.md` §4: mover WhatsApp de `tenant` a `negocio`, agregar `negocio_id` a las 11 tablas operativas (backfill + CASCADE + drop de `tenant_id`), re-scopear uniques de `cliente`/`conversacion`, mantener las EXCLUDE constraints (siguen por `profesional_id`), reescribir RLS con el helper `auth_negocio_ids()`, regenerar `packages/db-types`, y actualizar seeds.
- Ajustado el mapeo de requisitos: BIZ-02 ahora lee `negocio.display_phone_number`; SADMIN-01/02 pasan a ser dos entidades separadas (Tenant vs Negocio); AUTH-03 documenta el aislamiento operativo por `negocio_id`.
- Ajustado el Pattern 3 (alta de superadmin): ahora crea Tenant(`nombre`) → Negocio(s) con WhatsApp → `perfil` ligado al Tenant, con el mismo patrón de compensating-rollback.
- Ajustado el diagrama de arquitectura: la anotación de RLS pasó de `tenant_id = auth_tenant_id()` a `negocio_id IN (SELECT auth_negocio_ids())` para las tablas operativas (perfil/tenant/negocio siguen por `auth_tenant_id()`).
- Se agregó una sección "Modelo de datos: Tenant → Negocio(s)" y se revisó D-05 en los User Constraints para reflejar "1 usuario = 1 Tenant, gestiona N Negocios" (SUPERSEDE el "1 usuario = 1 peluquería" original).

### Task 3 — Commit docs-only

- Commit único `591ad17` — `docs(02): reflejar modelo Tenant->Negocio(s) en UI-SPEC y RESEARCH` — incluye exactamente `02-UI-SPEC.md` y `02-RESEARCH.md`.
- `02-HANDOFF.md` y `02-CONTEXT.md` verificados sin cambios (`git diff HEAD~1 HEAD` vacío para ambos).
- No se hizo push.

## Deviations from Plan

None — plan executed exactly as written. Todas las verificaciones automatizadas de las 3 tareas pasaron sin necesidad de reintentos.

## Self-Check: PASSED

- FOUND: `.planning/phases/02-dashboard-y-datos-del-negocio/02-UI-SPEC.md` (modified, contains "selector de negocio" and "Nuevo grupo", no longer contains "tenants = peluquer")
- FOUND: `.planning/phases/02-dashboard-y-datos-del-negocio/02-RESEARCH.md` (modified, contains "0003" and "auth_negocio_ids", no longer contains "ZERO schema migrations")
- FOUND: commit `591ad17` in `git log --oneline` on branch `worktree-agent-ab7da3eda1d70d7b0`, touching exactly the two target files
- FOUND: `.planning/phases/02-dashboard-y-datos-del-negocio/02-CONTEXT.md` and `02-HANDOFF.md` unchanged by the commit (verified via `git diff HEAD~1 HEAD --stat` for those paths — no output)
