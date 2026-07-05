/**
 * lib/schemas/profesional.ts — schema zod compartido entre el form de
 * "Datos generales" del profesional (`components/profesional-form.tsx`,
 * react-hook-form + zodResolver, UX client-side) y las Server Actions
 * `createProfesional`/`updateProfesional` (`app/actions/profesionales.ts`,
 * fuente de verdad, re-validación server-side) — PRO-01.
 *
 * Deliberadamente mínimo (solo `nombre` + `activo`, calcados 1:1 de la tabla
 * `profesional`): el plan 02-07 extiende la página de edición con el editor
 * de horario semanal (PRO-02) y la matriz de servicios/precio custom
 * (PRO-03/04) usando schemas propios y separados — no se anticipan acá para
 * no acoplar este schema a forma de datos que todavía no se construyó.
 */
import { z } from "zod";

export const profesionalSchema = z.object({
  nombre: z.string().trim().min(1, "El nombre es obligatorio"),
  activo: z.boolean().default(true),
});

export type ProfesionalInput = z.infer<typeof profesionalSchema>;
