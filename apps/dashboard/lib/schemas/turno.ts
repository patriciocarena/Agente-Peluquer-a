/**
 * lib/schemas/turno.ts — schema zod que valida el input de las Server
 * Actions de creación/edición de turnos (`app/actions/turnos.ts`, Plan 03/04
 * de esta fase). Es la primera capa de validación server-side (V5) del
 * formulario `turno-form-dialog.tsx`.
 *
 * `uuidLike` replica EXACTAMENTE el helper de
 * `packages/availability-engine/src/booking.ts`: valida la FORMA de un UUID
 * (8-4-4-4-12 hex), no la versión/variante RFC 4122. `z.uuid()` estricto
 * rechazaría ids de fixtures/seed válidos que la propia base ya guardó — el
 * dashboard debe aceptar exactamente los mismos ids que acepta el motor, sin
 * drift entre ambos límites de validación.
 */
import { z } from "zod";

const uuidLike = z
  .string()
  .regex(
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
    "UUID inválido",
  );

export const turnoSchema = z.object({
  profesionalId: uuidLike,
  clienteId: uuidLike,
  serviceIds: z.array(uuidLike).min(1, "Elegí al menos un servicio."),
  inicio: z.iso.datetime(),
  fin: z.iso.datetime(),
});

export type TurnoInput = z.infer<typeof turnoSchema>;
