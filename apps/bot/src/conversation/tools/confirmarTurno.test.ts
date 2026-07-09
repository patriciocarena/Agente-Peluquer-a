/**
 * confirmarTurno.test.ts — RED/GREEN del bloque <behavior> de 06-04-PLAN.md
 * Task 1. `bookAppointment`/`computeSlots` van MOCKEADOS (no la fixture real):
 * esta tool es wrapper/mapeo + resolución del slot, no el motor. Sin Gemini,
 * sin DB real.
 *
 * Fix timezone (06-UAT): la tool recibe `fecha` + `horaInicio` (hora LOCAL) y
 * resuelve el instante UTC contra `computeSlots` server-side — el modelo nunca
 * pasa un ISO. Los tests verifican esa resolución.
 */
import type { AvailableSlot, BookAppointmentResult } from "@turnosbot/availability-engine";
import { describe, expect, it, vi } from "vitest";

// Mismo fix que buscarHorarios.test.ts: evita que db/client.ts lance en
// import-time por falta de env vars (confirmarTurno.ts importa
// buildBotAvailabilityData.ts transitivamente, que importa negocioScoped.ts
// -> db/client.ts).
vi.mock("../../db/client.js", () => ({ supabaseAdmin: {} }));

import { confirmarTurnoInputSchema, confirmarTurnoTool } from "./confirmarTurno.js";

const NEGOCIO_ID = "11111111-1111-1111-1111-111111111111";
const CLIENTE_ID = "22222222-2222-2222-2222-222222222222";
const PROFESIONAL_ID = "33333333-3333-3333-3333-333333333333";
const SERVICIO_ID = "44444444-4444-4444-4444-444444444444";
const TURNO_ID = "55555555-5555-5555-5555-555555555555";

// 09:00 hora local del negocio == 12:00 UTC (AR, UTC-3). El modelo pasa SOLO
// la hora local "09:00"; el instante ISO lo resuelve la tool contra computeSlots.
const HORA_INICIO = "09:00";
const SLOT_START_ISO = "2026-07-13T12:00:00.000Z";
const SLOT_END_ISO = "2026-07-13T12:30:00.000Z";

const INPUT = {
  profesionalId: PROFESIONAL_ID,
  servicioIds: [SERVICIO_ID],
  fecha: "2026-07-13",
  horaInicio: HORA_INICIO,
};

const FAKE_FRESH_DATA = { fake: "freshData" } as unknown as Awaited<
  ReturnType<typeof import("../buildBotAvailabilityData.js").buildBotAvailabilityData>
>;

function fakeBuildBotAvailabilityData() {
  return vi.fn(async (_negocioId: string) => FAKE_FRESH_DATA);
}

/** fakeComputeSlots — por defecto devuelve UN slot a las 09:00 con su ISO real.
 * `slots` permite override (ej. lista vacía para probar "no hay slot"). */
function fakeComputeSlots(slots: AvailableSlot[] = [
  { start: HORA_INICIO, end: "09:30", startIso: SLOT_START_ISO, endIso: SLOT_END_ISO, professionalId: PROFESIONAL_ID },
]) {
  return vi.fn(
    async (
      _input: Parameters<typeof import("@turnosbot/availability-engine").computeSlots>[0],
      _data: Parameters<typeof import("@turnosbot/availability-engine").computeSlots>[1],
    ): Promise<AvailableSlot[]> => slots,
  );
}

/** fakeBookAppointment — mock tipado con la MISMA firma que `bookAppointment`
 * real (input, deps) para que `.mock.calls[0]` infiera una tupla no-vacía. */
function fakeBookAppointment(result: BookAppointmentResult) {
  return vi.fn(
    async (
      _input: Parameters<typeof import("@turnosbot/availability-engine").bookAppointment>[0],
      _deps: Parameters<typeof import("@turnosbot/availability-engine").bookAppointment>[1],
    ): Promise<BookAppointmentResult> => result,
  );
}

function buildTool(overrides: Partial<Parameters<typeof confirmarTurnoTool>[2]> = {}) {
  return confirmarTurnoTool(NEGOCIO_ID, CLIENTE_ID, {
    bookAppointment: fakeBookAppointment({ ok: true, turnoId: TURNO_ID, precioTotal: 5000 }),
    computeSlots: fakeComputeSlots(),
    buildBotAvailabilityData: fakeBuildBotAvailabilityData(),
    supabase: {} as never,
    ...overrides,
  });
}

async function runExecute(t: ReturnType<typeof confirmarTurnoTool>, input: unknown): Promise<unknown> {
  const execute = t.execute as unknown as (input: unknown, options: unknown) => Promise<unknown>;
  return execute(input, { toolCallId: "test", messages: [] });
}

