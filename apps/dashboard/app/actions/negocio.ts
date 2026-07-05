/**
 * app/actions/negocio.ts — Server Action `updateNegocio` (BIZ-01/03).
 *
 * Re-valida con `negocioSchema` server-side (la validación client-side del
 * form es solo UX, bypasseable — 02-RESEARCH.md Anti-Patterns) y deriva el
 * `negocio_id` SIEMPRE de `getNegocioActivo()` (contexto server-side),
 * NUNCA de un campo del form (T-02-11: el anti-pattern explícito de
 * 02-RESEARCH.md es un negocio_id oculto en el form; acá ni siquiera se
 * acepta como parámetro). El `.update()` además va scoped por RLS
 * (`negocio_aislamiento` -> auth_tenant_id()), así que un id ajeno nunca
 * podría matchear ninguna fila aunque algo más arriba fallara (T-02-10,
 * defensa en profundidad).
 *
 * `requireRole("owner")` es la misma capa de defensa en profundidad que ya
 * usa el resto del dashboard (middleware.ts gatea a nivel de ruta; esto
 * gatea a nivel de Server Action individual).
 */
"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/require-role";
import { getNegocioActivo } from "@/lib/negocio-context";
import { createClient } from "@/lib/supabase/server";
import { negocioSchema, type NegocioInput } from "@/lib/schemas/negocio";

const SAVE_ERROR_COPY =
  "No pudimos guardar los cambios. Revisá los datos marcados e intentá de nuevo.";

export type UpdateNegocioResult = { error: string } | { success: true };

export async function updateNegocio(input: NegocioInput): Promise<UpdateNegocioResult> {
  await requireRole("owner");

  const parsed = negocioSchema.safeParse(input);
  if (!parsed.success) {
    return { error: SAVE_ERROR_COPY };
  }

  // negocio_id derivado del contexto server-side — nunca de `input` (T-02-11).
  const { negocio } = await getNegocioActivo();

  const supabase = await createClient();
  const { error } = await supabase
    .from("negocio")
    .update({
      nombre: parsed.data.nombre,
      direccion: parsed.data.direccion?.trim() || null,
      telefono: parsed.data.telefono?.trim() || null,
      timezone: parsed.data.timezone,
      granularidad_min: parsed.data.granularidad_min,
      horario_general: parsed.data.horario_general?.trim() || null,
    })
    .eq("id", negocio.id); // RLS-scoped: solo matchea si negocio.id pertenece al tenant propio

  if (error) {
    return { error: SAVE_ERROR_COPY };
  }

  revalidatePath("/negocio");
  return { success: true };
}
