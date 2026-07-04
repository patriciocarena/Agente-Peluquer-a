/**
 * lib/schemas/auth.ts — schema zod compartido entre el form de login
 * (react-hook-form + zodResolver, UX client-side) y la Server Action
 * `signIn` (fuente de verdad, re-validación server-side) — AUTH-01.
 *
 * Fuente: 02-RESEARCH.md "Zod schema shared between react-hook-form and a
 * Server Action" (zod v4, ya project-locked).
 */
import { z } from "zod";

export const signInSchema = z.object({
  email: z.email("Ingresá un email válido."),
  password: z.string().min(1, "La contraseña es obligatoria."),
});

export type SignInInput = z.infer<typeof signInSchema>;
