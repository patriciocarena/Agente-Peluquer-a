# Phase 4: Grilla y turnos del dashboard - Context

**Gathered:** 2026-07-05
**Status:** Ready for planning

<domain>
## Phase Boundary

El dueño opera la agenda completa de turnos del negocio activo desde el dashboard: ve una grilla de turnos por profesional y día, bloquea manualmente slots, ve el detalle de un turno confirmado, y puede cancelar, reagendar o crear manualmente un turno (cliente que llama/viene). Todo esto usa el **mismo motor compartido** `@turnosbot/availability-engine` (`computeSlots`/`bookAppointment`) que después usará el bot (Fase 6), de modo que ambos caminos nunca discrepen sobre qué está libre (AVAIL-04).

**Cubre:** APPT-01, APPT-02, APPT-03, APPT-04, APPT-05, APPT-06.

**NO cubre (fases posteriores):** integración WhatsApp Cloud API (Fase 5), agente conversacional / reagendado y cancelación por WhatsApp (Fase 6 — BOT-09/10, pero debe reusar la misma lógica de dominio definida acá), hardening (Fase 7).

</domain>

<decisions>
## Implementation Decisions

### Layout y visualización de la grilla
- **D-01:** Vista principal: **columnas = profesionales activos del negocio, un día a la vez**, eje vertical = horas del día alineadas a la granularidad del negocio (`negocio.granularidad_min`, D-01 Fase 3). Navegación día por día (flechas / date-picker). Es el layout estándar de software de turnos de peluquería/barbería — mejor para "quién está libre ahora" que una vista por tabs o semanal.
- **D-02:** Estados visuales por **color**: confirmado, pendiente, bloqueo manual y libre tienen cada uno un estilo distinto (ej. verde/celeste, amarillo, gris rayado, blanco) — lectura de un vistazo.
- **D-03:** Crear turno o bloqueo tocando la grilla: **click en un slot libre abre un menú/popover chico** con dos opciones ("Crear turno" / "Bloquear"), cada una abre su modal correspondiente con profesional + hora de inicio pre-cargados.
- **D-04:** Click en un **turno existente** (pendiente o confirmado) abre un **panel de detalle** (cliente, servicio(s), precio, horario) con acciones "Cancelar" / "Reagendar" — esto satisface APPT-03.
- **D-05:** Click en un **bloqueo manual existente** abre un popover simple con el motivo (si lo hay) y un botón para eliminar el bloqueo (libera el slot).
- **D-06:** Al **cancelar** un turno, la celda **vuelve a verse libre al instante** (blanco) — no queda tachado ni ocupando espacio visual. El turno sigue existiendo en la base con `estado='cancelado'` para historial; solo deja de "pesar" en la grilla activa.

### Ventana de reserva para el dueño (D-04/D-05 de Fase 3 vs. dashboard)
- **D-07:** El dueño **NO respeta** la ventana de reserva pensada para el cliente por WhatsApp (mínimo 60 min de anticipación / máximo 30 días, D-04/D-05 de `03-CONTEXT.md`). Puede cargar un turno manual para "ahora mismo", para hace unos minutos (corrección), o para dentro de más de 30 días. Esas dos reglas quedan como una restricción **exclusiva del camino del bot/cliente final** (Fase 6), no del motor en general.
- **D-08 (nota técnica para research/planning):** Hoy `computeSlots` aplica el filtro de ventana **internamente** (no es un parámetro), y `bookAppointment` siempre revalida el slot pedido llamando a `computeSlots(freshData)` antes de insertar (anti-cache, T-03-13). Para que el dashboard pueda saltear la ventana sin duplicar el motor (rompería AVAIL-04), hace falta agregar una forma de bypassear ese filtro solo en el camino del dashboard (ej. un flag opcional tipo `skipBookingWindow?: boolean` en `ComputeSlotsInput`/`BookAppointmentInput`, default `false`/comportamiento actual para el bot). **El usuario delegó la forma exacta de implementarlo al planner/researcher** — el único requisito duro es que siga siendo un solo motor compartido, sin lógica de disponibilidad paralela para el dashboard.

### Alta manual de turno (cliente que llama/viene)
- **D-09:** Si el cliente no existe todavía en `cliente` (identificado por teléfono), se **busca o crea al vuelo dentro del mismo modal** de alta de turno: input de búsqueda por teléfono/nombre; si no hay match, un formulario inline (teléfono + nombre opcional) crea la fila de `cliente` en el momento, sin salir del flujo.
- **D-10:** El slot se elige mostrando los **huecos reales calculados por `computeSlots`** para el profesional/servicio(s)/día elegidos (sin la ventana de 60min/30d, por D-07) — nunca un input de hora libre sin validar contra disponibilidad real. Este selector de slot es el mismo componente que usa el modal de "Reagendar" (D-13).
- **D-11:** El alta manual reutiliza **`bookAppointment`** como único camino de escritura (con el bypass de ventana de D-07/D-08 activado) — sin lógica de inserción paralela para el dashboard.

