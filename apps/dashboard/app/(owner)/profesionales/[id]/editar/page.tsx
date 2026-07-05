/**
 * app/(owner)/profesionales/[id]/editar/page.tsx — edición full-page de un
 * profesional (PRO-01/02/03/04, 02-UI-SPEC.md §CRUD Interaction Pattern:
 * full-page, no modal). Server Component: carga el profesional + su horario
 * (`horario_trabajo`) + los servicios activos del negocio + las
 * asignaciones existentes (`profesional_servicio`), todo scoped al negocio
 * activo (`getNegocioActivo()`, T-02-16/T-02-10 — nunca se confía en el
 * `id` de la URL sin el filtro `.eq("negocio_id", negocio.id)`), y renderiza
 * tres secciones separadas por `space-y-8` (32px, xl —
 * `components/profesional-form.tsx` §comentario "SECCIÓN 02-07"):
 * "Datos generales" (02-06), "Horario semanal" (PRO-02) y "Servicios que
 * realiza" (PRO-03/04). Cada sección persiste con su propia Server Action
 * (`updateProfesional`/`updateHorario`/`updateServiciosMatrix`) y su propio
 * botón "Guardar cambios" — mismo patrón modular que ya usa el resto del
 * dashboard (Servicios/Perfil del negocio), en vez de un único form gigante
 * mezclando tres modelos de datos distintos.
 */
import { notFound } from "next/navigation";

import { getNegocioActivo } from "@/lib/negocio-context";
import { createClient } from "@/lib/supabase/server";
import { ProfesionalForm } from "@/components/profesional-form";
import { HorarioEditor } from "@/components/horario-editor";
import { ServiciosMatrix } from "@/components/servicios-matrix";
import { type DiaHorario } from "@/lib/schemas/horario";

type Props = {
  params: Promise<{ id: string }>;
};

const CARGA_ERROR_COPY =
  "Hubo un problema al cargar los datos. Recargá la página o intentá más tarde.";

/** Agrupa las filas planas de `horario_trabajo` (una por bloque) en las 7
 * entradas `DiaHorario` (0=domingo..6=sábado) que espera `HorarioEditor`;
 * un día sin filas queda con `bloques: []` (Cerrado). */
function agruparHorarioPorDia(
  filas: { dia_semana: number; hora_inicio: string; hora_fin: string }[],
): DiaHorario[] {
  return Array.from({ length: 7 }, (_, dia_semana) => ({
    dia_semana,
    bloques: filas
      .filter((fila) => fila.dia_semana === dia_semana)
      .map((fila) => ({
        // Postgres `time` viaja como "HH:mm:ss" — se recorta a "HH:mm" para
        // matchear HORA_REGEX de horarioSchema y el `<input type="time">`.
        hora_inicio: fila.hora_inicio.slice(0, 5),
        hora_fin: fila.hora_fin.slice(0, 5),
      }))
      .sort((a, b) => (a.hora_inicio < b.hora_inicio ? -1 : 1)),
  }));
}

export default async function EditarProfesionalPage({ params }: Props) {
  const { id } = await params;
  const { negocio } = await getNegocioActivo();
  const supabase = await createClient();

  const { data: profesional, error: profesionalError } = await supabase
    .from("profesional")
    .select("*")
    .eq("id", id)
    .eq("negocio_id", negocio.id)
    .maybeSingle();

  if (profesionalError) {
    throw new Error(CARGA_ERROR_COPY);
  }
  if (!profesional) {
    notFound();
  }

  const [horarioResult, serviciosResult, asignacionesResult] = await Promise.all([
    supabase
      .from("horario_trabajo")
      .select("dia_semana, hora_inicio, hora_fin")
      .eq("profesional_id", profesional.id)
      .eq("negocio_id", negocio.id),
    supabase
      .from("servicio")
      .select("*")
      .eq("negocio_id", negocio.id)
      .eq("activo", true)
      .order("orden", { ascending: true }),
    supabase
      .from("profesional_servicio")
      .select("*")
      .eq("profesional_id", profesional.id)
      .eq("negocio_id", negocio.id),
  ]);

  if (horarioResult.error || serviciosResult.error || asignacionesResult.error) {
    throw new Error(CARGA_ERROR_COPY);
  }

  const horarioInicial = agruparHorarioPorDia(horarioResult.data ?? []);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8">
      <h1 className="text-2xl font-semibold">Editar profesional</h1>

      <ProfesionalForm profesional={profesional} />

      <HorarioEditor
        profesionalId={profesional.id}
        horarioInicial={horarioInicial}
        stepMinutos={negocio.granularidad_min}
      />

      <ServiciosMatrix
        profesionalId={profesional.id}
        servicios={serviciosResult.data ?? []}
        asignaciones={asignacionesResult.data ?? []}
      />
    </div>
  );
}
