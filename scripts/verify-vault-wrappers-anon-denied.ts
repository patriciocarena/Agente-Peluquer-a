/**
 * verify-vault-wrappers-anon-denied.ts (07-SECURITY, regresión de T-07-01/T-07-02)
 *
 * Prueba que la anon key NO puede ejecutar los wrappers Vault (ni set_ ni get_).
 * Es la regresión permanente del fix de 0006. Read-only respecto a datos de
 * negocio (no setea secretos): solo intenta ejecutar y espera RECHAZO.
 *
 *   exit 0  → anon RECHAZADO en ambos wrappers (fix OK).
 *   exit 1  → anon PUDO ejecutar alguno (agujero abierto).
 *
 * Targets ONLY bdgufnitakelyialjoqg. Run:
 *   node --env-file=.env --import tsx scripts/verify-vault-wrappers-anon-denied.ts
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !url.includes("bdgufnitakelyialjoqg")) {
  console.error("SUPABASE_URL ausente o no apunta a bdgufnitakelyialjoqg. Abortando.");
  process.exit(1);
}
if (!anon) {
  console.error("FALTA NEXT_PUBLIC_SUPABASE_ANON_KEY en .env. Abortando.");
  process.exit(1);
}

const pub = createClient(url, anon, { auth: { persistSession: false } });
const NEG = "21111111-1111-1111-1111-111111111111"; // TENANT_A seed negocio

let ok = true;
const mark = (denied: boolean, label: string, detail: string) => {
  console.log(`${denied ? "✅" : "🚨"} ${label}: ${denied ? "RECHAZADO" : "EJECUTÓ (AGUJERO)"} — ${detail}`);
  if (!denied) ok = false;
};

// get_whatsapp_token: debe fallar por permisos.
{
  const { data, error } = await pub.rpc("get_whatsapp_token", { p_negocio_id: NEG });
  mark(!!error, "anon get_whatsapp_token", error ? error.message.slice(0, 80) : `devolvió ${JSON.stringify(data)}`);
}

// set_whatsapp_token_secret: debe fallar por permisos ANTES de crear ningún secreto.
{
  const { data, error } = await pub.rpc("set_whatsapp_token_secret", {
    p_negocio_id: NEG,
    p_token: "anon-should-be-denied",
    p_name: "anon-denied-probe",
  });
  mark(!!error, "anon set_whatsapp_token_secret", error ? error.message.slice(0, 80) : `creó secreto ${JSON.stringify(data)}`);
}

if (ok) {
  console.log("\n✅ verify-vault-wrappers-anon-denied.ts: PASSED — anon no puede tocar Vault.");
  process.exit(0);
} else {
  console.error("\n🚨 FAILED — anon todavía puede ejecutar un wrapper Vault. Aplicar 0006.");
  process.exit(1);
}
