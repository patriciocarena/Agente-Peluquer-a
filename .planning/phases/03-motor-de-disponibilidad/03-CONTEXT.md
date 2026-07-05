# Phase 3: Motor de disponibilidad - Context

**Gathered:** 2026-07-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Módulo de **cómputo puro y determinístico** que calcula qué slots están libres para un profesional, cruzando su horario de trabajo recurrente − sus bloqueos manuales − sus turnos `pendiente`/`confirmado`. Es el **único motor compartido** (`@turnosbot/availability-engine`) que consumirán tanto el bot (Fase 6) como la grilla del dashboard (Fase 4), de modo que nunca discrepen sobre qué está libre (AVAIL-04). Incluye el soporte de turnos multi-servicio (suma de duraciones en un bloque contiguo, AVAIL-02), el congelado de snapshots al agendar (AVAIL-03), y la auto-asignación de profesional cuando no hay preferencia (AVAIL-05).

**NO incluye** (pertenece a otras fases): la grilla visual del dashboard (Fase 4), la integración con WhatsApp (Fase 5), el agente conversacional (Fase 6). Se construye y verifica en aislamiento antes de conectarlo a cualquier interfaz.

</domain>

<decisions>
## Implementation Decisions

### Alineación de slots (grid snapping)
- **D-01:** Los slots ofrecidos arrancan **siempre en múltiplos de la granularidad del negocio** (`negocio.granularidad_min`, 15 o 30 min: 9:00, 9:30, 10:00…). Agenda prolija y legible para el cliente por WhatsApp. Se acepta que pueda quedar algún "hueco muerto" cuando un turno no termina justo en la grilla — se prioriza legibilidad sobre aprovechar cada minuto. (Descartado: encaje libre en cualquier minuto; híbrido.)

### Buffer entre turnos
- **D-02:** **Sin buffer en v1** — los turnos van back-to-back (el fin de uno habilita el inicio del siguiente). No se agrega ningún campo de schema por esto ahora. (Buffer configurable → Deferred Ideas.)

### Auto-asignación de profesional (AVAIL-05)
- **D-03:** Cuando el cliente **no** elige profesional, el motor asigna el profesional con el **hueco disponible más temprano** para el horario pedido (maximiza que el cliente consiga turno cuanto antes). (Descartado: orden fijo del dueño; reparto equitativo por carga.)

### Ventana de reserva
- **D-04:** El motor solo ofrece slots dentro de una ventana: **mínimo 60 min de anticipación** (no se puede reservar para dentro de menos de 1 hora) y **máximo 30 días hacia adelante**.
- **D-05:** Estos dos límites son **constantes hardcodeadas en el motor en v1** (no columnas por negocio todavía) — cero cambios de schema en esta fase. Exponerlos como configurables por negocio se difiere a Fase 4. Definir las constantes en un único lugar del paquete `@turnosbot/availability-engine` para que sean fáciles de promover a config luego.

### Decididas en fases previas (se arrastran, no se re-discutieron)
- Timezone AR fijo **UTC−3 sin DST**; todo el cálculo de intervalos se hace en la zona del negocio, nunca UTC-naive (Pitfall 4).
- **Granularidad configurable por negocio** (15/30 min, BIZ-03) — el motor la lee de `negocio.granularidad_min`.
- Turnos con estado `pendiente` **y** `confirmado` **bloquean** el slot; `cancelado` lo libera.
- Multi-servicio (ej: corte + barba) **suma las duraciones** y reserva un **único bloque contiguo** (AVAIL-02).
- Al agendar se **congelan snapshots** de nombre/precio/duración por servicio (AVAIL-03) — columnas `turno_servicio.{nombre,precio,duracion}_snapshot` y `turno.precio_total` ya existen; nunca hacer join vivo a `servicio.precio` (Pitfall 3).
- Doble-reserva imposible a nivel DB (constraint `EXCLUDE USING gist` en `turno`) — el motor evita ofrecer solapamientos, pero la DB es la última línea.

