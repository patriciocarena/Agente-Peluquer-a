/**
 * apps/bot/src/conversation/tools/cancelarTurno.ts — tool `cancelarTurno`
 * (BOT-09/AVAIL-04): cancela un turno EXISTENTE del cliente actual,
 * envolviendo el `cancelAppointment` COMPARTIDO agregado en el plan 06-01
 * (@turnosbot/availability-engine) — PROHIBIDO un UPDATE inline que marque el
 * turno como cancelado en esta tool; toda la escritura pasa por la función de
 * dominio compartida (anti-pattern explícito de 06-PATTERNS.md, T-06-13).
 *
 * `cancelarTurnoTool(negocioId, clienteId, deps?)` cierra sobre `negocioId`
 * (Pattern 1, D-13): el `inputSchema` de abajo NUNCA incluye `negocioId`.
 * `clienteId` se recibe para mantener la misma firma que las demás tools de
 * escritura (Pattern 1); el scoping real de la cancelación lo hace
 * `cancelAppointment` con `negocioId` + `turnoId` (mismo modelo de confianza
 * que `cancelarTurno` del dashboard, T-06-13).
 *
 * La confirmación explícita antes de cancelar (D-08: "¿confirmás que querés
 * cancelar tu turno?") es responsabilidad del system prompt + el gate del
 * responder (plan 06-05) — esta tool SOLO ejecuta la cancelación una vez que
 * el modelo decide llamarla.
 *
 * `already_cancelled` se mapea a un mensaje BENIGNO de éxito (idempotente,
 * consistente con `cancelarTurno` del dashboard, plan 06-01) — NUNCA a un
 * error duro.
 */
import { cancelAppointment, uuidLike } from "@turnosbot/availability-engine";
import type { CancelAppointmentResult } from "@turnosbot/availability-engine";
import { tool } from "ai";
import { z } from "zod";

import { supabaseAdmin } from "../../db/client.js";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@turnosbot/db-types";

/** inputSchema de `cancelarTurno`. Sin `negocioId` — closure-captured
 * (D-13). */
export const cancelarTurnoInputSchema = z.object({
  turnoId: uuidLike,
});

export type CancelarTurnoInput = z.infer<typeof cancelarTurnoInputSchema>;

export type CancelarTurnoResult =
  | { ok: true; turnoId: string; mensaje: string }
  | { ok: false; mensaje: string };

const CANCELADO_OK_COPY = "Listo, cancelamos tu turno.";
const YA_CANCELADO_COPY = "Ese turno ya figura cancelado.";
const GENERIC_ERROR_COPY = "No pudimos cancelar el turno. ¿Probamos de nuevo?";

/** mapCancelAppointmentResult — traduce el `CancelAppointmentResult` de
 * dominio a la estructura user-facing de esta tool. `already_cancelled` es
 * BENIGNO (idempotente, T-06-01/06-01-SUMMARY.md) — nunca un error duro. */
function mapCancelAppointmentResult(result: CancelAppointmentResult): CancelarTurnoResult {
  if (result.ok) {
    return { ok: true, turnoId: result.turnoId, mensaje: CANCELADO_OK_COPY };
  }
  switch (result.reason) {
    case "already_cancelled":
      // Idempotente: el turno ya no está activo (lo que el cliente quería).
      return { ok: true, turnoId: "", mensaje: YA_CANCELADO_COPY };
    case "not_found":
    case "update_error":
    case "validation_error":
    default:
      return { ok: false, mensaje: GENERIC_ERROR_COPY };
  }
}

/** Deps inyectables (Pattern 3): `cancelAppointment` y el cliente Supabase
 * service_role reales por defecto, sustituibles en tests por mocks
 * deterministas sin DB real ni Gemini. */
export interface CancelarTurnoDeps {
  cancelAppointment: typeof cancelAppointment;
  supabase: SupabaseClient<Database>;
}

const defaultDeps: CancelarTurnoDeps = {
  cancelAppointment,
  supabase: supabaseAdmin,
};

/**
 * cancelarTurnoTool(negocioId, clienteId, deps?) — factory que devuelve la
 * tool `cancelarTurno` del AI SDK, cerrada sobre `negocioId` (D-13).
 */
export function cancelarTurnoTool(
  negocioId: string,
  clienteId: string,
  deps: CancelarTurnoDeps = defaultDeps,
) {
  void clienteId; // reservado para paridad de firma con las demás tools de escritura (Pattern 1).
  return tool({
    description:
      "Cancela un turno EXISTENTE del cliente actual. SOLO llamar después de que el cliente confirmó explícitamente que quiere cancelar — nunca cancelar por una mención ambigua o implícita.",
    inputSchema: cancelarTurnoInputSchema,
    execute: async (input: CancelarTurnoInput): Promise<CancelarTurnoResult> => {
      // Delegación 100% en la función de dominio compartida (T-06-13):
      // PROHIBIDO un UPDATE inline que marque el turno como cancelado acá.
      const result = await deps.cancelAppointment(
        { negocioId, turnoId: input.turnoId },
        { supabase: deps.supabase },
      );

      return mapCancelAppointmentResult(result);
    },
  });
}
