/**
 * src/types.ts — contratos públicos del motor de disponibilidad + alias de
 * filas provenientes de `@turnosbot/db-types` (AVAIL-04).
 *
 * Import type-only de `Database`: el motor es PURO (data in, slots out) y no
 * debe acoplarse a ningún cliente DB (sin dependencia runtime del SDK de
 * Supabase) ni tener un cliente propio (03-RESEARCH.md Anti-Patterns). Los
 * consumidores (bot Fase 6, dashboard Fase 4) fetchean las filas y se las
 * pasan ya-scopeadas por negocio.
 *
 * Los alias de filas usan `Database["public"]["Tables"]["<tabla>"]["Row"]`
 * en vez de declarar shapes paralelos a mano: si el schema vuelve a cambiar
 * (como la migración 0003 tenant_id → negocio_id), estos tipos siguen la
 * fuente generada y no hay drift (evita la clase de bug del Pitfall 7).
 */
import type { Database } from "@turnosbot/db-types";

// ---------------------------------------------------------------------------
// Row aliases — NUNCA declarar shapes paralelos; siempre derivar de db-types.
// ---------------------------------------------------------------------------

export type TurnoRow = Database["public"]["Tables"]["turno"]["Row"];
export type TurnoServicioRow = Database["public"]["Tables"]["turno_servicio"]["Row"];
export type HorarioTrabajoRow = Database["public"]["Tables"]["horario_trabajo"]["Row"];
export type BloqueoRow = Database["public"]["Tables"]["bloqueo"]["Row"];
export type ServicioRow = Database["public"]["Tables"]["servicio"]["Row"];
export type NegocioRow = Database["public"]["Tables"]["negocio"]["Row"];

// ---------------------------------------------------------------------------
// Contrato público de computeSlots (evoluciona el stub de index.ts).
// ---------------------------------------------------------------------------

/**
 * Input de `computeSlots`. Evoluciona el contrato del stub original:
 * - `tenantId` → `negocioId` (migración 0003: tenant_id → negocio_id).
 * - `serviceId: string` → `serviceIds: string[]` (AVAIL-02, multi-servicio:
 *   la suma de duraciones se reserva como un único bloque contiguo).
 * - `professionalId?` se mantiene: su AUSENCIA dispara auto-asignación al
 *   profesional con el hueco más temprano (D-03/AVAIL-05).
 * - `date` se mantiene: ISO YYYY-MM-DD interpretado en la timezone del
 *   negocio (nunca UTC-naive — Pitfall 2).
 */
export interface ComputeSlotsInput {
  /** UUID del negocio dueño de las filas. El caller debe pasar SOLO filas de
   * este negocio_id; el motor es puro y no puede enforcar scoping por sí
   * mismo (V4 Access Control es responsabilidad del caller — T-03-01). */
  negocioId: string;
  /** UUIDs de los servicios pedidos; sus duraciones se suman en un único
   * bloque contiguo (AVAIL-02). Debe tener al menos un elemento. */
  serviceIds: string[];
  /** UUID del profesional preferido. Si se omite, el motor auto-asigna el
   * profesional con el hueco disponible más temprano (D-03/AVAIL-05). */
  professionalId?: string;
  /** ISO date, YYYY-MM-DD, interpretado en la timezone del negocio
   * (America/Argentina/*). Nunca parsear como UTC-naive (Pitfall 2). */
  date: string;
  /** D-08 (Fase 4): si es `true`, `computeSlots` NO aplica el filtro de
   * ventana de reserva `BOOKING_MIN_LEAD_MINUTES`/`BOOKING_MAX_ADVANCE_DAYS`
   * (D-04/D-05, Fase 3). El default (`undefined`/`false`) preserva el
   * comportamiento del bot byte-por-byte — SOLO el dashboard (Fase 4) debe
   * pasar `true` explícito, para que el dueño pueda cargar turnos "para
   * ahora mismo" o a más de 30 días (D-07). El bot NUNCA debe pasar `true`. */
  skipBookingWindow?: boolean;
}

/** Un slot ofrecible al cliente. `start`/`end` en HH:mm hora local del
 * negocio; `professionalId` indica a quién quedaría asignado el turno
 * (incluye el resultado de la auto-asignación cuando no hubo preferencia). */
export interface AvailableSlot {
  /** ISO time, HH:mm, hora local del negocio. */
  start: string;
  /** ISO time, HH:mm, hora local del negocio. */
  end: string;
  professionalId: string;
}

/**
 * `AvailabilityData` — los arrays de filas YA-FETCHEADAS que `computeSlots`
 * recibe como 2º parámetro. El motor no hace ningún I/O: opera solo sobre
 * estos datos.
 *
 * Contrato de scoping (T-03-01, V4 Access Control): el caller es responsable
 * de que TODAS estas filas pertenezcan al `negocio_id` del input. El motor
 * no puede enforcar aislamiento por sí mismo al ser puro; pasar filas de
 * otro negocio produce disponibilidad cruzada silenciosa. El uso de alias de
 * db-types garantiza que `negocio_id` esté tipado en cada fila, habilitando
 * una aserción de scoping en Wave 2+.
 */
