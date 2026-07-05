---
status: partial
phase: 02-dashboard-y-datos-del-negocio
source: [02-VERIFICATION.md]
started: 2026-07-04T00:00:00.000Z
updated: 2026-07-04T00:00:00.000Z
---

## Current Test

[awaiting human action — bootstrap del primer superadmin]

## Tests

### 1. Bootstrap del primer superadmin
expected: `scripts/bootstrap-superadmin.ts` corre contra `bdgufnitakelyialjoqg` con credenciales reales (email/contraseña, nunca hardcodeadas) y crea una fila en `perfil` con `rol='superadmin'`.
result: [pending]

### 2. Ciclo de vida del panel superadmin (SADMIN-01/02/03)
expected: post-bootstrap, `scripts/verify-admin-tenant-lifecycle.ts` pasa — alta de tenant+owner+negocio, rollback compensatorio ante fallo, y listado aislado vía service_role server-side.
result: [pending]

### 3. Spot-check visual/UX en navegador (ambos temas)
expected: persistencia de drag-and-drop de servicios, badges "Inactivo" en gris/muted, undo toast de "Copiar a todos los días", y que un owner nunca llega a `/admin` (redirect/403).
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
