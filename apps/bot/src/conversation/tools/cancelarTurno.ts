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
 *
 * CR-03 (cross-client tampering): `cancelAppointment` en sí solo scopea por
 * `negocioId` + `turnoId` (mismo modelo de confianza que el dashboard, donde
 * el owner autenticado SÍ puede tocar cualquier turno del negocio). El actor
 * de esta tool, en cambio, es un cliente anónimo de WhatsApp que solo debe
 * poder tocar SU PROPIO turno — un `turnoId` ajeno (pegado por el cliente,
 * o inducido por prompt-injection) no debe poder cancelarse. Por eso, ANTES
 * de delegar en `cancelAppointment`, esta tool verifica ownership leyendo el
 * turno vía `negocioScoped(negocioId).turnos()` (mismo patrón de
 * post-fetch-filter que `consultarNegocio.ts#estado_turno`, T-06-07) y
 * confirmando `turno.cliente_id === clienteId`. Si no existe o pertenece a
 * otro cliente, se devuelve el mismo `GENERIC_ERROR_COPY` que un error real
 * — nunca se distingue "no existe" de "no es tuyo" en el mensaje (evita
 * confirmar/negar la existencia de turnos ajenos).
 */
import { cancelAppointment, uuidLike } from "@turnosbot/availability-engine";
import type { CancelAppointmentResult } from "@turnosbot/availability-engine";
import { tool } from "ai";
import { z } from "zod";

import { supabaseAdmin } from "../../db/client.js";
import { negocioScoped as realNegocioScoped } from "../../db/negocioScoped.js";

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

/** Deps inyectables (Pattern 3): `cancelAppointment`, `negocioScoped` y el
 * cliente Supabase service_role reales por defecto, sustituibles en tests
 * por mocks deterministas sin DB real ni Gemini. */
export interface CancelarTurnoDeps {
  cancelAppointment: typeof cancelAppointment;
  negocioScoped: typeof realNegocioScoped;
  supabase: SupabaseClient<Database>;
}

const defaultDeps: CancelarTurnoDeps = {
  cancelAppointment,
  negocioScoped: realNegocioScoped,
  supabase: supabaseAdmin,
};

/**
 * cancelarTurnoTool(negocioId, clienteId, deps?) — factory que devuelve la
 * tool `cancelarTurno` del AI SDK, cerrada sobre `negocioId` (D-13) Y
 * `clienteId` (CR-03: ownership check antes de delegar en el motor).
 */
export function cancelarTurnoTool(
  negocioId: string,
  clienteId: string,
  deps: CancelarTurnoDeps = defaultDeps,
) {
  return tool({
    description:
      "Cancela un turno EXISTENTE del cliente actual. SOLO llamar después de que el cliente confirmó explícitamente que quiere cancelar — nunca cancelar por una mención ambigua o implícita.",
    inputSchema: cancelarTurnoInputSchema,
    execute: async (input: CancelarTurnoInput): Promise<CancelarTurnoResult> => {
      // CR-03: ownership check ANTES de tocar el motor de escritura —
      // cancelAppointment solo scopea por negocioId+turnoId (igual que el
      // dashboard, cuyo actor SÍ es un owner autenticado); este actor es un
      // cliente anónimo de WhatsApp que solo puede tocar su propio turno.
      const { data: turnos } = await deps.negocioScoped(negocioId).turnos();
      const turnoPropio = (turnos ?? []).find(
        (turno) => turno.id === input.turnoId && turno.cliente_id === clienteId,
      );
      if (!turnoPropio) {
        // No distinguir "no existe" de "no es tuyo" en el mensaje (no leak).
        return { ok: false, mensaje: GENERIC_ERROR_COPY };
      }

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
