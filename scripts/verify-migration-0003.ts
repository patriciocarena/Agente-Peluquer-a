/**
 * verify-migration-0003.ts (T-02-01..T-02-03, contrato Wave 0 de
 * 02-VALIDATION.md, D-09..D-12)
 *
 * Verificador vivo del shape post-migración-0003: reemplaza el "ojo humano
 * al diff" por una aserción determinística contra el catálogo de Postgres
 * (information_schema / pg_catalog) de bdgufnitakelyialjoqg. Asserta:
 *
 *   1. `tenant` tiene columnas `nombre`/`activo` y NO tiene
 *      whatsapp_phone_number_id/waba_id/whatsapp_token/display_phone_number.
 *   2. `negocio` SÍ tiene esas columnas WhatsApp + `activo`. NOTA (Fase 7,
 *      migración 0005, SEC-01): `whatsapp_token` (columna en claro) fue
 *      dropeada de `negocio` y reemplazada por `whatsapp_token_secret_id`
 *      (uuid, referencia a `vault.secrets`) — este script ya verifica el
 *      shape live post-0005, no el histórico post-0003.
 *   3. Cada una de las 11 tablas operativas (profesional, horario_trabajo,
 *      servicio, profesional_servicio, cliente, turno, turno_servicio,
 *      bloqueo, conversacion, mensaje, recordatorio) tiene `negocio_id`
 *      NOT NULL y NO tiene `tenant_id`.
 *   4. Existe la función `auth_negocio_ids()` y las 11 policies
 *      `<tabla>_aislamiento` referencian `negocio_id` (vía pg_policies).
 *
 * Este script se ESCRIBE en el Task 2 de 02-01-PLAN.md (estático, no toca
 * ninguna DB en ese momento) pero se EJECUTA recién en el checkpoint humano
 * (Task 3), después de que la migración 0003 haya sido aplicada en vivo.
 *
 * Introspección de catálogo: PostgREST (el cliente @supabase/supabase-js
 * normal) solo expone el schema `public`, no `information_schema` ni
 * `pg_catalog`. Por eso este script usa la Management API de Supabase
 * (POST /v1/projects/{ref}/database/query con el PAT en
 * SUPABASE_ACCESS_TOKEN) para correr SQL de solo-lectura contra el catálogo
 * — el mismo mecanismo ya documentado como válido y aislado para este
 * proyecto en CLAUDE.md (curl/fetch contra bdgufnitakelyialjoqg
 * específicamente; nunca contra el proyecto del restaurante).
 *
 * Targets ONLY bdgufnitakelyialjoqg. Run via:
 *   pnpm exec tsx scripts/verify-migration-0003.ts
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;

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
if (!SUPABASE_ACCESS_TOKEN) {
  console.error(
    "FALTA SUPABASE_ACCESS_TOKEN en .env (PAT de Management API, necesario para " +
      "introspeccionar information_schema/pg_catalog — PostgREST no expone esos " +
      "schemas). Generar uno en Supabase Dashboard -> Account -> Access Tokens y " +
      "agregarlo a .env.",
  );
  process.exit(1);
}

const OPERATIONAL_TABLES = [
  "profesional",
  "horario_trabajo",
  "servicio",
  "profesional_servicio",
  "cliente",
  "turno",
  "turno_servicio",
  "bloqueo",
  "conversacion",
  "mensaje",
  "recordatorio",
] as const;

type ColumnRow = { column_name: string; is_nullable: "YES" | "NO" };
type ProcRow = { proname: string };
type PolicyRow = { tablename: string; policyname: string; qual: string | null };

async function runSql<T>(query: string): Promise<T[]> {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SUPABASE_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Management API query falló (HTTP ${res.status}): ${text}`);
  }
  return (await res.json()) as T[];
}

async function getColumns(table: string): Promise<ColumnRow[]> {
  return runSql<ColumnRow>(
    `select column_name, is_nullable from information_schema.columns where table_schema = 'public' and table_name = '${table}'`,
  );
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

async function verifyTenant(): Promise<void> {
  const cols = await getColumns("tenant");
  const names = cols.map((c) => c.column_name);
  assert(names.includes("nombre"), "tenant.nombre no existe (esperado post-0003)");
  assert(names.includes("activo"), "tenant.activo no existe (esperado post-0003)");
  // whatsapp_token nunca existió en `tenant` (siempre vivió en `negocio`) --
  // el assert de ausencia sigue siendo válido tal cual post-0005.
  for (const col of ["whatsapp_phone_number_id", "waba_id", "whatsapp_token", "display_phone_number"]) {
    assert(!names.includes(col), `tenant todavía tiene la columna ${col} (debería haber sido dropeada por 0003)`);
  }
  console.log("OK: tenant tiene nombre+activo y NO tiene columnas WhatsApp.");
}

async function verifyNegocio(): Promise<void> {
  const cols = await getColumns("negocio");
  const names = cols.map((c) => c.column_name);
  // whatsapp_token_secret_id (no whatsapp_token) -- la migración 0005
  // (SEC-01, Fase 7) dropeó la columna en claro y la reemplazó por esta
  // referencia a vault.secrets.
  for (const col of ["whatsapp_phone_number_id", "waba_id", "whatsapp_token_secret_id", "display_phone_number", "activo"]) {
    assert(names.includes(col), `negocio no tiene la columna ${col} (esperado post-0003/0005)`);
  }
  console.log("OK: negocio tiene las 4 columnas WhatsApp (whatsapp_token_secret_id post-Vault) + activo.");
}

async function verifyOperationalTables(): Promise<void> {
  for (const table of OPERATIONAL_TABLES) {
    const cols = await getColumns(table);
    const byName = new Map(cols.map((c) => [c.column_name, c.is_nullable]));
    assert(byName.has("negocio_id"), `${table}.negocio_id no existe (esperado post-0003)`);
    assert(
      byName.get("negocio_id") === "NO",
      `${table}.negocio_id es NULLABLE (debería ser NOT NULL post-backfill)`,
    );
    assert(!byName.has("tenant_id"), `${table} todavía tiene tenant_id (debería haber sido dropeada por 0003)`);
  }
  console.log(`OK: las ${OPERATIONAL_TABLES.length} tablas operativas tienen negocio_id NOT NULL y no tienen tenant_id.`);
}

async function verifyRls(): Promise<void> {
  const fnRows = await runSql<ProcRow>(`select proname from pg_proc where proname = 'auth_negocio_ids'`);
  assert(fnRows.length > 0, "la función auth_negocio_ids() no existe");
  console.log("OK: auth_negocio_ids() existe.");

  const policyRows = await runSql<PolicyRow>(
    `select tablename, policyname, qual from pg_policies where schemaname = 'public' and policyname like '%_aislamiento'`,
  );
  for (const table of OPERATIONAL_TABLES) {
    const policyName = `${table}_aislamiento`;
    const policy = policyRows.find((r) => r.tablename === table && r.policyname === policyName);
    assert(!!policy, `no existe la policy ${policyName} sobre ${table}`);
    const qual = policy?.qual ?? "";
    assert(
      qual.includes("negocio_id") && qual.includes("auth_negocio_ids"),
      `la policy ${policyName} no referencia negocio_id/auth_negocio_ids() (qual="${qual}")`,
    );
  }
  console.log(`OK: las ${OPERATIONAL_TABLES.length} policies *_aislamiento filtran por negocio_id vía auth_negocio_ids().`);
}

async function main() {
  console.log(`Verificando shape post-0003 en vivo contra ${PROJECT_REF}...`);

  await verifyTenant();
  await verifyNegocio();
  await verifyOperationalTables();
  await verifyRls();

  console.log("\nverify-migration-0003.ts: PASSED");
}

main().catch((err) => {
  console.error("ERROR inesperado en verify-migration-0003.ts:", err);
  process.exit(1);
});
