import { expect, test } from "vitest"

/**
 * Smoke test — prueba únicamente que el runner de Vitest arranca y descubre
 * tests bajo lib/. Placeholder de Wave 0: las fases de CRUD reemplazan/añaden
 * los tests reales de lib/schemas (zod) y lib/reorder (dnd-kit).
 */
test("el runner de vitest está operativo", () => {
  expect(true).toBe(true)
})
