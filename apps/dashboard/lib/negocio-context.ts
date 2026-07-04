/**
 * lib/negocio-context.ts — ÚNICA fuente server-side del "negocio activo"
 * (D-13). Resuelve qué `negocio` de los N que puede tener el tenant del
 * owner está seleccionado para toda la sesión, leyendo una cookie y
 * validándola contra la lista de negocios que RLS (auth_tenant_id()) ya
 * scopeó al tenant del usuario autenticado.
 *
 * Ningún caller (Servicios/Profesionales/Perfil del negocio, planes 02-04..07)
 * debe resolver el negocio activo por su cuenta ni confiar en un negocio_id
 * enviado por el cliente (form field, query param sin validar, etc.) — todos
 * pasan por acá, mismo espíritu que lib/auth/require-role.ts y
 * apps/bot/src/db/tenantScoped.ts (T-02-10).
 *
 * Si la cookie no existe o referencia un negocio que no pertenece al tenant
 * (manipulación, negocio de otro tenant, id borrado), se cae de vuelta al
 * primer negocio de la lista (orden alfabético por nombre) — nunca revienta
 * la página. Si el tenant tiene un solo negocio, esa es siempre la única
 * opción posible, sin necesidad de que el owner haya elegido nada (D-13:
 * "colapsa a una etiqueta fija sin dejar de existir el concepto").
 *
 * La escritura de la cookie (persistencia de la elección del owner) vive en
 * app/actions/negocio-activo.ts (Server Action) — este módulo solo lee
 * cookies, nunca las escribe, porque Next.js prohíbe escribir cookies desde
 * un Server Component puro (ver lib/supabase/server.ts).
 */
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@turnosbot/db-types";

export const NEGOCIO_ACTIVO_COOKIE = "negocio_activo_id";

export type NegocioActivo = {
  negocio: Tables<"negocio">;
  negocios: Tables<"negocio">[];
};

export async function getNegocioActivo(): Promise<NegocioActivo> {
  const supabase = await createClient();

  // RLS (negocio_aislamiento -> auth_tenant_id()) scopea esta lista al
  // tenant del owner autenticado: no hace falta (ni se debe) filtrar acá
  // por tenant_id a mano.
  const { data: negocios, error } = await supabase
    .from("negocio")
    .select("*")
    .order("nombre", { ascending: true });

  if (error) {
    throw new Error("No pudimos cargar los negocios del tenant.");
  }

  if (!negocios || negocios.length === 0) {
    throw new Error("El tenant no tiene ningún negocio configurado.");
  }

  const cookieStore = await cookies();
  const negocioIdCookie = cookieStore.get(NEGOCIO_ACTIVO_COOKIE)?.value;

  // El id de la cookie NUNCA se confía a ciegas (T-02-10): solo es válido
  // si aparece en la lista ya scopeada por RLS al tenant propio.
  const negocioCookieValido = negocioIdCookie
    ? negocios.find((n) => n.id === negocioIdCookie)
    : undefined;

  const negocio = negocioCookieValido ?? negocios[0];

  return { negocio, negocios };
}
