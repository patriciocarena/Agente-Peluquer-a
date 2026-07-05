/**
 * lib/schemas/negocio.ts — schema zod compartido entre el form de Perfil del
 * negocio (`app/(owner)/negocio/negocio-form.tsx`, react-hook-form +
 * zodResolver, UX client-side) y la Server Action `updateNegocio`
 * (`app/actions/negocio.ts`, fuente de verdad, re-validación server-side)
 * — BIZ-01/03.
 *
 * `granularidad_min` está deliberadamente restringido a {15, 30} (BIZ-03: la
 * grilla de disponibilidad no soporta otros pasos); `horario_general` es el
 * resumen "display only" que ya documenta 0001_schema_core.sql (el horario
 * real, autoritativo, vive en `horario_trabajo` por profesional — fuera de
 * alcance de este plan).
 */
import { z } from "zod";

export const GRANULARIDADES_MIN = [15, 30] as const;

export const negocioSchema = z.object({
  nombre: z.string().trim().min(1, "El nombre es obligatorio."),
  direccion: z.string().trim().max(255).optional().nullable(),
  telefono: z.string().trim().max(50).optional().nullable(),
  timezone: z.string().trim().min(1, "La zona horaria es obligatoria."),
  granularidad_min: z.union([z.literal(15), z.literal(30)]),
  horario_general: z.string().trim().max(500).optional().nullable(),
});

export type NegocioInput = z.infer<typeof negocioSchema>;
