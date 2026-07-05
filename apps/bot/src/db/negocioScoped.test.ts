/**
 * Functional smoke test for negocioScoped(negocioId) (CORE-03).
 *
 * Uses the two seeded tenants' primary negocios (Plan 01-05 D-16;
 * scripts/seed-fixtures.ts TENANT_A.negocioId / TENANT_B.negocioId) to
 * assert that negocioScoped(negocioA).turnos() returns ONLY negocio-A rows
 * and NEVER negocio-B rows — proving the mandatory negocio_id filter
 * actually holds against the live database, not just structurally in the
 * source.
 *
 * This is a functional smoke test, run directly via `pnpm exec tsx` (no
 * test framework wired yet for apps/bot). The formal automated cross-tenant
 * service_role suite (SEC-03) is deferred to Phase 7.
 *
 * Fase 03 Pitfall 7 fix: this file previously called a differently-named
 * helper and asserted on the column migration 0003 removed from `turno`
 * (renamed to `negocio_id`); it now calls `negocioScoped(negocioId)` and
 * asserts on `negocio_id`, using each tenant's PRIMARY negocio.id (not the
 * tenant.id) as the fixture value.
 *
 * Run via: pnpm exec tsx apps/bot/src/db/negocioScoped.test.ts
 */
import { negocioScoped } from "./negocioScoped.js";

// Seeded fixture negocio IDs (mirrors scripts/seed-fixtures.ts TENANT_A/
// TENANT_B .negocioId — apps/bot cannot import from the root-level scripts/
// folder, so the two fixed IDs are duplicated here as literal constants tied
// to supabase/seed.sql). Each belongs to a DIFFERENT tenant, so this also
// exercises cross-tenant isolation, not just cross-negocio.
const NEGOCIO_A_ID = "21111111-1111-1111-1111-111111111111";
const NEGOCIO_B_ID = "22222222-2222-2222-2222-222222222222";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error(
      "FALTAN SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en .env — abortando smoke test.",
    );
    process.exit(1);
  }

  // Isolation guard (CLAUDE.md hard rule): never run this against any
  // project other than this repo's own bdgufnitakelyialjoqg.
  if (!process.env.SUPABASE_URL.includes("bdgufnitakelyialjoqg")) {
    console.error(
      `SUPABASE_URL no apunta al proyecto TurnosBot (bdgufnitakelyialjoqg). Abortando: ${process.env.SUPABASE_URL}`,
    );
    process.exit(1);
  }

  const { data: turnosA, error: errA } = await negocioScoped(NEGOCIO_A_ID).turnos().select("*");
  assert(!errA, `negocioScoped(A).turnos() no debería fallar: ${errA?.message}`);
  assert(
    (turnosA?.length ?? 0) > 0,
    "negocioScoped(A).turnos() debería devolver al menos 1 fila (seed data).",
  );
  assert(
    (turnosA ?? []).every((t) => (t as { negocio_id: string }).negocio_id === NEGOCIO_A_ID),
    "negocioScoped(A).turnos() devolvió una fila que NO pertenece al negocio A.",
  );
  assert(
    (turnosA ?? []).every((t) => (t as { negocio_id: string }).negocio_id !== NEGOCIO_B_ID),
    "negocioScoped(A).turnos() devolvió filas del negocio B -- FUGA CROSS-NEGOCIO.",
  );
  console.log(
    `OK: negocioScoped(A).turnos() devuelve ${turnosA?.length} fila(s), todas del negocio A.`,
  );

  const { data: turnosB, error: errB } = await negocioScoped(NEGOCIO_B_ID).turnos().select("*");
  assert(!errB, `negocioScoped(B).turnos() no debería fallar: ${errB?.message}`);
  assert(
    (turnosB ?? []).every((t) => (t as { negocio_id: string }).negocio_id === NEGOCIO_B_ID),
    "negocioScoped(B).turnos() devolvió una fila que NO pertenece al negocio B.",
  );
  console.log(
    `OK: negocioScoped(B).turnos() devuelve ${turnosB?.length} fila(s), todas del negocio B.`,
  );

  console.log("\nnegocioScoped.test.ts: PASSED");
}

main().catch((err) => {
  console.error("ERROR inesperado en negocioScoped.test.ts:", err);
  process.exit(1);
});
