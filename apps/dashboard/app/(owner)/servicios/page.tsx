/**
 * app/(owner)/servicios/page.tsx — listado de Servicios del negocio activo
 * (SVC-01/SVC-02). Server Component: lee vía el cliente RLS-scoped
 * (`lib/supabase/server.ts`), filtrando explícitamente por el `negocio_id`
 * activo (`getNegocioActivo()`) — RLS ya scopea `servicio` al tenant del
 * owner, pero un tenant puede tener N negocios, así que el filtro explícito
 * es necesario para no mezclar servicios de otro negocio del mismo tenant.
 * Header con CTA "+ Nuevo servicio" (único acento de la página, 02-UI-SPEC.md
 * §Visual Hierarchy), empty state con el copy exacto.
 */
import { getNegocioActivo } from "@/lib/negocio-context";
import { createClient } from "@/lib/supabase/server";
import { ServicioDialog } from "@/components/servicio-dialog";
import { ServiciosTable } from "@/components/servicios-table";
import { Button } from "@/components/ui/button";

export default async function ServiciosPage() {
  const { negocio } = await getNegocioActivo();
  const supabase = await createClient();

  const { data: servicios, error } = await supabase
    .from("servicio")
    .select("*")
    .eq("negocio_id", negocio.id)
    .order("orden", { ascending: true });

  if (error) {
    throw new Error("No pudimos cargar los servicios.");
  }

  const lista = servicios ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Servicios</h1>
        <ServicioDialog trigger={<Button>+ Nuevo servicio</Button>} />
      </div>

      {lista.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <h2 className="text-lg font-semibold">Todavía no cargaste servicios</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Agregá el primer servicio para poder asignarlo a tus profesionales.
          </p>
          <div className="mt-4 flex justify-center">
            <ServicioDialog trigger={<Button>+ Nuevo servicio</Button>} />
          </div>
        </div>
      ) : (
        <ServiciosTable servicios={lista} />
      )}
    </div>
  );
}