describe("confirmarTurnoTool", () => {
  it("caso ok: surface el turnoId real de bookAppointment (D-12/BOT-04)", async () => {
    const result = await runExecute(buildTool(), INPUT);
    expect(result).toEqual({ ok: true, turnoId: TURNO_ID, precioTotal: 5000 });
  });

  it("fix timezone: resuelve el instante server-side desde la hora local — bookAppointment recibe el startIso/endIso del slot, NO un ISO del modelo", async () => {
    const bookAppointmentMock = fakeBookAppointment({ ok: true, turnoId: TURNO_ID, precioTotal: 5000 });
    const t = buildTool({ bookAppointment: bookAppointmentMock });

    await runExecute(t, INPUT);

    const [rawInput] = bookAppointmentMock.mock.calls[0]!;
    // El input SOLO trae "09:00" local; la tool lo resolvió a 12:00 UTC vía computeSlots.
    expect(rawInput).toMatchObject({ inicio: SLOT_START_ISO, fin: SLOT_END_ISO });
    // El schema NO acepta un ISO del modelo — solo fecha + horaInicio local.
    const shape = confirmarTurnoInputSchema.shape;
    expect(Object.keys(shape)).toContain("fecha");
    expect(Object.keys(shape)).toContain("horaInicio");
    expect(Object.keys(shape)).not.toContain("slotInicio");
  });

  it("hora local que NO matchea ningún slot real -> slot_taken, sin llamar a bookAppointment (nunca reserva un horario distinto)", async () => {
    const bookAppointmentMock = fakeBookAppointment({ ok: true, turnoId: TURNO_ID, precioTotal: 5000 });
    const t = buildTool({ bookAppointment: bookAppointmentMock, computeSlots: fakeComputeSlots([]) });

    const result = await runExecute(t, INPUT);

    expect(result).toMatchObject({ ok: false });
    expect((result as { mensaje: string }).mensaje).toMatch(/se acaba de ocupar/i);
    expect(bookAppointmentMock).not.toHaveBeenCalled();
  });

  it("llama a bookAppointment SIN skipBookingWindow (el bot respeta la ventana)", async () => {
    const bookAppointmentMock = fakeBookAppointment({ ok: true, turnoId: TURNO_ID, precioTotal: 5000 });
    await runExecute(buildTool({ bookAppointment: bookAppointmentMock }), INPUT);

    expect(bookAppointmentMock).toHaveBeenCalledTimes(1);
    const [rawInput] = bookAppointmentMock.mock.calls[0]!;
    expect(rawInput).not.toHaveProperty("skipBookingWindow");
  });

  it("negocioId/clienteId pasados a bookAppointment provienen de la closure, no del input", async () => {
    const bookAppointmentMock = fakeBookAppointment({ ok: true, turnoId: TURNO_ID, precioTotal: 5000 });
    await runExecute(buildTool({ bookAppointment: bookAppointmentMock }), INPUT);

    const [rawInput] = bookAppointmentMock.mock.calls[0]!;
    expect(rawInput).toMatchObject({
      negocioId: NEGOCIO_ID,
      clienteId: CLIENTE_ID,
      profesionalId: PROFESIONAL_ID,
      serviceIds: [SERVICIO_ID],
      inicio: SLOT_START_ISO,
      fin: SLOT_END_ISO,
    });

    const shape = confirmarTurnoInputSchema.shape;
    expect(Object.keys(shape)).not.toContain("negocioId");
    expect(Object.keys(shape)).not.toContain("clienteId");
  });

  it("slot_taken (de bookAppointment) -> estructura de error sin turnoId, copy de re-oferta", async () => {
    const t = buildTool({ bookAppointment: fakeBookAppointment({ ok: false, reason: "slot_taken" }) });

    const result = await runExecute(t, INPUT);

    expect(result).not.toHaveProperty("turnoId");
    expect(result).toMatchObject({ ok: false });
    expect((result as { mensaje: string }).mensaje).toMatch(/se acaba de ocupar/i);
  });

  it.each(["validation_error", "insert_error"] as const)(
    "reason=%s -> estructura de error genérica sin turnoId",
    async (reason) => {
      const bookResult: BookAppointmentResult =
        reason === "validation_error"
          ? { ok: false, reason: "validation_error", issues: ["boom"] }
          : { ok: false, reason: "insert_error", message: "boom" };
      const t = buildTool({ bookAppointment: fakeBookAppointment(bookResult) });

      const result = await runExecute(t, INPUT);

      expect(result).not.toHaveProperty("turnoId");
      expect(result).toMatchObject({ ok: false });
    },
  );
});
