---
status: complete
phase: 04-grilla-y-turnos-del-dashboard
source:
  - 04-01-SUMMARY.md
  - 04-02-SUMMARY.md
  - 04-03-SUMMARY.md
  - 04-04-SUMMARY.md
  - 04-05-SUMMARY.md
  - 04-06-SUMMARY.md
  - 04-07-SUMMARY.md
started: 2026-07-06T00:00:00-03:00
updated: 2026-07-06T00:00:00-03:00
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: |
  Con .env real, `pnpm --filter @turnosbot/dashboard dev` bootea sin errores y
  navegar a /turnos renderiza la grilla (o empty state) sin error de conexión a Supabase.
  NOTA: requiere el availability-engine compilado a dist (`pnpm build` en la raíz) porque
  Turbopack no resuelve los especificadores NodeNext '.js' del src (ver 04-07-SUMMARY).
result: pass
note: |
  Verificado el 2026-07-06 con .env real: `next dev` (Turbopack) boot en 242ms sin errores,
  cargando .env.local. GET /turnos → 307 redirect a /login (gate de auth compila, sin 500);
  GET /login → 200. El render completo de la grilla se cubre en MQ-1 (§2). dist del engine
  presente. Se creó apps/dashboard/.env.local como symlink al .env raíz (gitignored) para
  que Next autolea las env vars.

### 2. MQ-1 — Grilla /turnos (APPT-01, D-01/D-02/D-03/D-06/D-07)
result: pass
note: |
  Layout, clickeabilidad, crear-vía-celda, repintado instantáneo y navegación de día
  verificados en vivo (2026-07-06). Contraste de color (D-02): se encontró un ISSUE —
  los 4 estados no se distinguían (confirmado a `bg-primary/12`=12%, azul, invisible en
  oscuro; pendiente ámbar fijo; bloqueo rayado a 14%). ARREGLADO en la misma sesión:
  grilla-turnos.tsx ahora usa tintes fuertes con barra de acento sólida a la izquierda
  (verde=confirmado, ámbar=pendiente, gris rayado 32%=bloqueo, plano=libre), theme-aware.
  El usuario confirmó en vivo que los 4 estados ahora se distinguen. Nota de diseño:
  --primary del proyecto es AZUL, no verde; confirmado se pintó verde (convención
  verde=agendado) vía estilo puntual, ya que no hay token --success/--warning.
expected: |
  /turnos muestra columnas = un profesional activo cada una (avatar + nombre), eje
  vertical = horas del día al paso de negocio.granularidad_min, UN día a la vez.
  4 estados de color distintos: libre (blanco, hover, pointer), confirmado (verde),
  pendiente (amber tenue), bloqueo (rayado gris diagonal). Click en celda libre →
  popover "Crear turno"/"Bloquear" con profesional+hora precargados; crear un turno
  repinta la celda a confirmado SIN refresh manual. Navegación de día (← / →, date-picker,
  ?fecha=). Empty states: sin profesionales activos → "Todavía no tenés profesionales
  activos"; profesional sin horario ese día → "Sin horario este día" pero celdas
  igual clickeables.
result: [pending]

### 3. MQ-2 — Detalle de turno (APPT-03, APPT-04, APPT-05, D-04/D-12/D-13)
expected: |
  Click en celda de turno (confirmado/pendiente) → Sheet lateral con nombre del cliente
  (o teléfono), cada servicio con su precio snapshot, total en font-semibold, horario
  HH:mm – HH:mm, y profesional. Precios es-AR ARS (ej "$ 12.500", sin decimales).
  Footer: "Reagendar" (outline) + "Cancelar turno" (destructive). Cancelar → confirmación
  "¿Seguro que querés cancelar este turno?" con "Confirmar"/"Volver", SIN campo motivo →
  toast "Turno cancelado.", cierra y libera la celda al instante. Reagendar → dialog con
  slot-selector compartido restringido a profesionales elegibles; nuevo slot → toast
  "Turno reagendado." y el turno se mueve (mismo id, no fila nueva).
result: pass
note: "Verificado en vivo el 2026-07-06 por el usuario: detalle con cliente/servicios/precio/total/horario/profesional, cancelar con confirmación sin motivo y reagendar OK."

### 4. MQ-3 — Alta manual de turno (APPT-06, D-09/D-10/D-11)
expected: |
  Desde el popover de celda libre → "Crear turno". Buscar cliente por teléfono; sin match
  → "No encontramos un cliente con ese teléfono." + alta inline ("Usar este cliente") sin
  salir del modal. Selector de profesional lista SOLO elegibles; slots = chips reales de
  computeSlots, incluyendo uno "para ahora mismo"/<60min (prueba del bypass de ventana D-07).
  Submit "Crear turno" → toast "Turno creado.", cierra, y la grilla muestra el nuevo
  confirmado.
result: pass
severity: minor
note: |
  Verificado en vivo el 2026-07-06: el usuario completó el alta de turno de punta a punta
  (buscar/crear cliente inline → servicio → slot real → "Crear turno" → celda pintada).
  La FUNCIÓN pasa. HALLAZGO DE UX (no bloqueante): el usuario reportó que la búsqueda de
  cliente es mala — obliga a conocer el teléfono, exige tildar ≥3 dígitos + click "Buscar"
  (sin búsqueda en vivo ni autocompletar), y no hay lista de clientes para elegir. Ver Gaps.

