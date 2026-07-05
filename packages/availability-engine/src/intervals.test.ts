/**
 * src/intervals.test.ts — RED del ciclo TDD de subtractIntervals (AVAIL-01).
 * Cubre la semántica half-open [start, end) que debe espejar exactamente
 * `tstzrange(inicio, fin, '[)')` del constraint `turno_no_overlap` (T-03-06,
 * 03-RESEARCH.md Pitfall 1): back-to-back sin buffer (D-02) NO es
 * solapamiento, tocar el borde exacto no crea huecos falsos, y los
 * intervalos de longitud cero resultantes se filtran.
 */
import { describe, expect, it } from "vitest";

import { subtractIntervals, type Interval } from "./intervals.js";

/**
 * Invariante reutilizable: el resultado nunca contiene intervalos con
 * `end <= start` (longitud cero o negativa) y está ordenado por inicio sin
 * solaparse consigo mismo.
 */
function assertBordesHalfOpen(result: Interval[]) {
  for (const interval of result) {
    expect(interval.end).toBeGreaterThan(interval.start);
  }
  for (let i = 1; i < result.length; i++) {
    expect(result[i].start).toBeGreaterThanOrEqual(result[i - 1].end);
  }
}

describe("subtractIntervals", () => {
  it("restar un busy del medio de un free lo parte en dos", () => {
    const free: Interval[] = [{ start: 9, end: 12 }];
    const busy: Interval[] = [{ start: 10, end: 11 }];
    const result = subtractIntervals(free, busy);
    expect(result).toEqual([
      { start: 9, end: 10 },
      { start: 11, end: 12 },
    ]);
    assertBordesHalfOpen(result);
  });

  it("back-to-back — busy tocando el fin del free NO se solapa (Pitfall 1 / D-02 sin buffer)", () => {
    const free: Interval[] = [{ start: 9, end: 10 }];
    const busy: Interval[] = [{ start: 10, end: 11 }];
    const result = subtractIntervals(free, busy);
    expect(result).toEqual([{ start: 9, end: 10 }]);
  });

  it("busy tocando el inicio exacto del free (b.end === f.start) no crea hueco falso ni overlap", () => {
    const free: Interval[] = [{ start: 10, end: 12 }];
    const busy: Interval[] = [{ start: 8, end: 10 }];
    const result = subtractIntervals(free, busy);
    expect(result).toEqual([{ start: 10, end: 12 }]);
  });

  it("busy que cubre todo el free → resultado vacío", () => {
    const free: Interval[] = [{ start: 9, end: 12 }];
    const busy: Interval[] = [{ start: 8, end: 13 }];
    const result = subtractIntervals(free, busy);
    expect(result).toEqual([]);
  });

  it("múltiples busy contra un free → resta acumulada correcta", () => {
    const free: Interval[] = [{ start: 9, end: 18 }];
    const busy: Interval[] = [
      { start: 10, end: 11 },
      { start: 14, end: 15 },
      { start: 16, end: 17 },
    ];
    const result = subtractIntervals(free, busy);
    expect(result).toEqual([
      { start: 9, end: 10 },
      { start: 11, end: 14 },
      { start: 15, end: 16 },
      { start: 17, end: 18 },
    ]);
    assertBordesHalfOpen(result);
  });

  it("intervalos de longitud cero resultantes se filtran (end > start)", () => {
    const free: Interval[] = [{ start: 9, end: 10 }];
    const busy: Interval[] = [{ start: 9, end: 10 }];
    const result = subtractIntervals(free, busy);
    expect(result).toEqual([]);
  });

  it("fast-path — busy vacío devuelve free tal cual", () => {
    const free: Interval[] = [
      { start: 9, end: 12 },
      { start: 14, end: 18 },
    ];
    const result = subtractIntervals(free, []);
    expect(result).toEqual(free);
  });
});
