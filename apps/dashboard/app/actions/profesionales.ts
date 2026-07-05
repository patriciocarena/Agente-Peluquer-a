/**
 * app/actions/profesionales.ts — Server Actions de Profesionales (PRO-01).
 *
 * Todas re-validan con `profesionalSchema` server-side (la validación
 * client-side del form es solo UX, bypasseable — 02-RESEARCH.md
 * Anti-Patterns) y derivan el `negocio_id` SIEMPRE de `getNegocioActivo()`
 * (contexto server-side), NUNCA de un campo del form (T-02-16: mismo
 * anti-pattern que `app/actions/negocio.ts`). El cliente Supabase usado acá
 * es el RLS-scoped (`lib/supabase/server.ts`, anon key + JWT del owner) —
 * nunca el service_role de `lib/supabase/admin.ts` (02-RESEARCH.md Pitfall
 * 4) — así que un `negocio_id` ajeno tampoco podría matchear ninguna fila
 * aunque algo más arriba fallara (defensa en profundidad).
 *
 * `toggleProfesionalActivo` se agrega primero (Task 2, deviation Rule 3):
 * `components/profesionales-table.tsx` necesita esta action para el Switch
 * de soft-delete antes de que Task 3 complete el resto del CRUD — sin esto,
 * Task 2 no compila (`tsc --noEmit` fallaría por el import inexistente).
 * `createProfesional`/`updateProfesional` se agregan en Task 3 en este mismo
 * archivo.
 *
 * Deja el archivo preparado para que 02-07 agregue las actions de horario
 * semanal (PRO-02) y la matriz de servicios/precio custom (PRO-03/04).
 */
"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/require-role";
import { getNegocioActivo } from "@/lib/negocio-context";
import { createClient } from "@/lib/supabase/server";

const GENERIC_ERROR = "No pudimos completar la operación. Intentá de nuevo.";

export type ProfesionalActionResult<T = undefined> =
  | { data: T; error?: undefined }
  | { data?: undefined; error: string };

/** PRO-01 — activar/desactivar un profesional (soft delete, Tabs/Switch). */
export async function toggleProfesionalActivo(
  profesionalId: string,
  activo: boolean,
): Promise<ProfesionalActionResult> {
  await requireRole("owner");

  const { negocio } = await getNegocioActivo();

  const supabase = await createClient();
  const { error } = await supabase
    .from("profesional")
    .update({ activo })
    .eq("id", profesionalId)
    .eq("negocio_id", negocio.id); // RLS-scoped: solo matchea si pertenece al negocio activo

  if (error) {
    return { error: GENERIC_ERROR };
  }

  revalidatePath("/profesionales");
  return { data: undefined };
}
