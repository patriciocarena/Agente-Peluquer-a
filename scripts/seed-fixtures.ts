/**
 * Shared fixture constants for the seeded two-tenant test data (D-16).
 * Mirrors supabase/seed.sql and scripts/apply-seed.ts exactly — imported by
 * the verify-* scripts and tenantScoped.test.ts so tenant/owner identities
 * are defined in exactly one place.
 */

export const TENANT_A = {
  tenantId: "11111111-1111-1111-1111-111111111111",
  negocioId: "21111111-1111-1111-1111-111111111111",
  profesionalId: "31111111-1111-1111-1111-111111111111",
  clienteId: "51111111-1111-1111-1111-111111111111",
  turnoId: "61111111-1111-1111-1111-111111111111",
  nombreNegocio: "Barbería Norte",
  ownerEmail: "owner-norte@turnosbot-seed.test",
  ownerPassword: "TurnosBotSeed!Norte1",
} as const;

export const TENANT_B = {
  tenantId: "12222222-2222-2222-2222-222222222222",
  negocioId: "22222222-2222-2222-2222-222222222222",
  profesionalId: "32222222-2222-2222-2222-222222222222",
  clienteId: "52222222-2222-2222-2222-222222222222",
  turnoId: "62222222-2222-2222-2222-222222222222",
  nombreNegocio: "Barbería Sur",
  ownerEmail: "owner-sur@turnosbot-seed.test",
  ownerPassword: "TurnosBotSeed!Sur1",
} as const;
