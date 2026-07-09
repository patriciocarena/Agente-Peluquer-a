/**
 * reagendarTurno.test.ts — RED/GREEN del bloque <behavior> de 06-04-PLAN.md
 * Task 2 (mitad reagendarTurno). `rescheduleAppointment`/`computeSlots`/
 * `negocioScoped` van MOCKEADOS (no fixtures reales): esta tool es
 * wrapper/mapeo + resolución del slot, no motor. Sin Gemini, sin DB real.
 *
 * CR-03: `negocioScoped(negocioId).turnos()` también se mockea con filas
 * fijas — la tool hace un ownership check (`turno.cliente_id === clienteId`)
 * ANTES de delegar en `rescheduleAppointment`.
 *
 * Fix timezone (06-UAT): la tool recibe `nuevaFecha` + `nuevaHoraInicio` (hora
 * LOCAL) y resuelve el instante UTC contra `computeSlots` server-side.
 */
import type { AvailableSlot, BookAppointmentResult } from "@turnosbot/availability-engine";
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

// 09:00 local == 12:00 UTC (AR). El modelo pasa la hora local; la tool resuelve el ISO.
const HORA = "09:00";
const SLOT_START_ISO = "2026-07-13T12:00:00.000Z";
const SLOT_END_ISO = "2026-07-13T12:30:00.000Z";

const INPUT = {
  turnoId: TURNO_ID,
  profesionalId: PROFESIONAL_ID,
  nuevaFecha: "2026-07-13",
  nuevaHoraInicio: HORA,
};

// freshData.turnos debe ser un array (la tool lo filtra para excluir el propio turno).
const FAKE_FRESH_DATA = { turnos: [] } as unknown as Awaited<
  ReturnType<typeof import("../buildBotAvailabilityData.js").buildBotAvailabilityData>
>;

function fakeBuildBotAvailabilityData() {
  return vi.fn(async (_negocioId: string) => FAKE_FRESH_DATA);
}

function fakeComputeSlots(slots: AvailableSlot[] = [
  { start: HORA, end: "09:30", startIso: SLOT_START_ISO, endIso: SLOT_END_ISO, professionalId: PROFESIONAL_ID },
]) {
  return vi.fn(
    async (
      _input: Parameters<typeof import("@turnosbot/availability-engine").computeSlots>[0],
      _data: Parameters<typeof import("@turnosbot/availability-engine").computeSlots>[1],
    ): Promise<AvailableSlot[]> => slots,
  );
}

/** fakeNegocioScoped — `turnoServicios()` con filas fijas (incl. un turno ajeno)
 * y `turnos()` (CR-03) con TURNO_ID de CLIENTE_ID y OTRO_TURNO_ID de OTRO_CLIENTE_ID. */
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
  const negocioScoped = negocioScopedFn as unknown as typeof import("../../db/negocioScoped.js").negocioScoped;
  return { negocioScoped, turnoServicios, turnos, negocioScopedFn };
}

function fakeRescheduleAppointment(result: BookAppointmentResult) {
  return vi.fn(
    async (
      _input: Parameters<typeof import("@turnosbot/availability-engine").rescheduleAppointment>[0],
      _deps: Parameters<typeof import("@turnosbot/availability-engine").rescheduleAppointment>[1],
    ): Promise<BookAppointmentResult> => result,
  );
}

function buildTool(overrides: Partial<Parameters<typeof reagendarTurnoTool>[2]> = {}) {
  const { negocioScoped } = fakeNegocioScoped();
  return reagendarTurnoTool(NEGOCIO_ID, CLIENTE_ID, {
    rescheduleAppointment: fakeRescheduleAppointment({ ok: true, turnoId: TURNO_ID, precioTotal: 5000 }),
    computeSlots: fakeComputeSlots(),
    buildBotAvailabilityData: fakeBuildBotAvailabilityData(),
    negocioScoped,
    supabase: {} as never,
    ...overrides,
  });
}

