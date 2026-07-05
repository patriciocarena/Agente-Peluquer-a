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
 * `toggleProfesionalActivo` se agregó primero (Task 2, deviation Rule 3):
 * `components/profesionales-table.tsx` necesitaba esta action para el
 * Switch de soft-delete antes de que este Task 3 completara el resto del
 * CRUD. `createProfesional`/`updateProfesional` (Task 3) re-validan con el
 * mismo `profesionalSchema` usado por `components/profesional-form.tsx`.
 *
 * Deja el archivo preparado para que 02-07 agregue las actions de horario
 * semanal (PRO-02) y la matriz de servicios/precio custom (PRO-03/04).
 */
"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/require-role";
import { getNegocioActivo } from "@/lib/negocio-context";
import { createClient } from "@/lib/supabase/server";
import { profesionalSchema, type ProfesionalInput } from "@/lib/schemas/profesional";

const SAVE_ERROR_COPY =
  "No pudimos guardar los cambios. Revisá los datos marcados e intentá de nuevo.";
const GENERIC_ERROR = "No pudimos completar la operación. Intentá de nuevo.";

export type ProfesionalActionResult<T = undefined> =
  | { data: T; error?: undefined }
  | { data?: undefined; error: string };

/** PRO-01 — crear un profesional (datos generales) del negocio activo. */
export async function createProfesional(
  input: ProfesionalInput,
): Promise<ProfesionalActionResult<{ profesionalId: string }>> {
  await requireRole("owner");

  const parsed = profesionalSchema.safeParse(input);
  if (!parsed.success) {
    return { error: SAVE_ERROR_COPY };
  }

  // negocio_id derivado del contexto server-side — nunca de `input` (T-02-16).
  const { negocio } = await getNegocioActivo();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profesional")
    .insert({
      negocio_id: negocio.id,
      nombre: parsed.data.nombre,
      activo: parsed.data.activo,
    })
    .select()
    .single();

  if (error || !data) {
    return { error: SAVE_ERROR_COPY };
  }

  revalidatePath("/profesionales");
  return { data: { profesionalId: data.id } };
}

/** PRO-01 — editar datos generales (nombre/activo) de un profesional existente. */
export async function updateProfesional(
  profesionalId: string,
  input: ProfesionalInput,
): Promise<ProfesionalActionResult> {
  await requireRole("owner");

  const parsed = profesionalSchema.safeParse(input);
  if (!parsed.success) {
    return { error: SAVE_ERROR_COPY };
  }

  // negocio_id derivado del contexto server-side, usado como filtro extra
  // (defensa en profundidad) además del propio RLS (T-02-16).
  const { negocio } = await getNegocioActivo();

  const supabase = await createClient();
  const { error } = await supabase
    .from("profesional")
    .update({
      nombre: parsed.data.nombre,
      activo: parsed.data.activo,
    })
    .eq("id", profesionalId)
    .eq("negocio_id", negocio.id); // RLS-scoped: solo matchea si pertenece al negocio activo

  if (error) {
    return { error: SAVE_ERROR_COPY };
  }

  revalidatePath("/profesionales");
  return { data: undefined };
}

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
