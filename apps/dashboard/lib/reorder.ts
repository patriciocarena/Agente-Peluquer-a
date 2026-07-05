/**
 * lib/reorder.ts — función pura de reordenamiento para SVC-02 (Servicios,
 * drag-and-drop). Dado el array actual y un evento de drag (fromId/toId),
 * usa `arrayMove` de `@dnd-kit/sortable` (ya dependencia del proyecto — no
 * reinventar el movimiento de array, 02-RESEARCH.md §Don't Hand-Roll) y
 * reasigna `orden` como índice contiguo 0..n-1 (la representación de
 * almacenamiento en `servicio.orden`).
 *
 * `components/servicios-table.tsx` llama esto en `onDragEnd` para calcular
 * el nuevo estado optimista antes de persistir vía
 * `reorderServiciosAction` (app/actions/servicios.ts).
 */
import { arrayMove } from "@dnd-kit/sortable";

export type ServicioOrdenable = {
  id: string;
  orden: number;
};

export function reorder<T extends ServicioOrdenable>(
  items: T[],
  fromId: string,
  toId: string,
): T[] {
  if (fromId === toId) return items;

  const fromIndex = items.findIndex((item) => item.id === fromId);
  const toIndex = items.findIndex((item) => item.id === toId);
  if (fromIndex === -1 || toIndex === -1) return items;

  const moved = arrayMove(items, fromIndex, toIndex);
  return moved.map((item, index) => ({ ...item, orden: index }));
}
