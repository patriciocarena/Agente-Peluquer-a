/**
 * verify-dashboard-isolation.ts (AUTH-03, Plan 02-03)
 *
 * Post-migración-0003 (D-09..D-12): las tablas operativas aíslan por
 * `negocio_id` vía `auth_negocio_ids()`, no por `tenant_id` directo (ese
 * campo fue dropeado de las 11 tablas operativas). Este script prueba el
 * aislamiento cross-TENANT tal cual lo ve el dashboard del owner: logueado
 * (anon key + JWT) como el dueño del Tenant A (Grupo Norte, que tiene DOS
 * negocios bajo el mismo tenant), ninguna query a una tabla operativa debe
 * devolver filas de negocios del Tenant B (Grupo Sur), y viceversa.
 *
 * Reusa las fixtures ya sembradas (scripts/apply-seed.ts /
 * scripts/seed-fixtures.ts) — no siembra datos nuevos.
 *
 * Nota: scripts/verify-isolation.ts (Fase 1) queda como referencia
 * histórica del patrón RLS pre-0003; ya no aplica tal cual post-migración
 * porque asserta `tenant_id` en tablas que hoy solo tienen `negocio_id`
 * (ver deferred-items.md — fuera de alcance de este plan).
 *
 * Requiere SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY en .env. Se corre
 * en el merge de wave (no per-commit) — necesita credenciales live.
 *
 * Targets ONLY bdgufnitakelyialjoqg. Run via:
 *   pnpm exec tsx scripts/verify-dashboard-isolation.ts
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@turnosbot/db-types";
import { TENANT_A, TENANT_B } from "./seed-fixtures.js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const PROJECT_REF = "bdgufnitakelyialjoqg";

if (!SUPABASE_URL) {
  console.error("FALTA SUPABASE_URL en .env — abortando.");
  process.exit(1);
}
if (!SUPABASE_URL.includes(PROJECT_REF)) {
  console.error(
    `SUPABASE_URL (${SUPABASE_URL}) no apunta al proyecto TurnosBot (${PROJECT_REF}). Abortando por regla de aislamiento.`,
  );
  process.exit(1);
}
if (!ANON_KEY) {
  console.error(
    "FALTA NEXT_PUBLIC_SUPABASE_ANON_KEY en .env — no se puede ejecutar la ruta RLS " +
      "(anon key + JWT de usuario). Agregar la clave anon/publishable del proyecto " +
      `${PROJECT_REF} a .env y volver a correr: pnpm exec tsx scripts/verify-dashboard-isolation.ts`,
  );
  process.exit(1);
}

type NegocioScopedTable = "profesional" | "servicio" | "cliente" | "turno";
const NEGOCIO_SCOPED_TABLES: NegocioScopedTable[] = ["profesional", "servicio", "cliente", "turno"];

// Tenant A (Grupo Norte) tiene DOS negocios bajo el mismo tenant (D-12).
const TENANT_A_NEGOCIO_IDS = new Set<string>([
  TENANT_A.negocioId,
  TENANT_A.segundoNegocio.negocioId,
]);
const TENANT_B_NEGOCIO_IDS = new Set<string>([TENANT_B.negocioId]);

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

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

async function assertNegocioTableIsolation(
  client: SupabaseClient<Database>,
  ownNegocioIds: Set<string>,
  otherNegocioIds: Set<string>,
  ownerLabel: string,
) {
  const { data, error } = await client.from("negocio").select("id");
  if (error) {
    throw new Error(`${ownerLabel}: query a negocio falló inesperadamente: ${error.message}`);
  }
  const ids = (data ?? []).map((r) => r.id);
  const leaked = ids.filter((id) => otherNegocioIds.has(id));
  assert(
    leaked.length === 0,
    `${ownerLabel}: FUGA -- tabla negocio devolvió negocio(s) de otro tenant: ${leaked.join(", ")}`,
  );
  for (const expected of ownNegocioIds) {
    assert(
      ids.includes(expected),
      `${ownerLabel}: la tabla negocio no devolvió el negocio propio esperado ${expected}`,
    );
  }
  console.log(
    `OK: ${ownerLabel} -- la tabla negocio devuelve exactamente los ${ownNegocioIds.size} negocio(s) del propio tenant.`,
  );
}

async function assertOnlyOwnNegocioRows(
  client: SupabaseClient<Database>,
  ownNegocioIds: Set<string>,
  otherNegocioIds: Set<string>,
  ownerLabel: string,
) {
  for (const table of NEGOCIO_SCOPED_TABLES) {
    const { data, error } = await client.from(table).select("*");
    if (error) {
      throw new Error(`${ownerLabel}: query a ${table} falló inesperadamente: ${error.message}`);
    }
    const rows = (data ?? []) as Array<{ negocio_id?: string }>;
    assert(
      rows.length > 0,
      `${ownerLabel}: la query a ${table} no devolvió ninguna fila (esperado: al menos las del propio negocio sembrado)`,
    );

    const leaked = rows.filter((r) => r.negocio_id !== undefined && otherNegocioIds.has(r.negocio_id));
    assert(
      leaked.length === 0,
      `${ownerLabel}: FUGA CROSS-TENANT en tabla ${table} — ${leaked.length} fila(s) de un negocio de otro tenant.`,
    );

    const foreign = rows.filter(
      (r) => r.negocio_id !== undefined && !ownNegocioIds.has(r.negocio_id),
    );
    assert(
      foreign.length === 0,
      `${ownerLabel}: FUGA -- tabla ${table} devolvió fila(s) con negocio_id fuera de los negocios propios (${foreign
        .map((f) => f.negocio_id)
        .join(", ")}).`,
    );
  }
  console.log(`OK (AUTH-03): ${ownerLabel} -- todas las consultas devuelven solo filas de sus propios negocios.`);
}

async function assertCannotReadOtherNegocioRow(
  client: SupabaseClient<Database>,
  otherTurnoId: string,
  ownerLabel: string,
) {
  const { data, error } = await client.from("turno").select("*").eq("id", otherTurnoId);
  if (error) {
    console.log(
      `OK: ${ownerLabel} -- lectura directa de un turno de otro tenant fue rechazada (error): ${error.message}`,
    );
    return;
  }
  assert(
    (data ?? []).length === 0,
    `${ownerLabel}: FUGA -- pudo leer directamente un turno_id de otro tenant.`,
  );
  console.log(`OK: ${ownerLabel} -- lectura directa de turno_id de otro tenant devuelve 0 filas.`);
}

async function main() {
  const ownerA = await signInAsOwner(TENANT_A.ownerEmail, TENANT_A.ownerPassword);
  const ownerB = await signInAsOwner(TENANT_B.ownerEmail, TENANT_B.ownerPassword);

  console.log(`\n--- Verificando como owner de ${TENANT_A.nombreTenant} (2 negocios) ---`);
  await assertNegocioTableIsolation(ownerA, TENANT_A_NEGOCIO_IDS, TENANT_B_NEGOCIO_IDS, "Owner A");
  await assertOnlyOwnNegocioRows(ownerA, TENANT_A_NEGOCIO_IDS, TENANT_B_NEGOCIO_IDS, "Owner A");
  await assertCannotReadOtherNegocioRow(ownerA, TENANT_B.turnoId, "Owner A");

  console.log(`\n--- Verificando como owner de ${TENANT_B.nombreTenant} ---`);
  await assertNegocioTableIsolation(ownerB, TENANT_B_NEGOCIO_IDS, TENANT_A_NEGOCIO_IDS, "Owner B");
  await assertOnlyOwnNegocioRows(ownerB, TENANT_B_NEGOCIO_IDS, TENANT_A_NEGOCIO_IDS, "Owner B");
  await assertCannotReadOtherNegocioRow(ownerB, TENANT_A.turnoId, "Owner B");

  console.log("\nverify-dashboard-isolation.ts: PASSED");
}

main().catch((err) => {
  console.error("ERROR inesperado en verify-dashboard-isolation.ts:", err);
  process.exit(1);
});
