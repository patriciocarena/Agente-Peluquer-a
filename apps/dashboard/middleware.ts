/**
 * middleware.ts — refresco de sesión + gate de rol (T-02-06/T-02-07,
 * AUTH-03 a nivel de ruta). Corre en cada request que matchee
 * `config.matcher`, ANTES de que cualquier Server Component/Action corra.
 *
 * Usa `supabase.auth.getUser()` (verificado por red contra el Auth server)
 * y NUNCA los métodos "getClaims"/"getSession" para este gate: es el único
 * de los tres que detecta una sesión revocada server-side
 * (perfil.activo=false, o un force-logout), crítico para el borde /admin
 * (02-RESEARCH.md Pitfall 1).
 *
 * Reglas de gate:
 *   - Sin sesión y no es /login -> redirect /login.
 *   - Sesión pero perfil.activo=false -> redirect /login?error=inactive.
 *   - Ruta /admin/* pero rol != 'superadmin' -> redirect / (nunca un
 *     404/500 que filtre la existencia de la ruta).
 *   - Ruta NO /admin pero rol == 'superadmin' (y no es /login) -> redirect
 *     /admin (el superadmin nunca ve la UI de owner, D-03).
 *
 * Fuente: 02-RESEARCH.md Pattern 2 (patrón sintetizado de
 * supabase.com/docs/guides/auth/server-side/nextjs + el modelo
 * perfil/auth_tenant_id de este proyecto).
 */
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@turnosbot/db-types";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser(); // verificado por red — no usar los métodos getClaims/getSession acá (Pitfall 1)

  const pathname = request.nextUrl.pathname;
  const isAdminRoute = pathname.startsWith("/admin");
  const isLoginRoute = pathname === "/login";

  if (!user) {
    if (!isLoginRoute) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    return response;
  }

  const { data: perfil } = await supabase
    .from("perfil")
    .select("rol, activo")
    .eq("id", user.id) // RLS (perfil_propio) ya lo restringe a id = auth.uid(); explícito por claridad.
    .single();

  if (!perfil?.activo) {
    return NextResponse.redirect(new URL("/login?error=inactive", request.url));
  }

  if (isAdminRoute && perfil.rol !== "superadmin") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (!isAdminRoute && perfil.rol === "superadmin" && !isLoginRoute) {
    return NextResponse.redirect(new URL("/admin", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|login).*)"],
};
