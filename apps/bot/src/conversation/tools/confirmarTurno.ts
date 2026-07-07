/**
 * apps/bot/src/conversation/tools/confirmarTurno.ts — tool `confirmarTurno`
 * (BOT-04/D-12): ÚNICA tool de escritura que crea un turno nuevo, envolviendo
 * `bookAppointment` (@turnosbot/availability-engine) — nunca reimplementando
 * el INSERT (AVAIL-04).
 *
 * `confirmarTurnoTool(negocioId, clienteId, deps?)` cierra sobre AMBOS
 * `negocioId` Y `clienteId` (Pattern 1 de 06-PATTERNS.md, D-13): el
 * `inputSchema` de abajo NUNCA incluye ninguno de los dos como campo que el
 * modelo pueda llenar.
 *
 * A diferencia del dashboard (`crearTurnoManual`, que activa el bypass opt-in
 * de la ventana de reserva porque el dueño puede cargar turnos "para ahora
 * mismo" o a más de 30 días — D-07), el BOT nunca activa ese bypass: respeta
 * la ventana de reserva de 60min/30d como cualquier cliente real.
 *
 * `execute` fetchea `freshData` DENTRO del execute (Pattern 7 anti-cache,
 * T-03-13/T-06-11) inmediatamente antes de llamar `bookAppointment` — nunca
 * reusa disponibilidad calculada en un turno de conversación previo.
 *
 * El valor estructurado devuelto en el caso `ok` INCLUYE el `turnoId` real
 * (T-06-11, D-12): el gate del responder (plan 06-05) inspecciona este campo
 * antes de dejar salir cualquier mensaje de confirmación — nunca se inventa
 * ni se deja pasar un turno_id fantasma. En error, la estructura NUNCA incluye
 * `turnoId`.
 */
import { bookAppointment, uuidLike } from "@turnosbot/availability-engine";
import type { BookAppointmentResult } from "@turnosbot/availability-engine";
import { tool } from "ai";
import { z } from "zod";

import { supabaseAdmin } from "../../db/client.js";
import { buildBotAvailabilityData as realBuildBotAvailabilityData } from "../buildBotAvailabilityData.js";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@turnosbot/db-types";

/** inputSchema de `confirmarTurno`. Sin `negocioId` ni `clienteId` — ambos
 * closure-captured (D-13, mismo Pattern 1 que las tools de lectura). */
export const confirmarTurnoInputSchema = z.object({
  profesionalId: uuidLike,
  servicioIds: z.array(uuidLike).min(1, "servicioIds no puede estar vacío"),
  slotInicio: z.iso.datetime(),
  slotFin: z.iso.datetime(),
});

export type ConfirmarTurnoInput = z.infer<typeof confirmarTurnoInputSchema>;

/** Resultado estructurado devuelto al modelo. El caso `ok:true` es la ÚNICA
 * forma en la que un `turnoId` real puede llegar al gate D-12 del plan
 * 06-05 — el caso de error NUNCA incluye `turnoId` (T-06-11). */
export type ConfirmarTurnoResult =
  | { ok: true; turnoId: string; precioTotal: number }
  | { ok: false; mensaje: string };

const SLOT_TAKEN_COPY = "Ese horario se acaba de ocupar, ¿probamos otro?";
const GENERIC_ERROR_COPY = "No pudimos confirmar el turno. ¿Probamos de nuevo?";

/** mapBookAppointmentResult — traduce el `BookAppointmentResult` de dominio a
 * la estructura user-facing de esta tool. Nunca inventa un `turnoId` en el
 * camino de error (T-06-11). */
function mapBookAppointmentResult(result: BookAppointmentResult): ConfirmarTurnoResult {
  if (result.ok) {
    return { ok: true, turnoId: result.turnoId, precioTotal: result.precioTotal };
  }
  switch (result.reason) {
    case "slot_taken":
      return { ok: false, mensaje: SLOT_TAKEN_COPY };
    case "validation_error":
    case "insert_error":
    default:
      return { ok: false, mensaje: GENERIC_ERROR_COPY };
  }
}

/** Deps inyectables (Pattern 3 de 06-PATTERNS.md): `bookAppointment`,
 * `buildBotAvailabilityData` y el cliente Supabase service_role reales por
 * defecto, sustituibles en tests por mocks deterministas sin DB real ni
 * Gemini. */
export interface ConfirmarTurnoDeps {
  bookAppointment: typeof bookAppointment;
  buildBotAvailabilityData: typeof realBuildBotAvailabilityData;
  supabase: SupabaseClient<Database>;
}

const defaultDeps: ConfirmarTurnoDeps = {
  bookAppointment,
  buildBotAvailabilityData: realBuildBotAvailabilityData,
  supabase: supabaseAdmin,
};

/**
 * confirmarTurnoTool(negocioId, clienteId, deps?) — factory que devuelve la
 * tool `confirmarTurno` del AI SDK, cerrada sobre `negocioId` Y `clienteId`
 * (D-13).
 */
export function confirmarTurnoTool(
  negocioId: string,
  clienteId: string,
  deps: ConfirmarTurnoDeps = defaultDeps,
) {
  return tool({
    description:
      "Confirma un turno real con el profesional, servicios y horario ya acordados con el cliente. Devuelve el turno_id real generado por el sistema — nunca le digas al cliente que su turno quedó confirmado sin haber llamado antes a esta herramienta y recibido ok:true.",
    inputSchema: confirmarTurnoInputSchema,
    execute: async (input: ConfirmarTurnoInput): Promise<ConfirmarTurnoResult> => {
      // Anti-cache (Pattern 7, T-03-13/T-06-11): freshData SIEMPRE fetcheado
      // dentro del execute, nunca reusado de un turno de conversación previo.
      const freshData = await deps.buildBotAvailabilityData(negocioId);

      const result = await deps.bookAppointment(
        {
          negocioId,
          profesionalId: input.profesionalId,
          clienteId,
          serviceIds: input.servicioIds,
          inicio: input.slotInicio,
          fin: input.slotFin,
          // Bypass opt-in de la ventana de reserva NUNCA activado: el bot
          // respeta la ventana 60min/30d (a diferencia del alta manual del
          // dueño en el dashboard).
        },
        { supabase: deps.supabase, freshData },
      );

      return mapBookAppointmentResult(result);
    },
  });
}
