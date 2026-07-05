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
 * `bookAppointment` (AVAIL-03) se agrega en Wave 4 (Plan 03-05).
 */
export * from "./types.js";
export * from "./constants.js";
export { computeSlots } from "./computeSlots.js";
