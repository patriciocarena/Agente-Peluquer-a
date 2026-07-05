/**
 * components/admin/estado-filter-tabs.tsx — Tabs "Todos / Activos /
 * Inactivos" que filtran las tablas de Grupos y Peluquerías del panel
 * superadmin (02-UI-SPEC.md §Soft-Delete Presentation). El filtro vive en
 * la URL (`?estado=activos|inactivos`, ausente = todos) para que el
 * Server Component de la página (admin/page.tsx, admin/[tenantId]/page.tsx)
 * pueda filtrar server-side sin duplicar el listado en el cliente.
 */
"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const ESTADO_FILTERS = [
  { value: "todos", label: "Todos" },
  { value: "activos", label: "Activos" },
  { value: "inactivos", label: "Inactivos" },
] as const;

export function EstadoFilterTabs() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get("estado") ?? "todos";

  return (
    <Tabs
      value={current}
      onValueChange={(value) => {
        const params = new URLSearchParams(searchParams.toString());
        if (value === "todos") {
          params.delete("estado");
        } else {
          params.set("estado", value);
        }
        const query = params.toString();
        router.push(query ? `${pathname}?${query}` : pathname);
      }}
    >
      <TabsList>
        {ESTADO_FILTERS.map((filter) => (
          <TabsTrigger key={filter.value} value={filter.value}>
            {filter.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
