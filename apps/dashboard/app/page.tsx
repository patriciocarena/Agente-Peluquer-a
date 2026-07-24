import { redirect } from "next/navigation";

/**
 * Landing raíz. El middleware (middleware.ts) garantiza que solo un owner
 * autenticado llega hasta acá: sin sesión -> /login; superadmin -> /admin.
 * Por eso la raíz redirige directo a la grilla de turnos en vez de renderizar
 * una página vacía (evita el aterrizaje en blanco tras el login del owner).
 */
export default function Home() {
  redirect("/turnos");
}
