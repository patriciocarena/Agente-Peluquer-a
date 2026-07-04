/**
 * apps/bot/src/db/client.ts — service-role Supabase client (CORE-03, Pattern 3)
 *
 * SERVER-ONLY. This client is constructed with SUPABASE_SERVICE_ROLE_KEY,
 * which BYPASSES Row Level Security entirely (Supabase design — see
 * PITFALLS.md Pitfall 7). It must NEVER be imported by, or its key exposed
 * to, any browser-reachable code (apps/dashboard client components, any
 * NEXT_PUBLIC_* bundle). It belongs exclusively to this bot service's
 * server-side process.
 *
 * Because service_role bypasses RLS, tenant isolation for every query made
 * through this client is enforced ONLY in application code — never rely on
 * `supabaseAdmin.from(...)` directly for tenant-scoped tables. Always go
 * through `tenantScoped(tenantId)` (./tenantScoped.ts), which bakes the
 * `.eq('tenant_id', tenantId)` filter into every accessor so it is
 * impossible to forget.
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@turnosbot/db-types";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY son obligatorias para el cliente service_role del bot (apps/bot/src/db/client.ts).",
  );
}

// server-only: never import this module from apps/dashboard client code or
// any NEXT_PUBLIC_* bundle.
export const supabaseAdmin = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