### 5. MQ-4 — Bloqueos manuales (APPT-02, D-03/D-05)
expected: |
  Desde popover de celda libre → "Bloquear" → dialog con profesional+hora precargados
  (no re-tipeados); motivo opcional; submit → toast "Horario bloqueado." y la celda pasa
  a estado rayado. Click en celda de bloqueo → popover con el motivo (o "Sin motivo
  especificado" en muted) y "Eliminar bloqueo" (destructive, con aria-label). Confirmación
  "¿Eliminar este bloqueo? El horario vuelve a estar disponible." → toast "Bloqueo
  eliminado." y la celda vuelve a libre al instante.
result: pass
note: "Verificado en vivo el 2026-07-06 por el usuario: crear bloqueo (precargado) → celda rayada; eliminar con confirmación → libera al instante."

### 6. Reschedule live script — GiST EXCLUDE re-fira en UPDATE (A1, APPT-05)
expected: |
  Con .env real, correr `pnpm tsx scripts/verify-reschedule.ts` contra bdgufnitakelyialjoqg
  prueba en vivo que el constraint GiST EXCLUDE (23P01) se re-dispara en un UPDATE de turno
  (no solo en INSERT) — reagendar a un slot ya ocupado devuelve slot_taken, no doble-booking.
  Script gated en credenciales reales (mismo patrón que los scripts gated de Fase 3).
result: pass
note: |
  Corrido en vivo contra bdgufnitakelyialjoqg el 2026-07-06 → "verify-reschedule.ts: PASSED"
  (exit 0). Verificado: el UPDATE dispara la GiST EXCLUDE real (23P01)→slot_taken (sin
  doble-booking) y el turno A conserva su horario original (sin estado inconsistente).
  Fix aplicado al script: la aserción final comparaba timestamps como strings crudos
  ("….000Z" de JS vs "…+00:00" de Postgres) dando un falso negativo; ahora compara por
  instante (new Date().getTime()). Cero cambios al código de producto (rescheduleAppointment).

## Summary

total: 6
passed: 6
issues: 0
pending: 0
skipped: 0
resolved_during_uat: 1  # MQ-1 contraste de color (D-02) — arreglado y re-verificado en vivo
notes: |
  MQ-1 (grilla) parcialmente ejercitada al completar MQ-3 (celdas clickeables, popover,
  crear-vía-grilla, repintado). Faltan confirmar explícitamente: estados de color D-02,
  navegación de día y empty states. Pendientes: MQ-1 (colores/nav), MQ-2, MQ-4.
  3 observaciones de UX/pre-existentes registradas en Gaps (ninguna bloquea la Fase 4).

## Gaps

- truth: "El dueño puede encontrar/elegir un cliente de forma cómoda al agendar un turno"
  status: works_with_ux_concern
  reason: "El usuario reportó que la búsqueda de cliente es mala UX: requiere conocer el teléfono, tildar ≥3 dígitos + click 'Buscar' (sin búsqueda en vivo/typeahead), y no existe lista/gestión de clientes para elegir de una. La función agenda correctamente, pero el flujo es incómodo para uso real del dueño."
  severity: minor
  test: 4
  category: ux
  scope: "Mejora de producto, no defecto de un requisito de la Fase 4. Candidato a backlog: (a) typeahead en vivo por nombre/teléfono, (b) lista/gestión de clientes, o (c) búsqueda por nombre además de teléfono."
  artifacts: [apps/dashboard/components/cliente-search.tsx, apps/dashboard/app/actions/clientes.ts]
  missing: []

- truth: "Tras iniciar sesión, el dueño llega a una pantalla útil (no a una página vacía)"
  status: pre_existing_gap
  reason: "signIn redirige a '/', que es app/page.tsx = `<main />` (vacío, fuera del grupo (owner), sin sidebar) → se ve toda negra en tema oscuro. Es un placeholder de la Fase 2, no de la Fase 4."
  severity: minor
  test: 0
  category: ux
  scope: "Fuera del alcance de la Fase 4. Fix simple: redirigir '/' (o el login) a '/turnos'. Anotar para una pasada de Fase 2/auth."
  artifacts: [apps/dashboard/app/page.tsx, apps/dashboard/app/actions/auth.ts]
  missing: []

- truth: "El input de precio en el alta/edición de servicio no dispara warnings de React"
  status: pre_existing_gap
  reason: "Console error 'Received NaN for the value attribute' en servicio-dialog.tsx (input de precio numérico arranca en NaN). Warning no fatal, pantalla /servicios (Fase 2), no /turnos."
  severity: cosmetic
  test: 0
  category: correctness
  scope: "Fuera del alcance de la Fase 4 (componente de Fase 2). Fix: castear value a string o default '' cuando NaN."
  artifacts: [apps/dashboard/components/servicio-dialog.tsx]
  missing: []
