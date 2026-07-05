/**
 * lib/reorder.test.ts — RED del ciclo TDD del plan 02-05 Task 1. Afirma el
 * `<behavior>` declarado: reorder(items, fromId, toId) reasigna `orden`
 * como índice contiguo 0..n-1 sin huecos ni duplicados tras mover
 * primero->último, último->primero, y es no-op cuando from === to.
 */
import { describe, expect, it } from "vitest";

import { reorder, type ServicioOrdenable } from "./reorder";

const items: ServicioOrdenable[] = [
  { id: "a", orden: 0 },
  { id: "b", orden: 1 },
  { id: "c", orden: 2 },
  { id: "d", orden: 3 },
];

function assertOrdenContiguoSinDuplicados(result: ServicioOrdenable[]) {
  const ordenes = result.map((item) => item.orden).sort((x, y) => x - y);
  const esperado = result.map((_, index) => index);
  expect(ordenes).toEqual(esperado);

  const idsUnicos = new Set(result.map((item) => item.id));
  expect(idsUnicos.size).toBe(result.length);
}

describe("reorder", () => {
  it("mueve el primero al último y reasigna orden contiguo", () => {
    const result = reorder(items, "a", "d");
    expect(result.map((item) => item.id)).toEqual(["b", "c", "d", "a"]);
    assertOrdenContiguoSinDuplicados(result);
  });

  it("mueve el último al primero y reasigna orden contiguo", () => {
    const result = reorder(items, "d", "a");
    expect(result.map((item) => item.id)).toEqual(["d", "a", "b", "c"]);
    assertOrdenContiguoSinDuplicados(result);
  });

  it("es no-op cuando from === to", () => {
    const result = reorder(items, "b", "b");
    expect(result).toEqual(items);
  });

  it("no deja huecos ni duplicados tras varios movimientos encadenados", () => {
    let current = items;
    current = reorder(current, "a", "c");
    current = reorder(current, "d", "b");
    current = reorder(current, "b", "a");
    assertOrdenContiguoSinDuplicados(current);
  });

  it("mover un elemento del medio no afecta el tamaño del array", () => {
    const result = reorder(items, "b", "c");
    expect(result).toHaveLength(items.length);
    assertOrdenContiguoSinDuplicados(result);
  });
});
