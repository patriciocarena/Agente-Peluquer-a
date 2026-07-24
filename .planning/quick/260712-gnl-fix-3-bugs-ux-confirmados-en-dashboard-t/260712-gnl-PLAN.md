---
phase: 260712-gnl
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/dashboard/components/turno-form-dialog.tsx
  - apps/dashboard/components/turno-detail-sheet.tsx
  - apps/dashboard/components/dia-picker.tsx
  - apps/dashboard/lib/auth/require-role.ts
  - apps/dashboard/app/(owner)/layout.tsx
  - apps/dashboard/app/(admin)/admin/layout.tsx
  - apps/dashboard/components/user-menu.tsx
autonomous: true
requirements:
  - UX-BUG-1-sheet-reagendar-stale
  - UX-BUG-2-diapicker-desync
  - UX-BUG-3-usermenu-iniciales-hardcodeadas

must_haves:
  truths:
    - "Tras reagendar un turno con exito (toast 'Turno reagendado.'), el Sheet de detalle se cierra solo — la grilla ya revalidada es la unica fuente de verdad visible; no queda mostrando el horario viejo"
    - "Al navegar con los links Dia anterior/siguiente, el input type=date del DiaPicker muestra el dia efectivamente cargado, no el dia previo"
    - "El avatar del topbar muestra iniciales derivadas del email real del usuario autenticado (no 'OW'), y el dropdown muestra el email de la cuenta activa (owner y superadmin)"
  artifacts:
    - path: "apps/dashboard/components/turno-form-dialog.tsx"
      provides: "Prop opcional onSuccess?() invocada en el exito de reagendar"
    - path: "apps/dashboard/components/turno-detail-sheet.tsx"
      provides: "onSuccess={() => onOpenChange(false)} en el TurnoFormDialog mode=reagendar"
    - path: "apps/dashboard/components/dia-picker.tsx"
      provides: "key={fecha} en el input type=date para forzar remount"
    - path: "apps/dashboard/lib/auth/require-role.ts"
      provides: "email:string en PerfilAutenticado y en el return de requireRole"
    - path: "apps/dashboard/components/user-menu.tsx"
      provides: "Prop email:string, iniciales derivadas y email visible en el dropdown"
  key_links:
    - from: "apps/dashboard/components/turno-detail-sheet.tsx"
      to: "TurnoFormDialog (mode=reagendar)"
      via: "onSuccess callback que cierra el Sheet padre"
      pattern: "onSuccess=\\{\\(\\) => onOpenChange\\(false\\)\\}"
    - from: "apps/dashboard/app/(owner)/layout.tsx y app/(admin)/admin/layout.tsx"
      to: "UserMenu"
      via: "prop email capturada de requireRole()"
      pattern: "<UserMenu email=\\{email\\}"
---

<objective>
Fix de 3 bugs de UX YA CONFIRMADOS en vivo en el dashboard de turnos (Next.js App Router, localhost:5202). El diagnostico y el fix exacto de cada bug ya fueron auditados por el orquestador leyendo el codigo y reproduciendo en el navegador — este plan solo implementa. NO re-investigar, NO re-explorar.

Los 3 bugs son independientes entre si y tocan archivos disjuntos, por eso van como 3 tasks autocontenidos y commiteables por separado dentro de un unico plan.

Purpose: Los tres son fallas de experiencia del dueno en la vista de agenda — el Sheet queda con datos viejos tras reagendar, el date-picker se desincroniza al navegar dias, y el avatar muestra iniciales hardcodeadas "OW" sin conexion a datos reales. Ninguno rompe funcionalidad de negocio (las Server Actions y revalidatePath funcionan bien), pero los tres erosionan la confianza en lo que la UI muestra.

Output: 7 archivos del dashboard modificados; `corepack pnpm typecheck` en 0 errores tras cada task.

Alcance duro (regla de CLAUDE.md): SOLO estos archivos del dashboard. NO tocar schema, DB, Server Actions de negocio (`app/actions/*`), motor de disponibilidad, ni el bot. NO mezclar con el proyecto del restaurante.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/STATE.md

