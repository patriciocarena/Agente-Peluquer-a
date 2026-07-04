/**
 * components/owner-sidebar.tsx — sidebar fijo del shell owner (240px vía
 * SidebarProvider en app/(owner)/layout.tsx), tres secciones: Profesionales /
 * Servicios / Negocio (02-UI-SPEC §Layout & Navigation). Item activo con
 * acento (SidebarMenuButton isActive ya usa --sidebar-primary/accent).
 *
 * Las rutas /profesionales y /servicios se construyen en 02-05/02-06 (fuera
 * de este plan) — el sidebar ya expone las tres secciones porque es parte
 * del contrato visual de esta fase; hasta que esos planes corran, esos dos
 * links no tienen página propia todavía.
 */
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Scissors, Store, Users } from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";

const NAV_ITEMS = [
  { href: "/profesionales", label: "Profesionales", icon: Users },
  { href: "/servicios", label: "Servicios", icon: Scissors },
  { href: "/negocio", label: "Negocio", icon: Store },
] as const;

export function OwnerSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <span className="px-2 py-1 text-sm font-semibold text-sidebar-foreground group-data-[collapsible=icon]:hidden">
          TurnosBot
        </span>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
                const isActive = pathname === href || pathname.startsWith(`${href}/`);
                return (
                  <SidebarMenuItem key={href}>
                    <SidebarMenuButton asChild isActive={isActive} tooltip={label}>
                      <Link href={href}>
                        <Icon />
                        <span>{label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}
