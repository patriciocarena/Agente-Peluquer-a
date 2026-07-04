"use client"

import * as React from "react"
import { ThemeProvider as NextThemesProvider } from "next-themes"

/**
 * ThemeProvider — envuelve next-themes con estrategia `class` para que el
 * variant `dark:` de Tailwind funcione (02-UI-SPEC §Design System). El toggle
 * Sol/Luna del topbar solo alterna `theme`; este provider es la única fuente
 * de verdad del modo claro/oscuro.
 */
export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>
}
