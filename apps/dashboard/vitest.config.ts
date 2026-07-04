import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

/**
 * Vitest — andamiaje de tests del dashboard (Wave 0 de 02-RESEARCH.md).
 * Las fases de CRUD llenan lib/schemas/*.test.ts (validación zod) y
 * lib/reorder/*.test.ts (lógica de reordenamiento dnd-kit). Entorno `node`
 * porque el foco es lógica pura; los tests de UI llegarían con su propio
 * entorno cuando se sumen. Alias @/* alineado con tsconfig.json.
 *
 * Run: pnpm --filter @turnosbot/dashboard exec vitest run
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "lib/**/__*__.test.ts"],
    globals: true,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
})
