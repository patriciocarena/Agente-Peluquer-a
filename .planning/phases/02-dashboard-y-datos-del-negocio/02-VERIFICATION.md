---
phase: 02-dashboard-y-datos-del-negocio
verified: 2026-07-05T02:42:51Z
status: human_needed
score: 15/16 requirements code-complete and verified; SADMIN end-to-end blocked on human bootstrap action
overrides_applied: 0
human_verification:
  - test: "Ejecutar scripts/bootstrap-superadmin.ts contra bdgufnitakelyialjoqg con credenciales reales del primer superadmin (email/password provistos por el humano, nunca hardcodeados)"
    expected: "Se crea un auth.user + una fila perfil(rol='superadmin', tenant_id=NULL); el superadmin puede loguearse en /login y el middleware lo redirige a /admin"
    why_human: "Requiere que el humano provea credenciales reales (no existen en el repo ni en .env); es una acción de una sola vez sobre la DB de producción/staging, correctamente gateada como checkpoint:human-action en el plan 02-08"
  - test: "Tras el bootstrap, ejecutar scripts/verify-admin-tenant-lifecycle.ts y confirmar (a) createTenantWithNegocio crea Tenant+owner+Negocio, (b) un fallo real en el insert de perfil deja 0 auth.users huérfanos (rollback), (c) el listado service_role ve el tenant sin pasar por JWT de owner"
    expected: "Los tres scripts de verificación pasan con exit 0, confirmando SADMIN-01/02/03 end-to-end contra la DB live"
    why_human: "El código (Server Actions + UI) ya está verificado estáticamente (tsc, vitest, tsc del build); falta únicamente la ejecución contra datos reales, que depende del superadmin bootstrapeado en el punto anterior"
  - test: "Loguearse visualmente en el dashboard como owner y como superadmin, y confirmar en el navegador (no solo por grep): paleta neutral+acento azul, dark/light toggle, opacidad ~60% en filas inactivas, badge gris (no rojo) 'Inactivo', drag-and-drop de servicios persistiendo visualmente, undo toast de 'Copiar a todos los días', y que el owner jamás ve /admin"
    expected: "El comportamiento visual coincide con 02-UI-SPEC.md en ambos temas"
    why_human: "Verificación visual/UX que no puede confirmarse por grep de código ni por tsc/vitest; no hay entorno de browser/Playwright en este runtime de verificación"
---

# Phase 2: Dashboard y datos del negocio — Verification Report

**Phase Goal:** El dueño de la peluquería puede loguearse y cargar toda la información base de su negocio; el superadmin puede dar de alta tenants.
**Verified:** 2026-07-05T02:42:51Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Owner login email/password, session persists on refresh, logout from any page (AUTH) | ✓ VERIFIED | `scripts/verify-auth-login.ts` run live against `bdgufnitakelyialjoqg`: login válido devuelve session con access+refresh token (AUTH-01); contraseña incorrecta rechazada; `refreshSession` + `getUser()` confirma el mismo `user.id` tras "refresh" (AUTH-02). `middleware.ts` usa `getUser()` (no getClaims/getSession) y gatea por rol. `user-menu.tsx` invoca la Server Action `signOut` real, montado en `app/(owner)/layout.tsx` que envuelve TODAS las páginas owner (AUTH-04). |
| 2 | Owner CRUD profesionales + horario semanal + servicios matrix con precio custom (PRO) | ✓ VERIFIED | `/profesionales`, `/profesionales/nuevo`, `/profesionales/[id]/editar` existen y compilan (`next build` con credenciales reales genera las 3 rutas). `horario-editor.tsx` (7 días, multi-bloque, "Copiar a todos los días", "Cerrado") y `servicios-matrix.tsx` (checkbox "Realiza" + precio custom) presentes y wireados a `updateHorario`/`updateServiciosMatrix` en `app/actions/profesionales.ts`, que derivan `negocio_id` server-side y validan pertenencia cruzada (T-02-18). `02-07-REVIEW.md`: 0 critical, 4 warnings (data-integrity, no bloqueantes — ver Anti-Patterns). |
| 3 | Owner CRUD + ordenar servicios (SVC) | ✓ VERIFIED | `/servicios` con Tabs Todos/Activos/Inactivos, Switch+AlertDialog destructivo, badge gris "Inactivo", drag-and-drop (`aria-label="Reordenar servicio"`) que llama `reorder()` (puro, testeado, 5 tests) y persiste vía `reorderServicios`. `servicio.test.ts` (7 tests) valida precio>=0 y duración entera>0. Todas las Server Actions derivan `negocio_id` de `getNegocioActivo()`. |
| 4 | Owner edita perfil del negocio + ve número WhatsApp (BIZ) | ✓ VERIFIED | `/negocio` edita nombre/dirección/teléfono/horario_general/timezone/granularidad (15/30) vía `updateNegocio`, que deriva `negocio_id` server-side (nunca del form). `negocio.display_phone_number` se muestra en bloque solo-lectura ("Este dato lo configura el superadmin de la plataforma"). `negocio.test.ts` (5 tests) valida granularidad∈{15,30}, nombre y timezone no vacíos. |
| 5 | Superadmin CRUD tenants + config WhatsApp + panel aislado de owners (SADMIN) | ? UNCERTAIN (code complete, live bootstrap pending) | Código completo y verificado estáticamente: `/admin`, `/admin/[tenantId]`, `tenant-dialog.tsx`/`negocio-dialog.tsx` (sin campo token), `admin-tenants.ts` con `createTenantWithNegocio` (Pattern 3, rollback `deleteUser`+`delete tenant`), único importador de `lib/supabase/admin.ts` confirmado por grep de imports reales. `next build` con credenciales reales genera `/admin` y `/admin/[tenantId]` sin error. PERO: consulta live a `bdgufnitakelyialjoqg` confirma `select * from perfil where rol='superadmin'` devuelve **0 filas** — `scripts/bootstrap-superadmin.ts` nunca se ejecutó. Sin un superadmin real, nadie puede loguearse en `/admin` hoy; el criterio de éxito no puede confirmarse end-to-end. Esto es un checkpoint humano documentado (02-08-PLAN.md Task 3), no un defecto de código. |

