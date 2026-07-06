/**
 * Single env-access point for apps/bot.
 *
 * Reads the fixed env var names defined in .env.example. None of these are
 * required at boot for the health-check skeleton in this phase — real
 * validation (throwing on missing required vars) is wired in later phases
 * once the bot actually needs Supabase/Gemini/WhatsApp credentials.
 */

export interface BotEnv {
  PORT: number;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SUPABASE_DB_URL?: string;
  GOOGLE_GENERATIVE_AI_API_KEY?: string;
  /** Meta App Secret — HMAC-SHA256 sobre el body crudo del webhook (D-06). */
  WHATSAPP_APP_SECRET?: string;
  /** Token propio para el handshake GET hub.verify_token (D-05). */
  WHATSAPP_VERIFY_TOKEN?: string;
  /**
   * Gate de envío saliente (D-01): `false` (default) mockea el POST a Graph
   * API y loguea la request en vez de pegarle a graph.facebook.com; `true`
   * pega a la API real. Solo la literal string "true" activa el modo live.
   */
  WHATSAPP_LIVE: boolean;
  /**
   * Versión de la Graph API de Meta — un único env var overrideable, nunca
   * hardcodeada en los call sites (05-RESEARCH.md Open Question 1). NO
   * confundir con la regla de puerto 5432 de Postgres/pg-boss: no aplica acá.
   */
  WHATSAPP_GRAPH_API_VERSION: string;
  /** Token dev-only override, consumido solo por getWhatsappToken (D-04). */
  WHATSAPP_DEV_TOKEN?: string;
}

export function loadEnv(): BotEnv {
  return {
    PORT: Number(process.env.PORT ?? 3001),
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_DB_URL: process.env.SUPABASE_DB_URL,
    GOOGLE_GENERATIVE_AI_API_KEY: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    WHATSAPP_APP_SECRET: process.env.WHATSAPP_APP_SECRET,
    WHATSAPP_VERIFY_TOKEN: process.env.WHATSAPP_VERIFY_TOKEN,
    WHATSAPP_LIVE: process.env.WHATSAPP_LIVE === "true",
    WHATSAPP_GRAPH_API_VERSION: process.env.WHATSAPP_GRAPH_API_VERSION ?? "v23.0",
    WHATSAPP_DEV_TOKEN: process.env.WHATSAPP_DEV_TOKEN,
  };
}
