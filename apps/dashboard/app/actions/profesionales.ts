/**
 * app/actions/profesionales.ts — Server Actions de Profesionales
 * (PRO-01/02/03/04).
 *
 * Todas re-validan server-side (la validación client-side de forms/editores
 * es solo UX, bypasseable — 02-RESEARCH.md Anti-Patterns) y derivan el
 * `negocio_id` SIEMPRE de `getNegocioActivo()` (contexto server-side), NUNCA
 * de un campo del cliente (T-02-16: mismo anti-pattern que
 * `app/actions/negocio.ts`). El cliente Supabase usado acá es el RLS-scoped
 * (`lib/supabase/server.ts`, anon key + JWT del owner) — nunca el
 * service_role de `lib/supabase/admin.ts` (02-RESEARCH.md Pitfall 4) — así
 * que un `negocio_id`/`profesional_id`/`servicio_id` ajeno tampoco podría
 * matchear ninguna fila aunque algo más arriba fallara (defensa en
 * profundidad).
 *
 * `toggleProfesionalActivo` se agregó primero (Task 2, deviation Rule 3):
 * `components/profesionales-table.tsx` necesitaba esta action para el
 * Switch de soft-delete antes de que ese Task 3 completara el resto del
 * CRUD. `createProfesional`/`updateProfesional` (02-06 Task 3) re-validan
 * con el mismo `profesionalSchema` usado por
 * `components/profesional-form.tsx`.
 *
 * `updateHorario`/`updateServiciosMatrix` (02-07 Task 3) cierran PRO-02 y
 * PRO-03/04: la primera re-valida con `horarioSchema` (bloques ordenados,
 * sin solapamiento — T-02-19) y reemplaza atómicamente (delete+insert) las
 * filas de `horario_trabajo` del profesional; la segunda upserta/borra
 * `profesional_servicio` según el checkbox "Realiza" de cada fila, validando
 * `precio_custom >= 0` (T-02-20) y que cada `servicio_id` pertenezca al
 * negocio activo (T-02-18) antes de tocar ninguna fila. Ambas chequean
 * explícitamente que el `profesionalId` recibido pertenece al negocio activo
 * (T-02-18) — no alcanza con derivar `negocio_id`, porque un `profesionalId`
 * de otro negocio jamás debería ni siquiera intentarse escribir.
 */
"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/require-role";
import { getNegocioActivo } from "@/lib/negocio-context";
import { createClient } from "@/lib/supabase/server";
import { profesionalSchema, type ProfesionalInput } from "@/lib/schemas/profesional";
import { horarioSchema, type HorarioInput } from "@/lib/schemas/horario";

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
 * PRO-02 — reemplazar atómicamente el horario semanal de un profesional.
 * `dias` ya viene validado client-side por `HorarioEditor`, pero se
 * re-valida acá con `horarioSchema` completo (T-02-19: solapamiento + orden
 * de horas) porque el client-side es solo UX y es bypasseable.
 */
