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
}

export function loadEnv(): BotEnv {
  return {
    PORT: Number(process.env.PORT ?? 3001),
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_DB_URL: process.env.SUPABASE_DB_URL,
    GOOGLE_GENERATIVE_AI_API_KEY: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  };
}
