/**
 * sanity-whatsapp-token-predrop.ts (07-01, Task 2 checkpoint — pre-DROP guard)
 *
 * Read-only. Confirma la premisa de la migración 0005: que
 * `negocio.whatsapp_token` es NULL en TODA fila antes de dropear la columna.
 *
 *   SELECT count(*) FILTER (WHERE whatsapp_token IS NOT NULL) AS con_token,
 *          count(*)                                          AS total
 *     FROM negocio;
 *
 * Se espera con_token = 0. Si con_token > 0 hay tokens reales y NO se debe
 * aplicar 0005 (se perderían) — escalar.
 *
 * Targets ONLY bdgufnitakelyialjoqg. Run via:
 *   pnpm exec tsx --env-file=.env scripts/sanity-whatsapp-token-predrop.ts
 */
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) {
  console.error("FALTA SUPABASE_URL en .env — abortando.");
  process.exit(1);
}
if (!SUPABASE_URL.includes("bdgufnitakelyialjoqg")) {
  console.error(
    `SUPABASE_URL no apunta al proyecto TurnosBot (bdgufnitakelyialjoqg). Abortando.`,
  );
  process.exit(1);
}
if (!SERVICE_ROLE_KEY) {
  console.error("FALTA SUPABASE_SERVICE_ROLE_KEY en .env — abortando.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data, error, count } = await supabase
  .from("negocio")
  .select("id, whatsapp_token", { count: "exact" });

if (error) {
  console.error("Error consultando negocio:", error.message);
  process.exit(1);
}

const rows = data ?? [];
const total = count ?? rows.length;
const conToken = rows.filter(
  (r) => (r as { whatsapp_token: string | null }).whatsapp_token != null,
).length;

console.log(`total negocios:        ${total}`);
console.log(`con whatsapp_token !=null: ${conToken}`);

if (conToken === 0) {
  console.log("\n✅ SANITY OK — con_token = 0. Seguro aplicar 0005 (DROP COLUMN).");
  process.exit(0);
} else {
  console.error(
    `\n🛑 SANITY FALLA — hay ${conToken} negocio(s) con token real. NO aplicar 0005. Escalar.`,
  );
  process.exit(2);
}