# Bug 1 — archivos que se tocan y su patron de referencia
@apps/dashboard/components/turno-form-dialog.tsx
@apps/dashboard/components/turno-detail-sheet.tsx

# Bug 2
@apps/dashboard/components/dia-picker.tsx

# Bug 3
@apps/dashboard/lib/auth/require-role.ts
@apps/dashboard/app/(owner)/layout.tsx
@apps/dashboard/app/(admin)/admin/layout.tsx
@apps/dashboard/components/user-menu.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Cerrar el Sheet de detalle tras un reagendado exitoso (Bug 1)</name>
  <files>apps/dashboard/components/turno-form-dialog.tsx, apps/dashboard/components/turno-detail-sheet.tsx</files>
  <action>
Causa raiz confirmada: en `turno-form-dialog.tsx` el `onSubmit()` exitoso llama `onOpenChange(false)` (linea ~137), pero ese `onOpenChange` es el prop del PROPIO TurnoFormDialog (controla solo el dialog anidado de reagendar) — nunca toca el `open`/`onOpenChange` del Sheet padre montado en `turno-detail-sheet.tsx` (linea ~166-173). El objeto `turno` que ve el Sheet es una snapshot capturada al click; por eso el Sheet sigue mostrando el horario viejo. La grilla de fondo si se mueve bien (revalidatePath funciona). El fix NO intenta refrescar el turno in-place: cierra el Sheet, dejando la grilla revalidada como unica fuente de verdad — mismo patron que ya usa la funcion `cancelar()` del Sheet, que hace `onOpenChange(false)` del Sheet en su exito (linea ~90).

1. En `turno-form-dialog.tsx`: agregar prop opcional `onSuccess?: () => void` al tipo `Props` (bloque de lineas ~48-63) y agregarlo a los parametros destructurados de `TurnoFormDialog` (lineas ~65-75). Dentro de `onSubmit()`, en la rama de exito — justo despues de `toast.success(...)` (linea ~136) y junto al `onOpenChange(false)` (linea ~137) — invocar `onSuccess?.()`. El modo "alta" (creacion desde SlotPopover) no pasa `onSuccess`, asi que ahi la llamada opcional es no-op y el comportamiento de creacion actual queda intacto.

2. En `turno-detail-sheet.tsx`: en el elemento `<TurnoFormDialog mode="reagendar" ... />` (lineas ~166-173) agregar el prop `onSuccess={() => onOpenChange(false)}`. Asi un reagendado exitoso cierra TAMBIEN el Sheet padre (mismo resultado final que ya provoca "Cancelar turno"). NO agregar logica para "refrescar" el turno dentro del Sheet.

No modificar las Server Actions ni ningun otro archivo.
  </action>
  <verify>
    <automated>cd apps/dashboard && corepack pnpm typecheck</automated>
    <human-check>En /turnos: abrir un turno confirmado (el Sheet muestra su horario, ej "09:30 - 10:00"), clic "Reagendar", elegir otro horario, "Confirmar nuevo horario". Esperado: aparece el toast "Turno reagendado." Y el Sheet se cierra solo; la grilla muestra el turno en el horario nuevo. (Antes: el Sheet quedaba mostrando el horario viejo.)</human-check>
  </verify>
  <done>`corepack pnpm typecheck` pasa con 0 errores. `turno-form-dialog.tsx` expone `onSuccess?()` y lo invoca en el exito; `turno-detail-sheet.tsx` pasa `onSuccess={() => onOpenChange(false)}` al dialog de reagendar. El modo "alta" no cambia de comportamiento.</done>
</task>

<task type="auto">
  <name>Task 2: Resincronizar el DiaPicker al navegar dias (Bug 2)</name>
  <files>apps/dashboard/components/dia-picker.tsx</files>
  <action>
