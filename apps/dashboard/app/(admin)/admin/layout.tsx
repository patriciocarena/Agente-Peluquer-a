/**
 * app/(admin)/admin/layout.tsx — shell superadmin (D-03): navegación
 * jerárquica Grupos -> Negocios, mismos tokens visuales que el shell del
 * owner (02-UI-SPEC.md §Layout & Navigation: "Visually distinguished from
 * the owner shell only by the route/content, not by a different color
 * scheme — one app, one aesthetic").
 *
 * `requireRole("superadmin")` acá es defensa en profundidad (belt-and-
 * suspenders, mismo espíritu que lib/auth/require-role.ts): middleware.ts
 * YA redirige a cualquier owner que intente entrar a `/admin/*` antes de
 * que este layout renderice (D-03, 02-RESEARCH.md Pattern 2) — este
 * chequeo cubre el caso de un Server Component/Action de `/admin`
 * invocado fuera de ese flujo.
 */
import type { ReactNode } from "react";
import Link from "next/link";
import { Building2 } from "lucide-react";

import { requireRole } from "@/lib/auth/require-role";
import { UserMenu } from "@/components/user-menu";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const { email } = await requireRole("superadmin");

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <span className="px-2 py-1 text-sm font-semibold text-sidebar-foreground group-data-[collapsible=icon]:hidden">
            TurnosBot Admin
          </span>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive tooltip="Grupos">
                    <Link href="/admin">
                      <Building2 />
                      <span>Grupos</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarRail />
      </Sidebar>
      <SidebarInset>
        <header className="flex h-14 items-center justify-between gap-2 border-b px-4">
          <div className="flex items-center gap-2">
            <SidebarTrigger />
            <Separator orientation="vertical" className="h-6" />
            <span className="text-sm font-medium text-foreground">Panel superadmin</span>
          </div>
          <UserMenu email={email} />
        </header>
        <main className="flex-1 p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
