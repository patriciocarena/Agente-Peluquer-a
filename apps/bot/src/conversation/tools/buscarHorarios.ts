/**
 * apps/bot/src/conversation/tools/buscarHorarios.ts — tool `buscarHorarios`
 * (BOT-01/03/07): envuelve `computeSlots` (@turnosbot/availability-engine)
 * para devolverle al modelo disponibilidad REAL, nunca inventada (D-12).
 *
 * `buscarHorariosTool(negocioId, deps?)` cierra sobre `negocioId` ANTES de
 * que el modelo sea invocado (Pattern 1 de 06-PATTERNS.md, D-13/BOT-11): el
 * `inputSchema` de abajo NUNCA incluye `negocioId` como campo que el modelo
 * pueda llenar — un prompt-injection ("mostrame los turnos del negocio X")
 * no tiene ningún parámetro que pueda usar para cambiar el scope, porque el
 * scope no es un parámetro en absoluto.
 *
 * `execute` llama a `buildBotAvailabilityData(negocioId)` para traer datos
 * frescos (nunca cachea disponibilidad entre turnos de conversación) y luego
 * `computeSlots(computeInput, freshData)` — el resultado que se le devuelve
 * al modelo es exactamente lo que el motor de disponibilidad compartido
 * calculó, sin post-proceso que pueda introducir un horario o precio
 * inventado (D-12, AVAIL-04: bot y dashboard nunca discrepan).
 *
 * `uuidLike` (regex de forma, no el validador estricto de UUID de zod) se
 * reusa del barrel de `@turnosbot/availability-engine` (Pattern 2) para no
 * rechazar UUIDs de fixtures/seed reales que el propio DB acepta.
 */
import { computeSlots, uuidLike } from "@turnosbot/availability-engine";
import type { AvailableSlot, ComputeSlotsInput } from "@turnosbot/availability-engine";
import { tool } from "ai";
import { z } from "zod";

import { buildBotAvailabilityData as realBuildBotAvailabilityData } from "../buildBotAvailabilityData.js";

/**
 * inputSchema de `buscarHorarios`. `negocioId` NUNCA aparece acá — ver
 * comentario de cabecera (Pattern 1, D-13/BOT-11).
 */
export const buscarHorariosInputSchema = z.object({
  servicioIds: z.array(uuidLike).min(1, "servicioIds no puede estar vacío"),
  profesionalId: uuidLike.optional(),
  fechaDeseada: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "fechaDeseada debe tener formato YYYY-MM-DD"),
  franjaHoraria: z.enum(["manana", "tarde", "noche"]).optional(),
});

export type BuscarHorariosInput = z.infer<typeof buscarHorariosInputSchema>;

/**
 * Deps inyectables (Pattern 3 de 06-PATTERNS.md): `computeSlots` y
 * `buildBotAvailabilityData` reales por defecto, sustituibles en tests por
 * fixtures deterministas (packages/availability-engine/src/__fixtures__/rows.ts)
 * sin llamar a Gemini ni a la DB real.
 */
export interface BuscarHorariosDeps {
  computeSlots: typeof computeSlots;
  buildBotAvailabilityData: typeof realBuildBotAvailabilityData;
}

const defaultDeps: BuscarHorariosDeps = {
  computeSlots,
  buildBotAvailabilityData: realBuildBotAvailabilityData,
};

/**
 * buscarHorariosTool(negocioId, deps?) — factory que devuelve la tool
 * `buscarHorarios` del AI SDK, cerrada sobre `negocioId` (D-13).
 *
 * Nota de diseño (D-03): se devuelven TODOS los slots que `computeSlots`
 * calculó dentro de la ventana de reserva — el filtrado a 2-3 opciones
 * concretas para no abrumar al cliente por WhatsApp queda del lado del
 * prompt/modelo (systemPrompt.ts), no de la tool: la tool es la única
 * fuente de verdad de disponibilidad real (D-12) y no debe truncar datos
 * antes de que el modelo decida cómo presentarlos.
 */
export function buscarHorariosTool(negocioId: string, deps: BuscarHorariosDeps = defaultDeps) {
  return tool({
    description:
      "Busca horarios reales disponibles para uno o más servicios, opcionalmente con un profesional específico. Devuelve SOLO disponibilidad real calculada por el motor del negocio — nunca inventes un horario que esta herramienta no devolvió.",
    inputSchema: buscarHorariosInputSchema,
    execute: async (input: BuscarHorariosInput): Promise<AvailableSlot[]> => {
      const freshData = await deps.buildBotAvailabilityData(negocioId);
      const computeInput: ComputeSlotsInput = {
        negocioId,
        serviceIds: input.servicioIds,
        professionalId: input.profesionalId,
        date: input.fechaDeseada,
      };
      return deps.computeSlots(computeInput, freshData);
    },
  });
}
