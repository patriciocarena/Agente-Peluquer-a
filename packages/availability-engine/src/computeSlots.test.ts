/**
 * src/computeSlots.test.ts — RED del ciclo TDD de computeSlots (AVAIL-01,
 * AVAIL-02, AVAIL-04, AVAIL-05, D-04, D-05). Cada `it` mapea a una fila del
 * Test Map de 03-RESEARCH.md: resta AVAIL-01, Pitfall 4 (cancelado libera /
 * pendiente bloquea), multi-servicio contiguo AVAIL-02, ventana de reserva
 * lead+max D-04/D-05, y auto-asignación AVAIL-05.
 *
 * `now` se inyecta como tercer parámetro explícito (nunca el reloj real) para
 * que la ventana de reserva sea testeable de forma determinística.
 */
import { TZDate } from "@date-fns/tz";
import { describe, expect, it } from "vitest";

import {
  makeBloqueo,
  makeHorario,
  makeNegocio,
  makeTurno,
  NEGOCIO_ID,
  PROFESIONAL_A_ID,
  PROFESIONAL_B_ID,
  SERVICIO_BARBA,
  SERVICIO_BARBA_ID,
  SERVICIO_CORTE,
  SERVICIO_CORTE_ID,
  TURNO_CONFIRMADO,
} from "./__fixtures__/rows.js";
import { computeSlots } from "./computeSlots.js";
import type {
  AvailabilityData,
  BloqueoRow,
  ComputeSlotsInput,
  HorarioTrabajoRow,
  NegocioRow,
  ServicioRow,
  TurnoRow,
} from "./types.js";

const TZ = "America/Argentina/Buenos_Aires";
const FECHA = "2026-07-06"; // lunes (dia_semana=1), ver 03-03-SUMMARY.md

// "now" seguro: 16 días antes de FECHA → dentro de la ventana de 30 días
// (D-05) y con horas de sobra respecto del lead de 60 min (D-04), para que
// los tests que no ejercitan la ventana no se vean afectados por ella.
const SAFE_NOW = new TZDate(2026, 5, 20, 9, 0, 0, TZ).getTime();

interface FixtureOverrides {
  horarios?: HorarioTrabajoRow[];
  bloqueos?: BloqueoRow[];
  turnos?: TurnoRow[];
  servicios?: ServicioRow[];
  negocio?: NegocioRow;
}

/**
 * fixtureFor(overrides) — arma un `AvailabilityData` con defaults sensatos
 * (profesional A, lunes 09:00-13:00, sin bloqueos ni turnos, servicio
 * "Corte" 30 min), permitiendo que cada `it` override solo la dimensión que
 * prueba (estilo `horarioConDia` de apps/dashboard/lib/schemas/horario.test.ts).
 */
function fixtureFor(overrides: FixtureOverrides = {}): AvailabilityData {
  return {
    horarios: overrides.horarios ?? [
      makeHorario({ hora_inicio: "09:00:00", hora_fin: "13:00:00" }),
    ],
    bloqueos: overrides.bloqueos ?? [],
    turnos: overrides.turnos ?? [],
    servicios: overrides.servicios ?? [SERVICIO_CORTE],
    negocio: overrides.negocio ?? makeNegocio(),
  };
}

function inputFor(overrides: Partial<ComputeSlotsInput> = {}): ComputeSlotsInput {
  return {
    negocioId: NEGOCIO_ID,
    serviceIds: [SERVICIO_CORTE_ID],
    date: FECHA,
    ...overrides,
  };
}

