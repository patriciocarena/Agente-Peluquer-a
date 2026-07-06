/**
 * app/actions/clientes.ts — Server Actions de búsqueda/alta inline de
 * cliente (D-09, backing de APPT-06).
 *
 * `negocio_id` SIEMPRE se deriva de `getNegocioActivo()`, NUNCA de un campo
 * del cliente (T-02-13/T-04-08) — ninguna de las dos actions acepta un
 * `negocioId` en su input.
 *
 * `buscarClientePorTelefono` usa `.ilike` con match parcial (no exacto):
 * el dueño tipea dígitos del teléfono de forma incremental mientras busca
 * (04-RESEARCH.md A3) — un match exacto rompería esa UX de búsqueda en vivo.
 *
 * `crearClienteInline` NO revalida `/turnos`: crear un cliente no cambia la
 * grilla; el flujo del modal de turno usa el `clienteId` devuelto
 * directamente para continuar al paso de slot-picker (D-10).
 */
"use server";

import { requireRole } from "@/lib/auth/require-role";
import { getNegocioActivo } from "@/lib/negocio-context";
import { createClient } from "@/lib/supabase/server";
import {
  clienteBusquedaSchema,
  clienteInlineSchema,
  type ClienteInlineInput,
} from "@/lib/schemas/cliente";

const SAVE_ERROR_COPY =
  "No pudimos guardar los cambios. Revisá los datos marcados e intentá de nuevo.";
const GENERIC_ERROR_COPY = "No pudimos completar la operación. Intentá de nuevo.";

export type ClienteResumen = { id: string; nombre: string | null; telefono: string };

export type ClienteBusquedaResult = { clientes: ClienteResumen[] };
export type ClienteCrearResult = { error: string } | { clienteId: string };

/** D-09 — buscar clientes del negocio activo por match parcial de teléfono. */
export async function buscarClientePorTelefono(telefono: string): Promise<ClienteBusquedaResult> {
  await requireRole("owner");

  const parsed = clienteBusquedaSchema.safeParse({ telefono });
  if (!parsed.success) {
    return { clientes: [] };
  }

  // negocio_id derivado del contexto server-side — nunca de `telefono` (T-02-13/T-04-08).
  const { negocio } = await getNegocioActivo();

  const supabase = await createClient();
  const { data } = await supabase
    .from("cliente")
    .select("id, nombre, telefono")
    .eq("negocio_id", negocio.id)
    .ilike("telefono", `%${parsed.data.telefono}%`);

  return { clientes: data ?? [] };
}

/** D-09 — alta inline de un cliente nuevo del negocio activo. */
export async function crearClienteInline(input: ClienteInlineInput): Promise<ClienteCrearResult> {
  await requireRole("owner");

  const parsed = clienteInlineSchema.safeParse(input);
  if (!parsed.success) {
    return { error: SAVE_ERROR_COPY };
  }

  const { negocio } = await getNegocioActivo();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cliente")
    .insert({
      negocio_id: negocio.id,
      telefono: parsed.data.telefono.trim(),
      nombre: parsed.data.nombre?.trim() || null,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { error: GENERIC_ERROR_COPY };
  }

  return { clienteId: data.id };
}
