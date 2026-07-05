/**
 * app/(owner)/profesionales/[id]/editar/page.tsx — edición full-page de un
 * profesional (PRO-01/02/03/04), 02-UI-SPEC.md §CRUD Interaction Pattern.
 * Server Component: carga el profesional (RLS-scoped al negocio activo),
 * su horario (`horario_trabajo`) y sus servicios asignados
 * (`profesional_servicio`), además de los servicios ACTIVOS del negocio para
 * la matriz. Delega el form combinado (datos generales + horario + matriz)
 * a `components/profesional-editar-form.tsx` (Client Component: react-hook-
 * form para "Datos generales" + estado local para horario/matriz, un único
 * "Guardar cambios" que llama las tres Server Actions).
 */
import { notFound } from "next/navigation";

import { getNegocioActivo } from "@/lib/negocio-context";
import { createClient } from "@/lib/supabase/server";
import { DIAS_SEMANA, type Bloque, type HorarioInput } from "@/lib/schemas/horario";
import { ProfesionalEditarForm } from "@/components/profesional-editar-form";

type Params = Promise<{ id: string }>;

const DIA_SEMANA_INDEX = DIAS_SEMANA; // ["lunes", ..., "domingo"] — índice 0..6 = dia_semana en DB (0=lunes)

export default async function EditarProfesionalPage({ params }: { params: Params }) {
  const { id } = await params;
  const { negocio } = await getNegocioActivo();

  const supabase = await createClient();

  const { data: profesional, error: profesionalError } = await supabase
    .from("profesional")
    .select("*")
    .eq("id", id)
    .eq("negocio_id", negocio.id)
    .single();

  if (profesionalError || !profesional) {
    notFound();
  }

  const [{ data: bloquesHorario }, { data: asignaciones }, { data: serviciosActivos }] =
    await Promise.all([
      supabase
        .from("horario_trabajo")
        .select("dia_semana, hora_inicio, hora_fin")
        .eq("profesional_id", id)
        .eq("negocio_id", negocio.id)
        .order("hora_inicio", { ascending: true }),
      supabase
        .from("profesional_servicio")
        .select("servicio_id, precio_custom")
        .eq("profesional_id", id)
        .eq("negocio_id", negocio.id),
      supabase
        .from("servicio")
        .select("*")
        .eq("negocio_id", negocio.id)
        .eq("activo", true)
        .order("orden", { ascending: true }),
    ]);

  const horarioInicial: HorarioInput = DIA_SEMANA_INDEX.reduce((acc, dia, index) => {
    const bloques: Bloque[] = (bloquesHorario ?? [])
      .filter((fila) => fila.dia_semana === index)
      .map((fila) => ({
        hora_inicio: fila.hora_inicio.slice(0, 5),
        hora_fin: fila.hora_fin.slice(0, 5),
      }));
    acc[dia] = { bloques };
    return acc;
  }, {} as HorarioInput);

  return (
    <div className="mx-auto w-full max-w-2xl space-y-8">
      <h1 className="text-2xl font-semibold">Editar profesional</h1>
      <ProfesionalEditarForm
        profesional={profesional}
        horarioInicial={horarioInicial}
        asignacionesExistentes={asignaciones ?? []}
        serviciosActivos={serviciosActivos ?? []}
        granularidadMin={negocio.granularidad_min}
      />
    </div>
  );
}
