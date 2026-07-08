/**
 * reagendarTurno.test.ts — RED/GREEN del bloque <behavior> de 06-04-PLAN.md
 * Task 2 (mitad reagendarTurno). `rescheduleAppointment`/`negocioScoped` van
 * MOCKEADOS (no fixtures reales): esta tool es wrapper/mapeo, no motor. Sin
 * Gemini, sin DB real.
 *
 * CR-03: `negocioScoped(negocioId).turnos()` también se mockea con filas
 * fijas — la tool ahora hace un ownership check (`turno.cliente_id ===
 * clienteId`) ANTES de delegar en `rescheduleAppointment`.
 */
import type { BookAppointmentResult } from "@turnosbot/availability-engine";
import { describe, expect, it, vi } from "vitest";

// Mismo fix que buscarHorarios.test.ts: evita que db/client.ts lance en
// import-time por falta de env vars.
vi.mock("../../db/client.js", () => ({ supabaseAdmin: {} }));

import { reagendarTurnoInputSchema, reagendarTurnoTool } from "./reagendarTurno.js";

const NEGOCIO_ID = "11111111-1111-1111-1111-111111111111";
const CLIENTE_ID = "22222222-2222-2222-2222-222222222222";
const OTRO_CLIENTE_ID = "88888888-8888-8888-8888-888888888888";
const PROFESIONAL_ID = "33333333-3333-3333-3333-333333333333";
const SERVICIO_ID = "44444444-4444-4444-4444-444444444444";
const TURNO_ID = "55555555-5555-5555-5555-555555555555";
const OTRO_TURNO_ID = "66666666-6666-6666-6666-666666666666";

const INPUT = {
  turnoId: TURNO_ID,
  profesionalId: PROFESIONAL_ID,
  nuevoSlotInicio: "2026-07-13T12:00:00.000Z",
  nuevoSlotFin: "2026-07-13T12:30:00.000Z",
};

const FAKE_FRESH_DATA = { fake: "freshData" } as unknown as Awaited<
  ReturnType<typeof import("../buildBotAvailabilityData.js").buildBotAvailabilityData>
>;

function fakeBuildBotAvailabilityData() {
  return vi.fn(async (_negocioId: string) => FAKE_FRESH_DATA);
}

/** fakeNegocioScoped — devuelve un `negocioScoped` fake cuyo `turnoServicios()`
 * resuelve filas fijas (incluyendo un turno_id ajeno, para probar el filtro)
 * y cuyo `turnos()` (CR-03) resuelve TURNO_ID como propio de CLIENTE_ID y
 * OTRO_TURNO_ID como propio de OTRO_CLIENTE_ID — para probar el ownership
 * check. */
function fakeNegocioScoped() {
  const turnoServiciosRows = [
    { turno_id: TURNO_ID, servicio_id: SERVICIO_ID },
    { turno_id: OTRO_TURNO_ID, servicio_id: "77777777-7777-7777-7777-777777777777" },
  ];
  const turnosRows = [
    { id: TURNO_ID, cliente_id: CLIENTE_ID },
    { id: OTRO_TURNO_ID, cliente_id: OTRO_CLIENTE_ID },
  ];
  const turnoServicios = vi.fn(async () => ({ data: turnoServiciosRows, error: null }));
  const turnos = vi.fn(async () => ({ data: turnosRows, error: null }));
  const negocioScopedFn = vi.fn((_negocioId: string) => ({ turnoServicios, turnos }));
  // Cast: el fake solo implementa `turnoServicios`/`turnos` (lo único que
  // usa esta tool) — el tipo real de `negocioScoped` expone muchos más
  // accessors.
  const negocioScoped = negocioScopedFn as unknown as typeof import("../../db/negocioScoped.js").negocioScoped;
  return { negocioScoped, turnoServicios, turnos, negocioScopedFn };
}

/** fakeRescheduleAppointment — mock tipado con la MISMA firma que
 * `rescheduleAppointment` real para que `.mock.calls[0]` infiera una tupla
 * no-vacía (evita `Tuple type '[]' has no element at index '0'`). */
function fakeRescheduleAppointment(result: BookAppointmentResult) {
  return vi.fn(
    async (
      _input: Parameters<
        typeof import("@turnosbot/availability-engine").rescheduleAppointment
      >[0],
      _deps: Parameters<
        typeof import("@turnosbot/availability-engine").rescheduleAppointment
      >[1],
    ): Promise<BookAppointmentResult> => result,
  );
}

async function runExecute(
  t: ReturnType<typeof reagendarTurnoTool>,
  input: unknown,
): Promise<unknown> {
  const execute = t.execute as unknown as (
    input: unknown,
    options: unknown,
  ) => Promise<unknown>;
  return execute(input, { toolCallId: "test", messages: [] });
}

