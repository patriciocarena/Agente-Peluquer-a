/**
 * lib/schemas/horario.ts — schema zod del horario semanal recurrente de un
 * profesional (PRO-02), compartido entre `components/horario-editor.tsx`
 * (react-hook-form, UX client-side) y la Server Action `updateHorario`
 * (`app/actions/profesionales.ts`, fuente de verdad, re-validación
 * server-side) — mismo patrón que `lib/schemas/profesional.ts`/`servicio.ts`.
 *
 * Calca la forma de `horario_trabajo` (0001_schema_core.sql): `dia_semana`
 * es un entero 0..6 (0=domingo..6=sábado, convención Postgres/JS `Date#getDay`
 * usada también en `horario_general` de `negocio`), y cada día tiene una
 * lista de bloques `{hora_inicio, hora_fin}` en formato `HH:mm` — cero
 * bloques significa "Cerrado" ese día (02-UI-SPEC.md §Weekly Schedule
 * Editor). Múltiples filas por `(profesional_id, dia_semana)` son válidas en
 * la tabla (turno mañana + turno tarde); acá se modelan como bloques
 * disjuntos dentro del mismo día.
 *
 * `bloquesSolapan`/`tieneBloquesSolapados` se exportan como helpers puros
 * para que el editor (client-side) pueda validar en vivo antes de habilitar
 * "Guardar cambios", sin duplicar la lógica de solapamiento.
 */
import { z } from "zod";

/** Formato `HH:mm` 24hs estricto (02-UI-SPEC.md §Formatting Conventions). */
export const HORA_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const bloqueHorarioSchema = z
  .object({
    hora_inicio: z.string().regex(HORA_REGEX, "Formato de hora inválido (HH:mm)."),
    hora_fin: z.string().regex(HORA_REGEX, "Formato de hora inválido (HH:mm)."),
  })
  .refine((bloque) => bloque.hora_fin > bloque.hora_inicio, {
    message: "La hora de fin debe ser posterior a la hora de inicio.",
    path: ["hora_fin"],
  });

export type BloqueHorario = z.infer<typeof bloqueHorarioSchema>;

/** true si dos bloques (ya validados individualmente) se superponen en el tiempo. */
export function bloquesSolapan(a: BloqueHorario, b: BloqueHorario): boolean {
  return a.hora_inicio < b.hora_fin && b.hora_inicio < a.hora_fin;
}

/** true si algún par de bloques de la lista se superpone. O(n^2) sobre listas
 * de a lo sumo unos pocos bloques por día — sin necesidad de ordenar/optimizar. */
export function tieneBloquesSolapados(bloques: BloqueHorario[]): boolean {
  for (let i = 0; i < bloques.length; i += 1) {
    for (let j = i + 1; j < bloques.length; j += 1) {
      if (bloquesSolapan(bloques[i], bloques[j])) {
        return true;
      }
    }
  }
  return false;
}

export const diaHorarioSchema = z
  .object({
    dia_semana: z.number().int().min(0).max(6),
    bloques: z.array(bloqueHorarioSchema),
  })
  .refine((dia) => !tieneBloquesSolapados(dia.bloques), {
    message: "Los bloques horarios de este día se solapan.",
    path: ["bloques"],
  });

export type DiaHorario = z.infer<typeof diaHorarioSchema>;

/** Los 7 días de la semana, uno por cada valor de `dia_semana` (0..6), sin
 * repetidos ni faltantes — un profesional siempre tiene las 7 filas
 * representadas (aunque estén "Cerrado" con `bloques: []`). */
export const horarioSchema = z.object({
  dias: z
    .array(diaHorarioSchema)
    .length(7, "El horario debe tener exactamente 7 días.")
    .refine(
      (dias) => new Set(dias.map((dia) => dia.dia_semana)).size === 7,
      "El horario debe tener un día por cada valor de 0 a 6, sin repetidos.",
    ),
});

export type HorarioInput = z.infer<typeof horarioSchema>;

/** Nombres completos en español, indexados por `dia_semana` (0=domingo..6=sábado). */
export const DIAS_SEMANA_LABELS: Record<number, string> = {
  0: "Domingo",
  1: "Lunes",
  2: "Martes",
  3: "Miércoles",
  4: "Jueves",
  5: "Viernes",
  6: "Sábado",
};

/** Orden de renderizado del editor (Lunes primero, Domingo último —
 * 02-UI-SPEC.md), como lista de valores `dia_semana`. */
export const DIAS_SEMANA_ORDEN_UI = [1, 2, 3, 4, 5, 6, 0] as const;
