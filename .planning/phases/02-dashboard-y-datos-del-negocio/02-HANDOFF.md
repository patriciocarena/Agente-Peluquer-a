# Phase 2 — HANDOFF (trabajo en curso)

**Fecha:** 2026-07-04
**Estado:** Planificación de la Fase 2 **PAUSADA a mitad de un cambio de modelo de datos.** Hay que terminar de actualizar 2 documentos antes de retomar `/gsd-plan-phase 2`.

---

## 1. El cambio de modelo (Tenant → Negocio(s))

**Antes (Fase 1):** `Tenant` era 1:1 con la peluquería, tenía el WhatsApp, y todas las tablas operativas colgaban de `tenant_id`.

**Ahora:** un **`Tenant` es un contenedor/grupo** que puede tener **1..N `Negocio`** (sucursales). Cada `Negocio` tiene su propio WhatsApp, profesionales, servicios, clientes, turnos, horarios. El `Tenant` queda con **solo `nombre`**.

**Decisiones confirmadas por el dueño (2026-07-04):**
- **Owner a nivel Tenant** con **selector de negocio** en el dashboard. `perfil` sigue ligado a `tenant_id`. RLS operativa = "el negocio pertenece a mi tenant". **1 usuario (owner) = 1 Tenant, gestiona N Negocios.**
- **Todos los campos de perfil del negocio viven en `Negocio`** (timezone, dirección, teléfono, granularidad, horario general). Tenant = solo `nombre`.
- El **superadmin** gestiona DOS entidades separadas: **Tenant** (solo nombre) y **Negocio** (datos generales + WhatsApp no-secreta), reflejando la jerarquía.

---

## 2. Estado de los 3 documentos

| Documento | Estado | Qué falta |
|-----------|--------|-----------|
| `02-CONTEXT.md` | ✅ **HECHO** | Actualizado: domain boundary + D-09..D-13 (nuevo modelo) + D-03/D-04/D-05 revisados + `<deferred>` con impacto cross-fase. Es la **fuente de verdad** del nuevo modelo — leerlo primero. |
| `02-UI-SPEC.md` | ❌ **PENDIENTE** | Todavía describe el flujo viejo "Superadmin Tenant = peluquería, un solo Dialog con WhatsApp". Ver §3. |
| `02-RESEARCH.md` | ❌ **PENDIENTE** | Su "Schema Readiness Audit" concluye **"cero migraciones"** — YA NO es cierto. Ver §4. |

---

## 3. Ediciones pendientes en `02-UI-SPEC.md`

1. **Scope (línea ~14):** reflejar Tenant + Negocio(s), no "tenants = peluquerías".
2. **Layout & Navigation:**
   - **Owner shell:** agregar un **selector de negocio** (dropdown en el topbar o sidebar) que fija el "negocio activo"; todo el CRUD opera sobre ese `negocio_id`. Si el tenant tiene 1 solo negocio, colapsa a etiqueta fija.
   - **Superadmin shell:** navegación que refleje **Tenant → Negocio(s)** (ej: lista de Tenants → al entrar a un tenant, su lista de Negocios).
3. **Copywriting Contract:**
   - Hoy `+ Nueva peluquería` crea un tenant → **"peluquería" en lenguaje de negocio ES un Negocio**, no un Tenant. Separar: `+ Nuevo grupo` (crea Tenant) y `+ Nueva peluquería` (crea Negocio dentro de un tenant).
   - Empty states: uno para **lista de Tenants** ("Todavía no hay grupos…") y otro para **lista de Negocios dentro de un tenant** ("Este grupo todavía no tiene peluquerías…").
   - Destructivos: **separar** "Desactivar grupo/Tenant" de "Desactivar peluquería/Negocio". El copy actual de "Desactivar peluquería" mezcla efectos de tenant (login del dueño) con los de negocio (WhatsApp) — corregir: desactivar un Negocio afecta solo a ese negocio (su WhatsApp/turnos); el login del owner depende del Tenant.
4. **CRUD Interaction Pattern (tabla):** reemplazar la fila "Superadmin Tenant → Dialog con Datos generales + WhatsApp" por **DOS filas**: (a) **Superadmin Tenant** → Dialog con **solo `nombre`**; (b) **Superadmin Negocio** → Dialog con datos generales (nombre, dirección, teléfono, timezone, granularidad) + **WhatsApp no-secreta** (phone_number_id, waba_id, número visible; SIN token).
5. **Perfil del negocio (BIZ):** todo el CRUD de perfil opera sobre el **negocio seleccionado**; "WhatsApp vinculado" (BIZ-02) muestra el `display_phone_number` del negocio.

---

## 4. Ediciones pendientes en `02-RESEARCH.md` + spec de la migración `0003`

Reemplazar la conclusión "**Phase 2 needs ZERO schema migrations**" (Schema Readiness Audit + Summary + "key insight") por: **se requiere la migración `0003`**. También ajustar: el mapeo de requisitos (BIZ-02 `display_phone_number` ahora en `negocio`; SADMIN-01/02 = Tenant vs Negocio; AUTH-03 aislamiento operativo ahora por negocio), el **Pattern 3** (alta de superadmin: ahora crea Tenant `nombre` → luego Negocio(s) con WhatsApp; el owner se liga al tenant), y el diagrama de arquitectura (predicado RLS).

