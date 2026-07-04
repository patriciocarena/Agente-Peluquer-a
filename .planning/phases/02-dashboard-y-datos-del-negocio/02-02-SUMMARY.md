---
phase: 02-dashboard-y-datos-del-negocio
plan: 02
subsystem: ui
tags: [nextjs, tailwind-v4, shadcn, radix, next-themes, inter, vitest, sonner, react-hook-form, dnd-kit]

# Dependency graph
requires:
  - phase: 02-01
    provides: stub apps/dashboard (package.json con next 16.2.10, react 19, @supabase/ssr) + monorepo pnpm
provides:
  - Dashboard Next.js 16 con Tailwind v4 (CSS-first) + shadcn/ui inicializados (base radix, css-variables)
  - globals.css con base neutral de shadcn + acento azul aislado en --primary/--ring/--sidebar-primary (light #2563EB / dark #3B82F6)
  - ThemeProvider (next-themes, estrategia class) + Inter self-hosted + Toaster (sonner) en el root layout
  - 24 componentes shadcn del inventario UI-SPEC en components/ui/ (incl. form estilo radix-base) + sidebar/sheet/tooltip/use-mobile
  - Runner de tests vitest configurado y ejecutable (vitest.config.ts + script test + smoke test verde)
affects: [auth, dashboard CRUD, profesionales, servicios, negocio, superadmin, testing]

# Tech tracking
tech-stack:
  added: [tailwindcss@4.3.2, "@tailwindcss/postcss@4.3.2", shadcn@4.13.0, radix-ui, next-themes@0.4.6, sonner@2.0.7, lucide-react@1.23.0, class-variance-authority@0.7.1, clsx@2.1.1, tailwind-merge@3.6.0, tw-animate-css, react-hook-form@7.80.0, "@hookform/resolvers@5.4.0", "@dnd-kit/core@6.3.1", "@dnd-kit/sortable@10.0.0", "@dnd-kit/utilities@3.2.2", vitest@4.1.9]
  patterns: ["Tailwind v4 CSS-first (sin tailwind.config.js)", "base neutral shadcn + override de acento en bloque dedicado", "next-themes class strategy -> variant dark:", "vitest ESM con alias @/* alineado a tsconfig"]

key-files:
  created: [apps/dashboard/components.json, apps/dashboard/postcss.config.mjs, apps/dashboard/next.config.ts, apps/dashboard/app/globals.css, apps/dashboard/app/layout.tsx, apps/dashboard/app/page.tsx, apps/dashboard/components/theme-provider.tsx, apps/dashboard/lib/utils.ts, apps/dashboard/vitest.config.ts, apps/dashboard/lib/__smoke__.test.ts, "apps/dashboard/components/ui/ (24 componentes)"]
  modified: [apps/dashboard/package.json, apps/dashboard/tsconfig.json, .gitignore]

key-decisions:
  - "shadcn 4.x cambió a presets nombrados (nova/vega/...); se usó -b radix -p nova y se reescribió globals.css a mano para garantizar base neutral + acento exacto de la UI-SPEC (preset-independiente)"
  - "Componente form agregado manualmente en estilo radix-base (el item del registry no se materializó en el CLI); imports desde radix-ui unificado (Slot.Root)"
  - "next-env.d.ts añadido a .gitignore (autogenerado por Next); lib DOM añadida al tsconfig del dashboard (el base solo declaraba ES2022)"

patterns-established:
  - "Acento aislado: solo --primary/--primary-foreground/--ring/--sidebar-primary(+fg)/--sidebar-ring se sobreescriben a azul; el resto queda neutral de shadcn"
  - "Fuente Inter self-hosted vía next/font/google expuesta como --font-sans (NUNCA CDN)"
  - "vitest include lib/**/*.test.ts -> lugar canónico de tests de lib/schemas (zod) y lib/reorder (dnd-kit) para fases CRUD"

requirements-completed: [AUTH-01]

# Metrics
duration: 35min
completed: 2026-07-04
---

# Phase 2 Plan 02: Base visual del dashboard (Tailwind v4 + shadcn + tema + vitest) Summary

**Dashboard Next.js 16 con Tailwind v4 CSS-first + shadcn/ui (base radix), tema claro/oscuro vía next-themes, Inter self-hosted, 24 componentes del inventario UI-SPEC y runner vitest operativo — todo compilando con `next build`.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-07-04T17:30Z (aprox.)
- **Completed:** 2026-07-04T18:10Z
- **Tasks:** 2 auto (+ Task 0 checkpoint de legitimidad de paquetes: aprobado por el humano)
- **Files modified:** ~40 (24 componentes UI + config + layout/tema + vitest)

## Accomplishments
- shadcn/ui + Tailwind v4 inicializados scoped a `apps/dashboard` (base radix, css-variables, sin tailwind.config.js)
- Paleta neutral (grises) con un único acento azul aplicado SOLO a `--primary`/`--ring`/`--sidebar-primary` (+ foregrounds), light `#2563EB` / dark `#3B82F6`, en `:root` y `.dark`
- `layout.tsx`: Inter self-hosted (next/font/google, NO CDN) + `ThemeProvider` (next-themes, estrategia `class`) + `<Toaster />` de sonner
- 24 componentes del inventario en `components/ui/` (button, input, label, textarea, select, checkbox, switch, table, tabs, dialog, alert-dialog, card, badge, separator, dropdown-menu, sonner, skeleton, form, avatar, sidebar + sheet/tooltip transitivos)
- vitest 4.1.9 configurado (`vitest.config.ts` ESM, entorno node, alias `@/*`) + script `test` + smoke test verde
- `next build` compila sin errores; `vitest run` pasa

## Task Commits

Cada task fue commiteado atómicamente:

1. **Task 1: Init Tailwind v4 + shadcn + tema + componentes UI** - `f146e36` (feat)
2. **Task 2: Configurar vitest (andamiaje Wave 0)** - `07a9ab9` (test)

_Task 0 fue un checkpoint bloqueante de legitimidad de paquetes (verificación en registry.npmjs.org de los 14 paquetes nuevos: repo/maintainer esperados, sin postinstall sospechoso), aprobado explícitamente por el humano antes de cualquier install._

## Files Created/Modified
- `apps/dashboard/components.json` - config shadcn (style radix-nova, baseColor neutral, aliases @/*)
- `apps/dashboard/postcss.config.mjs` - plugin @tailwindcss/postcss (Tailwind v4)
- `apps/dashboard/next.config.ts` - config Next mínima
- `apps/dashboard/app/globals.css` - @import tailwindcss + @theme inline + tokens neutral + bloque de override de acento
- `apps/dashboard/app/layout.tsx` - Inter self-hosted + ThemeProvider + Toaster
- `apps/dashboard/app/page.tsx` - placeholder de home (reemplaza al viejo placeholder.ts eliminado)
- `apps/dashboard/components/theme-provider.tsx` - wrapper de next-themes (class strategy)
- `apps/dashboard/components/ui/*` - 24 componentes shadcn del inventario (form escrito a mano en estilo radix-base)
- `apps/dashboard/lib/utils.ts` - helper `cn()`
- `apps/dashboard/vitest.config.ts` - runner de tests (node, include lib/**/*.test.ts, alias @/*)
- `apps/dashboard/lib/__smoke__.test.ts` - smoke test placeholder (Wave 0)
- `apps/dashboard/package.json` - deps nuevas + script test + descripción actualizada
- `apps/dashboard/tsconfig.json` - alias @/*, baseUrl, lib DOM
- `.gitignore` - añadido next-env.d.ts

## Decisions Made
- **Preset de shadcn:** el CLI 4.x reemplazó el viejo flujo de "base color neutral" por presets nombrados (nova/vega/maia/...). Se usó `-b radix -p nova` y luego se reescribió `globals.css` a mano para fijar la base neutral + acento exacto de la UI-SPEC, haciendo el resultado independiente del preset.
- **Componente form manual:** el item `form` del registry no se materializó vía CLI (se colgaba en "Checking registry"); se escribió `form.tsx` a mano en estilo radix-base consistente con los demás componentes (import `Slot` desde `radix-ui`, `Slot.Root`).
- **Entorno de tests node:** el foco de Wave 0 es lógica pura (lib/schemas zod, lib/reorder dnd-kit); tests de UI sumarían su propio entorno cuando lleguen.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] CLI de shadcn 4.x sin el flujo de base-color asumido por el plan**
- **Found during:** Task 1 (init)
- **Issue:** El comando del plan (`shadcn init -t next -b radix --css-variables -y`) se colgaba pidiendo un preset interactivo (Nova/Vega/...) que la UI-SPEC no contemplaba; `-t next` además no scaffoldea el app en un stub y fallaba la detección de framework/Tailwind/alias.
- **Fix:** Se scaffoldeó una estructura Next mínima (next.config.ts, app/layout, app/page, globals.css), se instaló Tailwind v4 + postcss config y se agregó el alias `@/*` al tsconfig; luego `shadcn init -b radix -p nova` completó. globals.css se reescribió a mano para garantizar la base neutral + acento de la UI-SPEC.
- **Files modified:** apps/dashboard/next.config.ts, postcss.config.mjs, tsconfig.json, app/globals.css
- **Verification:** `next build` compila; components.json + tokens presentes
- **Committed in:** f146e36 (Task 1)

**2. [Rule 3 - Blocking] Componente `form` no generado por el CLI**
- **Found during:** Task 1
- **Issue:** `shadcn add form` no materializaba el archivo (se detenía en "Checking registry").
- **Fix:** Se escribió `components/ui/form.tsx` a mano en estilo radix-base (Slot desde radix-ui, integración react-hook-form), consistente con label/button generados.
- **Files modified:** apps/dashboard/components/ui/form.tsx
- **Verification:** `next build` type-check pasa
- **Committed in:** f146e36 (Task 1)

**3. [Rule 3 - Blocking] Falta lib DOM en el tsconfig base**
- **Found during:** Task 1 (next build type-check)
- **Issue:** `tsconfig.base.json` solo declara `lib: ["ES2022"]`; sidebar.tsx usa `document` -> error de tipos "Cannot find name 'document'".
- **Fix:** Se añadió `lib: ["dom", "dom.iterable", "ES2022"]` + `target ES2022` al tsconfig del dashboard.
- **Files modified:** apps/dashboard/tsconfig.json
- **Verification:** `next build` type-check pasa
- **Committed in:** f146e36 (Task 1)

**4. [Rule 3 - Blocking] next-env.d.ts autogenerado sin ignorar**
- **Found during:** Task 1
- **Issue:** Next genera `next-env.d.ts`; no debe commitearse.
- **Fix:** Añadido a `.gitignore`.
- **Files modified:** .gitignore
- **Committed in:** f146e36 (Task 1)

---

**Total deviations:** 4 auto-fixed (todas Rule 3 - blocking: desalineación entre el CLI de shadcn actual y el comando del plan + config faltante). Ninguna cambia el contrato visual de la UI-SPEC ni agrega scope: el resultado (base neutral + acento azul aislado, Inter self-hosted, inventario de componentes, vitest) es exactamente el especificado.
**Impact on plan:** Sin scope creep. Los ajustes fueron mecánicos para reproducir el contrato con la versión vigente del toolchain.

## Issues Encountered
- `pnpm` no estaba en PATH; se usó `corepack pnpm` (9.15.0, coincide con `packageManager`) vía un shim en PATH para que el CLI de shadcn (que invoca `pnpm` directo) resolviera.
- Los presets del CLI de shadcn 4.x fueron el mayor punto de fricción (ver Deviations 1); resuelto reescribiendo globals.css a mano.

## Known Stubs
- `apps/dashboard/app/page.tsx` - home vacío (`<main />`), placeholder hasta que auth/CRUD definan la ruta por defecto (Profesionales list, per UI-SPEC). Intencional; lo resuelven las fases de auth/CRUD siguientes.
- `apps/dashboard/lib/__smoke__.test.ts` - test placeholder que solo prueba que el runner arranca; las fases CRUD lo reemplazan con tests reales de lib/schemas y lib/reorder.

## User Setup Required
None - no se requiere configuración de servicios externos en este plan (scaffolding puro de frontend; sin acceso a DB).

## Next Phase Readiness
- Base visual + tooling listos: los planes de auth y CRUD pueden construir páginas y Server Actions sobre shadcn + tema + vitest ya operativos.
- Sin bloqueos introducidos por este plan. (El bloqueo activo del proyecto sigue siendo el de 02-01: aplicar la migración 0003 live contra bdgufnitakelyialjoqg — ajeno a este plan de frontend.)

---
*Phase: 02-dashboard-y-datos-del-negocio*
*Completed: 2026-07-04*

## Self-Check: PASSED

- Archivos clave verificados en disco (components.json, globals.css, layout.tsx, vitest.config.ts, form.tsx, sidebar.tsx, theme-provider.tsx, smoke test, SUMMARY).
- Commits verificados en git log: f146e36 (Task 1), 07a9ab9 (Task 2).
