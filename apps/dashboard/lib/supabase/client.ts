/**
 * lib/supabase/client.ts — cliente Supabase para Client Components
 * (RLS, anon key). Uso previsto: el form de login (signIn se invoca como
 * Server Action, pero cualquier widget puramente client-interactivo que
 * necesite el cliente de browser lo obtiene de acá) y, en fases futuras,
 * cualquier componente client-side que necesite reaccionar a
 * onAuthStateChange en tiempo real.
 *
 * La anon key es segura para exponer en el bundle del browser: nunca
 * bypassa RLS.
 *
 * Fuente: patrón oficial `@supabase/ssr` `createBrowserClient`
 * (02-RESEARCH.md Pattern 1).
 */
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@turnosbot/db-types";

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