Causa raiz confirmada: `<input type="date" defaultValue={fecha} ... />` (lineas ~28-38) — `defaultValue` solo aplica en el mount inicial. Al navegar con los links Dia anterior/siguiente (que son `<Link>` server-side y cambian el search param `?fecha=`), Next.js re-renderiza el Server Component padre con un nuevo `fecha`, pero el Client Component `DiaPicker` NO se remonta (misma posicion en el arbol) — solo se re-renderiza, y `defaultValue` no tiene efecto en updates. Por eso el encabezado cambia pero el input queda pegado en el dia viejo.

Fix minimo: agregar `key={fecha}` al elemento `<input type="date" ...>`. Esto fuerza a React a desmontar/remontar el input cada vez que cambia la prop `fecha`, re-aplicando `defaultValue` con el valor nuevo. Es el patron canonico de React para "resetear un componente no controlado cuando cambia una prop" — mas simple que convertirlo en input controlado para un unico input nativo sin otro estado interno. No cambiar nada mas del componente (el `onChange` que hace `router.push` queda igual).
  </action>
  <verify>
    <automated>cd apps/dashboard && corepack pnpm typecheck</automated>
    <human-check>En /turnos?fecha=2026-07-12 el input de fecha muestra "12/07/2026". Clic en "Dia siguiente". Esperado: el encabezado pasa a "lunes, 13 de julio" Y el input type=date pasa a "13/07/2026". (Antes: el input seguia en "12/07/2026".)</human-check>
  </verify>
  <done>`corepack pnpm typecheck` pasa con 0 errores. El `<input type="date">` de `dia-picker.tsx` tiene `key={fecha}`; al navegar dias el input muestra el dia cargado.</done>
</task>

<task type="auto">
  <name>Task 3: Iniciales y email reales en el UserMenu (Bug 3)</name>
  <files>apps/dashboard/lib/auth/require-role.ts, apps/dashboard/app/(owner)/layout.tsx, apps/dashboard/app/(admin)/admin/layout.tsx, apps/dashboard/components/user-menu.tsx</files>
  <action>
Causa raiz confirmada: `user-menu.tsx` tiene `<AvatarFallback>OW</AvatarFallback>` literal (linea ~48), nunca se conecto a datos reales. `require-role.ts` ya llama `supabase.auth.getUser()` y tiene `user.email` disponible, pero el tipo de retorno `PerfilAutenticado` (lineas ~26-30) solo expone `userId`/`rol`/`tenantId` y descarta el email. La tabla `perfil` NO tiene columna `nombre` — el unico identificador humano disponible es `user.email` de `auth.users`. El cambio de tipo es aditivo y no rompe a los ~10+ callers de `requireRole` (todos descartan el return); `<UserMenu>` solo se monta en los dos layouts que este task modifica; nada mas construye un `PerfilAutenticado`.

1. `lib/auth/require-role.ts`: agregar `email: string` al tipo `PerfilAutenticado` (lineas ~26-30) y agregar `email: user.email ?? ""` al objeto que devuelve `requireRole()` (return de la linea ~67). `user` ya esta en scope; `user.email` es `string | undefined`, por eso el coalesce a `""`.

2. `app/(owner)/layout.tsx`: cambiar `await requireRole("owner");` (linea ~37) para capturar el resultado — `const { email } = await requireRole("owner");` — y pasar `email` a `<UserMenu />` (linea ~50) como `<UserMenu email={email} />`.

3. `app/(admin)/admin/layout.tsx`: mismo cambio — `const { email } = await requireRole("superadmin");` (linea ~38) y `<UserMenu email={email} />` (linea ~73).

