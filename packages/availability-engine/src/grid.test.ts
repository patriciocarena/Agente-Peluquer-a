/**
 * src/grid.test.ts — RED del ciclo TDD de snapToGrid (D-01, AVAIL-02).
 * Cubre alineación a granularidad, dimensionado multi-servicio (suma de
 * duraciones) y el gate obligatorio de Pitfall 5 (hueco muerto): un slot
 * que no entra antes del fin del bloque de trabajo NUNCA se emite, aun
 * cuando el candidato mismo cae dentro del free interval.
 */
import { describe, expect, it } from "vitest";

import { snapToGrid } from "./grid.js";
import type { Interval } from "./types.js";

// Anchor de medianoche-en-zona (epoch ms arbitrario; solo importa el offset
// relativo a los free intervals de cada test, no un valor real de reloj).
const MIDNIGHT = 0;
const HOUR = 60 * 60_000;
const MIN = 60_000;

describe("snapToGrid", () => {
  it("free 09:00-12:00, gran=30, dur=30 → 6 slots alineados", () => {
    const free: Interval[] = [{ start: 9 * HOUR, end: 12 * HOUR }];
    const result = snapToGrid(free, 30, 30, MIDNIGHT);
    expect(result).toHaveLength(6);
    expect(result.map((s) => s.start)).toEqual([
      9 * HOUR,
      9 * HOUR + 30 * MIN,
      10 * HOUR,
      10 * HOUR + 30 * MIN,
      11 * HOUR,
      11 * HOUR + 30 * MIN,
    ]);
  });

  it("free 09:00-12:00, gran=30, dur=60 → último slot que entra es 11:00 (11:30 NO se emite)", () => {
    const free: Interval[] = [{ start: 9 * HOUR, end: 12 * HOUR }];
    const result = snapToGrid(free, 30, 60, MIDNIGHT);
    expect(result.map((s) => s.start)).toEqual([
      9 * HOUR,
      9 * HOUR + 30 * MIN,
      10 * HOUR,
      10 * HOUR + 30 * MIN,
      11 * HOUR,
    ]);
    expect(result.every((s) => s.end <= free[0].end)).toBe(true);
  });

  it("Pitfall 5 (hueco muerto): bloque termina 18:00, gran=30, dur=45 → 17:30-18:15 NO se emite", () => {
    const free: Interval[] = [{ start: 17 * HOUR, end: 18 * HOUR }];
    const result = snapToGrid(free, 30, 45, MIDNIGHT);
    // 17:00-17:45 entra (17:45 <= 18:00). 17:30-18:15 NO entra (18:15 > 18:00).
    expect(result).toEqual([{ start: 17 * HOUR, end: 17 * HOUR + 45 * MIN }]);
  });

  it("multi-servicio: dur = suma de duraciones (corte 30 + barba 15 = 45) reserva un bloque contiguo (AVAIL-02)", () => {
    const free: Interval[] = [{ start: 9 * HOUR, end: 10 * HOUR }];
    const totalDuration = 30 + 15; // corte + barba
    const result = snapToGrid(free, 30, totalDuration, MIDNIGHT);
    expect(result).toEqual([{ start: 9 * HOUR, end: 9 * HOUR + 45 * MIN }]);
  });

  it("alineación a grilla: todos los start emitidos son múltiplos de granularidad desde el anchor", () => {
    const free: Interval[] = [{ start: 9 * HOUR, end: 13 * HOUR }];
    const granMs = 15 * MIN;
    const result = snapToGrid(free, 15, 30, MIDNIGHT);
    for (const slot of result) {
      expect((slot.start - MIDNIGHT) % granMs).toBe(0);
    }
    expect(result.length).toBeGreaterThan(0);
  });
});
