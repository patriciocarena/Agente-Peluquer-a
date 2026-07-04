/**
 * @turnosbot/availability-engine
 *
 * STUB — no business logic yet. This package will hold the pure,
 * deterministic slot-computation function shared by the bot's tool layer
 * and the dashboard's turnos grid:
 *
 *   computeSlots = horario de trabajo − bloqueos − turnos confirmados
 *
 * Real implementation lands in a later plan once the 16-table schema
 * (supabase/migrations) exists. This stub only establishes the type
 * signature so both apps/bot and apps/dashboard can depend on the package
 * from day one without drift.
 */

export interface ComputeSlotsInput {
  tenantId: string;
  serviceId: string;
  professionalId?: string;
  /** ISO date, YYYY-MM-DD, interpreted in the tenant's timezone (America/Argentina/*) */
  date: string;
}

export interface AvailableSlot {
  /** ISO time, HH:mm, tenant-local timezone */
  start: string;
  /** ISO time, HH:mm, tenant-local timezone */
  end: string;
  professionalId: string;
}

/**
 * Placeholder implementation only — throws until real logic lands.
 * Real implementation: read professional work hours, subtract blocks and
 * confirmed appointments, return remaining open intervals sized to the
 * service duration.
 */
export async function computeSlots(_input: ComputeSlotsInput): Promise<AvailableSlot[]> {
  throw new Error("computeSlots: not implemented yet (stub — see packages/availability-engine)");
}
