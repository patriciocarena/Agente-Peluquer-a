/**
 * app/(admin)/admin/page.tsx — listado de Tenants (Grupos), raíz de
 * `/admin` (SADMIN-01/03). Server Component: lee vía `listTenants()`
 * (service_role, aislado de RLS). CTA "+ Nuevo grupo" (único acento,
 * 02-UI-SPEC.md), empty state exacto, Tabs Todos/Activos/Inactivos +
 * Switch de soft-delete con AlertDialog destructivo exacto.
 */
import Link from "next/link";

import { listTenants } from "@/app/actions/admin-tenants";
import { EstadoFilterTabs } from "@/components/admin/estado-filter-tabs";
import { TenantActivoSwitch } from "@/components/admin/tenant-activo-switch";
import { TenantDialog } from "@/components/admin/tenant-dialog";
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

type SearchParams = Promise<{ estado?: string }>;

export default async function AdminGruposPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { estado } = await searchParams;
  const tenants = await listTenants();

  const filtered = tenants.filter((tenant) => {
    if (estado === "activos") return tenant.activo;
    if (estado === "inactivos") return !tenant.activo;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Grupos</h1>
        <TenantDialog trigger={<Button>+ Nuevo grupo</Button>} />
      </div>

      {tenants.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <h2 className="text-lg font-semibold">Todavía no hay grupos registrados</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Creá el primer grupo para empezar a darle de alta sus peluquerías.
          </p>
          <div className="mt-4 flex justify-center">
            <TenantDialog trigger={<Button>+ Nuevo grupo</Button>} />
          </div>
        </div>
      ) : (
        <>
          <EstadoFilterTabs />
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((tenant) => (
                <TableRow key={tenant.id} className={cn(!tenant.activo && "opacity-60")}>
                  <TableCell>
                    <Link
                      href={`/admin/${tenant.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {tenant.nombre}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant={tenant.activo ? "default" : "secondary"}>
                      {tenant.activo ? "Activo" : "Inactivo"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-3">
                      <TenantDialog
                        tenant={tenant}
                        trigger={
                          <Button variant="outline" size="sm">
                            Editar
                          </Button>
                        }
                      />
                      <TenantActivoSwitch
                        tenantId={tenant.id}
                        nombre={tenant.nombre}
                        activo={tenant.activo}
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