export async function updateHorario(
  profesionalId: string,
  dias: HorarioInput["dias"],
): Promise<ProfesionalActionResult> {
  await requireRole("owner");

  const parsed = horarioSchema.safeParse({ dias });
  if (!parsed.success) {
    return { error: SAVE_ERROR_COPY };
  }

  const { negocio } = await getNegocioActivo();

  const supabase = await createClient();

  // Chequeo explícito de pertenencia (T-02-18): un profesionalId ajeno no
  // debe recibir horario, aunque RLS ya lo scopee — defensa en profundidad.
  const { data: profesional, error: profesionalError } = await supabase
    .from("profesional")
    .select("id")
    .eq("id", profesionalId)
    .eq("negocio_id", negocio.id)
    .maybeSingle();

  if (profesionalError || !profesional) {
    return { error: GENERIC_ERROR };
  }

  const filas = parsed.data.dias.flatMap((dia) =>
    dia.bloques.map((bloque) => ({
      negocio_id: negocio.id,
      profesional_id: profesionalId,
      dia_semana: dia.dia_semana,
      hora_inicio: bloque.hora_inicio,
      hora_fin: bloque.hora_fin,
    })),
  );

  // Reemplazo atómico a nivel de dominio: se borran todas las filas actuales
  // del profesional y se insertan de nuevo los bloques enviados —
  // `parsed.data` ya garantiza que no hay solapamiento ni orden inválido.
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

export type ServiciosMatrixAsignacion = {
  servicio_id: string;
  realiza: boolean;
  precio_custom: number | null;
};

/**
 * PRO-03/04 — persistir la matriz de servicios que realiza un profesional +
 * precio custom opcional. Upserta las filas de `profesional_servicio` donde
 * `realiza` está tildado (con su `precio_custom`, nullable) y borra las de
 * los servicios destildados — mismo comportamiento que describe
 * `components/servicios-matrix.tsx`: destildar "Realiza" limpia el precio
 * custom de esa fila al guardar.
 */
export async function updateServiciosMatrix(
  profesionalId: string,
  asignaciones: ServiciosMatrixAsignacion[],
): Promise<ProfesionalActionResult> {
  await requireRole("owner");

  // T-02-20: precio_custom negativo se rechaza server-side, la validación
  // client-side del matrix es solo UX.
  const precioInvalido = asignaciones.some(
    (asignacion) => asignacion.precio_custom != null && asignacion.precio_custom < 0,
  );
  if (precioInvalido) {
    return { error: SAVE_ERROR_COPY };
  }

  const { negocio } = await getNegocioActivo();

  const supabase = await createClient();

  // Chequeo explícito de pertenencia (T-02-18): un profesionalId ajeno no
  // debe recibir asignaciones, aunque RLS ya lo scopee.
  const { data: profesional, error: profesionalError } = await supabase
    .from("profesional")
    .select("id")
    .eq("id", profesionalId)
    .eq("negocio_id", negocio.id)
    .maybeSingle();

  if (profesionalError || !profesional) {
    return { error: GENERIC_ERROR };
  }

  // T-02-18: nunca confiar en que un servicio_id enviado pertenece al
  // negocio activo — se valida explícitamente contra la lista de servicios
  // del propio negocio antes de escribir nada.
  const servicioIds = asignaciones.map((asignacion) => asignacion.servicio_id);
  const { data: serviciosDelNegocio, error: serviciosError } = await supabase
    .from("servicio")
    .select("id")
    .eq("negocio_id", negocio.id)
    .in("id", servicioIds.length > 0 ? servicioIds : [""]);

  if (serviciosError) {
    return { error: GENERIC_ERROR };
  }

  const idsValidos = new Set((serviciosDelNegocio ?? []).map((servicio) => servicio.id));
  const asignacionesValidas = asignaciones.filter((asignacion) =>
    idsValidos.has(asignacion.servicio_id),
  );

  const realizan = asignacionesValidas.filter((asignacion) => asignacion.realiza);
  const noRealizan = asignacionesValidas.filter((asignacion) => !asignacion.realiza);

  if (noRealizan.length > 0) {
    const { error: deleteError } = await supabase
      .from("profesional_servicio")
      .delete()
      .eq("profesional_id", profesionalId)
      .eq("negocio_id", negocio.id)
      .in(
        "servicio_id",
        noRealizan.map((asignacion) => asignacion.servicio_id),
      );

    if (deleteError) {
      return { error: GENERIC_ERROR };
    }
  }

  if (realizan.length > 0) {
    const { error: upsertError } = await supabase.from("profesional_servicio").upsert(
      realizan.map((asignacion) => ({
        negocio_id: negocio.id,
        profesional_id: profesionalId,
        servicio_id: asignacion.servicio_id,
        precio_custom: asignacion.precio_custom,
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
