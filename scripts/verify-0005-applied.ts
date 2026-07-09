/**
 * verify-0005-applied.ts (07-01, Task 2 — verificación post-migración vía REST)
 *
 * Confirma, contra bdgufnitakelyialjoqg por PostgREST (service_role), que la
 * migración 0005 quedó aplicada:
 *   1. negocio.whatsapp_token fue DROPEADA (select a esa col debe fallar).
 *   2. negocio.whatsapp_token_secret_id EXISTE (select ok).
 *   3. public.get_whatsapp_token(uuid) existe y ejecuta (rpc ok) — al ser la
 *      transacción atómica, esto prueba que TODO el 0005 commiteó (incluido el
 *      wrapper set_whatsapp_token_secret y la extensión Vault).
 *
 * Run: node --env-file=.env --import tsx scripts/verify-0005-applied.ts
 */
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_URL.includes("bdgufnitakelyialjoqg")) {
  console.error("SUPABASE_URL ausente o no apunta a bdgufnitakelyialjoqg. Abortando.");
  process.exit(1);
}
if (!SERVICE_ROLE_KEY) {
  console.error("FALTA SUPABASE_SERVICE_ROLE_KEY. Abortando.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

let ok = true;
const mark = (pass: boolean, msg: string) => {
  console.log(`${pass ? "✅" : "🛑"} ${msg}`);
  if (!pass) ok = false;
};

// 1. whatsapp_token debe estar dropeada.
{
  const { error } = await supabase.from("negocio").select("whatsapp_token").limit(1);
  mark(!!error, `whatsapp_token dropeada (select falla): ${error?.message ?? "SELECT AÚN FUNCIONA (col presente)"}`);
}

// 2. whatsapp_token_secret_id debe existir.
{
  const { error } = await supabase
    .from("negocio")
    .select("id, whatsapp_token_secret_id")
    .limit(1);
  mark(!error, `whatsapp_token_secret_id existe (select ok): ${error?.message ?? "ok"}`);
}

// 3. get_whatsapp_token existe y ejecuta.
{
  const { data: negocios } = await supabase.from("negocio").select("id").limit(1);
  const negId = negocios?.[0]?.id;
  if (!negId) {
    mark(false, "No hay negocios para probar el rpc get_whatsapp_token");
  } else {
    const { error } = await supabase.rpc("get_whatsapp_token", { p_negocio_id: negId });
    mark(!error, `rpc get_whatsapp_token ejecuta: ${error?.message ?? "ok (devolvió null, esperado sin secreto)"}`);
  }
}

console.log(ok ? "\n✅ 0005 verificada." : "\n🛑 0005 NO verificada — ver arriba.");
process.exit(ok ? 0 : 1);
