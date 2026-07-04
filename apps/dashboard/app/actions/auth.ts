/**
 * app/actions/auth.ts — Server Actions signIn/signOut (AUTH-01/02/04).
 *
 * `signIn` re-valida con el mismo schema zod que usa el form client-side
 * (lib/schemas/auth.ts) — la validación client-side es solo UX, esta
 * re-validación server-side es la que realmente importa (02-RESEARCH.md
 * Anti-Patterns: "la validación client-side es bypasseable"). En fallo
 * (validación o credenciales) devuelve el copy exacto de error de la
 * UI-SPEC, sin distinguir "no existe el email" de "contraseña incorrecta"
 * (evita enumeración de usuarios).
 *
 * `signOut` cierra la sesión Supabase y redirige a /login — se invoca
 * desde el user-menu del topbar (AUTH-04), que se cablea en el shell del
 * owner (Fase 2 Plan 02-04); esta Server Action ya queda lista para eso.
 */
"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signInSchema, type SignInInput } from "@/lib/schemas/auth";

const LOGIN_ERROR_COPY = "Email o contraseña incorrectos. Probá de nuevo.";

export type SignInResult = { error: string } | undefined;

export async function signIn(input: SignInInput): Promise<SignInResult> {
  const parsed = signInSchema.safeParse(input);
  if (!parsed.success) {
    return { error: LOGIN_ERROR_COPY };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    return { error: LOGIN_ERROR_COPY };
  }

  redirect("/");
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
