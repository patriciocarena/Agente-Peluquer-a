/**
 * apps/bot/src/whatsapp/getWhatsappToken.ts — D-04 choke point
 *
 * D-04 choke point: resuelve el token de larga duración de la WhatsApp Cloud
 * API por negocio (o WHATSAPP_DEV_TOKEN env override en dev). SEC-01 (Phase
 * 7, migración 0005) ya está vivo: el token NUNCA se lee de una columna en
 * claro — el único camino sancionado es el wrapper SECURITY DEFINER
 * `get_whatsapp_token(p_negocio_id)`, que decripta desde Supabase Vault
 * (`vault.secrets`) del lado de la DB. La columna `negocio.whatsapp_token`
 * fue dropeada por 0005 y reemplazada por `negocio.whatsapp_token_secret_id`.
 *
 * NOTE: la resolución sigue siendo por el `id` propio del negocio (no por
 * `negocioScoped(negocioId).negocio()`, que filtra por `tenant_id` — eje
 * equivocado acá). El `negocioId` recibido acá es siempre el id
 * DB-resuelto producido por la resolución de tenant upstream (nunca input
 * crudo de cliente), así que invocar el RPC con ese id es single-tenant-safe.
 */
import { loadEnv } from "../config/env.js";
import { supabaseAdmin } from "../db/client.js";

export async function getWhatsappToken(negocioId: string): Promise<string> {
  const env = loadEnv();
  if (env.WHATSAPP_DEV_TOKEN) return env.WHATSAPP_DEV_TOKEN;

  const { data, error } = await supabaseAdmin.rpc("get_whatsapp_token", {
    p_negocio_id: negocioId,
  });

  if (error || !data) {
    throw new Error(`No whatsapp_token found for negocioId=${negocioId}`);
  }
  return data;
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
