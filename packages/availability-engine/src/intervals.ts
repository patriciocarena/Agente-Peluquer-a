/**
 * src/intervals.ts — resta pura de intervalos half-open [start, end)
 * (AVAIL-01). `computeSlots` (Wave 3) llama a `subtractIntervals` dos veces
 * (horario − bloqueos, luego resultado − turnos activos) para obtener los
 * huecos libres antes de alinearlos a grilla (grid.ts).
 *
 * La semántica `[)` (inicio inclusivo, fin exclusivo) debe espejar EXACTO la
 * de `tstzrange(inicio, fin, '[)')` del constraint `turno_no_overlap` del
 * DB: por eso el test de "no overlap" es `b.end <= f.start || b.start >=
 * f.end`, nunca con `<`/`>` estrictos en el lugar equivocado. Si esta
 * semántica diverge de la del DB, el motor ofrece slots que el DB luego
 * rechaza (23P01 sin concurrencia real) — T-03-06. En particular, dos
 * turnos back-to-back (el fin de uno == el inicio del otro) NO son
 * solapamiento: D-02 (sin buffer en v1) depende de esto.
 */
import type { Interval } from "./types.js";

export type { Interval };

/**
 * subtractIntervals(free, busy) — resta `busy` de `free` con semántica
 * half-open. `busy` no necesita venir pre-fusionado ni ordenado: se ordena
 * internamente y se aplica secuencialmente contra el resultado acumulado
 * (permite bloqueos/turnos superpuestos entre sí sin duplicar huecos).
 */
export function subtractIntervals(free: Interval[], busy: Interval[]): Interval[] {
  if (busy.length === 0) return free;

  const sortedBusy = [...busy].sort((a, b) => a.start - b.start);
  let result: Interval[] = [...free];

  for (const b of sortedBusy) {
    const next: Interval[] = [];
    for (const f of result) {
      if (b.end <= f.start || b.start >= f.end) {
        // Sin solapamiento (incluye el caso back-to-back / borde exacto).
        next.push(f);
        continue;
      }
      if (b.start > f.start) next.push({ start: f.start, end: Math.min(b.start, f.end) });
      if (b.end < f.end) next.push({ start: Math.max(b.end, f.start), end: f.end });
    }
    result = next.filter((i) => i.end > i.start);
  }

  return result;
}
