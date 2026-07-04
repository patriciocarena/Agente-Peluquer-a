# Phase 2: Dashboard y datos del negocio - Context

**Gathered:** 2026-07-04
**Status:** Ready for planning

<domain>
## Phase Boundary

El dueño se loguea al dashboard y administra los datos base de sus peluquerías. **Modelo de datos (revisado 2026-07-04): un `Tenant` es un contenedor/grupo que puede tener uno o varios `Negocio` (sucursales); cada `Negocio` tiene su propio WhatsApp, profesionales, servicios, clientes, turnos y horarios.** El dueño (owner) opera a nivel Tenant y elige con qué Negocio trabaja mediante un **selector de negocio** en el dashboard; para el Negocio seleccionado administra: profesionales (con horario semanal recurrente + servicios que realiza + precio custom opcional), servicios (nombre, descripción, precio, duración, orden) y el perfil del negocio (nombre, dirección, teléfono, horario general, timezone, granularidad de grilla, y ver el número de WhatsApp vinculado del Negocio). En paralelo, el superadmin da de alta/edita/desactiva **Tenants** (solo nombre) y, por separado, crea/edita/desactiva **Negocios** dentro de cada tenant (cada uno con su config de WhatsApp no-secreta), desde un panel `/admin` aislado del acceso de los dueños. Se construye **todo el dashboard Next.js de cero** (hoy `apps/dashboard` es solo stub) sobre las tablas de la Fase 1, **más una migración `0003` que reorganiza el schema al modelo Tenant → Negocio(s)** (ver `<decisions>` D-09..D-12).

**Cubre:** AUTH-01..04, PRO-01..04, SVC-01..02, BIZ-01..03, SADMIN-01..03.

**NO cubre (fases posteriores):** motor de disponibilidad (Fase 3), grilla y administración de turnos (Fase 4), integración WhatsApp Cloud API (Fase 5), agente conversacional (Fase 6), hardening + encriptación de tokens + tests de carga (Fase 7).

</domain>

<decisions>
## Implementation Decisions

### Estilo visual / sistema de UI
- **D-01:** UI con **shadcn/ui + Tailwind CSS** — componentes accesibles (Radix) copiados al repo, no una librería pesada. Es el estándar actual para Next.js 16 App Router + React 19 y encaja con un CRUD admin (tablas, forms, modales, toggles). Requiere **agregar Tailwind al `apps/dashboard`** (hoy no está en su `package.json`) e inicializar shadcn.
- **D-02:** Estética **admin limpia y neutra** (grises neutros + un color de acento) con **modo claro + oscuro conmutable** (tokens de tema definidos para ambos modos desde el inicio).

### Modelo de datos: Tenant → Negocio(s) (revisado 2026-07-04 — SUPERSEDE el 1:1 de Fase 1)
- **D-09:** Un **`Tenant` es un contenedor/grupo** y puede tener **1..N `Negocio`** (sucursales/peluquerías del mismo grupo). El Negocio es la unidad operativa real. `Tenant` queda con **solo `nombre`** (+ `activo`, timestamps); pierde todo dato operativo y de WhatsApp.
- **D-10:** El **WhatsApp vive en `Negocio`**, no en `Tenant`: `whatsapp_phone_number_id`, `waba_id`, `display_phone_number`, `whatsapp_token` se mueven de `tenant` → `negocio`. Cada Negocio tiene su propio número. (El token sigue difiriéndose a Fase 7 — ver D-04.)
- **D-11:** Todos los **campos de perfil del negocio viven en `Negocio`** (ya están ahí: `nombre`, `direccion`, `telefono`, `timezone`, `granularidad_min`, `horario_general`; se agrega `activo` para soft-delete de sucursal). Cada peluquería tiene su propio timezone/granularidad/horario.
- **D-12:** **Migración `0003` en alcance de Fase 2** (la Fase 1 ya NO cubre esto; el research previo que decía "cero migraciones" quedó obsoleto). La migración: (a) agrega `tenant.nombre`, quita las columnas WhatsApp de `tenant`; (b) agrega columnas WhatsApp + `activo` a `negocio`; (c) reemplaza `tenant_id` → `negocio_id` (FK a `negocio`) en TODAS las tablas operativas (`profesional`, `horario_trabajo`, `servicio`, `profesional_servicio`, `cliente`, `turno`, `turno_servicio`, `bloqueo`, `conversacion`, `mensaje`, `recordatorio`); (d) reescribe las RLS: `perfil`/`tenant`/`negocio` siguen resolviendo por `tenant_id = auth_tenant_id()`, y las tablas operativas pasan a aislar por **"el negocio pertenece a mi tenant"** (helper `auth_negocio_ids()` o `EXISTS`); (e) actualiza uniques (`cliente` y `conversacion` pasan a ser únicos por `negocio_id`) e índices; (f) regenera `packages/db-types`; (g) actualiza seeds/fixtures al nuevo shape. **Nota cross-fase:** el `tenantScoped(tenantId)` del bot (Fase 1, CORE-03) deberá volverse `negocioScoped` en la fase del bot — se registra como impacto, no se toca en Fase 2.

