/**
 * app/actions/profesionales.ts — Server Actions de Profesionales (PRO-01),
 * horario semanal (PRO-02) y matriz de servicios/precio custom (PRO-03/04).
 *
 * Todas re-validan server-side (la validación client-side del form/editor es
 * solo UX, bypasseable — 02-RESEARCH.md Anti-Patterns) y derivan el
 * `negocio_id` SIEMPRE de `getNegocioActivo()` (contexto server-side), NUNCA
 * de un campo del form (T-02-16: mismo anti-pattern que
 * `app/actions/negocio.ts`). El cliente Supabase usado acá es el RLS-scoped
 * (`lib/supabase/server.ts`, anon key + JWT del owner) — nunca el
 * service_role de `lib/supabase/admin.ts` (02-RESEARCH.md Pitfall 4) — así
 * que un `negocio_id` ajeno tampoco podría matchear ninguna fila aunque algo
 * más arriba fallara (defensa en profundidad).
 *
 * `toggleProfesionalActivo` se agregó primero (Task 2, deviation Rule 3):
 * `components/profesionales-table.tsx` necesitaba esta action para el
 * Switch de soft-delete antes de que este Task 3 completara el resto del
 * CRUD. `createProfesional`/`updateProfesional` (Task 3) re-validan con el
 * mismo `profesionalSchema` usado por `components/profesional-form.tsx`.
 *
 * `updateHorario`/`updateServiciosMatrix` (02-07) siguen el mismo patrón de
 * "chequeo explícito de pertenencia al negocio activo" que el resto del
 * archivo (T-02-18): antes de escribir, se verifica que `profesionalId` (y,
 * en el caso de la matriz, cada `servicioId`) pertenece al negocio activo —
 * un id de otro negocio no matchea ni el chequeo explícito ni la RLS
 * (`auth_negocio_ids()`), doble barrera.
 */
"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/require-role";
import { getNegocioActivo } from "@/lib/negocio-context";
import { createClient } from "@/lib/supabase/server";
import { profesionalSchema, type ProfesionalInput } from "@/lib/schemas/profesional";
import { DIAS_SEMANA, horarioSchema, type HorarioInput } from "@/lib/schemas/horario";

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

/**
 * PRO-02 — reemplaza atómicamente el horario semanal de un profesional.
 * Re-valida `dias` con `horarioSchema` (rechaza hora_fin<=hora_inicio y
 * bloques solapados — T-02-19) y, si es válido, borra todas las filas de
 * `horario_trabajo` del profesional y las vuelve a insertar (una fila por
 * bloque, `{dia_semana, hora_inicio, hora_fin}`) — el enfoque delete+insert
 * evita tener que diffear bloques existentes contra los nuevos (mucho más
 * simple que un upsert por clave compuesta, y el volumen por profesional es
 * mínimo: como mucho unas pocas decenas de filas).
 */
export async function updateHorario(
  profesionalId: string,
  dias: HorarioInput,
): Promise<ProfesionalActionResult> {
  await requireRole("owner");

  const parsed = horarioSchema.safeParse(dias);
  if (!parsed.success) {
    return { error: SAVE_ERROR_COPY };
  }

  const { negocio } = await getNegocioActivo();

  const supabase = await createClient();

  // Chequeo explícito de pertenencia (T-02-18): un profesionalId de otro
  // negocio no debe poder ni siquiera intentar el delete/insert de abajo.
  const { data: profesional, error: profesionalError } = await supabase
    .from("profesional")
    .select("id")
    .eq("id", profesionalId)
    .eq("negocio_id", negocio.id)
    .maybeSingle();

  if (profesionalError || !profesional) {
    return { error: GENERIC_ERROR };
  }

  const filas = DIAS_SEMANA.flatMap((dia, diaSemana) =>
    parsed.data[dia].bloques.map((bloque) => ({
      negocio_id: negocio.id,
      profesional_id: profesionalId,
      dia_semana: diaSemana,
      hora_inicio: bloque.hora_inicio,
      hora_fin: bloque.hora_fin,
    })),
  );

  const { error: deleteError } = await supabase
    .from("horario_trabajo")
    .delete()
    .eq("profesional_id", profesionalId)
    .eq("negocio_id", negocio.id);

  if (deleteError) {
    return { error: GENERIC_ERROR };
  }

  if (filas.length > 0) {
    const { error: insertError } = await supabase.from("horario_trabajo").insert(filas);
    if (insertError) {
      return { error: GENERIC_ERROR };
    }
  }

  revalidatePath(`/profesionales/${profesionalId}/editar`);
  return { data: undefined };
}

