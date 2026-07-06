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
    include: ["src/**/*.test.ts"],
    // negocioScoped.test.ts predates this vitest runner (Fase 03 Pitfall 7):
    // it's a manual, live-DB smoke test (top-level `main()` + `process.exit`,
    // gated on a real .env against bdgufnitakelyialjoqg) run via
    // `pnpm exec tsx apps/bot/src/db/negocioScoped.test.ts`, NOT a vitest
    // suite — it has no describe/it blocks and would crash the automated
    // runner (missing env vars) or hard-exit the process if it had them.
    // Excluded here so `vitest run` stays green without touching the file
    // or its already-documented run convention.
    exclude: ["src/db/negocioScoped.test.ts", "node_modules/**"],
    globals: true,
  },
})
