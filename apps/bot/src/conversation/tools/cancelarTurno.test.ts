/**
 * cancelarTurno.test.ts — RED/GREEN del bloque <behavior> de 06-04-PLAN.md
 * Task 2 (mitad cancelarTurno). `cancelAppointment` va MOCKEADO (no fixtures
 * reales): esta tool es wrapper/mapeo, no motor. Sin Gemini, sin DB real.
 *
 * CR-03: `negocioScoped` también va mockeado — la tool ahora hace un
 * ownership check (`turno.cliente_id === clienteId`) sobre
 * `negocioScoped(negocioId).turnos()` ANTES de delegar en `cancelAppointment`.
 */
import type { CancelAppointmentResult } from "@turnosbot/availability-engine";
import { describe, expect, it, vi } from "vitest";

// Mismo fix que buscarHorarios.test.ts: evita que db/client.ts lance en
// import-time por falta de env vars.
vi.mock("../../db/client.js", () => ({ supabaseAdmin: {} }));

import { cancelarTurnoInputSchema, cancelarTurnoTool } from "./cancelarTurno.js";

const NEGOCIO_ID = "11111111-1111-1111-1111-111111111111";
const CLIENTE_ID = "22222222-2222-2222-2222-222222222222";
const OTRO_CLIENTE_ID = "33333333-3333-3333-3333-333333333333";
const TURNO_ID = "55555555-5555-5555-5555-555555555555";
const TURNO_AJENO_ID = "66666666-6666-6666-6666-666666666666";

/** fakeCancelAppointment — mock tipado con la MISMA firma que
 * `cancelAppointment` real para que `.mock.calls[0]` infiera una tupla
 * no-vacía (evita `Tuple type '[]' has no element at index '0'`). */
function fakeCancelAppointment(result: CancelAppointmentResult) {
  return vi.fn(
    async (
      _input: Parameters<typeof import("@turnosbot/availability-engine").cancelAppointment>[0],
      _deps: Parameters<typeof import("@turnosbot/availability-engine").cancelAppointment>[1],
    ): Promise<CancelAppointmentResult> => result,
  );
}

/** fakeNegocioScoped — devuelve un `negocioScoped` fake cuyo `turnos()`
 * resuelve filas fijas: un turno del CLIENTE_ID (TURNO_ID) y uno de otro
 * cliente (TURNO_AJENO_ID) del mismo negocio — para probar el ownership
 * check de CR-03. */
function fakeNegocioScoped() {
  const turnosRows = [
    { id: TURNO_ID, cliente_id: CLIENTE_ID },
    { id: TURNO_AJENO_ID, cliente_id: OTRO_CLIENTE_ID },
  ];
  const turnos = vi.fn(async () => ({ data: turnosRows, error: null }));
  const negocioScopedFn = vi.fn((_negocioId: string) => ({ turnos }));
  // Cast: el fake solo implementa `turnos` (lo único que usa esta tool) — el
  // tipo real de `negocioScoped` expone muchos más accessors.
  const negocioScoped = negocioScopedFn as unknown as typeof import("../../db/negocioScoped.js").negocioScoped;
  return { negocioScoped, turnos, negocioScopedFn };
}

async function runExecute(
  t: ReturnType<typeof cancelarTurnoTool>,
  input: unknown,
): Promise<unknown> {
  const execute = t.execute as unknown as (
    input: unknown,
    options: unknown,
  ) => Promise<unknown>;
  return execute(input, { toolCallId: "test", messages: [] });
}

