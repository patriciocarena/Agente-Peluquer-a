/**
 * confirmarTurno.test.ts — RED/GREEN del bloque <behavior> de 06-04-PLAN.md
 * Task 1. `bookAppointment` va MOCKEADO (no la fixture real): esta tool es
 * puro wrapper/mapeo, no motor — lo que se testea es que delega
 * correctamente y mapea el resultado, no la lógica de `computeSlots`. Sin
 * Gemini, sin DB real.
 */
import type { BookAppointmentResult } from "@turnosbot/availability-engine";
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

const INPUT = {
  profesionalId: PROFESIONAL_ID,
  servicioIds: [SERVICIO_ID],
  slotInicio: "2026-07-13T12:00:00.000Z",
  slotFin: "2026-07-13T12:30:00.000Z",
};

const FAKE_FRESH_DATA = { fake: "freshData" } as unknown as Awaited<
  ReturnType<typeof import("../buildBotAvailabilityData.js").buildBotAvailabilityData>
>;

function fakeBuildBotAvailabilityData() {
  return vi.fn(async (_negocioId: string) => FAKE_FRESH_DATA);
}

/** fakeBookAppointment — mock tipado con la MISMA firma que `bookAppointment`
 * real (input, deps) para que `.mock.calls[0]` infiera una tupla no-vacía
 * (evita `Tuple type '[]' has no element at index '0'`). */
function fakeBookAppointment(result: BookAppointmentResult) {
  return vi.fn(
    async (
      _input: Parameters<typeof import("@turnosbot/availability-engine").bookAppointment>[0],
      _deps: Parameters<typeof import("@turnosbot/availability-engine").bookAppointment>[1],
    ): Promise<BookAppointmentResult> => result,
  );
}

async function runExecute(
  t: ReturnType<typeof confirmarTurnoTool>,
  input: unknown,
): Promise<unknown> {
  const execute = t.execute as unknown as (
    input: unknown,
    options: unknown,
  ) => Promise<unknown>;
  return execute(input, { toolCallId: "test", messages: [] });
}

describe("confirmarTurnoTool", () => {
  it("caso ok: surface el turnoId real de bookAppointment (D-12/BOT-04)", async () => {
    const bookAppointmentMock = vi.fn(
      async (): Promise<BookAppointmentResult> => ({
        ok: true,
        turnoId: TURNO_ID,
        precioTotal: 5000,
      }),
    );
    const buildBotAvailabilityData = fakeBuildBotAvailabilityData();
    const t = confirmarTurnoTool(NEGOCIO_ID, CLIENTE_ID, {
      bookAppointment: bookAppointmentMock,
      buildBotAvailabilityData,
      supabase: {} as never,
    });

    const result = await runExecute(t, INPUT);

    expect(result).toEqual({ ok: true, turnoId: TURNO_ID, precioTotal: 5000 });
  });

  it("llama a bookAppointment SIN skipBookingWindow (el bot respeta la ventana)", async () => {
    const bookAppointmentMock = fakeBookAppointment({
      ok: true,
      turnoId: TURNO_ID,
      precioTotal: 5000,
    });
    const t = confirmarTurnoTool(NEGOCIO_ID, CLIENTE_ID, {
      bookAppointment: bookAppointmentMock,
      buildBotAvailabilityData: fakeBuildBotAvailabilityData(),
      supabase: {} as never,
    });

    await runExecute(t, INPUT);

    expect(bookAppointmentMock).toHaveBeenCalledTimes(1);
    const [rawInput] = bookAppointmentMock.mock.calls[0]!;
    expect(rawInput).not.toHaveProperty("skipBookingWindow");
  });

  it("negocioId/clienteId pasados a bookAppointment provienen de la closure, no del input", async () => {
    const bookAppointmentMock = fakeBookAppointment({
      ok: true,
      turnoId: TURNO_ID,
      precioTotal: 5000,
    });
    const t = confirmarTurnoTool(NEGOCIO_ID, CLIENTE_ID, {
      bookAppointment: bookAppointmentMock,
      buildBotAvailabilityData: fakeBuildBotAvailabilityData(),
      supabase: {} as never,
    });

    await runExecute(t, INPUT);

    const [rawInput] = bookAppointmentMock.mock.calls[0]!;
    expect(rawInput).toMatchObject({
      negocioId: NEGOCIO_ID,
      clienteId: CLIENTE_ID,
      profesionalId: PROFESIONAL_ID,
      serviceIds: [SERVICIO_ID],
      inicio: INPUT.slotInicio,
      fin: INPUT.slotFin,
    });

    const shape = confirmarTurnoInputSchema.shape;
    expect(Object.keys(shape)).not.toContain("negocioId");
    expect(Object.keys(shape)).not.toContain("clienteId");
  });

  it("slot_taken -> estructura de error sin turnoId, copy de re-oferta", async () => {
    const bookAppointmentMock = vi.fn(
      async (): Promise<BookAppointmentResult> => ({ ok: false, reason: "slot_taken" }),
    );
    const t = confirmarTurnoTool(NEGOCIO_ID, CLIENTE_ID, {
      bookAppointment: bookAppointmentMock,
      buildBotAvailabilityData: fakeBuildBotAvailabilityData(),
      supabase: {} as never,
    });

    const result = await runExecute(t, INPUT);

    expect(result).not.toHaveProperty("turnoId");
    expect(result).toMatchObject({ ok: false });
    expect((result as { mensaje: string }).mensaje).toMatch(/se acaba de ocupar/i);
  });

  it.each(["validation_error", "insert_error"] as const)(
    "reason=%s -> estructura de error genérica sin turnoId",
    async (reason) => {
      const bookAppointmentMock = vi.fn(async (): Promise<BookAppointmentResult> => {
        if (reason === "validation_error") {
          return { ok: false, reason: "validation_error", issues: ["boom"] };
        }
        return { ok: false, reason: "insert_error", message: "boom" };
      });
      const t = confirmarTurnoTool(NEGOCIO_ID, CLIENTE_ID, {
        bookAppointment: bookAppointmentMock,
        buildBotAvailabilityData: fakeBuildBotAvailabilityData(),
        supabase: {} as never,
      });

      const result = await runExecute(t, INPUT);

      expect(result).not.toHaveProperty("turnoId");
      expect(result).toMatchObject({ ok: false });
    },
  );
});
