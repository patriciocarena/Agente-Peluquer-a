/**
 * app/actions/slots.ts — selector de disponibilidad respaldado por el motor
 * (D-10/D-13) + gate de elegibilidad profesional×servicio (Pitfall 6 /
 * Open Question 3 de 04-RESEARCH.md).
 *
 * `obtenerSlotsDisponibles` es un wrapper puro de lectura sobre
 * `computeSlots` — ninguna función de este archivo calcula disponibilidad a
 * mano (AVAIL-04: toda la matemática de huecos pasa por el motor
 * compartido).
 *
 * `negocio_id` SIEMPRE se deriva de `getNegocioActivo()` (contexto
 * server-side), NUNCA de un campo del cliente (T-02-13/T-04-15) — ninguna de
 * las dos actions acepta un `negocioId` en su input. Ambas usan el cliente
 * RLS del owner (`@/lib/supabase/server`), nunca `service_role`.
 */
"use server";

import { z } from "zod";

import { computeSlots, type AvailableSlot } from "@turnosbot/availability-engine";

import { requireRole } from "@/lib/auth/require-role";
import { buildAvailabilityData } from "@/lib/availability-data";
import { getNegocioActivo } from "@/lib/negocio-context";
import { createClient } from "@/lib/supabase/server";

const GENERIC_ERROR_COPY = "No pudimos completar la operación. Intentá de nuevo.";

const obtenerSlotsInputSchema = z.object({
  serviceIds: z.array(z.string()).min(1, "serviceIds no puede estar vacío"),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "fecha debe ser YYYY-MM-DD"),
  profesionalId: z.string().optional(),
});

export type ObtenerSlotsInput = {
  serviceIds: string[];
  fecha: string;
  profesionalId?: string;
};

/**
 * obtenerSlotsDisponibles (D-10/D-13) — wrapper de `computeSlots` con
 * `skipBookingWindow: true` (D-07: el dueño ve también "ahora mismo" y
 * fechas lejanas), sobre `buildAvailabilityData`. Envuelto en try/catch:
 * `assertScopedToNegocio` del motor puede lanzar ante una fila cruzada
 * (Pitfall 3), lo que acá se traduce en un error de UX en vez de un 500.
 */
export async function obtenerSlotsDisponibles(
  input: ObtenerSlotsInput,
): Promise<{ slots: AvailableSlot[] } | { error: string }> {
  await requireRole("owner");

  const parsed = obtenerSlotsInputSchema.safeParse(input);
  if (!parsed.success) {
    return { error: GENERIC_ERROR_COPY };
  }

  const { negocio } = await getNegocioActivo();

  try {
    const freshData = await buildAvailabilityData(negocio.id);
    const slots = await computeSlots(
      {
        negocioId: negocio.id,
        serviceIds: parsed.data.serviceIds,
        professionalId: parsed.data.profesionalId,
        date: parsed.data.fecha,
        skipBookingWindow: true,
      },
      freshData,
    );
    return { slots };
  } catch {
    return { error: GENERIC_ERROR_COPY };
  }
}

export type ProfesionalElegible = { id: string; nombre: string };

/**
 * profesionalesElegibles (Pitfall 6 / Open Question 3) — lista los
 * profesionales activos con fila en `profesional_servicio` para TODOS los
 * `serviceIds` pedidos (no solo alguno), así el selector de profesional
 * (alta manual y reagendar) nunca ofrece a alguien que no hace el servicio.
 */
export async function profesionalesElegibles(
  serviceIds: string[],
): Promise<{ profesionales: ProfesionalElegible[] } | { error: string }> {
  await requireRole("owner");

  if (serviceIds.length === 0) {
    return { profesionales: [] };
  }

  const { negocio } = await getNegocioActivo();

  const supabase = await createClient();

  const [profesionalServicioRes, profesionalRes] = await Promise.all([
    supabase
      .from("profesional_servicio")
      .select("profesional_id, servicio_id")
      .eq("negocio_id", negocio.id),
    supabase
      .from("profesional")
      .select("id, nombre")
      .eq("negocio_id", negocio.id)
      .eq("activo", true),
  ]);

  if (profesionalServicioRes.error || profesionalRes.error) {
    return { error: GENERIC_ERROR_COPY };
  }

  const filas = profesionalServicioRes.data ?? [];
  const profesionalesActivos = profesionalRes.data ?? [];

  // Un profesional es elegible si el conjunto de sus servicio_id incluye
  // TODOS los serviceIds pedidos (no solo alguno) — Pitfall 6.
  const serviciosPorProfesional = new Map<string, Set<string>>();
  for (const fila of filas) {
    const set = serviciosPorProfesional.get(fila.profesional_id) ?? new Set<string>();
    set.add(fila.servicio_id);
    serviciosPorProfesional.set(fila.profesional_id, set);
  }

  const profesionales = profesionalesActivos.filter((profesional) => {
    const serviciosDelProfesional = serviciosPorProfesional.get(profesional.id);
    if (!serviciosDelProfesional) return false;
    return serviceIds.every((servicioId) => serviciosDelProfesional.has(servicioId));
  });

  return { profesionales };
}
