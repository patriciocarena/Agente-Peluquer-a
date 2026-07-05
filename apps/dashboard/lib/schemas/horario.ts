/**
 * lib/schemas/horario.ts — schema zod del horario semanal recurrente de un
 * profesional (PRO-02), compartido entre `components/horario-editor.tsx`
 * (react-hook-form + zodResolver, UX client-side) y la Server Action
 * `updateHorario` (`app/actions/profesionales.ts`, fuente de verdad,
 * re-validación server-side) — mismo patrón que `lib/schemas/servicio.ts`.
 *
 * Estructura: un objeto con una clave por día de la semana (lunes..domingo),
 * cada uno con una lista de bloques `{hora_inicio, hora_fin}` en formato
 * HH:mm (02-UI-SPEC.md §Weekly Schedule Editor). Un día con 0 bloques se
 * muestra como "Cerrado" en el editor — es un estado válido, no un error.
 *
 * `bloquesSolapan` se exporta como helper puro (sin zod) para que
 * `horario-editor.tsx` pueda validar en el cliente, bloque a bloque, antes de
 * intentar guardar (misma lógica que el refine de abajo, reusada — no
 * reinventar la comparación de rangos en dos lugares).
 */
import { z } from "zod";

export const DIAS_SEMANA = [
  "lunes",
  "martes",
  "miercoles",
  "jueves",
  "viernes",
  "sabado",
  "domingo",
] as const;

export type DiaSemana = (typeof DIAS_SEMANA)[number];

const HORA_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

export type Bloque = { hora_inicio: string; hora_fin: string };

/**
 * Convierte "HH:mm" a minutos desde medianoche, para poder comparar rangos
 * numéricamente. Asume el string ya matchea HORA_REGEX (los callers de este
 * módulo lo validan antes con el schema/regex).
 */
function minutosDesdeMedianoche(hora: string): number {
  const [horas, minutos] = hora.split(":").map(Number);
  return horas * 60 + minutos;
}

/**
 * bloquesSolapan(a, b) — true si los rangos [hora_inicio, hora_fin) de dos
 * bloques se superponen. Bloques contiguos (uno termina exactamente cuando
 * el otro empieza, ej. 09:00–13:00 y 13:00–18:00) NO se consideran
 * solapados — son dos bloques disjuntos válidos.
 */
export function bloquesSolapan(a: Bloque, b: Bloque): boolean {
  const inicioA = minutosDesdeMedianoche(a.hora_inicio);
  const finA = minutosDesdeMedianoche(a.hora_fin);
  const inicioB = minutosDesdeMedianoche(b.hora_inicio);
  const finB = minutosDesdeMedianoche(b.hora_fin);
  return inicioA < finB && inicioB < finA;
}

const bloqueSchema = z
  .object({
    hora_inicio: z.string().regex(HORA_REGEX, "Formato de hora inválido (HH:mm)."),
    hora_fin: z.string().regex(HORA_REGEX, "Formato de hora inválido (HH:mm)."),
  })
  .refine((bloque) => minutosDesdeMedianoche(bloque.hora_fin) > minutosDesdeMedianoche(bloque.hora_inicio), {
    message: "La hora de fin debe ser posterior a la hora de inicio.",
    path: ["hora_fin"],
  });

const diaSchema = z
  .object({
    bloques: z.array(bloqueSchema),
  })
  .refine(
    (dia) => {
      for (let i = 0; i < dia.bloques.length; i++) {
        for (let j = i + 1; j < dia.bloques.length; j++) {
          if (bloquesSolapan(dia.bloques[i], dia.bloques[j])) {
            return false;
          }
        }
      }
      return true;
    },
    { message: "Los bloques horarios de un mismo día no pueden solaparse.", path: ["bloques"] },
  );

export const horarioSchema = z.object({
  lunes: diaSchema,
  martes: diaSchema,
  miercoles: diaSchema,
  jueves: diaSchema,
  viernes: diaSchema,
  sabado: diaSchema,
  domingo: diaSchema,
});

export type HorarioInput = z.infer<typeof horarioSchema>;
export type DiaHorario = z.infer<typeof diaSchema>;
