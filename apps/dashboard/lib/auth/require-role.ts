/**
 * lib/auth/require-role.ts — único lugar del dashboard que lee
 * perfil.rol/activo para decidir acceso (T-02-06/T-02-07).
 *
 * Mirrorea la filosofía de apps/bot/src/db/tenantScoped.ts — "el mistake de
 * saltear el chequeo se vuelve estructuralmente imposible, no una cuestión
 * de disciplina de code review": ningún Server Component/Action debe leer
 * `perfil.rol`/`perfil.activo` por su cuenta; todos pasan por acá.
 *
 * `middleware.ts` ya hace este mismo gate a nivel de RUTA en cada request
 * (redirige antes de que el Server Component/Action siquiera corra). Este
 * helper es la capa de defensa en profundidad para Server
 * Components/Actions individuales — belt-and-suspenders, no un reemplazo
 * del middleware (02-RESEARCH.md Pattern 2 + Anti-Patterns).
 *
 * Usa `.single()` sobre `perfil` filtrado explícitamente por
 * `id = auth.uid()` — RLS (`perfil_propio`, Fase 1) ya restringe la fila a
 * la propia, el `.eq()` es explícito por claridad y defensa en profundidad.
 */
import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Rol = "owner" | "superadmin";

export type PerfilAutenticado = {
  userId: string;
  rol: Rol;
  tenantId: string | null;
  email: string;
};

/**
 * requireRole(rol) — exige que el usuario autenticado tenga exactamente el
 * rol pedido y esté activo. Si no hay sesión, si el perfil no existe, si
 * está desactivado, o si el rol no coincide, redirige (nunca devuelve un
 * valor "vacío" que el caller pueda ignorar por error).
 */
export async function requireRole(rol: Rol): Promise<PerfilAutenticado> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: perfil, error } = await supabase
    .from("perfil")
    .select("rol, activo, tenant_id")
    .eq("id", user.id)
    .single();

  if (error || !perfil) {
    redirect("/login");
  }

  if (!perfil.activo) {
    redirect("/login?error=inactive");
  }

  if (perfil.rol !== rol) {
    redirect(perfil.rol === "superadmin" ? "/admin" : "/");
  }

  return { userId: user.id, rol, tenantId: perfil.tenant_id, email: user.email ?? "" };
}
