---
status: partial
phase: 02-dashboard-y-datos-del-negocio
source: [02-VERIFICATION.md]
started: 2026-07-04T00:00:00.000Z
updated: 2026-07-04T00:00:00.000Z
---

## Current Test

[solo resta un spot-check visual en navegador — no bloqueante]

## Tests

### 1. Bootstrap del primer superadmin
expected: `scripts/bootstrap-superadmin.ts` corre contra `bdgufnitakelyialjoqg` con credenciales reales (email/contraseña, nunca hardcodeadas) y crea una fila en `perfil` con `rol='superadmin'`.
result: passed — 2026-07-04. Superadmin creado: auth.users.id=f66ffbaf-6141-4441-87bd-543faea1c2f9, email=phono4884@gmail.com, rol='superadmin' en perfil.

### 2. Ciclo de vida del panel superadmin (SADMIN-01/02/03)
expected: post-bootstrap, `scripts/verify-admin-tenant-lifecycle.ts` pasa — alta de tenant+owner+negocio, rollback compensatorio ante fallo, y listado aislado vía service_role server-side.
result: passed — 2026-07-04. Script PASSED: alta tenant+owner+negocio (whatsapp_token NULL), owner con rol='owner', listado service_role aislado (SADMIN-03), rol inválido rechazado por check constraint, compensación con 0 huérfanos, cleanup OK.

### 3. Spot-check visual/UX en navegador (ambos temas)
expected: persistencia de drag-and-drop de servicios, badges "Inactivo" en gris/muted, undo toast de "Copiar a todos los días", y que un owner nunca llega a `/admin` (redirect/403).
result: [pending] — spot-check manual en el navegador; no bloqueante (el gate de rol de /admin ya está verificado a nivel código/DB en middleware.ts).

## Summary

total: 3
passed: 2
issues: 0
pending: 1
skipped: 0
blocked: 0

## Gaps
