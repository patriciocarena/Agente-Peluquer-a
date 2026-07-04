/**
 * verify-isolation.ts (CORE-01/CORE-02, Success Criteria #1 & #2)
 *
 * Asserts, against the LIVE database and the two seeded tenants, that RLS
 * fully isolates the dashboard's per-user JWT path:
 *   1. Sign in as owner A (anon key + password -> JWT, RLS path).
 *      - Query each tenant-scoped table; assert every returned row has
 *        tenant A's tenant_id.
 *      - Attempt to read a KNOWN tenant-B row (by id) directly; assert 0 rows.
 *      - Attempt to UPDATE a tenant-B row; assert it is blocked (0 rows
 *        affected / RLS-denied), and attempt to INSERT a row claiming
 *        tenant B's tenant_id; assert it is rejected.
 *   2. Repeat symmetrically as owner B.
 *
 * Requires NEXT_PUBLIC_SUPABASE_ANON_KEY (RLS path — anon key + user JWT).
 * If absent, this script exits early with a clear message rather than
 * fabricating a result (see Plan 01-05 environment adaptations).
 *
 * Targets ONLY bdgufnitakelyialjoqg. Run via:
 *   pnpm exec tsx scripts/verify-isolation.ts
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@turnosbot/db-types";
import { TENANT_A, TENANT_B } from "./seed-fixtures.js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL) {
  console.error("FALTA SUPABASE_URL en .env — abortando.");
  process.exit(1);
}
if (!SUPABASE_URL.includes("bdgufnitakelyialjoqg")) {
  console.error(`SUPABASE_URL no apunta al proyecto TurnosBot. Abortando.`);
  process.exit(1);
}
if (!ANON_KEY) {
  console.error(
    "FALTA NEXT_PUBLIC_SUPABASE_ANON_KEY en .env — no se puede ejecutar la ruta RLS " +
      "(anon key + JWT de usuario). Agregar la clave anon/publishable del proyecto " +
      "bdgufnitakelyialjoqg a .env y volver a correr: pnpm exec tsx scripts/verify-isolation.ts",
  );
  process.exit(1);
}

type TenantScopedTable = "negocio" | "profesional" | "servicio" | "cliente" | "turno";
const TENANT_SCOPED_TABLES: TenantScopedTable[] = ["negocio", "profesional", "servicio", "cliente", "turno"];

async function signInAsOwner(email: string, password: string): Promise<SupabaseClient<Database>> {
  const client = createClient<Database>(SUPABASE_URL!, ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    throw new Error(`No se pudo iniciar sesión como ${email}: ${error.message}`);
  }
  return client;
}

async function assertOnlyOwnTenantRows(
  client: SupabaseClient<Database>,
  ownTenantId: string,
  ownerLabel: string,
) {
  for (const table of TENANT_SCOPED_TABLES) {
    const { data, error } = await client.from(table).select("*");
    if (error) {
      throw new Error(`${ownerLabel}: query a ${table} falló inesperadamente: ${error.message}`);
    }
    const rows = (data ?? []) as Array<{ tenant_id?: string }>;
    const leaked = rows.filter((r) => r.tenant_id !== undefined && r.tenant_id !== ownTenantId);
    if (leaked.length > 0) {
      throw new Error(
        `${ownerLabel}: FUGA CROSS-TENANT en tabla ${table} — ${leaked.length} fila(s) con tenant_id distinto al propio.`,
      );
    }
  }
  console.log(`OK: ${ownerLabel} -- todas las consultas devuelven solo filas de su propio tenant.`);
}

async function assertCannotReadOtherTenantRow(
  client: SupabaseClient<Database>,
  otherTurnoId: string,
  ownerLabel: string,
) {
  const { data, error } = await client.from("turno").select("*").eq("id", otherTurnoId);
  if (error) {
    // RLS denial can surface as an error in some configs — acceptable, but log it.
    console.log(`OK: ${ownerLabel} -- lectura directa de turno de otro tenant fue rechazada (error): ${error.message}`);
    return;
  }
  if ((data ?? []).length !== 0) {
    throw new Error(`${ownerLabel}: FUGA -- pudo leer directamente un turno_id de otro tenant.`);
  }
  console.log(`OK: ${ownerLabel} -- lectura directa de turno_id de otro tenant devuelve 0 filas.`);
}

async function assertCannotWriteOtherTenant(
  client: SupabaseClient<Database>,
  otherTurnoId: string,
  otherTenantId: string,
  ownerLabel: string,
) {
  // Attempt UPDATE on a known other-tenant row.
  const { data: updateData, error: updateErr } = await client
    .from("turno")
    .update({ estado: "cancelado" })
    .eq("id", otherTurnoId)
    .select();
  if (updateErr) {
    console.log(`OK: ${ownerLabel} -- UPDATE cross-tenant rechazado (error): ${updateErr.message}`);
  } else if ((updateData ?? []).length !== 0) {
    throw new Error(`${ownerLabel}: FUGA -- pudo actualizar un turno de otro tenant.`);
  } else {
    console.log(`OK: ${ownerLabel} -- UPDATE cross-tenant afectó 0 filas (bloqueado por RLS).`);
  }

  // Attempt INSERT claiming the other tenant's tenant_id.
  const { error: insertErr } = await client.from("negocio").insert({
    id: "99999999-9999-9999-9999-999999999999",
    tenant_id: otherTenantId,
    nombre: "Intento de fuga cross-tenant",
    timezone: "America/Argentina/Buenos_Aires",
  });
  if (!insertErr) {
    // Clean up if it somehow succeeded, then fail loudly.
    await client.from("negocio").delete().eq("id", "99999999-9999-9999-9999-999999999999");
    throw new Error(`${ownerLabel}: FUGA -- pudo insertar una fila con tenant_id de otro tenant.`);
  }
  console.log(`OK: ${ownerLabel} -- INSERT con tenant_id ajeno fue rechazado por RLS: ${insertErr.message}`);
}

async function main() {
  const ownerA = await signInAsOwner(TENANT_A.ownerEmail, TENANT_A.ownerPassword);
  const ownerB = await signInAsOwner(TENANT_B.ownerEmail, TENANT_B.ownerPassword);

  console.log(`\n--- Verificando como ${TENANT_A.nombreNegocio} (owner A) ---`);
  await assertOnlyOwnTenantRows(ownerA, TENANT_A.tenantId, "Owner A");
  await assertCannotReadOtherTenantRow(ownerA, TENANT_B.turnoId, "Owner A");
  await assertCannotWriteOtherTenant(ownerA, TENANT_B.turnoId, TENANT_B.tenantId, "Owner A");

  console.log(`\n--- Verificando como ${TENANT_B.nombreNegocio} (owner B) ---`);
  await assertOnlyOwnTenantRows(ownerB, TENANT_B.tenantId, "Owner B");
  await assertCannotReadOtherTenantRow(ownerB, TENANT_A.turnoId, "Owner B");
  await assertCannotWriteOtherTenant(ownerB, TENANT_A.turnoId, TENANT_A.tenantId, "Owner B");

  console.log("\nverify-isolation.ts: PASSED");
}

main().catch((err) => {
  console.error("ERROR inesperado en verify-isolation.ts:", err);
  process.exit(1);
});