describe("cancelarTurnoTool", () => {
  it("llama cancelAppointment({negocioId, turnoId}, {supabase}) — negocioId de la closure — tras pasar el ownership check", async () => {
    const cancelAppointmentMock = fakeCancelAppointment({ ok: true, turnoId: TURNO_ID });
    const { negocioScoped } = fakeNegocioScoped();
    const t = cancelarTurnoTool(NEGOCIO_ID, CLIENTE_ID, {
      cancelAppointment: cancelAppointmentMock,
      negocioScoped,
      supabase: {} as never,
    });

    const result = await runExecute(t, { turnoId: TURNO_ID });

    expect(negocioScoped).toHaveBeenCalledWith(NEGOCIO_ID);
    expect(cancelAppointmentMock).toHaveBeenCalledTimes(1);
    const [rawInput] = cancelAppointmentMock.mock.calls[0]!;
    expect(rawInput).toEqual({ negocioId: NEGOCIO_ID, turnoId: TURNO_ID });
    expect(result).toMatchObject({ ok: true, turnoId: TURNO_ID });
  });

  it("reason=already_cancelled -> mensaje BENIGNO, no error duro", async () => {
    const cancelAppointmentMock = fakeCancelAppointment({
      ok: false,
      reason: "already_cancelled",
    });
    const { negocioScoped } = fakeNegocioScoped();
    const t = cancelarTurnoTool(NEGOCIO_ID, CLIENTE_ID, {
      cancelAppointment: cancelAppointmentMock,
      negocioScoped,
      supabase: {} as never,
    });

    const result = await runExecute(t, { turnoId: TURNO_ID });

    expect(result).toMatchObject({ ok: true });
    expect((result as { mensaje: string }).mensaje).toMatch(/ya figura cancelado/i);
  });

  it.each(["not_found", "update_error"] as const)(
    "reason=%s -> estructura de error mapeada",
    async (reason) => {
      const cancelAppointmentMock = fakeCancelAppointment(
        reason === "not_found"
          ? { ok: false, reason: "not_found" }
          : { ok: false, reason: "update_error", message: "boom" },
      );
      const { negocioScoped } = fakeNegocioScoped();
      const t = cancelarTurnoTool(NEGOCIO_ID, CLIENTE_ID, {
        cancelAppointment: cancelAppointmentMock,
        negocioScoped,
        supabase: {} as never,
      });

      const result = await runExecute(t, { turnoId: TURNO_ID });

      expect(result).toMatchObject({ ok: false });
    },
  );

  it("CR-03: turnoId de OTRO cliente del mismo negocio -> ok:false GENERIC_ERROR_COPY, cancelAppointment NUNCA llamado", async () => {
    const cancelAppointmentMock = fakeCancelAppointment({ ok: true, turnoId: TURNO_AJENO_ID });
    const { negocioScoped } = fakeNegocioScoped();
    const t = cancelarTurnoTool(NEGOCIO_ID, CLIENTE_ID, {
      cancelAppointment: cancelAppointmentMock,
      negocioScoped,
      supabase: {} as never,
    });

    const result = await runExecute(t, { turnoId: TURNO_AJENO_ID });

    expect(cancelAppointmentMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: false });
    expect((result as { mensaje: string }).mensaje).toMatch(/no pudimos cancelar/i);
  });

  it("CR-03: turnoId inexistente en el negocio -> ok:false, mismo mensaje genérico que un turnoId ajeno (no leak)", async () => {
    const cancelAppointmentMock = fakeCancelAppointment({ ok: true, turnoId: "inexistente" });
    const { negocioScoped } = fakeNegocioScoped();
    const t = cancelarTurnoTool(NEGOCIO_ID, CLIENTE_ID, {
      cancelAppointment: cancelAppointmentMock,
      negocioScoped,
      supabase: {} as never,
    });

    const result = await runExecute(t, { turnoId: "99999999-9999-9999-9999-999999999999" });

    expect(cancelAppointmentMock).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: false, mensaje: "No pudimos cancelar el turno. ¿Probamos de nuevo?" });
  });

  it("NUNCA recibe negocioId en su inputSchema (assert estructural, D-13)", () => {
    const shape = cancelarTurnoInputSchema.shape;
    expect(Object.keys(shape)).not.toContain("negocioId");
  });
});
