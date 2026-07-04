# Phase 1: Fundación multitenant - Context

**Gathered:** 2026-07-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Dejar la base de datos y el esqueleto de infraestructura de modo que, desde el primer momento, queden garantizados: aislamiento por `tenant_id`, timezone argentino correcto (`TIMESTAMPTZ`) y protección anti-doble-reserva a nivel Postgres. Todo verificado con datos de al menos dos tenants de prueba, corriendo en un contenedor `linux/arm64`.

**Cubre:** CORE-01, CORE-02, CORE-03, CORE-04, CORE-05.

**NO cubre (fases posteriores):** carga de datos del negocio y login del dashboard (Fase 2), motor de disponibilidad (Fase 3), grilla de turnos (Fase 4), integración WhatsApp (Fase 5), agente conversacional (Fase 6), hardening/encriptación de tokens y tests de carga (Fase 7). En Fase 1 se crean las tablas de esas fases pero no se cablea su lógica.

</domain>

<decisions>
## Implementation Decisions

### Alcance del schema
- **D-01:** Se crea el **schema completo de referencia (las 16 tablas) en la Fase 1**, no un subconjunto mínimo. Motivo: el schema ya está diseñado; crearlo entero permite aplicar `tenant_id` + RLS de forma uniforme desde el día 1 y evita reescribir migraciones fase a fase.
- **D-02:** Las tablas de fases futuras (`conversation`, `message`, y cualquier tabla de agente/WhatsApp) se crean con su estructura y RLS ahora, pero **quedan vacías / sin lógica cableada** hasta su fase correspondiente.
- **D-03:** La tabla `reminder` (recordatorios) se **reserva en el schema** aunque los recordatorios sean v2 (fuera de alcance del roadmap actual). No se cablea worker ni plantilla.
- **D-04:** Toda tabla de negocio lleva `tenant_id` y una política RLS que la aísla por tenant (CORE-01). El patrón de aislamiento es idéntico en todas las tablas tenant-scoped.

### Mapeo usuario → tenant (aislamiento del dashboard)
- **D-05:** El vínculo usuario→peluquería se resuelve con una **tabla de perfil ligada a `auth.uid()`** (patrón Supabase: `id = auth.uid()`, `tenant_id`, y un flag/rol). Reemplaza el `password_hash` manual del schema de referencia (ver Key Decisions en PROJECT.md).
- **D-06:** El rol distingue al menos `owner` (dueño de peluquería, RLS-scoped a su tenant) y `superadmin` (acceso cross-tenant vía `service_role` en ruta aislada, **nunca** vía RLS relajada).
- **D-07:** Las políticas RLS del dashboard resuelven el tenant leyendo la fila de perfil del usuario logueado — **no** se ata el `tenant_id` a un claim del JWT que requiera resincronización. (Claude tiene discreción sobre la técnica exacta: subconsulta a la tabla de perfil vs. función `SECURITY DEFINER` helper — elegir la más robusta/estándar al planificar.)
- **D-08:** En v1, **un usuario = una peluquería** (relación 1:1 owner↔tenant). No se modela multi-tenant-por-usuario.

