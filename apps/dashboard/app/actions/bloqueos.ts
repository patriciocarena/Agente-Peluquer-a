/**
 * app/actions/bloqueos.ts — Server Actions de bloqueo manual (APPT-02).
 *
 * Un bloqueo NO es un turno: se escribe directo a la tabla `bloqueo`, sin
 * pasar por el motor de disponibilidad (`computeSlots` lo resta al leer,
 * pero crearlo/eliminarlo es una escritura simple, mismo espíritu que
 * `app/actions/servicios.ts`).
 *
 * `negocio_id` SIEMPRE se deriva de `getNegocioActivo()` (contexto
 * server-side), NUNCA de un campo del cliente (T-02-13/T-04-08) — ninguna
 * de las dos actions acepta un `negocioId` en su input.
 *
 * Ambas terminan en `revalidatePath("/turnos")` en el camino de éxito
 * (Pitfall 4): el bloqueo debe reflejarse de inmediato en la grilla.
 */
"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/require-role";
import { getNegocioActivo } from "@/lib/negocio-context";
import { createClient } from "@/lib/supabase/server";
import { bloqueoSchema, type BloqueoInput } from "@/lib/schemas/bloqueo";

const SAVE_ERROR_COPY =
  "No pudimos guardar los cambios. Revisá los datos marcados e intentá de nuevo.";
const GENERIC_ERROR_COPY = "No pudimos completar la operación. Intentá de nuevo.";

export type BloqueoActionResult = { error: string } | { success: true };

/** APPT-02 — crear un bloqueo manual del negocio activo. */
export async function crearBloqueo(input: BloqueoInput): Promise<BloqueoActionResult> {
  await requireRole("owner");

  const parsed = bloqueoSchema.safeParse(input);
  if (!parsed.success) {
    return { error: SAVE_ERROR_COPY };
  }

  // negocio_id derivado del contexto server-side — nunca de `input` (T-02-13/T-04-08).
  const { negocio } = await getNegocioActivo();

  const supabase = await createClient();
  const { error } = await supabase.from("bloqueo").insert({
    negocio_id: negocio.id,
    profesional_id: parsed.data.profesionalId,
    inicio: parsed.data.inicio,
    fin: parsed.data.fin,
    motivo: parsed.data.motivo?.trim() || null,
  });

  if (error) {
    return { error: GENERIC_ERROR_COPY };
  }

  revalidatePath("/turnos");
  return { success: true };
}

/** APPT-02 — eliminar un bloqueo manual del negocio activo. */
export async function eliminarBloqueo(bloqueoId: string): Promise<BloqueoActionResult> {
  await requireRole("owner");

  const { negocio } = await getNegocioActivo();

  const supabase = await createClient();
  const { error } = await supabase
    .from("bloqueo")
    .delete()
    .eq("id", bloqueoId)
    .eq("negocio_id", negocio.id); // defensa en profundidad, RLS ya lo scopea (T-04-09)

  if (error) {
    return { error: GENERIC_ERROR_COPY };
  }

  revalidatePath("/turnos");
  return { success: true };
}
