/**
 * lib/schemas/bloqueo.ts — schema zod que valida el input de la Server Action
 * de creación de bloqueos manuales (`app/actions/turnos.ts` o equivalente,
 * Plan 03/04 de esta fase), usado por `bloqueo-popover.tsx` (D-05).
 *
 * `motivo` es SIEMPRE opcional (D-12, 04-UI-SPEC.md): la columna `motivo` de
 * la tabla `bloqueo` es `text` nullable en la DB — nunca se debe exigir un
 * motivo para crear un bloqueo manual. El cap de `.max(280)` corta input
 * basura en el borde (T-04-05) sin convertir el campo en obligatorio.
 */
import { z } from "zod";

const uuidLike = z
  .string()
  .regex(
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
    "UUID inválido",
  );

export const bloqueoSchema = z.object({
  profesionalId: uuidLike,
  inicio: z.iso.datetime(),
  fin: z.iso.datetime(),
  motivo: z.string().trim().max(280, "El motivo no puede superar los 280 caracteres.").optional(),
});

export type BloqueoInput = z.infer<typeof bloqueoSchema>;
