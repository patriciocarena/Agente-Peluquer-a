/**
 * apps/bot/src/whatsapp/getWhatsappToken.ts — D-04 choke point
 *
 * D-04 choke point: today reads the plaintext negocio.whatsapp_token column
 * (or WHATSAPP_DEV_TOKEN env override in dev). Phase 7 (SEC-01) replaces the
 * BODY of this function with a Vault/AES-GCM decrypt — no call site changes.
 * TODO(SEC-01, Phase 7): plaintext-in-DB is a documented, ticketed interim risk.
 *
 * NOTE: this file intentionally reads `negocio` BY ITS OWN PRIMARY KEY (`id`),
 * NOT via `negocioScoped(negocioId).negocio()`. That accessor (see
 * ../db/negocioScoped.ts) filters by `.eq('tenant_id', negocioId)` — the
 * wrong axis for "give me this negocio's own row by its own id". The
 * `negocioId` received here is always the DB-resolved negocio id produced by
 * tenant resolution upstream (never raw client input), so a direct
 * `supabaseAdmin.from("negocio").eq("id", negocioId)` read is single-tenant-safe.
 */
import { loadEnv } from "../config/env.js";
import { supabaseAdmin } from "../db/client.js";

export async function getWhatsappToken(negocioId: string): Promise<string> {
  const env = loadEnv();
  if (env.WHATSAPP_DEV_TOKEN) return env.WHATSAPP_DEV_TOKEN;

  const { data, error } = await supabaseAdmin
    .from("negocio")
    .select("whatsapp_token")
    .eq("id", negocioId)
    .single();

  if (error || !data?.whatsapp_token) {
    throw new Error(`No whatsapp_token found for negocioId=${negocioId}`);
  }
  return data.whatsapp_token;
}

export async function getPhoneNumberId(negocioId: string): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("negocio")
    .select("whatsapp_phone_number_id")
    .eq("id", negocioId)
    .single();

  if (error || !data?.whatsapp_phone_number_id) {
    throw new Error(`No whatsapp_phone_number_id found for negocioId=${negocioId}`);
  }
  return data.whatsapp_phone_number_id;
}
