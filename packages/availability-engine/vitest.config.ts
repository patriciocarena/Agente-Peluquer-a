import { defineConfig } from "vitest/config"

/**
 * Vitest — andamiaje de tests de @turnosbot/availability-engine (Wave 0 de
 * 03-RESEARCH.md). Paquete puro (sin DOM, sin cliente DB) que solo hace
 * cómputo de intervalos/fechas, por eso entorno `node` y sin bloque de path
 * aliasing (el paquete usa imports relativos, no el alias `@/*` de Next.js
 * del dashboard). Los tests se colocan junto a cada módulo bajo src/*.test.ts.
 *
 * Run: pnpm --filter @turnosbot/availability-engine exec vitest run
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    globals: true,
  },
})
