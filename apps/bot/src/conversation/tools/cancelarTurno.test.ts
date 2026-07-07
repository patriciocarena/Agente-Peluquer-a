/**
 * cancelarTurno.test.ts — RED/GREEN del bloque <behavior> de 06-04-PLAN.md
 * Task 2 (mitad cancelarTurno). `cancelAppointment` va MOCKEADO (no fixtures
 * reales): esta tool es wrapper/mapeo, no motor. Sin Gemini, sin DB real.
 */
import type { CancelAppointmentResult } from "@turnosbot/availability-engine";
import { describe, expect, it, vi } from "vitest";

// Mismo fix que buscarHorarios.test.ts: evita que db/client.ts lance en
// import-time por falta de env vars.
vi.mock("../../db/client.js", () => ({ supabaseAdmin: {} }));

import { cancelarTurnoInputSchema, cancelarTurnoTool } from "./cancelarTurno.js";

const NEGOCIO_ID = "11111111-1111-1111-1111-111111111111";
const CLIENTE_ID = "22222222-2222-2222-2222-222222222222";
const TURNO_ID = "55555555-5555-5555-5555-555555555555";

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
  it("llama cancelAppointment({negocioId, turnoId}, {supabase}) — negocioId de la closure", async () => {
    const cancelAppointmentMock = fakeCancelAppointment({ ok: true, turnoId: TURNO_ID });
    const t = cancelarTurnoTool(NEGOCIO_ID, CLIENTE_ID, {
      cancelAppointment: cancelAppointmentMock,
      supabase: {} as never,
    });

    const result = await runExecute(t, { turnoId: TURNO_ID });

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
    const t = cancelarTurnoTool(NEGOCIO_ID, CLIENTE_ID, {
      cancelAppointment: cancelAppointmentMock,
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
      const t = cancelarTurnoTool(NEGOCIO_ID, CLIENTE_ID, {
        cancelAppointment: cancelAppointmentMock,
        supabase: {} as never,
      });

      const result = await runExecute(t, { turnoId: TURNO_ID });

      expect(result).toMatchObject({ ok: false });
    },
  );

  it("NUNCA recibe negocioId en su inputSchema (assert estructural, D-13)", () => {
    const shape = cancelarTurnoInputSchema.shape;
    expect(Object.keys(shape)).not.toContain("negocioId");
  });
});
