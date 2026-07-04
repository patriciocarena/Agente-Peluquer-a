/**
 * lib/supabase/admin.ts — cliente service_role, SOLO SERVIDOR (T-02-08).
 *
 * Este cliente BYPASSA Row Level Security por completo — misma naturaleza
 * que apps/bot/src/db/client.ts. El aislamiento cross-tenant deja de estar
 * garantizado por la DB para cualquier query hecha a través de este
 * cliente: queda 100% a cargo del código de aplicación que lo invoca.
 *
 * El ÚNICO caller sancionado en apps/dashboard es
 * `app/actions/admin-tenants.ts` (panel /admin del superadmin, Fase 2 Plan
 * 02-08 — SADMIN-01/02). Ningún archivo bajo `app/(owner)/**` ni ningún
 * Client Component debe importar este módulo (02-RESEARCH.md Pitfall 4:
 * "Mixing the RLS-scoped client and the service_role client in the same
 * file/route"). El import de `server-only` hace que cualquier intento de
 * arrastrar este módulo a un bundle de cliente rompa el BUILD, en vez de
 * depender solo de disciplina de code review.
 *
 * SUPABASE_SERVICE_ROLE_KEY NUNCA se prefija NEXT_PUBLIC_ — si alguna vez
 * ves ese prefijo agregado a esta clave, es un incidente de seguridad
 * (el secreto quedaría embebido en el bundle del browser).
 *
 * Fuente: apps/bot/src/db/client.ts (patrón de guard server-only +
 * construcción del cliente service_role) + 02-RESEARCH.md Pattern 1.
 */
import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@turnosbot/db-types";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY son obligatorias para el cliente service_role del dashboard (apps/dashboard/lib/supabase/admin.ts).",
  );
}

export function createAdminClient() {
  return createSupabaseClient<Database>(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
