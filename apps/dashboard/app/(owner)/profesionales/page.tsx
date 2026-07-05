/**
 * app/(owner)/profesionales/page.tsx — lista de Profesionales del negocio
 * activo (PRO-01). Server Component: lee vía el cliente RLS-scoped
 * (`lib/supabase/server.ts`) filtrando explícitamente por el `negocio_id`
 * resuelto server-side en `getNegocioActivo()` (T-02-16/T-02-10) — nunca se
 * confía en un negocio_id de query param/cookie sin pasar por ese contexto.
 * Header con CTA "+ Nuevo profesional" (único acento, navega a
 * `/profesionales/nuevo`), empty state con el copy exacto de
 * 02-UI-SPEC.md, y delega la tabla a `components/profesionales-table.tsx`
 * (Client Component: Tabs/Switch/soft-delete).
 */
import Link from "next/link";

import { getNegocioActivo } from "@/lib/negocio-context";
import { createClient } from "@/lib/supabase/server";
import { ProfesionalesTable } from "@/components/profesionales-table";
import { Button } from "@/components/ui/button";

export default async function ProfesionalesPage() {
  const { negocio } = await getNegocioActivo();

  const supabase = await createClient();
  const { data: profesionales, error } = await supabase
    .from("profesional")
    .select("*")
    .eq("negocio_id", negocio.id)
    .order("nombre", { ascending: true });

  if (error) {
    throw new Error("Hubo un problema al cargar los datos. Recargá la página o intentá más tarde.");
  }

  const lista = profesionales ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Profesionales</h1>
        <Button asChild>
          <Link href="/profesionales/nuevo">+ Nuevo profesional</Link>
        </Button>
      </div>

      {lista.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <h2 className="text-lg font-semibold">Todavía no cargaste profesionales</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Agregá el primer profesional para empezar a asignarle horarios y
            servicios.
          </p>
          <div className="mt-4 flex justify-center">
            <Button asChild>
              <Link href="/profesionales/nuevo">+ Nuevo profesional</Link>
            </Button>
          </div>
        </div>
      ) : (
        <ProfesionalesTable profesionales={lista} />
      )}
    </div>
  );
}