### Panel superadmin: acceso y aislamiento
- **D-03 (revisado):** El panel superadmin es una **ruta `/admin` dentro de la misma app Next.js**, gateada por rol vía **middleware** (mismo login; si `perfil.rol = 'superadmin'` accede, si es `owner` nunca ve ni entra a `/admin`). Todo el acceso cross-tenant del admin va **server-side con `service_role` en rutas aisladas** (Route Handlers / Server Actions server-only) — **nunca** RLS relajada, nunca `service_role` en el cliente. Un solo deploy. **El superadmin gestiona DOS entidades separadas:** (1) **Tenant** — alta/edición/baja con **solo `nombre`** (SADMIN-01, ya no lleva WhatsApp); (2) **Negocio** — dentro de un tenant, alta/edición/baja con datos generales + config de WhatsApp no-secreta (SADMIN-02). La jerarquía Tenant → Negocio(s) se refleja en la navegación del panel.
- **D-04 (revisado):** **SADMIN-02 se cumple parcialmente en Fase 2** y **a nivel `Negocio`:** al crear/editar un Negocio, el superadmin carga la **config no-secreta** de WhatsApp del negocio (`phone_number_id`, `waba_id`, número visible). El **token de acceso y su encriptación** (Vault/AES-GCM) se difiere a **Fase 7 (SEC-01)** — guardrail duro de CLAUDE.md. **BIZ-02** (el dueño ve el número de WhatsApp vinculado) se satisface leyendo el `display_phone_number` **del Negocio seleccionado**.

### Auth y aislamiento (revisado con el modelo Tenant → Negocio)
- **D-05 (revisado):** Login **email/contraseña con Supabase Auth**; sesión persistente por **cookies vía `@supabase/ssr`** (AUTH-01/02); logout desde cualquier página (AUTH-04). El **owner opera a nivel Tenant**: `perfil` sigue ligando `id = auth.uid()` → `tenant_id` + `rol`. **1 usuario = 1 Tenant (grupo), que gestiona N Negocios** (esto SUPERSEDE el "1 usuario = 1 peluquería" de Fase 1 D-08). El aislamiento (AUTH-03) lo enforcea **RLS**: `negocio` por `tenant_id = auth_tenant_id()`, y las tablas operativas por "su `negocio_id` pertenece a un negocio de mi tenant". El dashboard del owner incluye un **selector de negocio** (D-11/D-13) que fija el negocio activo para todo el CRUD operativo.
- **D-13:** El **selector de negocio** en el shell del owner define el "negocio activo" del contexto (persistido, p.ej. en cookie/URL). Todo el CRUD de profesionales/servicios/perfil opera sobre ese `negocio_id`. Si el tenant tiene un solo negocio, el selector puede colapsar a una etiqueta fija (sin dejar de existir el concepto).

### Claude's Discretion
Áreas NO discutidas por el usuario — decido yo al planificar / en `ui-phase`, con estos defaults sugeridos:
- **Layout y navegación (shell):** default → sidebar lateral con secciones Profesionales / Servicios / Perfil, y `/admin` para el superadmin; rutas separadas por sección (App Router). Densidad cómoda.
- **Editor de horario semanal del profesional (PRO-02):** área UX-pesada — que `ui-phase`/plan la diseñen con cuidado. Default → filas "día + rango horario" con soporte de **múltiples bloques por día** (ej: 9–13 y 16–20) y un atajo "copiar a todos los días".
- **Asignación de servicios por profesional + precio custom (PRO-03/04):** default → matriz/lista de servicios en la página de edición del profesional, con checkbox de "lo hace" y campo opcional de precio que pisa el base (`profesional_servicio`).
- **Patrón de mutación de datos** (Server Actions vs Route Handlers) dentro del patrón SSR ya fijado.
- **Patrón de CRUD** (inline vs modal vs página), presentación de soft-delete (toggle activar/desactivar vs tab de archivados), y orden de servicios SVC-02 (drag-and-drop vs campo de orden).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requisitos y goal de la fase
- `.planning/ROADMAP.md` §"Phase 2: Dashboard y datos del negocio" — goal y los 5 Success Criteria que la fase debe hacer verdaderos.
- `.planning/REQUIREMENTS.md` §AUTH / §PRO / §SVC / §BIZ / §SADMIN — los 16 requisitos exactos de esta fase (AUTH-01..04, PRO-01..04, SVC-01..02, BIZ-01..03, SADMIN-01..03).
- `.planning/PROJECT.md` — stack fijado, Supabase Auth vs `password_hash`, timezone AR, constraints multitenant.