export interface AvailabilityData {
  /** Horarios de trabajo recurrentes (por día de semana) de los
   * profesionales candidatos. */
  horarios: HorarioTrabajoRow[];
  /** Bloqueos manuales que restan disponibilidad. */
  bloqueos: BloqueoRow[];
  /** Turnos existentes. Solo `pendiente`/`confirmado` bloquean; `cancelado`
   * libera el slot (Pitfall 4). */
  turnos: TurnoRow[];
  /** Servicios del negocio (fuente de `duracion_min` para sumar AVAIL-02). */
  servicios: ServicioRow[];
  /** El negocio: aporta `timezone` (IANA) y `granularidad_min` (D-01). */
  negocio: NegocioRow;
}

/**
 * `BookAppointmentInput` — input del módulo de booking (Wave 4). Al agendar
 * se congelan snapshots de nombre/precio/duración por servicio (AVAIL-03);
 * nunca se hace join vivo a `servicio.precio` (Pitfall 3). `precio_total` se
 * calcula sumando los `precio_snapshot` en la misma transacción.
 */
export interface BookAppointmentInput {
  /** Negocio dueño del turno (scoping — T-03-01). */
  negocioId: string;
  /** Profesional al que se asigna el turno (ya resuelto: preferido o
   * auto-asignado). */
  profesionalId: string;
  /** Cliente que reserva. */
  clienteId: string;
  /** Servicios a reservar; se congelan como snapshots (AVAIL-03). */
  serviceIds: string[];
  /** Inicio del bloque contiguo, ISO timestamptz. */
  inicio: string;
  /** Fin del bloque contiguo (inicio + suma de duraciones), ISO timestamptz. */
  fin: string;
  /** D-08 (Fase 4): idéntica semántica que `ComputeSlotsInput.skipBookingWindow`
   * — se propaga a la re-validación de freshness interna contra
   * `computeSlots`. Default (`undefined`/`false`) preserva el comportamiento
   * del bot; solo el dashboard pasa `true`. */
  skipBookingWindow?: boolean;
}

/**
 * `RescheduleAppointmentInput` — input de `rescheduleAppointment` (D-14,
 * Fase 4), hermana de `BookAppointmentInput`. A diferencia de un
 * cancelar+crear, D-14 hace un UPDATE del MISMO `turno.id` (nunca cancela ni
 * crea uno nuevo).
 *
 * `serviceIds` existe SOLO para dimensionar la duración del bloque contiguo
 * en la revalidación interna contra `computeSlots` (consistente con
 * `BookAppointmentInput`); `rescheduleAppointment` NUNCA reescribe
 * `turno_servicio` — D-14 pisa únicamente `inicio`/`fin`/`profesional_id`
 * del turno existente (Open Question 1 de 04-RESEARCH.md, resuelta por el
 * planner).
 */
export interface RescheduleAppointmentInput {
  /** Negocio dueño del turno (scoping — T-03-01). */
  negocioId: string;
  /** UUID del turno EXISTENTE a reagendar. Este id se excluye de los turnos
   * activos que bloquean al revalidar disponibilidad (self-exclusion,
   * Pitfall 2) y es el mismo id que recibe el UPDATE. */
  turnoId: string;
  /** Profesional al que queda asignado el turno tras el reagendado (puede
   * ser el mismo de antes o uno distinto). */
  profesionalId: string;
  /** Servicios del turno — usados SOLO para dimensionar la duración total en
   * la revalidación; D-14 no reescribe `turno_servicio` con esto. */
  serviceIds: string[];
  /** Nuevo inicio del bloque contiguo, ISO timestamptz. */
  inicio: string;
  /** Nuevo fin del bloque contiguo, ISO timestamptz. */
  fin: string;
  /** D-08: idéntica semántica que `ComputeSlotsInput.skipBookingWindow`. */
  skipBookingWindow?: boolean;
}

// ---------------------------------------------------------------------------
// Tipo interno compartido de intervalos.
// ---------------------------------------------------------------------------

/**
 * `Interval` — intervalo half-open `[start, end)` en epoch ms. Reutilizado
 * por intervals.ts/grid.ts en Wave 2+.
 *
 * La semántica `[)` (inicio inclusivo, fin exclusivo) espeja exactamente la
 * del constraint del DB `tstzrange(inicio, fin, '[)')`: así dos turnos
 * back-to-back (D-02, sin buffer — el fin de uno habilita el inicio del
 * siguiente) son válidos y el motor no ofrece solapamientos que el DB
 * rechazaría al insertar (Pitfall 1).
 */
export interface Interval {
  /** Epoch ms, inclusivo. */
  start: number;
  /** Epoch ms, exclusivo. */
  end: number;
}
