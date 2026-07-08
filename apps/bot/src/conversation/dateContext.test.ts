/**
 * dateContext.test.ts — cubre buildDateContext() (Bug fecha,
 * bot-no-agenda-uuid-y-fecha.md / 06-UAT.md Gaps): el modelo usó fechaDeseada
 * '2025-07-25' (año equivocado) porque nunca tuvo un "hoy" real en contexto.
 */
import { describe, expect, it } from "vitest";

import { buildDateContext } from "./dateContext.js";

describe("buildDateContext", () => {
  it("resuelve fechaHoy en formato YYYY-MM-DD en la timezone del negocio", () => {
    const nowMs = new Date("2026-07-10T12:00:00.000Z").getTime();
    const { fechaHoy } = buildDateContext(nowMs, "America/Argentina/Buenos_Aires");

    expect(fechaHoy).toBe("2026-07-10");
  });

  it("resuelve diaSemanaHoy en español", () => {
    // 2026-07-10 es viernes.
    const nowMs = new Date("2026-07-10T12:00:00.000Z").getTime();
    const { diaSemanaHoy } = buildDateContext(nowMs, "America/Argentina/Buenos_Aires");

    expect(diaSemanaHoy.toLowerCase()).toBe("viernes");
  });

  it("respeta la timezone -- una hora que cruza medianoche UTC da una fecha distinta según el negocio", () => {
    // 2026-07-10T02:00:00Z es 2026-07-09 23:00 en Buenos Aires (UTC-3) pero
    // ya 2026-07-10 en una timezone UTC+ (usamos Europe/Madrid como control:
    // verano CEST = UTC+2, 04:00 local, sigue siendo 2026-07-10).
    const nowMs = new Date("2026-07-10T02:00:00.000Z").getTime();

    const buenosAires = buildDateContext(nowMs, "America/Argentina/Buenos_Aires");
    const madrid = buildDateContext(nowMs, "Europe/Madrid");

    expect(buenosAires.fechaHoy).toBe("2026-07-09");
    expect(madrid.fechaHoy).toBe("2026-07-10");
  });

  it("nunca lee Date.now() -- dos llamadas con el mismo nowMs dan el mismo resultado (función pura)", () => {
    const nowMs = new Date("2026-01-01T00:00:00.000Z").getTime();
    const first = buildDateContext(nowMs, "America/Argentina/Buenos_Aires");
    const second = buildDateContext(nowMs, "America/Argentina/Buenos_Aires");

    expect(first).toEqual(second);
  });
});
