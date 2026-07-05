/**
 * src/schedule.ts — resuelve `horario_trabajo` (recurrente por
 * `dia_semana`) a intervalos concretos de una fecha, en la timezone IANA del
 * negocio (AVAIL-01, Pitfall 2).
 *
 * Convención de `dia_semana`: 0=domingo..6=sábado, exactamente el
 * `CHECK (dia_semana BETWEEN 0 AND 6)` de `supabase/migrations/0001_schema_core.sql`
 * y el `.getDay()` nativo de `TZDate` (mismo orden que `Date.prototype.getDay`,
 * resuelto en la zona dada) — no requiere remapeo.
 *
 * REGLA DURA: todo límite de día se construye vía `TZDate` con la zona IANA
 * (`negocio.timezone`, ej. "America/Argentina/Buenos_Aires"). NUNCA
 * `new Date(dateStr)` (parsea como UTC, Pitfall 2: un horario 00:00-02:00 se
 * corre 3 horas y aparece en el día equivocado cerca de medianoche) y NUNCA
 * un offset -3 hardcodeado (Argentina no tiene DST hoy, pero hardcodear el
 * offset es la clase de bug que esta regla previene independientemente de
 * eso).
 */
import { TZDate } from "@date-fns/tz";

import type { HorarioTrabajoRow, Interval } from "./types.js";

/**
 * Parsea "HH:mm" o "HH:mm:ss" (las columnas `time` de Postgrest serializan
 * con segundos) y devuelve solo horas/minutos — el segundo extra se tolera
 * pero se ignora, ya que `horario_trabajo.hora_inicio/hora_fin` no necesita
 * precisión de segundos.
 */
function parseHoraMinuto(hora: string): { horas: number; minutos: number } {
  const [horas, minutos] = hora.split(":").map(Number);
  return { horas, minutos };
}

/**
 * dayStartEpochInZone(dateStr, timezone) — epoch ms de medianoche en la
 * zona del negocio para la fecha dada. Única fuente de la lógica de
 * "medianoche-en-zona"; `computeSlots` (Wave 3) la reutiliza como `anchor`
 * de `snapToGrid` (grid.ts) para que ambos módulos compartan exactamente el
 * mismo cero de grilla.
 */
export function dayStartEpochInZone(dateStr: string, timezone: string): number {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new TZDate(year, month - 1, day, 0, 0, 0, timezone).getTime();
}

/**
 * resolveWorkIntervalsForDate(horarios, dateStr, timezone) — filtra
 * `horarios` por el `dia_semana` que corresponde a `dateStr` en `timezone`
 * (resuelto vía TZDate, nunca UTC-naive) y construye un intervalo por cada
 * fila que matchea, en epoch ms.
 */
export function resolveWorkIntervalsForDate(
  horarios: HorarioTrabajoRow[],
  dateStr: string,
  timezone: string,
): Interval[] {
  const [year, month, day] = dateStr.split("-").map(Number);
  const anchor = new TZDate(year, month - 1, day, 0, 0, 0, timezone);
  const dow = anchor.getDay();

  return horarios
    .filter((h) => h.dia_semana === dow && h.activo !== false)
    .map((h) => {
      const inicio = parseHoraMinuto(h.hora_inicio);
      const fin = parseHoraMinuto(h.hora_fin);
      const start = new TZDate(year, month - 1, day, inicio.horas, inicio.minutos, 0, timezone).getTime();
      const end = new TZDate(year, month - 1, day, fin.horas, fin.minutos, 0, timezone).getTime();
      return { start, end };
    });
}