### Spec de la migración `0003_tenant_negocio_split.sql`

Trabaja sobre `supabase/migrations/0001_schema_core.sql` (schema) y `0002_rls_policies.sql` (RLS). Pasos:

1. **`tenant`:** `ADD COLUMN nombre text` → backfill desde su `negocio.nombre` (hoy 1:1) → `SET NOT NULL`. `DROP COLUMN whatsapp_phone_number_id, waba_id, whatsapp_token, display_phone_number`. Drop `idx_tenant_whatsapp_phone_number_id`.
2. **`negocio`:** `ADD COLUMN whatsapp_phone_number_id text UNIQUE, waba_id text, whatsapp_token text, display_phone_number text, activo boolean NOT NULL DEFAULT true`. Backfill los valores de WhatsApp **desde el tenant padre** ANTES de dropearlos de `tenant`. Índice en `whatsapp_phone_number_id`.
3. **Tablas operativas** (`profesional`, `horario_trabajo`, `servicio`, `profesional_servicio`, `cliente`, `turno`, `turno_servicio`, `bloqueo`, `conversacion`, `mensaje`, `recordatorio`): `ADD COLUMN negocio_id uuid REFERENCES negocio(id) ON DELETE CASCADE`. **Backfill** (hoy 1:1: `negocio_id` = el negocio cuyo `tenant_id` = el `tenant_id` de la fila; para tablas hijas como `horario_trabajo`/`profesional_servicio`/`turno_servicio` backfillear desde el `negocio_id` del padre). `SET NOT NULL`. Dropear FK+índices de `tenant_id`, luego `DROP COLUMN tenant_id`. Agregar `idx_<tabla>_negocio_id`. Actualizar índices compuestos (`idx_turno_tenant_profesional_inicio` → por `negocio_id`; ídem `bloqueo`).
4. **Uniques:** `cliente` (`tenant_id`,`telefono`) → (`negocio_id`,`telefono`); `conversacion` (`tenant_id`,`cliente_id`) → (`negocio_id`,`cliente_id`).
5. **EXCLUDE constraints** (`turno_no_overlap`, `bloqueo_no_overlap`) usan `profesional_id` → **NO cambian**.
6. **RLS (nuevo `0004` o dentro de `0003`):** mantener `perfil` (`id=auth.uid()`), `tenant` (`id=auth_tenant_id()`), `negocio` (`tenant_id=auth_tenant_id()`). Para las tablas operativas: DROP de las policies `*_aislamiento` viejas (`tenant_id=auth_tenant_id()`) y crear helper `auth_negocio_ids()` (SECURITY DEFINER, STABLE, `search_path=''`, `GRANT EXECUTE ... authenticated`) que devuelva `SELECT id FROM public.negocio WHERE tenant_id = auth_tenant_id()`; nuevas policies `USING/WITH CHECK (negocio_id IN (SELECT auth_negocio_ids()))`.
7. **`packages/db-types`:** regenerar (`supabase gen types typescript`) tras aplicar.
8. **Seeds/fixtures** (`supabase/seed.sql`, `scripts/*seed*`): actualizar al shape Tenant(nombre) → Negocio(s con WhatsApp) → filas operativas con `negocio_id`. Los 2 tenants de prueba (Barbería Norte / Barbería Sur) deberían pasar a ser, p.ej., un Tenant con 2 Negocios (para probar el modelo 1:N), o mantenerse como 2 tenants de 1 negocio — decidir al planificar.
9. **Impacto cross-fase (NO tocar en Fase 2):** `tenantScoped(tenantId)` del bot (Fase 1, CORE-03) deberá volverse `negocioScoped(negocioId)` en la fase del bot.

**Aplicar la migración en vivo requiere las credenciales de Supabase `bdgufnitakelyialjoqg`** (`.env`, gitignored — NO está en el repo) o el PAT de la Management API. Coordinar con el dueño. La regla dura de aislamiento de proyecto (ver `CLAUDE.md`): **solo** `bdgufnitakelyialjoqg`, nunca el proyecto del restaurante.

---

## 5. Cómo retomar

1. Leer `02-CONTEXT.md` (fuente de verdad del nuevo modelo), luego este handoff.
2. Terminar las ediciones de `02-UI-SPEC.md` (§3) y `02-RESEARCH.md` (§4).
3. Commitear esos cambios.
4. Retomar `/gsd-plan-phase 2` — ahora el gate de UI ya está satisfecho (existe UI-SPEC) y el planner debe incluir una tarea **`[BLOCKING]` de migración + schema-push** (0003) antes de la verificación.

## 6. Notas de entorno
- Repo git en `main` (rama por defecto), remoto `origin` = `github.com/patriciocarena/Agente-Peluquer-a`.
- `.env` NO está en el repo (gitignored). Para tocar la DB en vivo hacen falta credenciales propias del proyecto `bdgufnitakelyialjoqg`.
- Stack/flujo: es un proyecto GSD (`.planning/`), pnpm monorepo, Next.js 16 + Supabase. `gsd-sdk` requerido para los comandos GSD.
- Docker/colima solo se necesitan para el build arm64 del bot (no para el trabajo de la Fase 2).
