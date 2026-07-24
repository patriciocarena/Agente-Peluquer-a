---
quick_id: 260711-gos
slug: fix-landing-owner-turnos
date: 2026-07-11
status: complete
---

# Quick Task 260711-gos — Summary

## Qué se arregló

El owner que se logueaba aterrizaba en `/`, un stub vacío (`app/page.tsx` → `<main />`),
viendo una **página en blanco**. Descubierto en vivo mientras se preparaban los tests
visuales de la fase 04.

## Cambio (1 archivo, código)

- `apps/dashboard/app/page.tsx`: de `return <main />` a `redirect("/turnos")`
  (`next/navigation`). El middleware ya garantiza que la raíz solo la alcanza un owner
  autenticado (sin sesión → `/login`; superadmin → `/admin`), así que no hace falta
  chequear rol en la página. Cubre cualquier arribo a `/`, no solo el post-login.

## Verificación (en vivo, server :5202)

- Con sesión de owner (`owner-norte@turnosbot-seed.test`), navegar a `/` ahora termina en
  `/turnos` con la grilla renderizada (`document.body.innerText.length > 0`, contiene
  "Turnos"), **cero errores de consola**. Antes: `/` con body vacío.
- Next dev compiló el cambio vía HMR y sirvió `/turnos` sin errores (confirma tipado/compilación
  sin correr `tsc`, que sufre la trampa del `dist/` viejo — env rule #6 del handoff).
- Ningún test dependía del stub (`grep` sin matches).

## Alcance

Fix de routing de la **fase 02** (auth/landing), independiente de los tests visuales
MQ-1..4 de la fase 04, que siguen pendientes.
