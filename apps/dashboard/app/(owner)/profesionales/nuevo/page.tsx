/**
 * app/(owner)/profesionales/nuevo/page.tsx — alta full-page de un
 * profesional (PRO-01, 02-UI-SPEC.md §CRUD Interaction Pattern: full-page,
 * no modal — necesita espacio para datos generales + horario semanal +
 * matriz de servicios, agregados en 02-07). Server Component simple:
 * delega todo el form/mutación a `components/profesional-form.tsx`.
 */
import { ProfesionalForm } from "@/components/profesional-form";

export default function NuevoProfesionalPage() {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">Nuevo profesional</h1>
      <ProfesionalForm />
    </div>
  );
}
