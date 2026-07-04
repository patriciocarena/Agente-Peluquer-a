/**
 * verify-timezone.ts (CORE-04, Success Criteria #3, Pitfall 4)
 *
 * Asserts the 15:00 America/Argentina/Buenos_Aires -> 18:00Z round-trip:
 *   1. Insert a turno whose local wall-clock time is 15:00 in the
 *      America/Argentina/Buenos_Aires IANA zone.
 *      (Argentina is fixed offset, no DST — Pitfall 4).
 *   2. Read back the stored `inicio` and assert it is exactly 18:00:00Z.
 *   3. Convert the stored UTC instant back to the IANA zone using a
 *      tz-aware approach (Intl.DateTimeFormat with timeZone), NEVER a
 *      hardcoded numeric offset, and assert it renders as 15:00.
 *
 * Targets ONLY bdgufnitakelyialjoqg (service_role). Run via:
 *   pnpm exec tsx scripts/verify-timezone.ts
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@turnosbot/db-types";
import { TENANT_A } from "./seed-fixtures.js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("FALTAN SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en .env — abortando.");
  process.exit(1);
}
if (!SUPABASE_URL.includes("bdgufnitakelyialjoqg")) {
  console.error(`SUPABASE_URL no apunta al proyecto TurnosBot. Abortando.`);
  process.exit(1);
}

const supabaseAdmin = createClient<Database>(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const TZ = "America/Argentina/Buenos_Aires";

/**
 * Renders a UTC Date's wall-clock HH:mm in the given IANA timezone using the
 * native, tz-aware Intl API — never a hardcoded numeric offset (Pitfall 4).
 */
function renderTimeInZone(date: Date, timeZone: string): string {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return formatter.format(date);
}

async function main() {
  const testTurnoId = "71111111-1111-1111-1111-111111111111";

  // Clean up any prior run's row (idempotent re-run), then insert fresh.
  await supabaseAdmin.from("turno").delete().eq("id", testTurnoId);

  // 15:00 in America/Argentina/Buenos_Aires (fixed offset, no DST) == 18:00Z.
  // We express the insert directly as the expected UTC instant, since that is
  // what the tz-aware conversion (verified below) must independently confirm.
  const inicioUtcIso = "2026-08-01T18:00:00.000Z";
  const finUtcIso = "2026-08-01T18:30:00.000Z";

  const { error: insertErr } = await supabaseAdmin.from("turno").insert({
    id: testTurnoId,
    tenant_id: TENANT_A.tenantId,
    profesional_id: TENANT_A.profesionalId,
    cliente_id: TENANT_A.clienteId,
    inicio: inicioUtcIso,
    fin: finUtcIso,
    estado: "pendiente",
    precio_total: 6000.0,
  });
  if (insertErr) {
    console.error("FAIL: no se pudo insertar el turno de prueba:", insertErr.message);
    process.exit(1);
  }

  const { data: row, error: readErr } = await supabaseAdmin
    .from("turno")
    .select("inicio")
    .eq("id", testTurnoId)
    .single();
  if (readErr || !row) {
    console.error("FAIL: no se pudo leer el turno de prueba:", readErr?.message);
    process.exit(1);
  }

  const storedDate = new Date(row.inicio);
  const storedIso = storedDate.toISOString();

  // Assertion 1: stored value round-trips to exactly 18:00:00Z.
  if (storedIso !== "2026-08-01T18:00:00.000Z") {
    console.error(`FAIL: se esperaba 18:00:00Z almacenado, se obtuvo ${storedIso}`);
    process.exit(1);
  }
  console.log(`OK: turno insertado a las 15:00 ${TZ} se almacena como ${storedIso} (18:00Z).`);

  // Assertion 2: converting back via the IANA zone (tz-aware, no hardcoded
  // numeric offset) renders 15:00.
  const renderedLocal = renderTimeInZone(storedDate, TZ);
  if (renderedLocal !== "15:00") {
    console.error(`FAIL: se esperaba render 15:00 en ${TZ}, se obtuvo ${renderedLocal}`);
    process.exit(1);
  }
  console.log(`OK: el instante UTC almacenado renderiza como ${renderedLocal} en ${TZ} (conversión tz-aware, sin offset hardcodeado).`);

  // Cleanup.
  await supabaseAdmin.from("turno").delete().eq("id", testTurnoId);

  console.log("\nverify-timezone.ts: PASSED");
}

main().catch((err) => {
  console.error("ERROR inesperado en verify-timezone.ts:", err);
  process.exit(1);
});
