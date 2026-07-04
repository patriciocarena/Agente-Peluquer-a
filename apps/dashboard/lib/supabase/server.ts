/**
 * lib/supabase/server.ts — cliente Supabase para Server Components/Actions
 * (RLS, anon key + cookies del usuario autenticado).
 *
 * Este es el cliente que usa TODO el código owner-facing del dashboard: la
 * anon key nunca bypassa RLS, así que el aislamiento cross-tenant (AUTH-03)
 * queda enforced por la DB (auth_negocio_ids() / auth_tenant_id(), Fase 1 +
 * migración 0003) para cualquier query hecha a través de este cliente — no
 * hace falta (ni se debe) filtrar manualmente por tenant_id/negocio_id acá.
 *
 * `cookies()` es async en Next.js 15+/16 — por eso este factory es async.
 * El `setAll` puede fallar cuando se invoca desde un Server Component puro
 * (no puede escribir cookies); se ignora ese caso porque el middleware
 * (../../middleware.ts) ya refresca la sesión y propaga el Set-Cookie en
 * cada request.
 *
 * Fuente: patrón oficial supabase.com/docs/guides/auth/server-side/creating-a-client
 * (02-RESEARCH.md Pattern 1).
 */
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@turnosbot/db-types";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // setAll llamado desde un Server Component — no puede escribir
            // cookies. Seguro de ignorar porque middleware.ts ya refresca
            // la sesión y propaga el Set-Cookie en cada request.
          }
        },
      },
    },
  );
}
