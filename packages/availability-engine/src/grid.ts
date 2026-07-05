/**
 * src/grid.ts — alineación de slots a la grilla de granularidad del
 * negocio, dimensionada a la duración total multi-servicio (D-01, AVAIL-02).
 *
 * DECISIÓN DE ANCHOR (Open Question 1 de 03-RESEARCH.md, resuelta A1): la
 * grilla se ancla a **medianoche en el timezone del negocio** (marcas de
 * reloj absolutas: 9:00, 9:30, 10:00…), NO al inicio del turno de cada
 * profesional. Así un profesional con `hora_inicio` fuera de grilla (ej.
 * 09:05) no produce una lista de slots corrida respecto de otro que empieza
 * a las 09:00 — ambos usan las mismas marcas absolutas, que es lo que "9:00,
 * 9:30…" de D-01 realmente pide ("agenda prolija"). El caller
 * (`computeSlots`, Wave 3) pasa el epoch ms de medianoche-en-zona como
 * `anchor` (ver `dayStartEpochInZone` en schedule.ts — única fuente de esa
 * lógica).
 *
 * Gate de emisión OBLIGATORIO (Pitfall 5): `candidate + durMs <= free.end`,
 * nunca solo `candidate < free.end`. Un bloque de trabajo que termina en
 * 18:00 con granularidad 30 y duración 45 deja 17:30-18:15 fuera de rango —
 * ese hueco muerto se acepta por diseño (D-01); no se "arregla" permitiendo
 * arranques fuera de grilla.
 */
import type { Interval } from "./types.js";

export type { Interval };

/**
 * snapToGrid(freeIntervals, granularidadMin, totalDurationMin, anchor) —
 * para cada intervalo libre, emite todos los slots de duración
 * `totalDurationMin` cuyo inicio es un múltiplo de `granularidadMin` desde
 * `anchor` y que caben enteros antes del fin del intervalo.
 */
export function snapToGrid(
  freeIntervals: Interval[],
  granularidadMin: number,
  totalDurationMin: number,
  anchor: number,
): Interval[] {
  const granMs = granularidadMin * 60_000;
  const durMs = totalDurationMin * 60_000;
  const slots: Interval[] = [];

  for (const free of freeIntervals) {
    // Primer instante alineado a grilla >= free.start, anclado a `anchor`.
    const offset = Math.ceil((free.start - anchor) / granMs) * granMs;
    let candidate = anchor + offset;
    while (candidate + durMs <= free.end) {
      slots.push({ start: candidate, end: candidate + durMs });
      candidate += granMs;
    }
  }

  return slots;
}
