/**
 * app/(admin)/admin/[tenantId]/page.tsx — listado de Negocios (peluquerías)
 * de un Tenant (SADMIN-02/03). Server Component: lee vía
 * `getTenantWithNegocios()` (service_role, aislado de RLS). Breadcrumb/
 * back-link a Grupos, CTA "+ Nueva peluquería" (único acento), empty state
 * exacto, Tabs Todos/Activos/Inactivos + Switch de soft-delete con
 * AlertDialog destructivo exacto (02-UI-SPEC.md).
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { getTenantWithNegocios } from "@/app/actions/admin-tenants";
import { EstadoFilterTabs } from "@/components/admin/estado-filter-tabs";
import { NegocioActivoSwitch } from "@/components/admin/negocio-activo-switch";
import { NegocioDialog } from "@/components/admin/negocio-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

type Params = Promise<{ tenantId: string }>;
type SearchParams = Promise<{ estado?: string }>;

export default async function AdminNegociosPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { tenantId } = await params;
  const { estado } = await searchParams;

  const result = await getTenantWithNegocios(tenantId);
  if (!result) {
    notFound();
  }
  const { tenant, negocios } = result;

  const filtered = negocios.filter((negocio) => {
    if (estado === "activos") return negocio.activo;
    if (estado === "inactivos") return !negocio.activo;
    return true;
  });

  return (
    <div className="space-y-6">
      <Link
        href="/admin"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Grupos
      </Link>

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{tenant.nombre}</h1>
        <NegocioDialog
          tenantId={tenant.id}
          trigger={<Button>+ Nueva peluquería</Button>}
        />
      </div>

      {negocios.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <h2 className="text-lg font-semibold">Este grupo todavía no tiene peluquerías</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Creá la primera peluquería de este grupo para empezar a vincular su
            WhatsApp.
          </p>
          <div className="mt-4 flex justify-center">
            <NegocioDialog
              tenantId={tenant.id}
              trigger={<Button>+ Nueva peluquería</Button>}
            />
          </div>
        </div>
      ) : (
        <>
          <EstadoFilterTabs />
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Número visible</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((negocio) => (
                <TableRow key={negocio.id} className={cn(!negocio.activo && "opacity-60")}>
                  <TableCell className="font-medium">{negocio.nombre}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {negocio.display_phone_number ?? "Sin vincular"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={negocio.activo ? "default" : "secondary"}>
                      {negocio.activo ? "Activo" : "Inactivo"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-3">
                      <NegocioDialog
                        tenantId={tenant.id}
                        negocio={negocio}
                        trigger={
                          <Button variant="outline" size="sm">
                            Editar
                          </Button>
                        }
                      />
                      <NegocioActivoSwitch
                        tenantId={tenant.id}
                        negocioId={negocio.id}
                        nombre={negocio.nombre}
                        activo={negocio.activo}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}
    </div>
  );
}
