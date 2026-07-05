/**
 * src/computeSlots.ts — orquestación pura del motor de disponibilidad
 * (AVAIL-01/02/04/05, D-03/D-04/D-05). Compone los primitivos de Wave 2
 * (intervals.ts, grid.ts, schedule.ts) y el desempate de auto-asignación
 * (autoAssign.ts) en el cálculo completo: horario del día − bloqueos −
 * turnos activos → grilla dimensionada a la duración multi-servicio →
 * ventana de reserva (D-04/D-05) → auto-asignación si no hay preferencia
 * (D-03/AVAIL-05).
 *
 * ANTI-PATRÓN (03-RESEARCH.md, respetado): este módulo NUNCA importa el SDK
 * de Supabase ni sostiene un cliente propio — recibe TODAS las filas
 * ya-fetcheadas vía el 2º parámetro `AvailabilityData` (AVAIL-04). El
 * caller (bot/dashboard) es responsable de scopear las filas al
 * `negocioId` correcto (T-03-01, V4 Access Control); este módulo agrega una
 * aserción defensiva de scoping (T-03-09) que falla ruidosamente ante una
 * fila cruzada, en vez de computar disponibilidad cross-negocio en
 * silencio si un caller tiene un bug.
 */
import { TZDate } from "@date-fns/tz";

import { autoAssign } from "./autoAssign.js";
import { BOOKING_MAX_ADVANCE_DAYS, BOOKING_MIN_LEAD_MINUTES } from "./constants.js";
import { snapToGrid } from "./grid.js";
import { subtractIntervals } from "./intervals.js";
import { dayStartEpochInZone, resolveWorkIntervalsForDate } from "./schedule.js";
import type { AvailabilityData, AvailableSlot, ComputeSlotsInput, Interval } from "./types.js";

/**
 * Filtro "busy" (Pitfall 4): SOLO `pendiente` y `confirmado` bloquean un
 * turno; `cancelado` libera el slot. Debe ser el inverso lógico exacto del
 * `WHERE (estado != 'cancelado')` del constraint `turno_no_overlap` del DB
 * (T-03-10) — si diverge, el motor ofrece slots que el DB luego rechaza al
 * insertar.
 */
const ESTADOS_QUE_BLOQUEAN = new Set(["pendiente", "confirmado"]);

/**
 * assertScopedToNegocio (T-03-09, Information Disclosure, mitigate) —
 * aserción defensiva: si alguna fila de `data` no pertenece a
 * `input.negocioId`, falla ruidosamente en vez de computar disponibilidad
 * cross-negocio en silencio. El motor es puro y no puede enforcar
 * aislamiento por sí mismo al no tener cliente DB/RLS propios; esto es una
 * red de seguridad contra un caller con bug, no un reemplazo de RLS.
 */
function assertScopedToNegocio(input: ComputeSlotsInput, data: AvailabilityData): void {
  const filasConNegocioId: Array<{ negocio_id: string }> = [
    ...data.horarios,
    ...data.bloqueos,
    ...data.turnos,
    ...data.servicios,
  ];
  const filaCruzada = filasConNegocioId.find((fila) => fila.negocio_id !== input.negocioId);
  if (filaCruzada) {
    throw new Error(
      `computeSlots: fila con negocio_id="${filaCruzada.negocio_id}" no pertenece al negocioId="${input.negocioId}" del input (T-03-09).`,
    );
  }
  if (data.negocio.id !== input.negocioId) {
    throw new Error(
      `computeSlots: data.negocio.id="${data.negocio.id}" no coincide con negocioId="${input.negocioId}" del input (T-03-09).`,
    );
  }
}

/** ISO timestamptz → Interval en epoch ms. */
function toInterval(inicioIso: string, finIso: string): Interval {
  return { start: new Date(inicioIso).getTime(), end: new Date(finIso).getTime() };
}

/** Epoch ms → "HH:mm" en la zona del negocio (nunca offset -3 hardcodeado). */
function formatHHmmInZone(epochMs: number, timezone: string): string {
  const zoned = new TZDate(epochMs, timezone);
  const horas = String(zoned.getHours()).padStart(2, "0");
  const minutos = String(zoned.getMinutes()).padStart(2, "0");
  return `${horas}:${minutos}`;
}

