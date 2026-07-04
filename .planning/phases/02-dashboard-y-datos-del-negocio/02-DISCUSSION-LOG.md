# Phase 2: Dashboard y datos del negocio - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-04
**Phase:** 02-dashboard-y-datos-del-negocio
**Areas discussed:** Estilo visual / sistema de UI, Panel superadmin: acceso y separación

---

## Estilo visual / sistema de UI

### Enfoque de UI

| Option | Description | Selected |
|--------|-------------|----------|
| shadcn/ui + Tailwind | Componentes accesibles copiables al repo (Radix + Tailwind); estándar Next.js App Router + React 19; ideal CRUD admin | ✓ |
| Tailwind solo | Solo utilidades, componentes a mano; más liviano pero más trabajo para tablas/modales accesibles | |
| Librería (Mantine/Chakra) | Librería completa lista; rápido pero dependencia grande y menos control; posible choque con React 19 | |

**User's choice:** shadcn/ui + Tailwind

### Tono / tema

| Option | Description | Selected |
|--------|-------------|----------|
| Admin limpio y neutro, solo claro | Sobrio, solo modo claro; menos superficie | |
| Limpio + modo oscuro | Mismo estilo con claro/oscuro conmutable | ✓ |
| Con color de marca peluquería | Acento con identidad del rubro | |

**User's choice:** Limpio + modo oscuro
**Notes:** Se define soporte claro/oscuro con tokens en ambos modos desde el inicio (no agregar dark mode después).

---

## Panel superadmin: acceso y separación

### Acceso del superadmin

| Option | Description | Selected |
|--------|-------------|----------|
| Ruta /admin misma app, gateada por rol | Mismo login; middleware gatea por rol; cross-tenant server-side con service_role aislado; un solo deploy | ✓ |
| App/subdominio separado | Panel aparte; más aislamiento físico pero duplica setup; sobredimensionado para v1 | |
| Mismo dashboard, sección condicional | Sin ruta aparte; mezcla superficies owner/superadmin; más riesgo de fuga | |

**User's choice:** Ruta /admin en la misma app, gateada por rol

### Config de WhatsApp / token (SADMIN-02 vs SEC-01)

| Option | Description | Selected |
|--------|-------------|----------|
| Solo config no-secreta ahora; token en Fase 7 | Carga phone_number_id/waba_id/número visible; token + encriptación en Fase 7 | ✓ |
| Cargar token ya, con Supabase Vault | Vault ahora, token encriptado desde Fase 2; adelanta trabajo de Fase 7 | |
| Cargar token en plano por ahora | ⚠️ No recomendado; contradice guardrail duro de CLAUDE.md | |

**User's choice:** Solo config no-secreta ahora; token en Fase 7
**Notes:** SADMIN-02 queda parcial en Fase 2 (config no-secreta) y se completa en Fase 7 con el token encriptado. BIZ-02 se satisface con el número visible.

---

## Claude's Discretion

Áreas no seleccionadas por el usuario (decide Claude al planificar / en ui-phase):
- Layout y navegación (shell): sidebar vs top-nav, rutas vs secciones, densidad.
- Editor de horario semanal del profesional (PRO-02): UX del input de múltiples bloques por día.
- Asignación de servicios por profesional + precio custom (PRO-03/04): dónde/cómo.
- Patrón de mutación (Server Actions vs Route Handlers) dentro del patrón SSR fijado.
- Patrón de CRUD (inline/modal/página), soft-delete, orden de servicios (SVC-02).

## Deferred Ideas

- Token de WhatsApp + encriptación (SEC-01) → Fase 7; SADMIN-02 se completa ahí.
- Motor de disponibilidad (Fase 3) y grilla de turnos (Fase 4) — no en Fase 2.
- Métricas/analytics — Out of Scope.
- Multi-usuario por peluquería — no en v1.