export type AsignacionServicioInput = {
  servicioId: string;
  realiza: boolean;
  precioCustom: number | null;
};

/**
 * PRO-03/04 — persiste la matriz de servicios que un profesional realiza,
 * con precio custom opcional. Para cada asignación con `realiza: true`,
 * upsertea (por la unique implícita `profesional_id + servicio_id`, ver
 * abajo) la fila de `profesional_servicio` con su `precio_custom` (nullable
 * — sin precio custom pisa el precio base del servicio); para cada
 * asignación con `realiza: false`, borra la fila si existía (T-02-18/T-02-20:
 * también valida que cada `servicioId` pertenezca al negocio activo antes de
 * escribir, y que `precioCustom` sea `null` o >= 0).
 */
export async function updateServiciosMatrix(
  profesionalId: string,
  asignaciones: AsignacionServicioInput[],
): Promise<ProfesionalActionResult> {
  await requireRole("owner");

  const precioInvalido = asignaciones.some(
    (asignacion) => asignacion.precioCustom !== null && asignacion.precioCustom < 0,
  );
  if (precioInvalido) {
    return { error: SAVE_ERROR_COPY };
  }

  const { negocio } = await getNegocioActivo();

  const supabase = await createClient();

  // Chequeo explícito de pertenencia del profesional (T-02-18).
  const { data: profesional, error: profesionalError } = await supabase
    .from("profesional")
    .select("id")
    .eq("id", profesionalId)
    .eq("negocio_id", negocio.id)
    .maybeSingle();

  if (profesionalError || !profesional) {
    return { error: GENERIC_ERROR };
  }

  const servicioIds = asignaciones.map((asignacion) => asignacion.servicioId);
  if (servicioIds.length > 0) {
    // Chequeo explícito: rechaza cualquier servicioId que no sea del negocio
    // activo (T-02-18: nunca confiar en el servicioId enviado por el
    // cliente, un servicio de otro negocio no debe poder asignarse).
    const { data: serviciosDelNegocio, error: serviciosError } = await supabase
      .from("servicio")
      .select("id")
      .eq("negocio_id", negocio.id)
      .in("id", servicioIds);

    if (serviciosError) {
      return { error: GENERIC_ERROR };
    }

    const idsValidos = new Set((serviciosDelNegocio ?? []).map((servicio) => servicio.id));
    const hayServicioAjeno = servicioIds.some((id) => !idsValidos.has(id));
    if (hayServicioAjeno) {
      return { error: GENERIC_ERROR };
    }
  }

  const aRealizar = asignaciones.filter((asignacion) => asignacion.realiza);
  const aNoRealizar = asignaciones.filter((asignacion) => !asignacion.realiza);

  if (aNoRealizar.length > 0) {
    const { error: deleteError } = await supabase
      .from("profesional_servicio")
      .delete()
      .eq("profesional_id", profesionalId)
      .eq("negocio_id", negocio.id)
      .in(
        "servicio_id",
        aNoRealizar.map((asignacion) => asignacion.servicioId),
      );

    if (deleteError) {
      return { error: GENERIC_ERROR };
    }
  }

  if (aRealizar.length > 0) {
    const { error: upsertError } = await supabase.from("profesional_servicio").upsert(
      aRealizar.map((asignacion) => ({
        negocio_id: negocio.id,
        profesional_id: profesionalId,
        servicio_id: asignacion.servicioId,
        precio_custom: asignacion.precioCustom,
      })),
      { onConflict: "profesional_id,servicio_id" },
    );

    if (upsertError) {
      return { error: GENERIC_ERROR };
    }
  }

  revalidatePath(`/profesionales/${profesionalId}/editar`);
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
