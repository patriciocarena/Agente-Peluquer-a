/**
 * lib/availability-data.ts — ÚNICO helper de fetch que arma el shape
 * `AvailabilityData` que consume `computeSlots` (04-RESEARCH.md Pattern 1).
 *
 * `page.tsx` (render de la grilla, Plan 07) y las Server Actions de turnos
 * que revalidan disponibilidad (Plan 04) reusan `buildAvailabilityData` en
 * vez de cada uno armar su propio fetch — un solo camino de lectura, sin
 * drift entre lo que la grilla muestra y lo que el motor valida al escribir.
 *
 * El cliente usado es SIEMPRE el RLS del owner (`@/lib/supabase/server`),
 * nunca `lib/supabase/admin.ts` (T-04-11) — cada query además va scoped
 * explícitamente por `negocio_id` (defensa en profundidad sobre RLS, mismo
 * patrón que `app/actions/servicios.ts`).
 *
 * `negocioId` se recibe como parámetro (el caller lo deriva de
 * `getNegocioActivo()`) para no resolver el negocio activo dos veces por
 * request cuando tanto una Server Action como el Server Component que la
 * invoca necesitan el mismo dato.
 *
 * NO se pre-filtra por fecha: `computeSlots` filtra internamente sobre el
 * array completo scopeado por negocio (04-RESEARCH.md A2 acepta este fetch
 * completo para v1 dado el volumen esperado por tenant).
 */
import type { AvailabilityData, TurnoServicioRow } from "@turnosbot/availability-engine";

import { createClient } from "@/lib/supabase/server";

/**
 * buildAvailabilityData(negocioId) — arma el shape `AvailabilityData`
 * (horarios, bloqueos, turnos, servicios, negocio) con un `Promise.all` de
 * cinco queries scopeadas al negocio activo.
 */
export async function buildAvailabilityData(negocioId: string): Promise<AvailabilityData> {
  const supabase = await createClient();

  const [horariosRes, bloqueosRes, turnosRes, serviciosRes, negocioRes] = await Promise.all([
    supabase.from("horario_trabajo").select("*").eq("negocio_id", negocioId),
    supabase.from("bloqueo").select("*").eq("negocio_id", negocioId),
    supabase.from("turno").select("*").eq("negocio_id", negocioId),
    supabase.from("servicio").select("*").eq("negocio_id", negocioId),
    supabase.from("negocio").select("*").eq("id", negocioId).single(),
  ]);

  if (negocioRes.error || !negocioRes.data) {
    throw new Error("Hubo un problema al cargar la agenda. Recargá la página o intentá más tarde.");
  }

  return {
    horarios: horariosRes.data ?? [],
    bloqueos: bloqueosRes.data ?? [],
    turnos: turnosRes.data ?? [],
    servicios: serviciosRes.data ?? [],
    negocio: negocioRes.data,
  };
}

/**
 * fetchTurnoServicios(negocioId, turnoId) — dato SOLO para el panel de
 * detalle de un turno (qué servicios componen ese bloque). Separado de
 * `buildAvailabilityData` a propósito: `turno_servicio` no forma parte del
 * contrato `AvailabilityData` que consume el motor (Pitfall 5) y mezclarlo
 * ahí contaminaría ese contrato con un dato de UI.
 */
export async function fetchTurnoServicios(
  negocioId: string,
  turnoId: string,
): Promise<TurnoServicioRow[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("turno_servicio")
    .select("*")
    .eq("negocio_id", negocioId)
    .eq("turno_id", turnoId);

  return data ?? [];
}
