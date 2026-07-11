---
quick_id: 260711-gos
slug: fix-landing-owner-turnos
date: 2026-07-11
mode: quick (inline)
---

# Quick Task 260711-gos: Fix landing en blanco tras login del owner

## Bug (reproducido en vivo)

Un owner que se loguea aterriza en **`/`**, que es un stub vacío (`app/page.tsx` →
`return <main />`) → **página en blanco**. La acción de login (`app/actions/auth.ts:42`)
redirige a `/`; el `middleware.ts` rebota al superadmin de `/` → `/admin`, pero al owner
no lo manda a ningún lado, así que se queda en la raíz vacía.

Reproducido con el seed `owner-norte@turnosbot-seed.test`: `POST /login → 303`, luego
`/` con `document.body.innerText.length === 0`.

## Fix

`app/page.tsx` redirige a `/turnos`. El middleware ya garantiza que la raíz solo la
alcanza un owner autenticado (sin sesión → `/login`; superadmin → `/admin`), así que no
hace falta chequear rol en la página.

```tsx
import { redirect } from "next/navigation";
export default function Home() {
  redirect("/turnos");
}
```

Más robusto que arreglar solo el redirect del login: cubre cualquier arribo a `/`
(bookmark, navegación manual), no solo el post-login.

## Verificación

En vivo, server en :5202, sesión de owner activa: navegar a `/` debe terminar en
`/turnos` con la grilla renderizada (no `<main/>` vacío).

**Fuera de alcance:** los tests visuales de la fase 04 (MQ-1..4). Este es un fix de
routing de fase 02.
