/**
 * @turnosbot/shared
 *
 * STUB — placeholder constants only. Real i18n strings, tenant config
 * shape, and cross-cutting constants land as later plans need them.
 */

/** Default locale for all customer-facing strings (barbershops in Argentina). */
export const DEFAULT_LOCALE = "es-AR" as const;

/** Default IANA timezone family for tenant scheduling (overridden per-tenant later). */
export const DEFAULT_TIMEZONE = "America/Argentina/Buenos_Aires" as const;

/** Default currency for pricing (Argentine peso). */
export const DEFAULT_CURRENCY = "ARS" as const;
