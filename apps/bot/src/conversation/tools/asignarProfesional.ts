/**
 * apps/bot/src/conversation/tools/asignarProfesional.ts — tool
 * `asignarProfesional` (D-04/BOT-02): resuelve "sin preferencia" de
 * profesional delegando 100% en `autoAssign` (@turnosbot/availability-engine),
 * la función PURA de desempate determinista — este wrapper NO reimplementa
 * ninguna heurística propia de selección (06-PATTERNS.md "Don't Hand-Roll").
 *
 * `asignarProfesionalTool(negocioId, deps?)` cierra sobre `negocioId` (D-13,
 * mismo Pattern 1 que `buscarHorarios.ts`) — el `inputSchema` nunca incluye
 * `negocioId` ni `profesionalId` (esta tool es específicamente para el caso
 * "el cliente no tiene preferencia").
 *
 * `execute` arma el mapa `slotsByProfessional` llamando a `computeSlots` una
 * vez por cada profesional candidato (derivados de `freshData.horarios`, los
 * únicos que tienen horario_trabajo cargado) y se lo pasa tal cual a
 * `autoAssign` — el mismo mapa/estructura que `computeSlots` arma
 * internamente cuando no se le pasa `professionalId` (ver
 * packages/availability-engine/src/computeSlots.ts líneas 110-157).
 */
import { autoAssign, computeSlots, uuidLike } from "@turnosbot/availability-engine";
import type { AvailableSlot, ComputeSlotsInput } from "@turnosbot/availability-engine";
import { tool } from "ai";
import { z } from "zod";

import { buildBotAvailabilityData as realBuildBotAvailabilityData } from "../buildBotAvailabilityData.js";

/** inputSchema de `asignarProfesional`. Sin `negocioId` (closure, D-13) ni
 * `profesionalId` (esta tool asume "sin preferencia" por diseño). */
export const asignarProfesionalInputSchema = z.object({
  servicioIds: z.array(uuidLike).min(1, "servicioIds no puede estar vacío"),
  fechaDeseada: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "fechaDeseada debe tener formato YYYY-MM-DD"),
  franjaHoraria: z.enum(["manana", "tarde", "noche"]).optional(),
});

export type AsignarProfesionalInput = z.infer<typeof asignarProfesionalInputSchema>;

export type AsignarProfesionalResult = { professionalId: string; slot: AvailableSlot } | null;

/** Deps inyectables (Pattern 3): `computeSlots`/`autoAssign` reales por
 * defecto, sustituibles en tests con fixtures deterministas. */
export interface AsignarProfesionalDeps {
  computeSlots: typeof computeSlots;
  autoAssign: typeof autoAssign;
  buildBotAvailabilityData: typeof realBuildBotAvailabilityData;
}

const defaultDeps: AsignarProfesionalDeps = {
  computeSlots,
  autoAssign,
  buildBotAvailabilityData: realBuildBotAvailabilityData,
};

/**
 * asignarProfesionalTool(negocioId, deps?) — factory que devuelve la tool
 * `asignarProfesional` del AI SDK, cerrada sobre `negocioId` (D-13).
 */
export function asignarProfesionalTool(
  negocioId: string,
  deps: AsignarProfesionalDeps = defaultDeps,
) {
  return tool({
    description:
      "Asigna automáticamente un profesional cuando el cliente no tiene preferencia (D-04). Devuelve el profesional con el hueco disponible más temprano, o null si no hay ningún hueco.",
    inputSchema: asignarProfesionalInputSchema,
    execute: async (input: AsignarProfesionalInput): Promise<AsignarProfesionalResult> => {
      const freshData = await deps.buildBotAvailabilityData(negocioId);

      const candidateIds = Array.from(
        new Set(freshData.horarios.map((horario) => horario.profesional_id)),
      );

      const slotsByProfessional = new Map<string, AvailableSlot[]>();
      for (const profesionalId of candidateIds) {
        const computeInput: ComputeSlotsInput = {
          negocioId,
          serviceIds: input.servicioIds,
          professionalId: profesionalId,
          date: input.fechaDeseada,
        };
        const slots = await deps.computeSlots(computeInput, freshData);
        slotsByProfessional.set(profesionalId, slots);
      }

      return deps.autoAssign(slotsByProfessional);
    },
  });
}