**Score:** 4/5 truths fully verified; 1/5 code-complete but blocked on a documented human action (not a code gap).

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/dashboard/lib/supabase/{server,client,admin}.ts` | 3 clientes Supabase (RLS server/browser, service_role) | ✓ VERIFIED | Existen; `admin.ts` tiene `import "server-only"`; único importador real es `admin-tenants.ts` (confirmado por grep de imports, no de comentarios) |
| `apps/dashboard/middleware.ts` | Gate de rol + refresh de sesión | ✓ VERIFIED | Usa `getUser()`, redirige por rol, matcher excluye assets/login |
| `apps/dashboard/app/(auth)/login/page.tsx` + `app/actions/auth.ts` | Login/logout | ✓ VERIFIED | `signIn`/`signOut` presentes; ejercitados live por `verify-auth-login.ts` (PASSED) |
| `scripts/verify-dashboard-isolation.ts` | AUTH-03 live | ✓ VERIFIED | Ejecutado en esta verificación: PASSED (Owner A ve solo sus 2 negocios, Owner B solo el suyo, 0 filas cross-tenant) |
| `apps/dashboard/app/(owner)/{negocio,servicios,profesionales}/**` | CRUD páginas | ✓ VERIFIED | Todas presentes; `next build` con env real genera las rutas dinámicas correspondientes |
| `apps/dashboard/app/actions/{negocio,servicios,profesionales}.ts` | Server Actions | ✓ VERIFIED | Todas derivan `negocio_id` de `getNegocioActivo()`, re-validan con zod, RLS-scoped |
| `apps/dashboard/lib/schemas/{negocio,servicio,profesional,horario,admin}.ts` (+ tests) | Validación zod | ✓ VERIFIED | 42/42 tests vitest pasan (7 archivos) |
| `apps/dashboard/app/(admin)/admin/**` + `app/actions/admin-tenants.ts` | Panel superadmin | ⚠️ ORPHANED (temporalmente) | Código completo, compila, pero sin ningún `perfil.rol='superadmin'` en la DB live la ruta es inalcanzable por cualquier usuario real hoy — no es un defecto de wiring sino la ausencia del dato de bootstrap |
| `scripts/bootstrap-superadmin.ts` + `scripts/verify-admin-tenant-lifecycle.ts` | Bootstrap + verificación live | ✗ NOT EXECUTED | Archivos existen y tipan; nunca se corrieron contra `bdgufnitakelyialjoqg` (confirmado: 0 superadmins en la tabla `perfil`) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `negocio-selector`/`negocio-context` | `negocio_id` activo | cookie validada contra RLS | ✓ WIRED | `getNegocioActivo()` es la única fuente consumida por Servicios/Profesionales/Negocio |
| `middleware` | gate `/admin` vs owner | `perfil.rol` vía `getUser()` | ✓ WIRED | Confirmado en código; sin superadmin real, la rama "redirige a /admin" nunca se ejercita en producción todavía (verificable solo tras el bootstrap) |
| `servicios-table` dnd | `servicio.orden` | `reorder()` → `reorderServicios` | ✓ WIRED | `reorder()` puro con 5 tests; Server Action persiste en batch |
| `horario-editor`/`servicios-matrix` | `horario_trabajo`/`profesional_servicio` | `updateHorario`/`updateServiciosMatrix` | ✓ WIRED | Ambas validan pertenencia al negocio activo antes de escribir (T-02-18) |
| `admin-tenants.ts` | `lib/supabase/admin.ts` | único importador (file-boundary) | ✓ WIRED | Confirmado por grep de `^import`, no de comentarios: solo `admin-tenants.ts` importa el cliente service_role |
| `createTenantWithNegocio` | rollback compensatorio | `deleteUser` + `delete tenant` en fallo Postgres | ✓ WIRED (código) / ? UNVERIFIED (live) | Implementado y revisado en 02-07-REVIEW.md-adjacent code review; el test end-to-end (`verify-admin-tenant-lifecycle.ts`) nunca corrió contra la DB real |
| `bootstrap-superadmin` | `perfil(rol=superadmin)` | habilita gate `/admin` | ✗ NOT EXECUTED | 0 filas `rol='superadmin'` confirmadas vía Management API contra `bdgufnitakelyialjoqg` |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `/servicios` page | `servicios` | `supabase.from("servicio").select("*").eq("negocio_id", negocio.id)` | Sí — query real, no static return | ✓ FLOWING |
| `/profesionales` page | `profesionales` | Query RLS-scoped por negocio activo | Sí | ✓ FLOWING |
| `/negocio` page | `negocio` | `getNegocioActivo()` → fila real de `negocio` | Sí | ✓ FLOWING |
| `verify-dashboard-isolation.ts` (proxy de todo el CRUD) | filas operativas | Login real + queries RLS-scoped | Sí — 0 filas cross-tenant confirmado en vivo | ✓ FLOWING |
| `/admin` page | `listTenants()` | `admin.from("tenant").select("*")` (service_role) | Sí — query real; pero devuelve datos existentes de seed, nunca ejercitado por un superadmin real logueado | ✓ FLOWING (código) / ? no ejercitado end-to-end por un usuario real |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| AUTH-01/02 login + persistencia de sesión, live | `pnpm exec tsx scripts/verify-auth-login.ts` (con `.env` cargado) | "PASSED" — login válido/inválido + refresh de sesión confirmados contra `bdgufnitakelyialjoqg` | ✓ PASS |
| AUTH-03 aislamiento cross-tenant, live | `pnpm exec tsx scripts/verify-dashboard-isolation.ts` | "PASSED" — Owner A (2 negocios) y Owner B (1 negocio) solo ven sus propias filas, 0 filas cruzadas | ✓ PASS |
| Unit tests (schemas: negocio, servicio, profesional, horario, admin, reorder) | `pnpm --filter @turnosbot/dashboard exec vitest run` | "7 test files, 42 tests passed" | ✓ PASS |
| Typecheck completo del dashboard | `pnpm --filter @turnosbot/dashboard exec tsc --noEmit` | Sin output (0 errores) | ✓ PASS |
| Build de producción con credenciales reales | `next build` (con `.env` cargado) | Compila; genera `/`, `/login`, `/negocio`, `/profesionales`, `/profesionales/[id]/editar`, `/profesionales/nuevo`, `/servicios`, `/admin`, `/admin/[tenantId]` | ✓ PASS |
| Existencia de superadmin en DB live | Management API: `select * from perfil where rol='superadmin'` contra `bdgufnitakelyialjoqg` | `[]` (0 filas) | ✗ FAIL (esperado — checkpoint humano pendiente, no un bug) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|--------------|------------|-------------|--------|----------|
| AUTH-01 | 02-02, 02-03 | Login email/password | ✓ SATISFIED | `verify-auth-login.ts` live PASSED |
| AUTH-02 | 02-03 | Persistencia de sesión | ✓ SATISFIED | `verify-auth-login.ts` live PASSED (refreshSession) |
| AUTH-03 | 02-01, 02-03 | Aislamiento por tenant/negocio | ✓ SATISFIED | `verify-dashboard-isolation.ts` live PASSED |
| AUTH-04 | 02-03, 02-04 | Logout desde cualquier página | ✓ SATISFIED | `user-menu.tsx` en `app/(owner)/layout.tsx` (envuelve todas las páginas owner) invoca `signOut` real |
| PRO-01 | 02-06 | CRUD profesionales + soft-delete | ✓ SATISFIED | Lista/alta/tabla con Tabs/Switch/AlertDialog; Server Actions verificadas |
| PRO-02 | 02-07 | Horario semanal multi-bloque | ✓ SATISFIED | `horario-editor.tsx` + `horarioSchema` (10 tests) + `updateHorario` |
| PRO-03 | 02-07 | Asignación de servicios por profesional | ✓ SATISFIED | `servicios-matrix.tsx` + `updateServiciosMatrix` |
| PRO-04 | 02-07 | Precio custom que pisa el base | ✓ SATISFIED | Columna `precio_custom` en la matriz; validación server-side (con el gap conocido WR-01 de NaN, no bloqueante) |
| SVC-01 | 02-05 | CRUD servicios | ✓ SATISFIED | `servicio.test.ts` (7 tests) + CRUD completo |
| SVC-02 | 02-05 | Orden drag-and-drop | ✓ SATISFIED | `reorder.test.ts` (5 tests) + persistencia en batch |
| BIZ-01 | 02-04 | Editar perfil del negocio | ✓ SATISFIED | `/negocio` + `negocio.test.ts` (5 tests) |
| BIZ-02 | 02-01, 02-04 | Ver WhatsApp vinculado | ✓ SATISFIED | `display_phone_number` mostrado solo-lectura |
| BIZ-03 | 02-04 | Granularidad 15/30 | ✓ SATISFIED | `negocioSchema` restringe a `{15,30}`, editable en `/negocio` |
| SADMIN-01 | 02-08 | CRUD tenants | ? NEEDS HUMAN | Código completo y verificado estáticamente; sin ejecución live no hay confirmación end-to-end |
| SADMIN-02 | 02-01, 02-08 | Config WhatsApp por negocio (sin token) | ? NEEDS HUMAN | `negocio-dialog.tsx` sin campo token (grep confirma); falta ejercitarlo con un superadmin real |
| SADMIN-03 | 02-08 | Listado aislado de RLS vía service_role | ? NEEDS HUMAN | `listTenants`/`getTenantWithNegocios` usan `admin.ts`; sin login real de superadmin no se puede confirmar el aislamiento end-to-end (aunque el gate de middleware está verificado en código) |

**Ninguna requirement quedó huérfana** — las 16 IDs de la tabla del prompt (AUTH-01..04, PRO-01..04, SVC-01..02, BIZ-01..03, SADMIN-01..03) están declaradas en `requirements:` de algún plan y mapeadas arriba.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `apps/dashboard/app/actions/profesionales.ts` | ~204-209 | `NaN` en `precioCustom` bypassa el guard `< 0` (WR-01 de 02-07-REVIEW.md) | ⚠️ Warning | Confirmado aún presente en el código actual; un cliente scripteado podría persistir un precio `NaN`. No bloqueante para el goal del phase (documentado, no crítico) |
| `apps/dashboard/app/actions/profesionales.ts` | `updateHorario`/`updateServiciosMatrix` | delete+insert / delete+upsert no transaccional (WR-02, WR-03) | ⚠️ Warning | Ventana de fallo parcial (data-integrity), no cross-tenant leak; documentado en 02-07-REVIEW.md, aceptado como no-bloqueante |
| `apps/dashboard/app/actions/profesionales.ts` | `updateHorario` | Sin enforcement server-side de alineación a `granularidad_min` (WR-04) | ℹ️ Info | Relevante para Fase 3 (motor de disponibilidad), no para el goal de esta fase |
| `apps/dashboard/components/horario-editor.tsx` | ~163-164 | `key={index}` en lista de bloques (IN-02) | ℹ️ Info | Cosmético/UX, no funcional |

Ningún anti-patrón bloqueante (🛑) fue encontrado. Los hallazgos arriba ya estaban documentados en `02-07-REVIEW.md` (0 critical / 4 warning) y se confirmaron aún presentes en esta verificación, sin agregar hallazgos nuevos de severidad mayor.

### Human Verification Required

### 1. Bootstrap del primer superadmin

**Test:** Ejecutar `scripts/bootstrap-superadmin.ts` contra `bdgufnitakelyialjoqg` con credenciales reales (email/password del superadmin, provistos por env/prompt — nunca hardcodeados en un archivo commiteado).
**Expected:** Se crea un `auth.user` + una fila `perfil(rol='superadmin', tenant_id=NULL)`; ese usuario puede loguearse en `/login` y el middleware lo redirige a `/admin`.
**Why human:** Requiere credenciales reales que no existen en el repo ni en `.env`; es una acción de una sola vez sobre la base de datos real, correctamente gateada como `checkpoint:human-action` en el propio plan 02-08 (no un olvido del ejecutor).

### 2. Ejecutar verify-admin-tenant-lifecycle.ts contra la DB live

**Test:** Tras el bootstrap, correr `pnpm exec tsx scripts/verify-admin-tenant-lifecycle.ts`.
**Expected:** Confirma (a) `createTenantWithNegocio` crea Tenant+owner+Negocio correctamente, (b) un fallo real (violación del CHECK de `rol`) dispara el rollback dejando 0 `auth.users` huérfanos, (c) el listado `service_role` ve el tenant sin pasar por un JWT de owner.
**Why human:** El código ya está verificado estáticamente (tsc, vitest, `next build` con credenciales reales); falta solo la ejecución contra datos reales, que depende de tener un superadmin bootstrapeado primero.

### 3. Verificación visual del panel completo en ambos temas

**Test:** Loguearse como owner (dashboard) y, tras el bootstrap, como superadmin (`/admin`); navegar Servicios (drag-and-drop, Tabs, badges), Profesionales (horario, matriz de precios), Negocio (granularidad, WhatsApp solo-lectura), y confirmar que un owner nunca ve `/admin` en el navegador real.
**Expected:** El comportamiento visual coincide con `02-UI-SPEC.md` en modo claro y oscuro: paleta neutral + acento azul único, filas inactivas muteadas (~60% opacidad) con badge gris (no rojo), undo toast de 5s al "Copiar a todos los días", reordenamiento persistente.
**Why human:** Verificación visual/UX que no puede confirmarse por grep ni por `tsc`/`vitest`; no hay entorno de browser/Playwright disponible en este runtime de verificación (ya señalado como pendiente en varios SUMMARYs de la fase, p.ej. 02-05 D4 y 02-06 D2).

### Gaps Summary

No se encontraron gaps de código. Las 4 primeras Success Criteria del roadmap (AUTH, PRO, SVC, BIZ) están completamente implementadas, verificadas estáticamente (tsc, vitest — 42/42 tests) y confirmadas en vivo contra la base real `bdgufnitakelyialjoqg` mediante `verify-auth-login.ts` y `verify-dashboard-isolation.ts` (ambos PASSED en esta verificación), además de un `next build` exitoso con credenciales reales que genera todas las rutas esperadas (incluidas `/admin` y `/admin/[tenantId]`).

La quinta Success Criterion (SADMIN) tiene su código completo, tipado y probado estáticamente (11 tests en `admin.test.ts`, sin campo token en el dialog de Negocio, único importador de `admin.ts` confirmado), pero **no puede verificarse end-to-end** porque `scripts/bootstrap-superadmin.ts` nunca se ejecutó contra la DB live — confirmado en esta verificación mediante una consulta directa a `bdgufnitakelyialjoqg` (`select * from perfil where rol='superadmin'` devuelve 0 filas). Esto es exactamente el estado documentado en `02-08-SUMMARY.md` (`status: blocked`, Task 3 pausada en `checkpoint:human-action`) y en el contexto crítico de este verificador: no es un defecto de código sino una acción pendiente que solo el humano puede completar (proveer las credenciales del primer superadmin).

Adicionalmente, 3 items de verificación visual (drag-and-drop end-to-end, opacidad/colores de badges, toggle de tema) quedan pendientes de confirmación humana en un navegador real, consistente con lo ya señalado como pendiente en los SUMMARYs de 02-05 y 02-06.

**Recomendación:** proceder a cerrar el código de la fase 02 (no hay gaps de implementación); resolver el checkpoint humano de 02-08 (bootstrap + verify-admin-tenant-lifecycle.ts + confirmación visual) antes de dar por completamente cerrada la Success Criterion #5 del roadmap.

---

*Verified: 2026-07-05T02:42:51Z*
*Verifier: Claude (gsd-verifier)*
