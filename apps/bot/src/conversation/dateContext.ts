/**
 * apps/bot/src/conversation/dateContext.ts — buildDateContext(nowMs, timezone):
 * resuelve "hoy" (YYYY-MM-DD) y el nombre del día de la semana, en la
 * timezone del negocio, para inyectar en el system prompt (Bug fecha,
 * bot-no-agenda-uuid-y-fecha.md / 06-UAT.md Gaps: el modelo usó fechaDeseada
 * '2025-07-25' con el año equivocado porque nunca tuvo un "hoy" en contexto).
 *
 * Usa `Intl.DateTimeFormat` nativo (Node 24) — sin agregar `@date-fns/tz`
 * como dependencia nueva de `apps/bot` (esa dependencia ya vive en
 * `@turnosbot/availability-engine`, pero este cálculo es lo bastante simple
 * como para no cruzar el barrel del motor solo por esto).
 *
 * Función pura (misma disciplina que `systemPrompt.ts`/`computeSlots.ts`):
 * `nowMs` y `timezone` SIEMPRE inyectados por el caller (`responder.ts`, que
 * a su vez los resuelve de `deps.now()` y `negocio.timezone` vía
 * `negocioScoped`) — nunca lee `Date.now()` ni ningún negocio acá adentro,
 * así que es determinísticamente testeable sin mockear el reloj global.
 */
export interface DateContext {
  /** Fecha de "hoy" en formato YYYY-MM-DD, en la timezone del negocio. */
  fechaHoy: string;
  /** Nombre del día de la semana en español (p.ej. "viernes"), en la
   * timezone del negocio. */
  diaSemanaHoy: string;
}

/**
 * buildDateContext(nowMs, timezone) — usa la convención de
 * `Intl.DateTimeFormat("en-CA", ...)` para obtener directamente el formato
 * YYYY-MM-DD (locale en-CA formatea fechas cortas así, evita tener que
 * reordenar día/mes/año a mano) y `Intl.DateTimeFormat("es-AR", { weekday:
 * "long" })` para el nombre del día en español.
 */
export function buildDateContext(nowMs: number, timezone: string): DateContext {
  const fechaHoy = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(nowMs);

  const diaSemanaHoy = new Intl.DateTimeFormat("es-AR", {
    timeZone: timezone,
    weekday: "long",
  }).format(nowMs);

  return { fechaHoy, diaSemanaHoy };
}