/**
 * computeSlots(input, data, now?) — cálculo puro de disponibilidad.
 *
 * `now` es un parámetro explícito e inyectable (por defecto `Date.now()`)
 * para que la ventana de reserva (D-04/D-05) sea testeable de forma
 * determinística sin depender del reloj real.
 */
export async function computeSlots(
  input: ComputeSlotsInput,
  data: AvailabilityData,
  now: number = Date.now(),
): Promise<AvailableSlot[]> {
  assertScopedToNegocio(input, data);

  const { timezone, granularidad_min: granularidadMin } = data.negocio;

  // 1. Duración total multi-servicio en un único bloque contiguo (AVAIL-02).
  const totalDurationMin = data.servicios
    .filter((servicio) => input.serviceIds.includes(servicio.id))
    .reduce((sum, servicio) => sum + servicio.duracion_min, 0);

  // 2. Profesionales candidatos: el preferido, o todos los que tengan
  //    horario_trabajo cargado. Los que no trabajen ese dia_semana quedan
  //    con cero slots naturalmente (resolveWorkIntervalsForDate devuelve []).
  const candidateIds = input.professionalId
    ? [input.professionalId]
    : Array.from(new Set(data.horarios.map((horario) => horario.profesional_id)));

  const anchor = dayStartEpochInZone(input.date, timezone);
  const minStart = now + BOOKING_MIN_LEAD_MINUTES * 60_000;
  const maxStart = now + BOOKING_MAX_ADVANCE_DAYS * 24 * 60 * 60_000;

  const slotsByProfessional = new Map<string, AvailableSlot[]>();

  for (const profesionalId of candidateIds) {
    // 3a. Horario recurrente de este profesional → intervalos de la fecha.
    const horariosDeEsteProf = data.horarios.filter((h) => h.profesional_id === profesionalId);
    const workIntervals = resolveWorkIntervalsForDate(horariosDeEsteProf, input.date, timezone);

    // 3b. Restar bloqueos de este profesional.
    const bloqueosDeEsteProf = data.bloqueos
      .filter((b) => b.profesional_id === profesionalId)
      .map((b) => toInterval(b.inicio, b.fin));
    const libreTrasBloqueos = subtractIntervals(workIntervals, bloqueosDeEsteProf);

    // 3c. Restar turnos activos (Pitfall 4: pendiente+confirmado bloquean;
    //     cancelado libera).
    const turnosActivosDeEsteProf = data.turnos
      .filter((t) => t.profesional_id === profesionalId && ESTADOS_QUE_BLOQUEAN.has(t.estado))
      .map((t) => toInterval(t.inicio, t.fin));
    const libreTrasTurnos = subtractIntervals(libreTrasBloqueos, turnosActivosDeEsteProf);

    // 3d. Alinear a grilla, dimensionada a la duración total (AVAIL-02,
    //     gate Pitfall 5 vía snapToGrid).
    const slotsIntervalos = snapToGrid(libreTrasTurnos, granularidadMin, totalDurationMin, anchor);

    // 4. Ventana de reserva: start >= now+60min y start <= now+30d (D-04/D-05).
    const slotsEnVentana = slotsIntervalos.filter(
      (slotInterval) => slotInterval.start >= minStart && slotInterval.start <= maxStart,
    );

    // 5. Interval (epoch ms) → AvailableSlot (HH:mm en zona del negocio).
    const availableSlots: AvailableSlot[] = slotsEnVentana.map((slotInterval) => ({
      start: formatHHmmInZone(slotInterval.start, timezone),
      end: formatHHmmInZone(slotInterval.end, timezone),
      professionalId: profesionalId,
    }));

    slotsByProfessional.set(profesionalId, availableSlots);
  }

  // 6. Sin professionalId → auto-asignar el hueco más temprano (D-03/AVAIL-05).
  if (!input.professionalId) {
    const winner = autoAssign(slotsByProfessional);
    return winner ? (slotsByProfessional.get(winner.professionalId) ?? []) : [];
  }

  return slotsByProfessional.get(input.professionalId) ?? [];
}
