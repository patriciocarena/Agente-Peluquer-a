/**
 * apps/bot/src/conversation/buildBotAvailabilityData.ts — arma el shape
 * `AvailabilityData` que consume `computeSlots` (@turnosbot/availability-engine),
 * análogo de `apps/dashboard/lib/availability-data.ts#buildAvailabilityData`
 * pero SIEMPRE vía `negocioScoped(negocioId)` (BOT-11, D-13, T-06-05) — el
 * bot corre con el cliente service_role (bypassa RLS por completo, Pitfall
 * 7 de negocioScoped.ts), así que `negocioScoped` es la ÚNICA barrera real
 * de aislamiento cross-negocio en este servicio. Nunca usar el cliente
 * Supabase admin directo acá.
 *
 * Patrón de deps opcional inyectable con default real (mismo patrón que
 * `ProcessInboundWhatsappEventDeps` en `queue/inboundWorker.ts`), para poder
 * testear con un `negocioScoped` fake sin pegarle a la DB real.
 */
import type { AvailabilityData } from "@turnosbot/availability-engine";

import { negocioScoped as realNegocioScoped } from "../db/negocioScoped.js";

export interface BuildBotAvailabilityDataDeps {
  negocioScoped: typeof realNegocioScoped;
}

/**
 * buildBotAvailabilityData(negocioId, deps?) — arma `AvailabilityData`
 * (horarios, bloqueos, turnos, servicios, negocio) con un `Promise.all` de
 * cinco lecturas, todas resueltas por `negocioScoped(negocioId)`.
 *
 * `negocio()` filtra por `tenant_id` (no `negocio_id` — ver el comentario de
 * cabecera de `negocioScoped.ts`, Pitfall 3) y devuelve potencialmente más
 * de una fila si el tenant tiene varios negocios; acá se toma la primera
 * (`.data?.[0]`) ya que este helper opera sobre un `negocioId` puntual.
 */
export async function buildBotAvailabilityData(
  negocioId: string,
  deps: BuildBotAvailabilityDataDeps = { negocioScoped: realNegocioScoped },
): Promise<AvailabilityData> {
  const db = deps.negocioScoped(negocioId);

  const [horariosRes, bloqueosRes, turnosRes, serviciosRes, negocioRes] = await Promise.all([
    db.horariosTrabajo(),
    db.bloqueos(),
    db.turnos(),
    db.servicios(),
    db.negocio(),
  ]);

  const negocio = negocioRes.data?.[0];

  if (negocioRes.error || !negocio) {
    throw new Error(
      `buildBotAvailabilityData: no se pudo cargar el negocio (negocioId=${negocioId}): ${negocioRes.error?.message}`,
    );
  }

  return {
    horarios: horariosRes.data ?? [],
    bloqueos: bloqueosRes.data ?? [],
    turnos: turnosRes.data ?? [],
    servicios: serviciosRes.data ?? [],
    negocio,
  };
}