4. `components/user-menu.tsx`: agregar un tipo `Props` con `email: string` y cambiar la firma a `export function UserMenu({ email }: Props)` (hoy no recibe props, linea ~24). Agregar una funcion chica LOCAL que derive iniciales del email: tomar la parte antes del `@`, en mayusculas, sus primeras 2 letras; fallback `"?"` si `email` viene vacio. Reemplazar el `<AvatarFallback>OW</AvatarFallback>` (linea ~48) por esas iniciales derivadas. Ademas, agregar el email completo como texto NO clickeable dentro del `DropdownMenuContent` (linea ~52) — arriba de la fila del toggle de tema, o como item separado no interactivo — con clases `text-xs text-muted-foreground truncate` (o similar, consistente con el resto del dropdown) para que el dueno confirme que cuenta tiene activa. Sin dependencias nuevas.

No tocar Server Actions, middleware, ni schema.
  </action>
  <verify>
    <automated>cd apps/dashboard && corepack pnpm typecheck</automated>
    <human-check>Login como owner (seed: owner-norte@turnosbot-seed.test): el avatar del topbar muestra iniciales del email (no "OW"); abrir el dropdown muestra el email de la cuenta activa. Repetir como superadmin en /admin (phono4884@gmail.com): mismas iniciales/email reales.</human-check>
  </verify>
  <done>`corepack pnpm typecheck` pasa con 0 errores. `PerfilAutenticado` y el return de `requireRole` incluyen `email`; ambos layouts capturan y pasan `email` a `UserMenu`; `UserMenu` renderiza iniciales derivadas del email (no "OW") y muestra el email en el dropdown. Ningun otro caller de `requireRole` rompe.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

Cambio UI-only del dashboard. No introduce ningun trust boundary nuevo: no hay entrada de usuario nueva que cruce al servidor, no hay endpoints nuevos, no hay instalacion de paquetes.

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-gnl-01 | Information Disclosure | `user-menu.tsx` muestra el email en avatar/dropdown | accept | El email es el del usuario autenticado (`auth.getUser()` del propio request); se renderiza solo en su propio topbar. No expone datos de otros usuarios/tenants. Sin cambio de superficie de datos. |
| T-gnl-02 | Elevation of Privilege | `require-role.ts` return type gana `email` | accept | Cambio puramente aditivo al tipo/objeto de retorno; el gate de rol/activo (`perfil.rol`, `perfil.activo`, redirect) queda intacto. No altera ninguna decision de acceso. |
| T-gnl-SC | Tampering | npm/pnpm installs | mitigate | N/A — cero paquetes instalados en este plan (todos los fixes usan React/Next ya presentes). No hay superficie de supply-chain. |
</threat_model>

<verification>
Tras cada task, desde la raiz del repo:

`cd apps/dashboard && corepack pnpm typecheck` → 0 errores.

(Nota de entorno, ver STATE.md: `pnpm` NO esta en PATH — usar el prefijo `corepack pnpm`. El baseline de typecheck en `main` esta limpio: 0 errores confirmado antes de empezar, el error preexistente de `turnos/page.tsx:250` que menciona STATE.md ya fue resuelto en un commit posterior.)

Los tres bugs son de comportamiento visual/interactivo y `apps/dashboard` no tiene framework de render de componentes, asi que la prueba conductual final es en el navegador (guiones en cada `<human-check>`). El gate automatizado por task es el typecheck.
</verification>

<success_criteria>
- Los 3 tasks commiteados por separado (cada uno autocontenido y reversible de forma independiente).
- `corepack pnpm typecheck` en 0 errores tras cada task.
- Bug 1: reagendar exitoso cierra el Sheet; deja de mostrar el horario viejo.
- Bug 2: navegar Dia anterior/siguiente sincroniza el input de fecha con el dia cargado.
- Bug 3: avatar con iniciales del email real (no "OW") + email visible en el dropdown, tanto en owner como en superadmin.
- Cero cambios fuera de los 7 archivos listados. Nada de schema/DB/bot/Server Actions de negocio.
</success_criteria>

<output>
Al terminar, crear `.planning/quick/260712-gnl-fix-3-bugs-ux-confirmados-en-dashboard-t/260712-gnl-SUMMARY.md` con: los 3 fixes aplicados, los 7 archivos tocados, el resultado del typecheck, y los commits (uno por bug si se commitea por separado).
</output>