async function runExecute(t: ReturnType<typeof reagendarTurnoTool>, input: unknown): Promise<unknown> {
  const execute = t.execute as unknown as (input: unknown, options: unknown) => Promise<unknown>;
  return execute(input, { toolCallId: "test", messages: [] });
}

describe("reagendarTurnoTool", () => {
  it("trae serviceIds vía turnoServicios y resuelve el instante server-side: rescheduleAppointment recibe el startIso/endIso del slot (fix timezone), misma forma que el dashboard (D-09)", async () => {
    const rescheduleAppointmentMock = fakeRescheduleAppointment({ ok: true, turnoId: TURNO_ID, precioTotal: 5000 });
    const { negocioScoped } = fakeNegocioScoped();
    const t = reagendarTurnoTool(NEGOCIO_ID, CLIENTE_ID, {
      rescheduleAppointment: rescheduleAppointmentMock,
      computeSlots: fakeComputeSlots(),
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
      inicio: SLOT_START_ISO, // resuelto server-side desde "09:00" local
      fin: SLOT_END_ISO,
    });
    expect(rawInput).not.toHaveProperty("skipBookingWindow");
  });

  it("nueva hora local sin slot disponible -> slot_taken, sin llamar rescheduleAppointment", async () => {
    const rescheduleAppointmentMock = fakeRescheduleAppointment({ ok: true, turnoId: TURNO_ID, precioTotal: 5000 });
    const t = buildTool({ rescheduleAppointment: rescheduleAppointmentMock, computeSlots: fakeComputeSlots([]) });

    const result = await runExecute(t, INPUT);

    expect(rescheduleAppointmentMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: false });
    expect((result as { mensaje: string }).mensaje).toMatch(/se acaba de ocupar/i);
  });

  it("caso ok: devuelve estructura con turnoId", async () => {
    const result = await runExecute(buildTool(), INPUT);
    expect(result).toEqual({ ok: true, turnoId: TURNO_ID, precioTotal: 5000 });
  });

  it("reason=slot_taken (de rescheduleAppointment) -> estructura de error mapeada (re-oferta)", async () => {
    const t = buildTool({ rescheduleAppointment: fakeRescheduleAppointment({ ok: false, reason: "slot_taken" }) });

    const result = await runExecute(t, INPUT);

    expect(result).not.toHaveProperty("turnoId");
    expect(result).toMatchObject({ ok: false });
    expect((result as { mensaje: string }).mensaje).toMatch(/se acaba de ocupar/i);
  });

  it("CR-03: turnoId de OTRO cliente del mismo negocio -> ok:false GENERIC_ERROR_COPY, rescheduleAppointment NUNCA llamado", async () => {
    const rescheduleAppointmentMock = fakeRescheduleAppointment({ ok: true, turnoId: OTRO_TURNO_ID, precioTotal: 5000 });
    const t = buildTool({ rescheduleAppointment: rescheduleAppointmentMock });

    const result = await runExecute(t, { ...INPUT, turnoId: OTRO_TURNO_ID });

    expect(rescheduleAppointmentMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: false });
    expect((result as { mensaje: string }).mensaje).toMatch(/no pudimos reagendar/i);
  });

  it("CR-03: turnoId inexistente en el negocio -> ok:false, mismo mensaje genérico que un turnoId ajeno (no leak)", async () => {
    const rescheduleAppointmentMock = fakeRescheduleAppointment({ ok: true, turnoId: "inexistente", precioTotal: 0 });
    const t = buildTool({ rescheduleAppointment: rescheduleAppointmentMock });

    const result = await runExecute(t, { ...INPUT, turnoId: "99999999-9999-9999-9999-999999999999" });

    expect(rescheduleAppointmentMock).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: false, mensaje: "No pudimos reagendar el turno. ¿Probamos de nuevo?" });
  });

  it("NUNCA recibe negocioId en su inputSchema (assert estructural, D-13)", () => {
    const shape = reagendarTurnoInputSchema.shape;
    expect(Object.keys(shape)).not.toContain("negocioId");
  });
});