describe("computeSlots", () => {
  it("AVAIL-01: resta bloqueos y turnos activos del horario, alineado a grilla", async () => {
    const data = fixtureFor({
      bloqueos: [makeBloqueo()], // 10:00-10:30 AR, profesional A
      turnos: [TURNO_CONFIRMADO], // 11:00-11:30 AR, profesional A
    });

    const slots = await computeSlots(inputFor({ professionalId: PROFESIONAL_A_ID }), data, SAFE_NOW);
    const starts = slots.map((s) => s.start);

    expect(starts).not.toContain("10:00");
    expect(starts).not.toContain("11:00");
    expect(starts).toContain("09:00");
    expect(starts).toContain("09:30");
  });

  it("startIso/endIso: cada slot expone el instante UTC exacto (fix booking timezone — no 'HH:mmZ')", async () => {
    const data = fixtureFor(); // 09:00-13:00 AR, servicio Corte 30 min, sin bloqueos/turnos
    const slots = await computeSlots(inputFor({ professionalId: PROFESIONAL_A_ID }), data, SAFE_NOW);

    const slot0900 = slots.find((s) => s.start === "09:00");
    expect(slot0900).toBeDefined();
    // 09:00 AR (UTC-3) = 12:00 UTC. El ISO es el instante REAL, nunca "2026-07-06T09:00:00Z"
    // (ese era el bug: el modelo le pegaba "Z" a la hora local -> confirmarTurno recibía
    // 09:00 UTC = 06:00 AR, fuera del horario -> slot_taken).
    expect(slot0900!.startIso).toBe("2026-07-06T12:00:00.000Z");
    expect(slot0900!.endIso).toBe("2026-07-06T12:30:00.000Z"); // +30 min (Corte)

    // Round-trip que bookAppointment hace internamente (formatHHmmInZone(startIso) === start):
    // pasar startIso a la reserva reconstruye la MISMA hora local que se le mostró al cliente.
    const zonedBack = new TZDate(new Date(slot0900!.startIso).getTime(), TZ);
    const hhmm = `${String(zonedBack.getHours()).padStart(2, "0")}:${String(zonedBack.getMinutes()).padStart(2, "0")}`;
    expect(hhmm).toBe(slot0900!.start);
  });

  it("Pitfall 4: un turno cancelado NO bloquea (el slot sigue disponible)", async () => {
    const turnoCancelado = makeTurno({
      estado: "cancelado",
      inicio: "2026-07-06T14:00:00.000Z", // 11:00 AR
      fin: "2026-07-06T14:30:00.000Z", // 11:30 AR
    });
    const data = fixtureFor({ turnos: [turnoCancelado] });

    const slots = await computeSlots(inputFor({ professionalId: PROFESIONAL_A_ID }), data, SAFE_NOW);

    expect(slots.map((s) => s.start)).toContain("11:00");
  });

  it("Pitfall 4: un turno pendiente SÍ bloquea (igual que confirmado)", async () => {
    const turnoPendiente = makeTurno({
      estado: "pendiente",
      inicio: "2026-07-06T14:00:00.000Z", // 11:00 AR
      fin: "2026-07-06T14:30:00.000Z", // 11:30 AR
    });
    const data = fixtureFor({ turnos: [turnoPendiente] });

    const slots = await computeSlots(inputFor({ professionalId: PROFESIONAL_A_ID }), data, SAFE_NOW);

    expect(slots.map((s) => s.start)).not.toContain("11:00");
  });

  it("AVAIL-02: multi-servicio suma duraciones en un único bloque contiguo (30+15=45)", async () => {
    const data = fixtureFor({ servicios: [SERVICIO_CORTE, SERVICIO_BARBA] });

    const slots = await computeSlots(
      inputFor({ professionalId: PROFESIONAL_A_ID, serviceIds: [SERVICIO_CORTE_ID, SERVICIO_BARBA_ID] }),
      data,
      SAFE_NOW,
    );
    const starts = slots.map((s) => s.start);

    // 12:00-12:45 cabe justo antes de que termine el bloque (13:00).
    expect(starts).toContain("12:00");
    // 12:30+45min=13:15 excede el fin del bloque (Pitfall 5) — no se ofrece.
    expect(starts).not.toContain("12:30");
  });

  it("D-04: filtra slots que arrancan a menos de 60 min de 'now'", async () => {
    const data = fixtureFor();
    const now = new TZDate(2026, 6, 6, 9, 0, 0, TZ).getTime(); // 09:00 AR, mismo día

    const slots = await computeSlots(inputFor({ professionalId: PROFESIONAL_A_ID }), data, now);
    const starts = slots.map((s) => s.start);

    expect(starts).not.toContain("09:00");
    expect(starts).not.toContain("09:30");
    expect(starts).toContain("10:00");
  });

  it("D-05: filtra slots a más de 30 días de anticipación", async () => {
    const data = fixtureFor();
    const nowLejano = new TZDate(2026, 5, 1, 9, 0, 0, TZ).getTime(); // 2026-06-01, 35 días antes

    const slots = await computeSlots(inputFor({ professionalId: PROFESIONAL_A_ID }), data, nowLejano);

    expect(slots).toEqual([]);
  });

  it("D-05: ofrece slots dentro de la ventana de 30 días", async () => {
    const data = fixtureFor();

    const slots = await computeSlots(inputFor({ professionalId: PROFESIONAL_A_ID }), data, SAFE_NOW);

    expect(slots.map((s) => s.start)).toContain("09:00");
  });

  it("AVAIL-05: sin professionalId, auto-asigna el profesional con el hueco más temprano", async () => {
    const data = fixtureFor({
      horarios: [
        makeHorario({ profesional_id: PROFESIONAL_A_ID, hora_inicio: "09:00:00", hora_fin: "13:00:00" }),
        makeHorario({ profesional_id: PROFESIONAL_B_ID, hora_inicio: "08:00:00", hora_fin: "12:00:00" }),
      ],
    });

    const slots = await computeSlots(inputFor(), data, SAFE_NOW); // sin professionalId

    expect(slots.length).toBeGreaterThan(0);
    expect(slots.every((s) => s.professionalId === PROFESIONAL_B_ID)).toBe(true);
    expect(slots.map((s) => s.start)).toContain("08:00");
  });

  it("con professionalId dado, devuelve solo los slots de ese profesional", async () => {
    const data = fixtureFor({
      horarios: [
        makeHorario({ profesional_id: PROFESIONAL_A_ID, hora_inicio: "09:00:00", hora_fin: "13:00:00" }),
        makeHorario({ profesional_id: PROFESIONAL_B_ID, hora_inicio: "08:00:00", hora_fin: "12:00:00" }),
      ],
    });

    const slots = await computeSlots(inputFor({ professionalId: PROFESIONAL_A_ID }), data, SAFE_NOW);

    expect(slots.every((s) => s.professionalId === PROFESIONAL_A_ID)).toBe(true);
    expect(slots.map((s) => s.start)).not.toContain("08:00");
  });

  describe("D-08: skipBookingWindow (Fase 4 — bypass de ventana de reserva para el dashboard)", () => {
    it("skipBookingWindow:true incluye un slot 'ahora mismo' que la ventana de 60min filtraría", async () => {
      const data = fixtureFor();
      // now = 09:00 AR del mismo día del horario (09:00-13:00) — sin
      // skipBookingWindow, D-04 filtraría 09:00/09:30 (menos de 60min de lead).
      const now = new TZDate(2026, 6, 6, 9, 0, 0, TZ).getTime();

      const slots = await computeSlots(
        inputFor({ professionalId: PROFESIONAL_A_ID, skipBookingWindow: true }),
        data,
        now,
      );
      const starts = slots.map((s) => s.start);

      expect(starts).toContain("09:00");
      expect(starts).toContain("09:30");
    });

    it("skipBookingWindow:true incluye slots a más de 30 días de 'now'", async () => {
      const data = fixtureFor();
      const nowLejano = new TZDate(2026, 5, 1, 9, 0, 0, TZ).getTime(); // 35 días antes de FECHA

      const slots = await computeSlots(
        inputFor({ professionalId: PROFESIONAL_A_ID, skipBookingWindow: true }),
        data,
        nowLejano,
      );

      expect(slots.map((s) => s.start)).toContain("09:00");
    });

    it("Pitfall 1 (regression guard): omitir skipBookingWindow preserva el comportamiento actual byte-por-byte", async () => {
      const data = fixtureFor();
      const now = new TZDate(2026, 6, 6, 9, 0, 0, TZ).getTime(); // dentro del día, ejercita D-04

      const slotsOmitido = await computeSlots(inputFor({ professionalId: PROFESIONAL_A_ID }), data, now);
      const slotsSinFlag = await computeSlots(
        inputFor({ professionalId: PROFESIONAL_A_ID, skipBookingWindow: undefined }),
        data,
        now,
      );

      // Slots fuera de la ventana (09:00/09:30, <60min de lead) siguen
      // filtrados igual que antes del cambio.
      expect(slotsOmitido.map((s) => s.start)).not.toContain("09:00");
      expect(slotsOmitido.map((s) => s.start)).not.toContain("09:30");
      expect(slotsOmitido).toEqual(slotsSinFlag);
    });

    it("skipBookingWindow:false explícito === comportamiento omitido (default explícito)", async () => {
      const data = fixtureFor();
      const now = new TZDate(2026, 6, 6, 9, 0, 0, TZ).getTime();

      const slotsOmitido = await computeSlots(inputFor({ professionalId: PROFESIONAL_A_ID }), data, now);
      const slotsFalseExplicito = await computeSlots(
        inputFor({ professionalId: PROFESIONAL_A_ID, skipBookingWindow: false }),
        data,
        now,
      );

      expect(slotsFalseExplicito).toEqual(slotsOmitido);
    });
  });
});
