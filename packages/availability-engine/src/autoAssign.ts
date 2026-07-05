/**
 * src/autoAssign.ts — auto-asignación del profesional con el hueco más
 * temprano cuando el cliente no especifica preferencia (AVAIL-05, D-03).
 *
 * IMPORTANTE (Assumption A3, 03-RESEARCH.md Pitfall 6): el tie-break por
 * `professionalId` (orden ascendente de UUID) es un desempate de ÚLTIMO
 * RECURSO para el caso en que dos profesionales tengan su hueco más
 * temprano exactamente a la misma hora. NO es una estrategia de "reparto
 * equitativo" de carga entre profesionales — esa idea fue explícitamente
 * descartada para v1 (D-03: "Descartado: orden fijo del dueño; reparto
 * equitativo por carga"). Si en el futuro se quisiera balancear carga entre
 * profesionales, eso es una feature nueva y deliberada, no una extensión de
 * este tie-break de último recurso.
 *
 * `computeSlots` (Wave 3) llama a esta función con el Map de slots ya
 * calculados por profesional (post-ventana de reserva), tras convertir cada
 * `Interval` a `AvailableSlot` con horas "HH:mm" en la zona del negocio.
 */
import type { AvailableSlot } from "./types.js";

/**
 * autoAssign(slotsByProfessional) — elige el profesional con el hueco
 * disponible más temprano (D-03/AVAIL-05).
 *
 * ANTES de iterar, ordena las entradas por `professionalId` ascendente
 * (sort estable de UUID) para que el tie-break sea determinístico
 * independientemente del orden de inserción del Map — el orden de fetch
 * upstream (p. ej. una consulta a Postgres sin `ORDER BY`) no está
 * garantizado, así que la iteración NO puede depender de él (Pitfall 6).
 *
 * Asume cada lista de slots pre-ordenada ascendente por `start` dentro de
 * cada profesional (responsabilidad de `computeSlots`, que ya construye los
 * slots en ese orden vía `snapToGrid`).
 */
export function autoAssign(
  slotsByProfessional: Map<string, AvailableSlot[]>,
): { professionalId: string; slot: AvailableSlot } | null {
  const sortedEntries = [...slotsByProfessional.entries()].sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  );

  let best: { professionalId: string; slot: AvailableSlot } | null = null;
  for (const [professionalId, slots] of sortedEntries) {
    if (slots.length === 0) continue;
    const earliest = slots[0];
    // Estrictamente-menor: en un empate exacto, el primero encontrado en el
    // orden ya ascendente-por-id gana (determinismo de Pitfall 6).
    if (!best || earliest.start < best.slot.start) {
      best = { professionalId, slot: earliest };
    }
  }
  return best;
}
