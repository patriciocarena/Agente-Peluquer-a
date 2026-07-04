# Phase 1: Fundación multitenant - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-03
**Phase:** 1-fundaci-n-multitenant
**Areas discussed:** Alcance del schema, Usuario→peluquería, Estados que ocupan turno, Esqueleto ARM

---

## Selección de áreas

| Opción | Descripción | Seleccionada |
|--------|-------------|--------------|
| Alcance del schema | 16 tablas completas ahora vs. núcleo mínimo | (delegado) |
| Usuario → peluquería | Cómo el dashboard mapea usuario a tenant | (delegado) |
| Estados que ocupan turno | Qué estados bloquean la constraint anti-doble-reserva | (delegado) |
| Esqueleto ARM | Alcance del esqueleto de infraestructura | (delegado) |

**Respuesta del usuario:** "No preference" — el usuario delegó la selección de áreas. Se aplicó el criterio estándar (opción recomendada) en las cuatro áreas y se presentaron para confirmación.

---

## Alcance del schema

| Opción | Descripción | Seleccionada |
|--------|-------------|--------------|
| 16 tablas completas ahora | Crear todo el schema de referencia; RLS uniforme día 1; evita reescribir migraciones | ✓ |
| Núcleo mínimo | Solo tenant/profesional/servicio/turno/bloqueo; resto por fase | |

**Elección del usuario:** 16 tablas completas ahora (confirmado).
**Notas:** Tablas de fases futuras (`conversation`, `message`, `reminder`) se crean con estructura + RLS pero quedan sin lógica cableada. `reminder` reservada aunque sea v2.

---

## Usuario → peluquería (aislamiento del dashboard)

| Opción | Descripción | Seleccionada |
|--------|-------------|--------------|
| Tabla de perfil ligada a auth.uid() | `id=auth.uid()`, `tenant_id`, flag de rol; RLS lee esa fila | ✓ |
| Claim de tenant en el JWT | tenant_id embebido en el token | |

**Elección del usuario:** Tabla de perfil (confirmado).
**Notas:** Roles `owner` (RLS-scoped) y `superadmin` (service_role, ruta aislada). v1: 1 usuario = 1 tenant. Reemplaza el `password_hash` manual del schema de referencia.

---

## Estados del turno que ocupan el horario

| Opción | Descripción | Seleccionada |
|--------|-------------|--------------|
| pendiente + confirmado ocupan / cancelado libera | `EXCLUDE ... WHERE (estado != 'cancelado')` | ✓ |
| solo confirmado ocupa (pendiente no reserva) | | |
| sumar estado no_show | | |

**Elección del usuario:** pendiente + confirmado ocupan; cancelado libera (confirmado).
**Notas:** Un turno en negociación/pendiente reserva el slot para evitar doble toma. Constraint a nivel Postgres (GiST), no aplicación.

---

## Esqueleto de infraestructura (ARM)

| Opción | Descripción | Seleccionada |
|--------|-------------|--------------|
| Mínimo real | Monorepo + Dockerfile + compose que compila/arranca en linux/arm64 + health check, sin lógica | ✓ |
| Andamiaje más amplio | Ambas apps ya esbozadas | |

**Elección del usuario:** Mínimo real (confirmado).
**Notas:** Objetivo — validar ARM (Success Criteria #5) antes de acumular dependencias.

---

## Claude's Discretion

- Herramienta/flujo de migraciones (archivos SQL vs. MCP `apply_migration`).
- Técnica exacta de la política RLS (subconsulta vs. función helper `SECURITY DEFINER`).
- Mecanismo de seed de tenants de prueba.
- Nombres de columnas/índices y tipo de rango de la GiST.
- Gestor de paquetes del monorepo y process manager.
- Detalles del health check y del Dockerfile.

## Deferred Ideas

- Encriptación de tokens de WhatsApp (SEC-01) → Fase 7.
- Test de carga concurrente formal (SEC-02) → Fase 7.
- Suite de aislamiento cross-tenant service_role (SEC-03) → Fase 7.
- Recordatorios automáticos (REMIND-01) → v2; solo se reserva la tabla.
- Multi-usuario por peluquería → no en v1.