### Cancelar y reagendar
- **D-12:** Cancelar un turno = **confirmación simple** ("¿Seguro que querés cancelar este turno?" con Confirmar/Volver), **sin campo de motivo** (no existe columna para esto en el schema y no se agrega).
- **D-13:** Reagendar un turno = desde el panel de detalle (D-04), botón "Reagendar" abre un **modal con la misma grilla de disponibilidad** (mismo componente selector de slot que el alta manual, D-10) para elegir nuevo día/hora/profesional.
- **D-14:** Reagendar se implementa como **UPDATE del mismo `turno`** (mismo `turno_id`, se pisan `inicio`/`fin`, y `profesional_id` si también cambia de profesional) — **no** se cancela+crea uno nuevo. Preserva la continuidad/trazabilidad de un turno como una única entidad a lo largo de su ciclo de vida. **Nota técnica para research/planning:** esto requiere una función nueva en el motor (ej. `rescheduleAppointment`, análoga a `bookAppointment` pero con `UPDATE` en vez de `INSERT`) que revalide el nuevo horario contra `computeSlots(freshData)` **excluyendo el propio turno que se está reagendando** de los turnos "activos" que bloquean, para no chocar contra su propio slot viejo. Esta misma función/lógica de dominio la reutilizará el bot en Fase 6 (BOT-10 exige "misma lógica de dominio que el dashboard").

### Claude's Discretion
Áreas no discutidas explícitamente por el usuario — decide el planner/researcher:
- Forma exacta del bypass de ventana de reserva (D-08): nombre del flag, si vive en `ComputeSlotsInput`, `BookAppointmentInput`, o ambos.
- Forma exacta de `rescheduleAppointment` (D-14): firma, manejo del error `23P01` (mismo patrón que `bookAppointment`), si vive en `booking.ts` o un módulo nuevo.
- Densidad exacta de la grilla (alto de fila en píxeles, cómo se comprime cuando hay muchos profesionales — scroll horizontal vs. columnas angostas).
- Patrón de fetch/revalidación de la grilla (Server Component + Server Actions con `revalidatePath`, vs. cliente con refetch) — seguir el patrón ya establecido en Fase 2 (Server Actions + `useTransition`, ver `servicio-dialog.tsx`).
- Manejo de negocios sin profesionales activos o sin horario cargado ese día (empty state de la grilla).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requisitos y goal de la fase
- `.planning/ROADMAP.md` §"Phase 4: Grilla y turnos del dashboard" — goal y los 4 Success Criteria que la fase debe hacer verdaderos.
- `.planning/REQUIREMENTS.md` §APPT — APPT-01..06, los 6 requisitos exactos de esta fase.
- `.planning/PROJECT.md` — stack fijado, constraints multitenant, timezone AR.

### Motor de disponibilidad (a consumir, no reimplementar)
- `packages/availability-engine/src/index.ts` — barrel público: `computeSlots`, `bookAppointment`, `isSlotTakenConcurrently`, tipos, constantes. Único camino de lectura/escritura de disponibilidad (AVAIL-04) — el dashboard NO debe calcular disponibilidad por su cuenta.
- `packages/availability-engine/src/computeSlots.ts` — implementación del cálculo; aquí vive el filtro de ventana de reserva (D-04/D-05 Fase 3) que hay que hacer bypasseable para el dashboard (D-08).
- `packages/availability-engine/src/booking.ts` — `bookAppointment` (único camino de alta con snapshots congelados, AVAIL-03) y el manejo del `23P01` (`isSlotTakenConcurrently`, CORE-05). Sirve de patrón/base para la nueva `rescheduleAppointment` (D-14).
- `packages/availability-engine/src/types.ts` — `ComputeSlotsInput`, `AvailabilityData`, `BookAppointmentInput`, row aliases desde `db-types`. Extender acá el flag de bypass de ventana (D-08) y el input de reagendado (D-14).
- `packages/availability-engine/src/constants.ts` — `BOOKING_MIN_LEAD_MINUTES` / `BOOKING_MAX_ADVANCE_DAYS`, las dos constantes que el dashboard debe poder saltear.
- `.planning/phases/03-motor-de-disponibilidad/03-CONTEXT.md` — D-01 (grid snapping), D-02 (sin buffer), D-03 (auto-asignación = hueco más temprano), D-04/D-05 (ventana de reserva, con la nota explícita de que su configurabilidad/alcance se difiere a Fase 4 — resuelto acá en D-07/D-08).

