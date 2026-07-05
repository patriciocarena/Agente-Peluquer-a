/**
 * src/schedule.test.ts — RED del ciclo TDD de resolveWorkIntervalsForDate
 * (AVAIL-01, Pitfall 2). Cubre resolución por dia_semana en zona IANA vía
 * TZDate (nunca UTC-naive), multi-bloque del mismo día, filtrado por día de
 * la semana, tolerancia al segundo extra de "HH:mm:ss" (Postgrest time
 * column), y el day-boundary explícito de Pitfall 2.
 */
import { TZDate } from "@date-fns/tz";
import { describe, expect, it } from "vitest";

import { HORARIOS_LUNES_A, makeHorario } from "./__fixtures__/rows.js";
import { dayStartEpochInZone, resolveWorkIntervalsForDate } from "./schedule.js";

const TZ = "America/Argentina/Buenos_Aires";

describe("resolveWorkIntervalsForDate", () => {
  it("2026-07-06 (lunes) con horario dia_semana=1 09:00-13:00 → un intervalo en zona AR", () => {
    const horarios = [makeHorario({ dia_semana: 1, hora_inicio: "09:00:00", hora_fin: "13:00:00" })];
    const result = resolveWorkIntervalsForDate(horarios, "2026-07-06", TZ);
    expect(result).toHaveLength(1);
    expect(result[0].start).toBe(new TZDate(2026, 6, 6, 9, 0, 0, TZ).getTime());
    expect(result[0].end).toBe(new TZDate(2026, 6, 6, 13, 0, 0, TZ).getTime());
  });

  it("horario de otro dia_semana NO matchea la fecha → intervalos vacíos", () => {
    const horarios = [makeHorario({ dia_semana: 2, hora_inicio: "09:00:00", hora_fin: "13:00:00" })];
    const result = resolveWorkIntervalsForDate(horarios, "2026-07-06", TZ);
    expect(result).toEqual([]);
  });

  it("multi-bloque: dos filas del mismo dia_semana (mañana + tarde) → dos intervalos", () => {
    const result = resolveWorkIntervalsForDate(HORARIOS_LUNES_A, "2026-07-06", TZ);
    expect(result).toHaveLength(2);
    expect(result[0].start).toBe(new TZDate(2026, 6, 6, 9, 0, 0, TZ).getTime());
    expect(result[0].end).toBe(new TZDate(2026, 6, 6, 13, 0, 0, TZ).getTime());
    expect(result[1].start).toBe(new TZDate(2026, 6, 6, 14, 0, 0, TZ).getTime());
    expect(result[1].end).toBe(new TZDate(2026, 6, 6, 18, 0, 0, TZ).getTime());
  });

  it("Pitfall 2 (day boundary): 00:00-02:00 resuelve a medianoche AR, no medianoche UTC", () => {
    const horarios = [makeHorario({ dia_semana: 1, hora_inicio: "00:00:00", hora_fin: "02:00:00" })];
    const result = resolveWorkIntervalsForDate(horarios, "2026-07-06", TZ);
    expect(result).toHaveLength(1);
    // El epoch de "medianoche AR" difiere del de "medianoche UTC" (UTC-3):
    // new Date("2026-07-06T00:00:00.000Z") sería medianoche UTC, NO AR.
    const medianocheUTCNaive = new Date("2026-07-06T00:00:00.000Z").getTime();
    expect(result[0].start).not.toBe(medianocheUTCNaive);
    expect(result[0].start).toBe(new TZDate(2026, 6, 6, 0, 0, 0, TZ).getTime());
  });

  it("tolera hora_inicio/hora_fin con segundos ('HH:mm:ss' de Postgrest time column)", () => {
    const horarios = [makeHorario({ dia_semana: 1, hora_inicio: "09:00:45", hora_fin: "13:00:30" })];
    const result = resolveWorkIntervalsForDate(horarios, "2026-07-06", TZ);
    expect(result).toHaveLength(1);
    // Solo horas/minutos se usan; los segundos se toleran pero se ignoran.
    expect(result[0].start).toBe(new TZDate(2026, 6, 6, 9, 0, 0, TZ).getTime());
    expect(result[0].end).toBe(new TZDate(2026, 6, 6, 13, 0, 0, TZ).getTime());
  });
});

describe("dayStartEpochInZone", () => {
  it("devuelve el epoch de medianoche en la zona del negocio para la fecha dada", () => {
    const result = dayStartEpochInZone("2026-07-06", TZ);
    expect(result).toBe(new TZDate(2026, 6, 6, 0, 0, 0, TZ).getTime());
  });
});
