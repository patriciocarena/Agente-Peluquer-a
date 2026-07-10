/**
 * verify-vault-no-plaintext.ts (SEC-01 Success Criterion #1, T-07-02/T-07-01,
 * 07-03-PLAN.md, verificación live GATED — NO se ejecuta como parte del plan)
 *
 * Prueba en vivo, contra `bdgufnitakelyialjoqg`, que el token de acceso de
 * WhatsApp de un negocio está encriptado en reposo (D-02 d) y que el bot
 * puede resolverlo de verdad vía el camino Vault:
 *
 *   1. Un SELECT directo a `negocio` NO expone ningún token en claro — la
 *      migración 0005 dropeó la columna plana `whatsapp_token`; la fila solo
 *      debe traer `whatsapp_token_secret_id`.
 *   2. `set_whatsapp_token_secret` (RPC SECURITY DEFINER) setea un secreto de
 *      prueba para el negocio y devuelve un uuid.
 *   3. Con `WHATSAPP_DEV_TOKEN` unset (Pitfall 5, 07-RESEARCH.md — si no se
 *      borra, el short-circuit de dev de `getWhatsappToken` devuelve el
 *      token de dev y el chequeo no prueba nada), `getWhatsappToken` resuelve
 *      el valor real vía el RPC `get_whatsapp_token`, que descifra desde
 *      `vault.decrypted_secrets` del lado de la DB.
 *   4. Limpieza: `negocio.whatsapp_token_secret_id` vuelve a NULL para no
 *      dejar estado.
 *
 * Targets ONLY bdgufnitakelyialjoqg (service_role). Requiere `.env` con
 * SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY. Run via:
 *   node --env-file=.env --import tsx scripts/verify-vault-no-plaintext.ts
 * (pnpm no está en PATH en algunos entornos de ejecución; tsx no autocarga
 * .env — usar la invocación de arriba, no `pnpm exec tsx ...`).
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
// Guard de aislamiento verbatim (CLAUDE.md, regla dura) — NUNCA tocar ningún
// otro proyecto Supabase (de otro producto o cliente) que no sea TurnosBot.
if (!SUPABASE_URL.includes("bdgufnitakelyialjoqg")) {
  console.error(`SUPABASE_URL no apunta al proyecto TurnosBot. Abortando.`);
  process.exit(1);
}

const supabaseAdmin = createClient<Database>(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const NEGOCIO_ID = TENANT_A.negocioId;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

async function cleanup() {
  await supabaseAdmin.from("negocio").update({ whatsapp_token_secret_id: null }).eq("id", NEGOCIO_ID);
}

async function main() {
  // Pitfall 5 (07-RESEARCH.md): borrar WHATSAPP_DEV_TOKEN ANTES de importar
  // getWhatsappToken.ts — si quedara seteado, su short-circuit de dev
  // devolvería ese valor y el chequeo del camino Vault no probaría nada.
  delete process.env.WHATSAPP_DEV_TOKEN;

  // Import dinámico DESPUÉS del delete de arriba, para que loadEnv() (que
  // corre en el módulo de config al importarse) nunca vea la env var.
  const { getWhatsappToken } = await import("../apps/bot/src/whatsapp/getWhatsappToken.js");

  await cleanup();

  // --- 1. No-plaintext: SELECT directo a negocio no expone token en claro --
  const { data: negocioRow, error: negocioErr } = await supabaseAdmin
    .from("negocio")
    .select("*")
    .eq("id", NEGOCIO_ID)
    .single();
  assert(!negocioErr && !!negocioRow, `no se pudo leer el negocio de prueba: ${negocioErr?.message}`);

  const negocioKeys = Object.keys(negocioRow as Record<string, unknown>);
  assert(
    negocioKeys.includes("whatsapp_token_secret_id"),
    "la fila de negocio no trae whatsapp_token_secret_id — ¿se aplicó la migración 0005?",
  );
  assert(
    !negocioKeys.includes("whatsapp_token"),
    "la fila de negocio expone la columna plana whatsapp_token -- FUGA DE TOKEN EN CLARO (0005 no dropeó la columna).",
  );
  console.log("OK: el SELECT directo a negocio no expone ningún token en claro (solo whatsapp_token_secret_id).");

  // --- 2. Seed del secreto vía RPC set_whatsapp_token_secret ---------------
  const testToken = `verify-vault-test-token-${Date.now()}`;
  const { data: secretId, error: setErr } = await supabaseAdmin.rpc("set_whatsapp_token_secret", {
    p_negocio_id: NEGOCIO_ID,
    p_token: testToken,
    p_name: `whatsapp-token-verify-${Date.now()}`,
  });
  assert(!setErr && !!secretId, `set_whatsapp_token_secret no devolvió un uuid: ${setErr?.message}`);
  console.log(`OK: set_whatsapp_token_secret devolvió un uuid de secret (${secretId}).`);

  // --- 3. Resolución vía Vault: getWhatsappToken debe traer el valor real -
  const resolved = await getWhatsappToken(NEGOCIO_ID);
  assert(
    resolved === testToken,
    `getWhatsappToken no resolvió el token de prueba vía Vault. Esperado "${testToken}", obtenido "${resolved}".`,
  );
  console.log("OK: getWhatsappToken resolvió el token real vía Vault (RPC get_whatsapp_token), con WHATSAPP_DEV_TOKEN unset.");

  // --- 4. Cleanup: dejar whatsapp_token_secret_id en NULL de nuevo --------
  await cleanup();
  console.log("OK: whatsapp_token_secret_id vuelto a NULL para el negocio de prueba.");

  console.log("\nverify-vault-no-plaintext.ts: PASSED");
}

main().catch(async (err) => {
  console.error("ERROR inesperado en verify-vault-no-plaintext.ts:", err);
  await cleanup();
  process.exit(1);
});
