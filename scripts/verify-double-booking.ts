/**
 * verify-double-booking.ts (CORE-05, Success Criteria #4, Pitfall 2, D-09/D-10/D-11)
 *
 * Asserts, against the LIVE database, that the `turno_no_overlap` EXCLUDE
 * USING gist constraint (not application code) rejects overlapping active
 * turnos for the same profesional:
 *
 *   1. Insert turno X [10:00, 10:30) for a profesional -> succeeds.
 *   2. Insert an overlapping active turno Y for the SAME profesional
 *      -> must be REJECTED by the DB constraint (23P01 exclusion violation).
 *   3. Insert a boundary-touching turno Z with inicio == fin of X
 *      -> must SUCCEED (D-11: no buffer, [inicio, fin) ranges may touch).
 *   4. Cancel X (estado='cancelado'), then insert an overlapping turno W
 *      -> must SUCCEED (D-10: cancelled frees the slot instantly).
 *   5. Fire N concurrent overlapping inserts for a fresh slot -> assert
 *      exactly ONE succeeds (functional concurrency smoke; formal load
 *      test is SEC-02/Phase 7).
 *
 * Targets ONLY bdgufnitakelyialjoqg (service_role). Run via:
 *   pnpm exec tsx scripts/verify-double-booking.ts
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

const PROFESIONAL_ID = TENANT_A.profesionalId;
const TENANT_ID = TENANT_A.tenantId;
const CLIENTE_ID = TENANT_A.clienteId;

const IDS = {
  x: "81111111-1111-1111-1111-111111111111",
  y: "82111111-1111-1111-1111-111111111111",
  z: "83111111-1111-1111-1111-111111111111",
  w: "84111111-1111-1111-1111-111111111111",
  concurrentPrefix: "9",
};

async function cleanup() {
  await supabaseAdmin.from("turno").delete().eq("id", IDS.x);
  await supabaseAdmin.from("turno").delete().eq("id", IDS.y);
  await supabaseAdmin.from("turno").delete().eq("id", IDS.z);
  await supabaseAdmin.from("turno").delete().eq("id", IDS.w);
  for (let i = 0; i < 10; i++) {
    await supabaseAdmin
      .from("turno")
      .delete()
      .eq("id", `9111111${i}-1111-1111-1111-11111111111${i}`);
  }
}

function insertTurno(id: string, inicio: string, fin: string, estado: "pendiente" | "confirmado" | "cancelado" = "confirmado") {
  return supabaseAdmin.from("turno").insert({
    id,
    tenant_id: TENANT_ID,
    profesional_id: PROFESIONAL_ID,
    cliente_id: CLIENTE_ID,
    inicio,
    fin,
    estado,
    precio_total: 6000.0,
  });
}

async function main() {
  await cleanup();

  // ---- Step 1: base turno X [10:00, 10:30) on 2026-09-01 ----
  const { error: xErr } = await insertTurno(IDS.x, "2026-09-01T13:00:00Z", "2026-09-01T13:30:00Z");
  if (xErr) {
    console.error("FAIL: turno base X debería insertarse sin error:", xErr.message);
    process.exit(1);
  }
  console.log("OK: turno X [13:00, 13:30) insertado.");

  // ---- Step 2: overlapping turno Y for the SAME profesional -> must be rejected ----
  const { error: yErr } = await insertTurno(IDS.y, "2026-09-01T13:15:00Z", "2026-09-01T13:45:00Z");
  if (!yErr) {
    console.error("FAIL: turno Y superpuesto debería ser rechazado por la constraint, pero se insertó.");
    process.exit(1);
  }
  if (!yErr.message.match(/exclu|conflict|overlap/i) && yErr.code !== "23P01") {
    console.error(`FAIL: turno Y fue rechazado pero no por la exclusion constraint esperada. code=${yErr.code} message=${yErr.message}`);
    process.exit(1);
  }
  console.log(`OK: turno Y superpuesto rechazado por la DB (code=${yErr.code}).`);

  // ---- Step 3: boundary-touching turno Z, inicio == fin of X -> must succeed (D-11) ----
  const { error: zErr } = await insertTurno(IDS.z, "2026-09-01T13:30:00Z", "2026-09-01T14:00:00Z");
  if (zErr) {
    console.error("FAIL: turno Z que toca el borde de X (D-11, sin buffer) debería aceptarse:", zErr.message);
    process.exit(1);
  }
  console.log("OK: turno Z [13:30, 14:00) que toca el borde de X fue aceptado (D-11).");

  // ---- Step 4: cancel X, then overlapping turno W must succeed (D-10) ----
  const { error: cancelErr } = await supabaseAdmin
    .from("turno")
    .update({ estado: "cancelado" })
    .eq("id", IDS.x);
  if (cancelErr) {
    console.error("FAIL: no se pudo cancelar turno X:", cancelErr.message);
    process.exit(1);
  }

  const { error: wErr } = await insertTurno(IDS.w, "2026-09-01T13:00:00Z", "2026-09-01T13:30:00Z");
  if (wErr) {
    console.error("FAIL: turno W debería aceptarse tras cancelar X (D-10, cancelado libera el slot):", wErr.message);
    process.exit(1);
  }
  console.log("OK: tras cancelar X, turno W superpuesto al horario original fue aceptado (D-10).");

  // ---- Step 5: concurrency smoke — N concurrent overlapping inserts, exactly 1 succeeds ----
  const N = 8;
  const concurrentSlot = { inicio: "2026-09-02T13:00:00Z", fin: "2026-09-02T13:30:00Z" };
  const concurrentIds = Array.from({ length: N }, (_, i) => `9111111${i}-1111-1111-1111-11111111111${i}`);

  const results = await Promise.allSettled(
    concurrentIds.map((id) => insertTurno(id, concurrentSlot.inicio, concurrentSlot.fin)),
  );

  const successes = results.filter(
    (r) => r.status === "fulfilled" && !(r.value as { error: unknown }).error,
  );

  if (successes.length !== 1) {
    console.error(
      `FAIL: se esperaba exactamente 1 insert exitoso de ${N} concurrentes superpuestos, se obtuvieron ${successes.length}.`,
    );
    process.exit(1);
  }
  console.log(`OK: de ${N} inserts concurrentes superpuestos, exactamente 1 tuvo éxito (concurrency smoke).`);

  await cleanup();

  console.log("\nverify-double-booking.ts: PASSED");
}

main().catch(async (err) => {
  console.error("ERROR inesperado en verify-double-booking.ts:", err);
  await cleanup();
  process.exit(1);
});
