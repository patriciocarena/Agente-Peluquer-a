/**
 * apps/bot/src/conversation/tools/reagendarTurno.ts — tool `reagendarTurno`
 * (BOT-10/D-09): mueve un turno EXISTENTE del cliente actual, envolviendo
 * `rescheduleAppointment` (@turnosbot/availability-engine) con la MISMA forma
 * de input que el reagendado del dashboard — nunca reimplementando el UPDATE
 * (AVAIL-04).
 *
 * `reagendarTurnoTool(negocioId, clienteId, deps?)` cierra sobre `negocioId`
 * (Pattern 1, D-13): el `inputSchema` de abajo NUNCA incluye `negocioId`.
 *
 * CR-03 (cross-client tampering): `rescheduleAppointment` en sí solo scopea
 * por `negocioId` + `turnoId` (mismo modelo de confianza que el dashboard,
 * donde el owner autenticado SÍ puede tocar cualquier turno del negocio). El
 * actor de esta tool es un cliente anónimo de WhatsApp que solo debe poder
 * tocar SU PROPIO turno — un `turnoId` ajeno no debe poder reagendarse. Por
 * eso `execute` verifica ownership (`turno.cliente_id === clienteId`) sobre
 * las filas ya-scopeadas por negocio de `negocioScoped(negocioId).turnos()`
 * ANTES de llamar al motor, devolviendo el mismo `GENERIC_ERROR_COPY` que un
 * error real si no existe o pertenece a otro cliente (no distingue los dos
 * casos en el mensaje — evita confirmar/negar la existencia de turnos
 * ajenos).
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
import { computeSlots, rescheduleAppointment, uuidLike } from "@turnosbot/availability-engine";
import type { BookAppointmentResult, ComputeSlotsInput } from "@turnosbot/availability-engine";
import { tool } from "ai";
import { z } from "zod";

import { supabaseAdmin } from "../../db/client.js";
import { negocioScoped as realNegocioScoped } from "../../db/negocioScoped.js";
import { buildBotAvailabilityData as realBuildBotAvailabilityData } from "../buildBotAvailabilityData.js";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@turnosbot/db-types";

/** inputSchema de `reagendarTurno`. Sin `negocioId` — closure-captured
 * (D-13). `nuevaFecha` + `nuevaHoraInicio` son la fecha y la HORA LOCAL del
 * nuevo slot (tal como buscarHorarios se lo mostró al modelo), NO un ISO — el
 * instante UTC lo resuelve el servidor acá (mismo fix de timezone que
 * `confirmarTurno`: el modelo nunca arma un timestamp). */
export const reagendarTurnoInputSchema = z.object({
  turnoId: uuidLike,
  profesionalId: uuidLike,
  nuevaFecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "nuevaFecha debe tener formato YYYY-MM-DD"),
  nuevaHoraInicio: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "nuevaHoraInicio debe tener formato HH:mm (hora local del slot)"),
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
  computeSlots: typeof computeSlots;
  buildBotAvailabilityData: typeof realBuildBotAvailabilityData;
  negocioScoped: typeof realNegocioScoped;
  supabase: SupabaseClient<Database>;
}

const defaultDeps: ReagendarTurnoDeps = {
  rescheduleAppointment,
  computeSlots,
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
  return tool({
    description:
      "Reagenda (mueve) un turno EXISTENTE del cliente actual a un nuevo profesional/horario. Devuelve el mismo turno_id, nunca uno nuevo — un reagendado nunca crea un turno adicional.",
    inputSchema: reagendarTurnoInputSchema,
    execute: async (input: ReagendarTurnoInput): Promise<ReagendarTurnoResult> => {
      const db = deps.negocioScoped(negocioId);
      const [turnosRes, turnoServiciosRes] = await Promise.all([db.turnos(), db.turnoServicios()]);

      // CR-03: ownership check ANTES de tocar el motor de escritura —
      // rescheduleAppointment solo scopea por negocioId+turnoId (igual que
      // el dashboard, cuyo actor SÍ es un owner autenticado); este actor es
      // un cliente anónimo de WhatsApp que solo puede tocar su propio turno.
      const turnoPropio = (turnosRes.data ?? []).find(
        (turno) => turno.id === input.turnoId && turno.cliente_id === clienteId,
      );
      if (!turnoPropio) {
        // No distinguir "no existe" de "no es tuyo" en el mensaje (no leak).
        return { ok: false, mensaje: GENERIC_ERROR_COPY };
      }

      const serviceIds = (turnoServiciosRes.data ?? [])
        .filter((ts) => ts.turno_id === input.turnoId)
        .map((ts) => ts.servicio_id);

      // Anti-cache (Pattern 7): freshData SIEMPRE fetcheado dentro del execute.
      const freshData = await deps.buildBotAvailabilityData(negocioId);

      // Resolución server-side del instante (mismo fix que confirmarTurno): el
      // modelo pasó la nueva fecha + HORA LOCAL; buscamos el slot real a esa
      // hora y usamos su startIso/endIso. Se EXCLUYE el propio turno de la
      // disponibilidad (mismo criterio que rescheduleAppointment internamente),
      // para que su horario ACTUAL no aparezca ocupado al resolver el nuevo.
      const dataExcludingSelf = {
        ...freshData,
        turnos: freshData.turnos.filter((t) => t.id !== input.turnoId),
      };
      const computeInput: ComputeSlotsInput = {
        negocioId,
        serviceIds,
        professionalId: input.profesionalId,
        date: input.nuevaFecha,
      };
      const slots = await deps.computeSlots(computeInput, dataExcludingSelf);
      const nuevoSlot = slots.find((s) => s.start === input.nuevaHoraInicio);
      if (!nuevoSlot) {
        return { ok: false, mensaje: SLOT_TAKEN_COPY };
      }

      const result = await deps.rescheduleAppointment(
        {
          negocioId,
          turnoId: input.turnoId,
          profesionalId: input.profesionalId,
          serviceIds,
          inicio: nuevoSlot.startIso,
          fin: nuevoSlot.endIso,
          // Bypass opt-in de la ventana de reserva NUNCA activado (el bot
          // respeta 60min/30d, a diferencia del dueño en el dashboard).
        },
        { supabase: deps.supabase, freshData },
      );

      return mapRescheduleResult(result);
    },
  });
}
