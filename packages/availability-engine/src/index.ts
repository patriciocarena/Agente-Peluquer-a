/**
 * @turnosbot/availability-engine — barrel de exports públicos.
 *
 * Este es el único path que `apps/bot` y `apps/dashboard` importan
 * (`"@turnosbot/availability-engine"`, definido por `main`/`types` en
 * package.json) — preservado exactamente; solo los internos se movieron a
 * módulos separados (constants.ts, intervals.ts, grid.ts, schedule.ts,
 * computeSlots.ts, autoAssign.ts, types.ts). Superficie pública mínima:
 * `computeSlots` + tipos + constantes. Los primitivos internos
 * (intervals/grid/schedule) NO se re-exportan — no hay consumidor externo
 * que los necesite (AVAIL-04: un único módulo puro compartido, sin drift).
 * `autoAssign` SÍ se reexporta (Fase 6 Plan 03, BOT-02/D-04): la tool
 * `asignarProfesional` del bot necesita invocar la MISMA función de
 * desempate que `computeSlots` usa internamente cuando no hay preferencia
 * de profesional, en vez de reimplementar la heurística.
 *
 * `bookAppointment` (AVAIL-03, Wave 4/Plan 03-05) se agrega debajo —
 * único camino de escritura compartido, junto con `isSlotTakenConcurrently`
 * para que el caller (bot/dashboard) pueda branchear su UX sobre el `23P01`
 * (CORE-05) sin reimplementar la detección del código localmente.
 *
 * `rescheduleAppointment` (D-14, Fase 4 Plan 01) se agrega debajo — hermana
 * de `bookAppointment` que hace UPDATE del mismo turno (nunca cancela+crea);
 * el dashboard (Planes 03-07) y el bot (Fase 6, BOT-10) la importan desde
 * este mismo barrel para no duplicar el motor (AVAIL-04).
 *
 * `cancelAppointment` (BOT-09, Fase 6 Plan 01) se agrega debajo — el TERCER
 * camino de escritura compartido (junto a bookAppointment/rescheduleAppointment),
 * cerrando el gap de cancelación (AVAIL-04 aplicado a cancelar): el dashboard
 * (Plan 06-01) y la tool del bot (Plan 06-04) importan la MISMA función, sin
 * un UPDATE inline paralelo que pudiera divergir. `uuidLike` también se
 * reexporta acá para que las tools del bot (planes 06-03/06-04) validen
 * turnoId/negocioId/etc con la misma forma de UUID que el motor, sin
 * redeclarar un regex propio.
 */
export * from "./types.js";
export * from "./constants.js";
export { computeSlots } from "./computeSlots.js";
export { autoAssign } from "./autoAssign.js";
export { bookAppointment } from "./booking.js";
export type { BookAppointmentDeps, BookAppointmentResult } from "./booking.js";
export { isSlotTakenConcurrently } from "./booking.js";
export { rescheduleAppointment } from "./booking.js";
export { cancelAppointment, uuidLike } from "./booking.js";
export type { CancelAppointmentResult } from "./booking.js";
