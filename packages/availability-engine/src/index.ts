/**
 * @turnosbot/availability-engine — barrel de exports públicos.
 *
 * Este es el único path que `apps/bot` y `apps/dashboard` importan
 * (`"@turnosbot/availability-engine"`, definido por `main`/`types` en
 * package.json) — preservado exactamente; solo los internos se movieron a
 * módulos separados (constants.ts, intervals.ts, grid.ts, schedule.ts,
 * computeSlots.ts, autoAssign.ts, types.ts). Superficie pública mínima:
 * `computeSlots` + tipos + constantes. Los primitivos internos
 * (intervals/grid/schedule/autoAssign) NO se re-exportan — no hay
 * consumidor externo que los necesite (AVAIL-04: un único módulo puro
 * compartido, sin drift).
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
 */
export * from "./types.js";
export * from "./constants.js";
export { computeSlots } from "./computeSlots.js";
export { bookAppointment } from "./booking.js";
export type { BookAppointmentDeps, BookAppointmentResult } from "./booking.js";
export { isSlotTakenConcurrently } from "./booking.js";
export { rescheduleAppointment } from "./booking.js";
