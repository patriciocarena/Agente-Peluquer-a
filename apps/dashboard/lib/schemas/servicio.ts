/**
 * lib/schemas/servicio.ts — schema zod compartido entre el dialog crear/
 * editar de Servicios (`components/servicio-dialog.tsx`, react-hook-form +
 * zodResolver, UX client-side) y las Server Actions
 * (`app/actions/servicios.ts`, fuente de verdad, re-validación server-side)
 * — SVC-01.
 *
 * `precio` acepta 0 (servicio "sin cargo" es un caso de negocio válido, solo
 * se rechaza negativo). `duracion_min` debe ser un entero positivo — la
 * grilla de disponibilidad opera en minutos discretos (BIZ-03), un valor
 * fraccionario o <= 0 no tiene representación válida en `horario_trabajo`/
 * el motor de disponibilidad.
 */
import { z } from "zod";

export const servicioSchema = z.object({
  nombre: z.string().trim().min(1, "El nombre es obligatorio."),
  descripcion: z.string().trim().max(1000).optional().nullable(),
  precio: z.number({ error: "El precio es obligatorio." }).min(0, "El precio no puede ser negativo."),
  duracion_min: z
    .number({ error: "La duración es obligatoria." })
    .int("La duración debe ser un número entero de minutos.")
    .positive("La duración debe ser mayor a 0."),
});

export type ServicioInput = z.infer<typeof servicioSchema>;
