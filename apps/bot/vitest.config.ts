import { defineConfig } from "vitest/config"

/**
 * Vitest — andamiaje de tests de apps/bot (Wave 0 de 05-PLAN.md). El bot
 * service usa imports relativos NodeNext (sin alias `@/*` como el dashboard),
 * por eso no hay bloque de path aliasing. Los tests se colocan junto a cada
 * módulo bajo src/*.test.ts.
 *
 * Run: pnpm --filter @turnosbot/bot exec vitest run
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "evals/**/*.test.ts"],
    // Los scripts de verificación live contra la DB real usan el sufijo
    // `.verify.ts` (no `.test.ts`) justamente para NO matchear el include de
    // arriba. Antes `negocioScoped.verify.ts` se llamaba `.test.ts` y vivía en
    // esta lista de `exclude`: parecía cubierto por CI y no lo estaba. Ver
    // W-01 de 07-VERIFICATION.md. Correr a mano:
    //   node --env-file=.env --import tsx apps/bot/src/db/negocioScoped.verify.ts
    exclude: ["node_modules/**"],
    globals: true,
  },
})
