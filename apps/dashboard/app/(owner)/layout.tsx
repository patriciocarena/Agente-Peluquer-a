/**
 * app/(owner)/layout.tsx — shell del owner (02-04 Task 1): sidebar fijo de
 * 240px (SidebarProvider/Sidebar del bloque shadcn) con las tres secciones
 * Profesionales/Servicios/Negocio, y un topbar con el `negocio-selector`
 * (D-13) a la izquierda y el `user-menu` (theme toggle + "Cerrar sesión",
 * AUTH-04) a la derecha. Responsive: icon-only rail <768px, Sheet
 * off-canvas <640px — ya resuelto por el bloque `components/ui/sidebar.tsx`
 * (02-UI-SPEC §Layout & Navigation).
 *
 * `requireRole("owner")` es la capa de defensa en profundidad (además del
 * gate de `middleware.ts`) — ningún owner-facing Server Component corre sin
 * pasar por acá primero (02-RESEARCH.md Pattern 2).
 *
 * `getNegocioActivo()` es la ÚNICA fuente server-side del negocio activo
 * (T-02-10): se resuelve acá, una vez, y se pasa ya validado al selector —
 * ninguna página hija necesita (ni debe) resolverlo por su cuenta.
 */
import type { ReactNode } from "react";

import { requireRole } from "@/lib/auth/require-role";
import { getNegocioActivo } from "@/lib/negocio-context";
import { OwnerSidebar } from "@/components/owner-sidebar";
import { NegocioSelector } from "@/components/negocio-selector";
import { UserMenu } from "@/components/user-menu";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";

export default async function OwnerLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireRole("owner");
  const { negocio, negocios } = await getNegocioActivo();

  return (
    <SidebarProvider>
      <OwnerSidebar />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b px-4">
          <div className="flex items-center gap-2">
            <SidebarTrigger aria-label="Alternar sidebar" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <NegocioSelector negocios={negocios} negocioActivoId={negocio.id} />
          </div>
          <UserMenu />
        </header>
        <main className="flex flex-1 flex-col gap-4 p-4 md:p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
