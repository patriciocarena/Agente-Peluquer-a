/**
 * apps/bot/src/conversation/tools/reagendarTurno.ts — tool `reagendarTurno`
 * (BOT-10/D-09): mueve un turno EXISTENTE del cliente actual, envolviendo
 * `rescheduleAppointment` (@turnosbot/availability-engine) con la MISMA forma
 * de input que el reagendado del dashboard — nunca reimplementando el UPDATE
 * (AVAIL-04).
 *
 * `reagendarTurnoTool(negocioId, clienteId, deps?)` cierra sobre `negocioId`
 * (Pattern 1, D-13): el `inputSchema` de abajo NUNCA incluye `negocioId`.
 * `clienteId` se recibe en la factory para mantener la misma firma que el
 * resto de las tools de escritura (Pattern 1), aunque `reagendarTurno` no lo
 * necesita para scopear el UPDATE (`rescheduleAppointment` ya scopea por
 * `negocioId` + `turnoId` — mismo modelo de confianza que el dashboard, donde
 * el owner tampoco filtra por `cliente_id`).
 *
 * `execute` trae los `serviceIds` del turno vía
 * `negocioScoped(negocioId).turnoServicios()` (los servicios NO cambian al
 * reagendar, solo se usan para dimensionar la duración del bloque en la
 * revalidación — mismo patrón que `fetchTurnoServicios` del dashboard), arma
 * `freshData` fresco (Pattern 7 anti-cache) y llama `rescheduleAppointment`
 * con EXACTAMENTE la misma forma de input que
 * `apps/dashboard/app/actions/turnos.ts#reagendarTurno` (D-09) — sin activar
 * el bypass opt-in de la ventana de reserva (el bot respeta 60min/30d, a
 * diferencia del dueño).
 */
import { rescheduleAppointment, uuidLike } from "@turnosbot/availability-engine";
import type { BookAppointmentResult } from "@turnosbot/availability-engine";
import { tool } from "ai";
import { z } from "zod";

import { supabaseAdmin } from "../../db/client.js";
import { negocioScoped as realNegocioScoped } from "../../db/negocioScoped.js";
import { buildBotAvailabilityData as realBuildBotAvailabilityData } from "../buildBotAvailabilityData.js";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@turnosbot/db-types";

/** inputSchema de `reagendarTurno`. Sin `negocioId` — closure-captured
 * (D-13). */
export const reagendarTurnoInputSchema = z.object({
  turnoId: uuidLike,
  profesionalId: uuidLike,
  nuevoSlotInicio: z.iso.datetime(),
  nuevoSlotFin: z.iso.datetime(),
});

export type ReagendarTurnoInput = z.infer<typeof reagendarTurnoInputSchema>;

export type ReagendarTurnoResult =
  | { ok: true; turnoId: string; precioTotal: number }
  | { ok: false; mensaje: string };

const SLOT_TAKEN_COPY = "Ese horario se acaba de ocupar, ¿probamos otro?";
const GENERIC_ERROR_COPY = "No pudimos reagendar el turno. ¿Probamos de nuevo?";

/** mapRescheduleResult — traduce el `BookAppointmentResult` (tipo compartido
 * con `rescheduleAppointment`) a la estructura user-facing de esta tool. */
function mapRescheduleResult(result: BookAppointmentResult): ReagendarTurnoResult {
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

/** Deps inyectables (Pattern 3): reales por defecto, sustituibles en tests
 * por mocks deterministas sin DB real ni Gemini. */
export interface ReagendarTurnoDeps {
  rescheduleAppointment: typeof rescheduleAppointment;
  buildBotAvailabilityData: typeof realBuildBotAvailabilityData;
  negocioScoped: typeof realNegocioScoped;
  supabase: SupabaseClient<Database>;
}

const defaultDeps: ReagendarTurnoDeps = {
  rescheduleAppointment,
  buildBotAvailabilityData: realBuildBotAvailabilityData,
  negocioScoped: realNegocioScoped,
  supabase: supabaseAdmin,
};

/**
 * reagendarTurnoTool(negocioId, clienteId, deps?) — factory que devuelve la
 * tool `reagendarTurno` del AI SDK, cerrada sobre `negocioId` (D-13).
 */
export function reagendarTurnoTool(
  negocioId: string,
  clienteId: string,
  deps: ReagendarTurnoDeps = defaultDeps,
) {
  void clienteId; // reservado para paridad de firma con las demás tools de escritura (Pattern 1).
  return tool({
    description:
      "Reagenda (mueve) un turno EXISTENTE del cliente actual a un nuevo profesional/horario. Devuelve el mismo turno_id, nunca uno nuevo — un reagendado nunca crea un turno adicional.",
    inputSchema: reagendarTurnoInputSchema,
    execute: async (input: ReagendarTurnoInput): Promise<ReagendarTurnoResult> => {
      const db = deps.negocioScoped(negocioId);
      const { data: turnoServiciosData } = await db.turnoServicios();
      const serviceIds = (turnoServiciosData ?? [])
        .filter((ts) => ts.turno_id === input.turnoId)
        .map((ts) => ts.servicio_id);

      // Anti-cache (Pattern 7): freshData SIEMPRE fetcheado dentro del execute.
      const freshData = await deps.buildBotAvailabilityData(negocioId);

      const result = await deps.rescheduleAppointment(
        {
          negocioId,
          turnoId: input.turnoId,
          profesionalId: input.profesionalId,
          serviceIds,
          inicio: input.nuevoSlotInicio,
          fin: input.nuevoSlotFin,
          // Bypass opt-in de la ventana de reserva NUNCA activado (el bot
          // respeta 60min/30d, a diferencia del dueño en el dashboard).
        },
        { supabase: deps.supabase, freshData },
      );

      return mapRescheduleResult(result);
    },
  });
}
