---
quick_id: 260710-jgn
slug: cerrar-sadmin-superadmin-live
date: 2026-07-10
status: complete
requirements-completed: [SADMIN-01, SADMIN-02, SADMIN-03]
---

# Quick Task 260710-jgn — Summary

## Qué se hizo

Cierre de `SADMIN-01/02/03` en `REQUIREMENTS.md` tras ejecutar en vivo el flujo del primer
superadmin (acción manual §2.2 del `HANDOFF-milestone-v1.md`).

**Ejecución en vivo (contra `bdgufnitakelyialjoqg`, ref confirmado por el guard de cada script):**

- `node --env-file=.env --import tsx scripts/bootstrap-superadmin.ts` → OK.
  `perfil` superadmin creado: `auth.users.id=f66ffbaf-6141-4441-87bd-543faea1c2f9`,
  email `phono4884@gmail.com`, `tenant_id=NULL`, `rol=superadmin`.
- `node --env-file=.env --import tsx scripts/verify-admin-tenant-lifecycle.ts` → **PASSED, exit 0**.
  Happy-path (Tenant+dueño+Negocio, `whatsapp_token_secret_id=NULL`), rollback compensatorio
  (cero huérfanos), listado `service_role` aislado de RLS. La base quedó limpia (datos de
  prueba eliminados por el propio script).

## Mapa evidencia → requisito

| Requisito | Evidencia en vivo |
|-----------|-------------------|
| SADMIN-01 (crear/editar/desactivar tenants) | lifecycle: happy-path + rollback |
| SADMIN-02 (config WhatsApp por tenant) | lifecycle: phone_number_id/waba_id/número visible en el alta; token encriptado por `verify-vault-no-plaintext.ts` + `verify-vault-wrappers-anon-denied.ts` (SEC-01) |
| SADMIN-03 (listar/aislar todos los tenants) | lifecycle: listado `service_role` |

## Cambios (solo docs)

- `REQUIREMENTS.md`: nota "Sin tildar a propósito" → nota de evidencia en vivo; `[x]` SADMIN-01/02/03; tabla de estado `Pending` → `Done`.
- `STATE.md`: bootstrap superadmin marcado RESUELTO en 3 lugares; conteo `48/51` → `51/51`; Session Continuity actualizada (quedan 3 acciones humanas).

## Pendiente (no bloquea el requisito de mecanismo)

Confirmación **visual** del gate `/admin` por la UI (superadmin lo ve, owner no) — paso 4
humano de `02-08-PLAN.md` Task 3. Cae dentro de los tests visuales de la fase 04.

## Fuera de alcance (por pedido del usuario)

Decisión de cuota de Gemini: se dejó **pendiente**, sin registrar como resuelta.
