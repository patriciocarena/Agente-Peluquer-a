/**
 * app/actions/turnos.ts — Server Actions de turno que SÍ usan el motor
 * compartido (APPT-04/05/06, BOT-09). Único camino de escritura de
 * disponibilidad = `bookAppointment`/`rescheduleAppointment`/
 * `cancelAppointment` (D-11/D-14/BOT-09) — nunca un insert/update paralelo de
 * `turno` que compita con el motor.
 *
 * `negocio_id` SIEMPRE se deriva de `getNegocioActivo()` (contexto
 * server-side), NUNCA de un campo del cliente (T-02-13/T-04-12) — ninguna de
 * las tres actions acepta un `negocioId` en su input.
 *
 * Todas terminan en `revalidatePath("/turnos")` en el camino de éxito
 * (Pitfall 4): la grilla debe reflejar el cambio de inmediato.
 */
"use server";

import { revalidatePath } from "next/cache";

import {
  bookAppointment,
  cancelAppointment,
  rescheduleAppointment,
  type BookAppointmentResult,
} from "@turnosbot/availability-engine";

import { requireRole } from "@/lib/auth/require-role";
import { buildAvailabilityData, fetchTurnoServicios } from "@/lib/availability-data";
import { getNegocioActivo } from "@/lib/negocio-context";
import { createClient } from "@/lib/supabase/server";
import { turnoSchema, type TurnoInput } from "@/lib/schemas/turno";

// Copys exactos de 04-UI-SPEC.md (mapeo de errores).
const SAVE_ERROR_COPY = "No pudimos guardar el turno. Revisá los datos e intentá de nuevo.";
const SLOT_TAKEN_COPY = "Ese horario se acaba de ocupar. Elegí otro horario disponible.";
const GENERIC_ERROR_COPY = "No pudimos completar la operación. Intentá de nuevo.";

export type TurnoActionResult = { error: string } | { success: true };

/** mapBookResult — traduce el resultado de dominio de bookAppointment/
 * rescheduleAppointment al copy exacto de 04-UI-SPEC.md que consume la UI. */
function mapBookResult(result: BookAppointmentResult): TurnoActionResult {
  if (result.ok) {
    return { success: true };
  }
  switch (result.reason) {
    case "slot_taken":
      return { error: SLOT_TAKEN_COPY };
    case "validation_error":
      return { error: SAVE_ERROR_COPY };
    case "insert_error":
    default:
      return { error: GENERIC_ERROR_COPY };
  }
}

/**
 * crearTurnoManual (APPT-06, D-10/D-11) — alta manual del dueño. Llama
 * `bookAppointment` con `skipBookingWindow: true` (D-07: el dueño puede
 * cargar turnos "para ahora mismo" o a más de 30 días) — único camino de
 * escritura, sin insert paralelo de `turno` (T-04-14).
 */
export async function crearTurnoManual(input: TurnoInput): Promise<TurnoActionResult> {
  await requireRole("owner");

  const parsed = turnoSchema.safeParse(input);
  if (!parsed.success) {
    return { error: SAVE_ERROR_COPY };
  }

  // negocio_id derivado del contexto server-side — nunca de `input` (T-02-13/T-04-12).
  const { negocio } = await getNegocioActivo();

  const supabase = await createClient();
  const freshData = await buildAvailabilityData(negocio.id);

  const result = await bookAppointment(
    {
      negocioId: negocio.id,
      profesionalId: parsed.data.profesionalId,
      clienteId: parsed.data.clienteId,
      serviceIds: parsed.data.serviceIds,
      inicio: parsed.data.inicio,
      fin: parsed.data.fin,
      skipBookingWindow: true,
    },
    { supabase, freshData },
  );

  // NOTA (AVAIL-04/D-11): esta escritura es SOLO-de-estado (`estado`), no
  // toca inicio/fin/profesional_id — no recalcula ni compite con el motor.
  // El alta manual del dueño (a diferencia de una reserva del bot) queda
  // confirmada directamente; `bookAppointment` siempre inserta en `pendiente`.
  if (result.ok) {
    await supabase
      .from("turno")
      .update({ estado: "confirmado" })
      .eq("id", result.turnoId)
      .eq("negocio_id", negocio.id);
  }

  revalidatePath("/turnos");
  return mapBookResult(result);
}

/**
 * cancelarTurno (APPT-04, BOT-09, D-06/D-12) — delega en `cancelAppointment`
 * (motor compartido, T-06-01/T-06-02): marca `estado='cancelado'`, NUNCA
 * borra la fila (historial) — `computeSlots` ignora `cancelado` (Pitfall 4),
 * así que la celda vuelve a libre al instante tras `revalidatePath`.
 *
 * `already_cancelled` (turno ya estaba cancelado) es un estado BENIGNO
 * idempotente, NO un error: el turno ya no está activo, que es exactamente
 * lo que el owner quería — se mapea a éxito. Esta misma semántica DEBE
 * reflejarse en la tool `cancelarTurno` del bot (plan 06-04): ambos callers
 * mapean `already_cancelled` como already-done, nunca como fallo duro. Solo
 * `not_found`/`update_error` (fallas reales) devuelven `{error}`.
 */
export async function cancelarTurno(turnoId: string): Promise<TurnoActionResult> {
  await requireRole("owner");

  const { negocio } = await getNegocioActivo();

  const supabase = await createClient();
  const result = await cancelAppointment({ negocioId: negocio.id, turnoId }, { supabase });

  if (result.ok) {
    revalidatePath("/turnos");
    return { success: true };
  }

  switch (result.reason) {
    case "already_cancelled":
      // Idempotente: el turno ya no está activo (lo que el owner quería).
      revalidatePath("/turnos");
      return { success: true };
    case "not_found":
    case "update_error":
    case "validation_error":
    default:
      return { error: GENERIC_ERROR_COPY };
  }
}

/**
 * reagendarTurno (APPT-05, D-14) — mueve el MISMO turno vía
 * `rescheduleAppointment` (UPDATE, nunca cancela+crea). Los `serviceIds`
 * originales del turno se traen vía `fetchTurnoServicios` — no cambian, solo
 * se pasan para dimensionar la duración del bloque en la revalidación.
 */
export async function reagendarTurno(
  turnoId: string,
  input: { profesionalId: string; inicio: string; fin: string },
): Promise<TurnoActionResult> {
  await requireRole("owner");

  const { negocio } = await getNegocioActivo();

  const supabase = await createClient();

  const serviciosDelTurno = await fetchTurnoServicios(negocio.id, turnoId);
  const serviceIds = serviciosDelTurno.map((s) => s.servicio_id);

  const freshData = await buildAvailabilityData(negocio.id);

  const result = await rescheduleAppointment(
    {
      negocioId: negocio.id,
      turnoId,
      profesionalId: input.profesionalId,
      serviceIds,
      inicio: input.inicio,
      fin: input.fin,
    },
    { supabase, freshData },
  );

  revalidatePath("/turnos");
  return mapBookResult(result);
}
