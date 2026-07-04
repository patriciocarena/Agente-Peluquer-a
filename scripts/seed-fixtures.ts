/**
 * Shared fixture constants for the seeded test data (D-16).
 * Mirrors scripts/apply-seed.ts exactly — imported by the verify-* scripts
 * and tenantScoped.test.ts so tenant/negocio/owner identities are defined
 * in exactly one place.
 *
 * Post-migration-0003 shape (D-09..D-12): `negocioId`/`profesionalId`/
 * `clienteId`/`turnoId`/`nombreNegocio` below always refer to each tenant's
 * PRIMARY (first) negocio — kept stable so pre-existing scripts that read
 * these flat fields (verify-isolation.ts, verify-timezone.ts,
 * verify-double-booking.ts, tenantScoped.test.ts) do not need to change
 * shape. TENANT_A additionally has `segundoNegocio` — a second negocio
 * under the SAME tenant (1:N model, D-12) — used to exercise the
 * owner's negocio selector; TENANT_B intentionally stays a single-negocio
 * tenant so cross-TENANT isolation checks (verify-isolation.ts) still
 * compare two distinct tenants.
 */

export const TENANT_A = {
  tenantId: "11111111-1111-1111-1111-111111111111",
  nombreTenant: "Grupo Norte",
  negocioId: "21111111-1111-1111-1111-111111111111",
  profesionalId: "31111111-1111-1111-1111-111111111111",
  clienteId: "51111111-1111-1111-1111-111111111111",
  turnoId: "61111111-1111-1111-1111-111111111111",
  nombreNegocio: "Barbería Norte",
  ownerEmail: "owner-norte@turnosbot-seed.test",
  ownerPassword: "TurnosBotSeed!Norte1",
  segundoNegocio: {
    negocioId: "23111111-1111-1111-1111-111111111111",
    profesionalId: "33111111-1111-1111-1111-111111111111",
    clienteId: "53111111-1111-1111-1111-111111111111",
    turnoId: "63111111-1111-1111-1111-111111111111",
    nombreNegocio: "Barbería Norte - Sucursal Palermo",
  },
} as const;

export const TENANT_B = {
  tenantId: "12222222-2222-2222-2222-222222222222",
  nombreTenant: "Grupo Sur",
  negocioId: "22222222-2222-2222-2222-222222222222",
  profesionalId: "32222222-2222-2222-2222-222222222222",
  clienteId: "52222222-2222-2222-2222-222222222222",
  turnoId: "62222222-2222-2222-2222-222222222222",
  nombreNegocio: "Barbería Sur",
  ownerEmail: "owner-sur@turnosbot-seed.test",
  ownerPassword: "TurnosBotSeed!Sur1",
} as const;