### Estados del turno y protección anti-doble-reserva
- **D-09:** La no-superposición de turnos del mismo profesional se enforcea a **nivel Postgres con `EXCLUDE USING gist`** sobre el rango `[inicio, fin)` (CORE-05), no con lógica de aplicación (Success Criteria #4).
- **D-10:** La constraint aplica **solo a turnos activos**: `WHERE (estado != 'cancelado')`. Un turno **`pendiente` o `confirmado` OCUPA** el slot (reserva mientras se negocia, evitando que dos clientes tomen el mismo horario); un turno **`cancelado` LIBERA** el slot al instante.
- **D-11:** Sin buffer entre turnos en v1 → los rangos son consecutivos `[inicio, fin)` (arrastrado de Out of Scope; el borde de un turno puede tocar el inicio del siguiente sin solaparse).

### Timezone
- **D-12:** Todos los timestamps de horario/turno se guardan como `TIMESTAMPTZ` (nunca `TIMESTAMP` naive) e internamente en UTC; la conversión a `America/Argentina/*` ocurre solo en la capa de presentación (CORE-04, Success Criteria #3).
- **D-13:** El timezone es **por tenant** (columna IANA en la fila de tenant/negocio), default `America/Argentina/Buenos_Aires`. Argentina es UTC-3 fijo sin DST — **prohibido** hardcodear el offset `-3`; usar la zona IANA con librería timezone-aware.

### Esqueleto de infraestructura (ARM)
- **D-14:** El esqueleto de Fase 1 es **mínimo real**: estructura monorepo (`apps/bot`, `apps/dashboard`, `packages/availability-engine`, `packages/db-types`, `packages/shared`, `supabase/migrations`) + `Dockerfile` + `docker-compose` que **compila y arranca en `linux/arm64`** con un health check, **sin lógica de negocio**.
- **D-15:** El objetivo del esqueleto es validar ARM temprano (Success Criteria #5) **antes** de acumular dependencias. No se esbozan features de las apps; solo el andamiaje que prueba build + arranque en arm64.

### Verificación de aislamiento
- **D-16:** El aislamiento se verifica con **datos de prueba de al menos dos tenants** (Success Criteria #1 y #2): ninguna consulta puede devolver filas de otro tenant, y un usuario logueado no puede forzar acceso a datos de otro tenant. (Claude tiene discreción sobre el mecanismo de seed de tenants de prueba.)

### Claude's Discretion
- Herramienta/flujo de migraciones (archivos SQL en `supabase/migrations` vs. `apply_migration` del MCP de Supabase) — elegir el estándar de Supabase.
- Técnica exacta de la política RLS (subconsulta a perfil vs. función helper `SECURITY DEFINER`).
- Mecanismo de seed de los tenants de prueba para las pruebas de aislamiento.
- Nombres exactos de columnas/índices y tipo de rango para la GiST (`tstzrange` u operador equivalente).
- Gestor de paquetes del monorepo (pnpm workspaces vs. Turborepo) y process manager, dentro de las constraints del stack.
- Detalles del health check y estructura interna del Dockerfile.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

> Nota: el proyecto es greenfield y **no existe todavía un archivo de schema SQL**. El "schema de referencia de 16 tablas" está descrito en prosa dentro de los docs de investigación y PROJECT.md; una de las salidas de esta fase es materializarlo como migraciones SQL. Las referencias abajo son las fuentes que definen requisitos y constraints de la Fase 1.

### Fundación multitenant / requisitos
- `.planning/PROJECT.md` — decisiones de stack fijadas, contexto del schema de referencia de 16 tablas, Supabase Auth vs `password_hash`, timezone AR.
- `.planning/REQUIREMENTS.md` §CORE (CORE-01…CORE-05) — requisitos exactos de aislamiento, RLS, `TIMESTAMPTZ` y constraint anti-doble-reserva.
- `.planning/ROADMAP.md` §"Phase 1" — goal y Success Criteria (5) que la fase debe hacer verdaderos.

### Arquitectura y patrones
- `.planning/research/ARCHITECTURE.md` — estructura de monorepo recomendada, patrón dual de seguridad (bot `service_role` con `tenant_id` en código / dashboard RLS con JWT de usuario), boundaries internos, patrón de `tenantScoped(tenantId)`.
- `.planning/research/SUMMARY.md` — síntesis de research; flags de qué fases necesitan research adicional (Fase 1 marcada como patrón estándar, research-phase probablemente innecesario).

### Anti-patterns y pitfalls (críticos para Fase 1)
- `.planning/research/PITFALLS.md` §"Pitfall 2" (líneas ~32–52) — constraint `EXCLUDE USING gist` con `WHERE (estado != 'cancelado')` para hacer el doble-booking estructuralmente imposible.
- `.planning/research/PITFALLS.md` §"Pitfall 4" (líneas ~88–108) — manejo de timezone AR: `TIMESTAMPTZ` obligatorio, prohibición de hardcodear `-3`, conversión solo en presentación, coherencia entre Node/Postgres/Next.js.
- `.planning/research/STACK.md` — versiones y constraints del stack (Node 24 LTS con `linux-arm64`, Supabase, conexión directa/session-mode para pg-boss, etc.) relevantes para el esqueleto ARM.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Ninguno todavía** — el repositorio es greenfield; solo existe `CLAUDE.md`. Esta fase crea la estructura base desde cero.

### Established Patterns
- El stack y las convenciones están fijados en `CLAUDE.md` (Technology Stack) y `.planning/PROJECT.md` (Constraints/Key Decisions) — deben respetarse como patrón establecido aunque no haya código aún.
- Estructura de monorepo objetivo definida en `.planning/research/ARCHITECTURE.md` §"Recommended Project Structure".

### Integration Points
- **Supabase (Postgres + Auth)** es el punto de integración central: esta fase crea el schema, las políticas RLS y la constraint GiST sobre ese Postgres.
- Hay un **MCP de Supabase conectado** en esta sesión (`apply_migration`, `execute_sql`, `list_tables`, `get_advisors`, etc.) — potencial vía para aplicar/verificar migraciones al planificar/ejecutar.
- El `packages/availability-engine` y `packages/db-types` se crean como paquetes vacíos/estructura ahora; los consumen fases posteriores (bot y dashboard).

</code_context>

<specifics>
## Specific Ideas

- El schema de referencia usa **nombres en español** (`turno`, `bloqueo`, `negocio`, `estado = 'cancelado'`, etc.) según lo mostrado en PITFALLS.md — mantener esa convención de nomenclatura del dominio.
- La constraint anti-doble-reserva debe ser **verificable bajo concurrencia** (el test de carga concurrente formal es de Fase 7 / SEC-02, pero la constraint en sí se crea y prueba funcionalmente en Fase 1).

</specifics>

<deferred>
## Deferred Ideas

- **Encriptación de tokens de WhatsApp** (SEC-01) — Fase 7. En Fase 1 la columna del token puede existir en el schema pero su encriptación (Vault/AES-GCM) se define y aplica en hardening.
- **Test de carga concurrente formal** (SEC-02) — Fase 7. La constraint GiST se crea en Fase 1; el test de carga bajo concurrencia real es de la fase de hardening.
- **Test de aislamiento cross-tenant automatizado sobre queries service_role del bot** (SEC-03) — Fase 7. En Fase 1 se verifica el aislamiento RLS del dashboard con dos tenants; la suite formal service_role es de hardening.
- **Recordatorios automáticos** (REMIND-01, v2) — solo se reserva la tabla `reminder`; ni worker ni plantilla HSM.
- **Multi-usuario por peluquería** — no modelado en v1; hoy 1 usuario = 1 tenant.

</deferred>

---

*Phase: 01-fundaci-n-multitenant*
*Context gathered: 2026-07-03*