### Claude's Discretion
- Estructura interna del algoritmo de intervalos (cómo resta bloqueos/turnos del horario), librería de fechas (date-fns-tz / Temporal / Intl), y forma exacta de la API del paquete más allá del contrato ya existente en `packages/availability-engine/src/index.ts`.
- Si la función de agendado (crear turno + snapshots + suma de duración) vive en el mismo paquete `availability-engine` o en un módulo de booking adyacente — mientras sea el único camino compartido que garantiza AVAIL-04.
- Cómo se resuelve el desempate cuando dos profesionales tienen el mismo "hueco más temprano" (ej: orden estable por id o por orden de carga) — elegir un criterio determinístico y documentarlo.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Contrato del motor (a implementar)
- `packages/availability-engine/src/index.ts` — stub con el contrato de tipos ya definido (`ComputeSlotsInput`, `AvailableSlot`, `computeSlots`). La implementación real reemplaza el `throw`. Este es el punto único de verdad que consumen bot y dashboard (AVAIL-04).

### Schema (fuente de los datos del cálculo)
- `supabase/migrations/0001_schema_core.sql` — tablas `horario_trabajo` (regla recurrente `dia_semana`+`hora_inicio`+`hora_fin`, tipo `time`), `bloqueo` (`inicio`/`fin` timestamptz), `turno` (`inicio`/`fin` timestamptz, `estado`, `precio_total` snapshot) con el constraint `EXCLUDE USING gist` anti-doble-reserva, `turno_servicio` (`nombre_snapshot`/`precio_snapshot`/`duracion_snapshot`), y `negocio.granularidad_min`.
- `supabase/migrations/0002_rls_policies.sql` — RLS por negocio/tenant (el motor corre server-side; el bot usa service_role vía `tenantScoped`, la grilla usa el path RLS del owner).

### Requisitos
- `.planning/REQUIREMENTS.md` — AVAIL-01 (cruce horario−bloqueos−turnos), AVAIL-02 (multi-servicio contiguo), AVAIL-03 (snapshots), AVAIL-04 (módulo único compartido), AVAIL-05 (auto-asignación).

### Patrones de fases previas
- `apps/dashboard/lib/schemas/horario.ts` — shape del horario semanal multi-bloque (Fase 2) que produce las filas de `horario_trabajo` que el motor consume.
- `apps/bot/src/db/tenantScoped.ts` — patrón de acceso a datos aislado por tenant para el path del bot.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/availability-engine` — paquete ya scaffoldeado con el contrato `computeSlots(input) => Promise<AvailableSlot[]>`. Ambos apps ya dependen de él (sin drift). Solo falta la lógica.
- `@turnosbot/db-types` (`packages/db-types`) — tipos generados del schema live; usar para tipar filas de `turno`, `horario_trabajo`, `bloqueo`, `servicio`, `turno_servicio`.
- `apps/bot/src/db/tenantScoped.ts` — helper de queries aisladas por tenant (service_role) para alimentar el motor desde el bot.

### Established Patterns
- Timezone: convertir con zona IANA (`America/Argentina/*`), nunca offset `-3` hardcodeado (verificado en Fase 1, `scripts/verify-timezone.ts`).
- Snapshots congelados al agendar (nunca join vivo a precios) — ya reflejado en el schema.

### Integration Points
- Consumidores: `apps/bot` (tool layer del agente, Fase 6) y `apps/dashboard` (grilla de turnos, Fase 4). Ambos importan el mismo `computeSlots` → garantiza AVAIL-04.
- Fuente de datos: tablas `horario_trabajo`, `bloqueo`, `turno`/`turno_servicio`, `negocio.granularidad_min` en Supabase `bdgufnitakelyialjoqg`.

</code_context>

<specifics>
## Specific Ideas

- Auto-asignación = "el hueco más temprano" (no orden del dueño ni balanceo de carga).
- Ventana de reserva concreta para v1: **60 min de anticipación mínima / 30 días máximos**, como constantes en el paquete del motor.

</specifics>

<deferred>
## Deferred Ideas

- **Buffer configurable entre turnos** (fijo por negocio o por servicio) — requiere campo de schema (`negocio.buffer_min` o por servicio). No en v1; retomar si los negocios lo piden.
- **Ventana de reserva configurable por negocio** (columnas `reserva_min_anticipacion_min` / `reserva_max_dias` + campos en el perfil del negocio) — diferido a Fase 4, cuando se arme la grilla/booking del dashboard. En v1 son constantes hardcodeadas (D-05).
- **Reparto equitativo / balanceo de carga entre profesionales** para la auto-asignación — descartado para v1 (se eligió "hueco más temprano"); podría ser una opción futura.

</deferred>

---

*Phase: 03-motor-de-disponibilidad*
*Context gathered: 2026-07-04*
