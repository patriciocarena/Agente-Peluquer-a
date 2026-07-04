/**
 * app/actions/negocio-activo.ts — Server Action que persiste el negocio
 * activo (D-13) elegido en `components/negocio-selector.tsx`.
 *
 * NO estaba en el `files_modified` original del plan 02-04 (Task 1), pero es
 * un archivo estructuralmente necesario: `lib/negocio-context.ts` solo LEE la
 * cookie (no puede escribirla desde un Server Component), y el selector es un
 * Client Component que necesita una Server Action real ("use server" a nivel
 * de módulo) para poder importarla — no alcanza con una función inline.
 * Documentado como deviation (Rule 3 — blocking issue) en el Summary.
 *
 * Doble validación server-side de que el negocio_id pertenece al tenant del
 * owner (T-02-10): además de que RLS ya scopea la query, se vuelve a
 * verificar acá antes de escribir la cookie, para que un id ajeno ni
 * siquiera llegue a persistirse (no-op silencioso, no rompe la sesión).
 */
"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { NEGOCIO_ACTIVO_COOKIE } from "@/lib/negocio-context";

const NEGOCIO_ACTIVO_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 año

export async function setNegocioActivo(negocioId: string): Promise<void> {
  const supabase = await createClient();

  const { data: negocio, error } = await supabase
    .from("negocio")
    .select("id")
    .eq("id", negocioId)
    .single();

  if (error || !negocio) {
    // id ajeno o inexistente (manipulación de cookie/URL): no-op silencioso,
    // nunca se persiste un negocio que no pertenezca al tenant del owner.
    return;
  }

  const cookieStore = await cookies();
  cookieStore.set(NEGOCIO_ACTIVO_COOKIE, negocio.id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: NEGOCIO_ACTIVO_COOKIE_MAX_AGE,
  });

  revalidatePath("/", "layout");
}
