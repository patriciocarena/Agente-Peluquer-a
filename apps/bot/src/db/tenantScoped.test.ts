/**
 * Functional smoke test for tenantScoped(tenantId) (CORE-03).
 *
 * Uses the two seeded tenants (Plan 01-05, D-16) to assert that
 * tenantScoped(tenantA).turnos() returns ONLY tenant-A rows and NEVER
 * tenant-B rows — proving the mandatory tenant_id filter actually holds
 * against the live database, not just structurally in the source.
 *
 * This is a functional smoke test, run directly via `pnpm exec tsx` (no
 * test framework wired yet for apps/bot). The formal automated cross-tenant
 * service_role suite (SEC-03) is deferred to Phase 7.
 *
 * Run via: pnpm exec tsx apps/bot/src/db/tenantScoped.test.ts
 */
import { tenantScoped } from "./tenantScoped.js";

// Seeded fixture tenant IDs (mirrors scripts/seed-fixtures.ts — apps/bot
// cannot import from the root-level scripts/ folder, so the two fixed IDs
// are duplicated here as literal constants tied to supabase/seed.sql).
const TENANT_A_ID = "11111111-1111-1111-1111-111111111111";
const TENANT_B_ID = "12222222-2222-2222-2222-222222222222";

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

  const { data: turnosA, error: errA } = await tenantScoped(TENANT_A_ID).turnos().select("*");
  assert(!errA, `tenantScoped(A).turnos() no debería fallar: ${errA?.message}`);
  assert((turnosA?.length ?? 0) > 0, "tenantScoped(A).turnos() debería devolver al menos 1 fila (seed data).");
  assert(
    (turnosA ?? []).every((t) => (t as { tenant_id: string }).tenant_id === TENANT_A_ID),
    "tenantScoped(A).turnos() devolvió una fila que NO pertenece al tenant A.",
  );
  assert(
    (turnosA ?? []).every((t) => (t as { tenant_id: string }).tenant_id !== TENANT_B_ID),
    "tenantScoped(A).turnos() devolvió filas del tenant B -- FUGA CROSS-TENANT.",
  );
  console.log(`OK: tenantScoped(A).turnos() devuelve ${turnosA?.length} fila(s), todas del tenant A.`);

  const { data: turnosB, error: errB } = await tenantScoped(TENANT_B_ID).turnos().select("*");
  assert(!errB, `tenantScoped(B).turnos() no debería fallar: ${errB?.message}`);
  assert(
    (turnosB ?? []).every((t) => (t as { tenant_id: string }).tenant_id === TENANT_B_ID),
    "tenantScoped(B).turnos() devolvió una fila que NO pertenece al tenant B.",
  );
  console.log(`OK: tenantScoped(B).turnos() devuelve ${turnosB?.length} fila(s), todas del tenant B.`);

  console.log("\ntenantScoped.test.ts: PASSED");
}

main().catch((err) => {
  console.error("ERROR inesperado en tenantScoped.test.ts:", err);
  process.exit(1);
});
