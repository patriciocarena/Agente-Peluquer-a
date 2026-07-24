/**
 * components/user-menu.tsx — avatar + dropdown en el topbar con el toggle de
 * tema (Sun/Moon icon-only, aria-label="Cambiar tema" — MANDATORY de
 * 02-UI-SPEC §Visual Hierarchy & Accessibility) y "Cerrar sesión" (AUTH-04,
 * sin confirmación — invoca la Server Action signOut directamente).
 */
"use client";

import { useTransition } from "react";
import { useTheme } from "next-themes";
import { LogOut, Moon, Sun } from "lucide-react";

import { signOut } from "@/app/actions/auth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Props = {
  /** Email del usuario autenticado (owner o superadmin) — única fuente
   * disponible de identidad legible, `perfil` no tiene columna `nombre`. */
  email: string;
};

/** Primeras 2 letras (mayúsculas) de la parte local del email, ej.
 * "ana.perez@x.com" -> "AN". Fallback "?" si el email viene vacío. */
function inicialesDeEmail(email: string): string {
  if (!email) return "?";
  const local = email.split("@")[0] ?? "";
  return local.slice(0, 2).toUpperCase() || "?";
}

export function UserMenu({ email }: Props) {
  const { theme, setTheme } = useTheme();
  const [isPending, startTransition] = useTransition();

  function toggleTheme() {
    setTheme(theme === "dark" ? "light" : "dark");
  }

  function handleSignOut() {
    startTransition(async () => {
      await signOut();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full"
          aria-label="Abrir menú de usuario"
        >
          <Avatar size="sm">
            <AvatarFallback>{inicialesDeEmail(email)}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="truncate font-normal" title={email}>
          {email}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="flex items-center justify-between px-1.5 py-1">
          <span className="text-sm text-muted-foreground">Tema</span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Cambiar tema"
            onClick={toggleTheme}
          >
            {theme === "dark" ? <Sun /> : <Moon />}
          </Button>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={isPending}
          onSelect={(event) => {
            event.preventDefault();
            handleSignOut();
          }}
        >
          <LogOut />
          Cerrar sesión
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