describe("reagendarTurnoTool", () => {
  it("trae serviceIds vía turnoServicios y llama rescheduleAppointment con la misma forma que el dashboard (D-09)", async () => {
    const rescheduleAppointmentMock = fakeRescheduleAppointment({
      ok: true,
      turnoId: TURNO_ID,
      precioTotal: 5000,
    });
    const { negocioScoped } = fakeNegocioScoped();
    const t = reagendarTurnoTool(NEGOCIO_ID, CLIENTE_ID, {
      rescheduleAppointment: rescheduleAppointmentMock,
      buildBotAvailabilityData: fakeBuildBotAvailabilityData(),
      negocioScoped,
      supabase: {} as never,
    });

    await runExecute(t, INPUT);

    expect(negocioScoped).toHaveBeenCalledWith(NEGOCIO_ID);
    expect(rescheduleAppointmentMock).toHaveBeenCalledTimes(1);
    const [rawInput] = rescheduleAppointmentMock.mock.calls[0]!;
    expect(rawInput).toEqual({
      negocioId: NEGOCIO_ID,
      turnoId: TURNO_ID,
      profesionalId: PROFESIONAL_ID,
      serviceIds: [SERVICIO_ID], // solo el servicio del turnoId pedido, no el ajeno
      inicio: INPUT.nuevoSlotInicio,
      fin: INPUT.nuevoSlotFin,
    });
    expect(rawInput).not.toHaveProperty("skipBookingWindow");
  });

  it("caso ok: devuelve estructura con turnoId", async () => {
    const rescheduleAppointmentMock = fakeRescheduleAppointment({
      ok: true,
      turnoId: TURNO_ID,
      precioTotal: 5000,
    });
    const { negocioScoped } = fakeNegocioScoped();
    const t = reagendarTurnoTool(NEGOCIO_ID, CLIENTE_ID, {
      rescheduleAppointment: rescheduleAppointmentMock,
      buildBotAvailabilityData: fakeBuildBotAvailabilityData(),
      negocioScoped,
      supabase: {} as never,
    });

    const result = await runExecute(t, INPUT);

    expect(result).toEqual({ ok: true, turnoId: TURNO_ID, precioTotal: 5000 });
  });

  it("reason=slot_taken -> estructura de error mapeada (re-oferta)", async () => {
    const rescheduleAppointmentMock = fakeRescheduleAppointment({
      ok: false,
      reason: "slot_taken",
    });
    const { negocioScoped } = fakeNegocioScoped();
    const t = reagendarTurnoTool(NEGOCIO_ID, CLIENTE_ID, {
      rescheduleAppointment: rescheduleAppointmentMock,
      buildBotAvailabilityData: fakeBuildBotAvailabilityData(),
      negocioScoped,
      supabase: {} as never,
    });

    const result = await runExecute(t, INPUT);

    expect(result).not.toHaveProperty("turnoId");
    expect(result).toMatchObject({ ok: false });
    expect((result as { mensaje: string }).mensaje).toMatch(/se acaba de ocupar/i);
  });

  it("CR-03: turnoId de OTRO cliente del mismo negocio -> ok:false GENERIC_ERROR_COPY, rescheduleAppointment NUNCA llamado", async () => {
    const rescheduleAppointmentMock = fakeRescheduleAppointment({
      ok: true,
      turnoId: OTRO_TURNO_ID,
      precioTotal: 5000,
    });
    const { negocioScoped } = fakeNegocioScoped();
    const t = reagendarTurnoTool(NEGOCIO_ID, CLIENTE_ID, {
      rescheduleAppointment: rescheduleAppointmentMock,
      buildBotAvailabilityData: fakeBuildBotAvailabilityData(),
      negocioScoped,
      supabase: {} as never,
    });

    const result = await runExecute(t, { ...INPUT, turnoId: OTRO_TURNO_ID });

    expect(rescheduleAppointmentMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: false });
    expect((result as { mensaje: string }).mensaje).toMatch(/no pudimos reagendar/i);
  });

  it("CR-03: turnoId inexistente en el negocio -> ok:false, mismo mensaje genérico que un turnoId ajeno (no leak)", async () => {
    const rescheduleAppointmentMock = fakeRescheduleAppointment({
      ok: true,
      turnoId: "inexistente",
      precioTotal: 0,
    });
    const { negocioScoped } = fakeNegocioScoped();
    const t = reagendarTurnoTool(NEGOCIO_ID, CLIENTE_ID, {
      rescheduleAppointment: rescheduleAppointmentMock,
      buildBotAvailabilityData: fakeBuildBotAvailabilityData(),
      negocioScoped,
      supabase: {} as never,
    });

    const result = await runExecute(t, { ...INPUT, turnoId: "99999999-9999-9999-9999-999999999999" });

    expect(rescheduleAppointmentMock).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: false, mensaje: "No pudimos reagendar el turno. ¿Probamos de nuevo?" });
  });

  it("NUNCA recibe negocioId en su inputSchema (assert estructural, D-13)", () => {
    const shape = reagendarTurnoInputSchema.shape;
    expect(Object.keys(shape)).not.toContain("negocioId");
  });
});