### Decisiones heredadas y modelo de datos
- `.planning/phases/01-fundaci-n-multitenant/01-CONTEXT.md` — D-05..D-08 (perfil ligado a `auth.uid()`, rol `owner`/`superadmin`, RLS por perfil, 1 usuario = 1 tenant) y D-13 (timezone por tenant, IANA, prohibido hardcodear `-3`).
- `supabase/migrations/0001_schema_core.sql` — shapes de las tablas que el CRUD opera: `negocio`, `perfil`, `profesional`, `horario_trabajo`, `servicio`, `profesional_servicio`, `tenant`.
- `supabase/migrations/0002_rls_policies.sql` — `auth_tenant_id()` y las políticas RLS por tenant que la app debe respetar (y que `/admin` deliberadamente evita usando `service_role` server-side).
- `packages/db-types/src/index.ts` + `packages/db-types/src/database.types.ts` — tipos generados del schema live; **fuente única de row shapes** para queries tipadas del dashboard.

### Arquitectura / patrones de seguridad
- `.planning/research/ARCHITECTURE.md` — patrón dual de seguridad (dashboard = RLS con JWT de usuario / ruta admin = `service_role` aislado), boundaries del monorepo.
- `CLAUDE.md` (root del repo) §"Technology Stack" y §"What NOT to Use" — `@supabase/ssr` para cookies SSR, **prohibición de guardar el token de WhatsApp en plano** (motiva D-04), aislamiento del proyecto (solo Supabase `bdgufnitakelyialjoqg`).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `apps/dashboard/` — **stub**: `package.json` ya declara `next@^16.2.10`, `react@19`, `@supabase/ssr@^0.12.0`, `@supabase/supabase-js@^2.110.0` y las workspace deps (`db-types`, `shared`, `availability-engine`); `tsconfig.json` presente; solo `app/placeholder.ts` de código. **Falta agregar Tailwind + inicializar shadcn/ui.**
- `packages/db-types` — tipos del schema (`Database`, `Tables<>`, `TablesInsert<>`, `TablesUpdate<>`) para todas las queries y forms tipados del dashboard.
- `packages/shared` — paquete compartido (hoy stub) para helpers comunes (ej. conversión de timezone en la capa de presentación).

### Established Patterns
- **Aislamiento dual:** el bot usa `tenantScoped(tenantId)` con `service_role`; el **dashboard NO** — usa RLS (cliente con JWT del usuario). La excepción es `/admin`, que usa `service_role` **solo server-side**.
- `auth_tenant_id()` (SECURITY DEFINER) en la DB resuelve el tenant desde `perfil` — las políticas RLS ya existen y la app debe operar dentro de ellas.
- Nomenclatura de dominio en **español** (`profesional`, `servicio`, `negocio`, `horario_trabajo`).

### Integration Points
- **Supabase Auth + Postgres** vía `@supabase/ssr`: `createServerClient`/`createBrowserClient` con manejo de cookies en Server Components, Route Handlers y Middleware (patrón oficial Next.js App Router).
- El middleware de Next.js es el punto donde se enforcea sesión + gate de rol (`owner` vs `superadmin` → `/admin`).

</code_context>

<specifics>
## Specific Ideas

- **Tailwind vía build del dashboard, NO por CDN.** (El workflow "recreación de diseño web" del `CLAUDE.md` de `~/Downloads` que usa `cdn.tailwindcss.com` aplica a mockups/capturas, no a esta app productiva.)
- Modo claro/oscuro con tokens de tema definidos para ambos modos desde el arranque (no agregar dark mode "después").
- Mantener la estética sobria de panel de administración: prioridad a formularios y tablas legibles por sobre decoración.

</specifics>

<deferred>
## Deferred Ideas

- **Token de WhatsApp + encriptación (SEC-01)** → Fase 7. En Fase 2 solo se carga la config no-secreta; **SADMIN-02 se completa en Fase 7** cuando se sume el token encriptado (Vault/AES-GCM).
- **Motor de disponibilidad (AVAIL, Fase 3)** y **grilla/administración de turnos (APPT, Fase 4)** — fuera de Fase 2; esta fase solo carga los datos base que esas fases consumen. Nota: ahora consumen datos **por `negocio_id`**.
- **`negocioScoped` en el bot (impacto cross-fase de D-12):** el `tenantScoped(tenantId)` de Fase 1 (CORE-03) y sus tests deberán migrar a `negocioScoped(negocioId)` en la fase del bot (5/6), ya que las tablas operativas pasan a `negocio_id`. Se registra como impacto; NO se toca en Fase 2.
- **Métricas / analytics / reportes** — Out of Scope del proyecto.
- **Multi-usuario por Tenant/Negocio** — no modelado en v1. Sigue siendo **1 usuario (owner) = 1 Tenant**; ese owner gestiona N Negocios, pero no hay sub-usuarios acotados a un negocio ni varios owners por grupo (evaluado y descartado para v1 en la discusión del cambio de modelo).

</deferred>

---

*Phase: 02-dashboard-y-datos-del-negocio*
*Context gathered: 2026-07-04*
