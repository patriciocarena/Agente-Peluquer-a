/**
 * app/actions/servicios.ts — Server Actions de Servicios (SVC-01/SVC-02).
 *
 * Re-validan con `servicioSchema` server-side (la validación client-side del
 * dialog es solo UX, bypasseable — 02-RESEARCH.md Anti-Patterns) y derivan
 * el `negocio_id` SIEMPRE de `getNegocioActivo()` (contexto server-side),
 * NUNCA de un campo del cliente (T-02-13: el anti-pattern explícito es un
 * negocio_id ajeno enviado al crear/reordenar). Cada `.update()`/`.insert()`
 * además va scoped por RLS (`negocio_id IN (SELECT auth_negocio_ids())`) y
 * por un `.eq("negocio_id", negocio.id)` explícito — defensa en profundidad,
 * mismo patrón que `app/actions/negocio.ts` (02-04).
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
import { servicioSchema, type ServicioInput } from "@/lib/schemas/servicio";

const SAVE_ERROR_COPY =
  "No pudimos guardar los cambios. Revisá los datos marcados e intentá de nuevo.";
const GENERIC_ERROR_COPY = "No pudimos completar la operación. Intentá de nuevo.";

export type ServicioActionResult = { error: string } | { success: true };

function servicioUpdatePayload(input: ServicioInput) {
  return {
    nombre: input.nombre,
    descripcion: input.descripcion?.trim() || null,
    precio: input.precio,
    duracion_min: input.duracion_min,
  };
}

/** SVC-01 — crear un servicio nuevo del negocio activo, al final del orden. */
export async function createServicio(input: ServicioInput): Promise<ServicioActionResult> {
  await requireRole("owner");

  const parsed = servicioSchema.safeParse(input);
  if (!parsed.success) {
    return { error: SAVE_ERROR_COPY };
  }

  // negocio_id derivado del contexto server-side — nunca de `input` (T-02-13).
  const { negocio } = await getNegocioActivo();

  const supabase = await createClient();

  const { count, error: countError } = await supabase
    .from("servicio")
    .select("id", { count: "exact", head: true })
    .eq("negocio_id", negocio.id);

  if (countError) {
    return { error: GENERIC_ERROR_COPY };
  }

  const { error } = await supabase.from("servicio").insert({
    negocio_id: negocio.id,
    ...servicioUpdatePayload(parsed.data),
    orden: count ?? 0,
  });

  if (error) {
    return { error: GENERIC_ERROR_COPY };
  }

  revalidatePath("/servicios");
  return { success: true };
}

/** SVC-01 — editar un servicio existente del negocio activo. */
export async function updateServicio(
  servicioId: string,
  input: ServicioInput,
): Promise<ServicioActionResult> {
  await requireRole("owner");

  const parsed = servicioSchema.safeParse(input);
  if (!parsed.success) {
    return { error: SAVE_ERROR_COPY };
  }

  const { negocio } = await getNegocioActivo();

  const supabase = await createClient();
  const { error } = await supabase
    .from("servicio")
    .update(servicioUpdatePayload(parsed.data))
    .eq("id", servicioId)
    .eq("negocio_id", negocio.id); // defensa en profundidad, RLS ya lo scopea

  if (error) {
    return { error: GENERIC_ERROR_COPY };
  }

  revalidatePath("/servicios");
  return { success: true };
}

/** SVC-01 — activar/desactivar un servicio (soft delete, Tabs/Switch). */
export async function toggleServicioActivo(
  servicioId: string,
  activo: boolean,
): Promise<ServicioActionResult> {
  await requireRole("owner");

  const { negocio } = await getNegocioActivo();

  const supabase = await createClient();
  const { error } = await supabase
    .from("servicio")
    .update({ activo })
    .eq("id", servicioId)
    .eq("negocio_id", negocio.id);

  if (error) {
    return { error: GENERIC_ERROR_COPY };
  }

  revalidatePath("/servicios");
  return { success: true };
}

export type ReorderServicioItem = { id: string; orden: number };

/**
 * SVC-02 — persiste en batch el nuevo `orden` tras un drag-and-drop
 * (`lib/reorder.ts` calcula el array reordenado client-side; esto solo
 * escribe el resultado). Cada fila se actualiza scoped al negocio activo;
 * si cualquiera falla, se devuelve error y el cliente hace rollback
 * optimista vía toast (02-UI-SPEC.md).
 */
export async function reorderServicios(
  items: ReorderServicioItem[],
): Promise<ServicioActionResult> {
  await requireRole("owner");

  const { negocio } = await getNegocioActivo();

  const supabase = await createClient();

  const results = await Promise.all(
    items.map(({ id, orden }) =>
      supabase.from("servicio").update({ orden }).eq("id", id).eq("negocio_id", negocio.id),
    ),
  );

  if (results.some((result) => result.error)) {
    return { error: GENERIC_ERROR_COPY };
  }

  revalidatePath("/servicios");
  return { success: true };
}