### Schema (fuente de los datos que la grilla consume/escribe)
- `supabase/migrations/0003_tenant_negocio_split.sql` — shape actual post-split: `turno`/`bloqueo`/`cliente` con `negocio_id` (no `tenant_id`). `turno.estado` CHECK IN ('pendiente','confirmado','cancelado'); sin columna de motivo de cancelación (consistente con D-12).
- `packages/db-types/src/database.types.ts` — tipos generados del schema live (`Tables<"turno">`, `Tables<"bloqueo">`, `Tables<"cliente">`) — fuente única de row shapes.

### Patrones de fases previas (dashboard)
- `apps/dashboard/components/servicio-dialog.tsx` y `apps/dashboard/components/admin/negocio-dialog.tsx` — patrón de modal CRUD con `react-hook-form` + `zodResolver` + Server Action + `useTransition` + `sonner` toast. Seguir este mismo patrón para los modales de turno/bloqueo.
- `apps/dashboard/components/owner-sidebar.tsx` — nav del shell owner; agregar acá la sección "Turnos"/"Agenda" de esta fase.
- `apps/dashboard/app/actions/servicios.ts` / `apps/dashboard/app/actions/profesionales.ts` — patrón de Server Actions ya establecido (validación zod, revalidatePath, acceso vía cliente Supabase con RLS del owner).
- `apps/dashboard/components/negocio-selector.tsx` + `apps/dashboard/app/actions/negocio-activo.ts` — el "negocio activo" (D-13 de Fase 2) determina qué `negocio_id` scopea toda la grilla.

### Arquitectura / aislamiento
- `CLAUDE.md` (root) — aislamiento de proyecto, único Supabase `bdgufnitakelyialjoqg`.
- Patrón dual ya establecido: el **dashboard usa RLS** (cliente con JWT del owner), nunca `service_role` — el motor recibe las filas ya-fetcheadas vía ese path (a diferencia del bot, que usará `negocioScoped` con `service_role` en Fase 6).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `@turnosbot/availability-engine` — `computeSlots` y `bookAppointment` ya implementados y verificados live (Fase 3). Solo falta extenderlos (D-08, D-14) y consumirlos desde el dashboard.
- Componentes shadcn ya instalados y usados: `Dialog`, `DropdownMenu`, `Table`, `Form`, `Popover` (a confirmar si ya está instalado; si no, agregar vía shadcn CLI igual que el resto).
- Patrón de modal CRUD (`servicio-dialog.tsx`) — reutilizable como base para "Crear turno" / "Bloquear slot" / "Reagendar".

### Established Patterns
- Server Actions + `react-hook-form` + `zodResolver` + `useTransition` + toast (`sonner`) para toda mutación del dashboard.
- Selector de negocio activo (Fase 2) determina el `negocio_id` de todas las queries/acciones de esta fase.
- Nomenclatura de dominio en español (`turno`, `bloqueo`, `profesional`, `cliente`).

### Integration Points
- La grilla necesita fetchear, scopeadas al `negocio_id` activo: `horario_trabajo`, `bloqueo`, `turno` (+`turno_servicio` para el detalle), `servicio`, `profesional`, `negocio` — el mismo shape de `AvailabilityData` que consume `computeSlots`.
- Las acciones de escritura (crear/cancelar/reagendar/bloquear) van vía Server Actions que llaman a `bookAppointment`/`rescheduleAppointment`/inserts directos a `bloqueo`, todo con el cliente Supabase RLS del owner (nunca `service_role` en el dashboard).

</code_context>

<specifics>
## Specific Ideas

- Layout de referencia: calendario tipo peluquería/barbería con columnas = profesionales, filas = horas del día — el usuario confirmó que es el layout más operativo para "quién está libre ahora".
- El dueño opera sin las restricciones de ventana de reserva pensadas para el bot — sus propios clientes, su propia agenda.

</specifics>

<deferred>
## Deferred Ideas

- **Drag-and-drop de turnos sobre la grilla** (para reagendar) — descartado para v1 a favor de un modal con selector de slot; podría evaluarse como mejora futura de UX.
- **Motivo de cancelación** — no se agrega campo de schema en v1; si se necesita auditar cancelaciones a futuro, requeriría una migración.
- **Bloqueos recurrentes** (ej. "todos los martes de 15 a 16") — la tabla `bloqueo` solo soporta instancias puntuales (`inicio`/`fin` concretos); bloqueos recurrentes no se discutieron y quedan fuera de esta fase (el horario semanal regular ya cubre la disponibilidad recurrente vía `horario_trabajo`).

</deferred>

---

*Phase: 04-grilla-y-turnos-del-dashboard*
*Context gathered: 2026-07-05*
