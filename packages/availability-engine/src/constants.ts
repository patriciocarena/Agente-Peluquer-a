/**
 * constants.ts — única fuente de verdad de la ventana de reserva del motor
 * de disponibilidad (D-04/D-05, 03-CONTEXT.md).
 *
 * D-04: el motor solo ofrece slots con al menos `BOOKING_MIN_LEAD_MINUTES`
 * minutos de anticipación respecto de "ahora", y como máximo
 * `BOOKING_MAX_ADVANCE_DAYS` días hacia adelante.
 * D-05: en v1 estos dos límites son constantes hardcodeadas en el motor
 * (no columnas por negocio) — cero cambios de schema en esta fase.
 * Exponerlos como configurables por negocio se difiere a Fase 4. Se
 * definen en este único archivo para que esa futura promoción a config
 * sea un cambio de un solo archivo, no una búsqueda dispersa por el código.
 */

/** Anticipación mínima para reservar: 60 minutos (D-04). */
export const BOOKING_MIN_LEAD_MINUTES = 60;

/** Horizonte máximo de reserva hacia adelante: 30 días (D-04). */
export const BOOKING_MAX_ADVANCE_DAYS = 30;
