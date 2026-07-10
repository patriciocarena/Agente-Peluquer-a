/**
 * Applies the seed data live to the TurnosBot Supabase project
 * (bdgufnitakelyialjoqg) via @supabase/supabase-js (service_role).
 *
 * This environment has no psql / Supabase CLI / SUPABASE_DB_URL access, so
 * this script is the mechanism that actually materializes seed data against
 * the live database (Plan 01-05, D-16). This script additionally creates the
 * Supabase Auth owner users (impossible via plain SQL INSERT against
 * auth.users) and their matching `perfil` rows.
 *
 * Post-migration-0003 shape (D-09..D-12): a `tenant` is now a
 * grupo/contenedor with ONLY `nombre` + `activo`; the WhatsApp fields
 * (whatsapp_phone_number_id, waba_id, whatsapp_token_secret_id,
 * display_phone_number) + `activo` live on `negocio`; every operational row
 * (profesional, servicio, cliente, turno) carries `negocio_id` (not
 * `tenant_id`). TENANT_A is seeded with TWO negocios under the same tenant
 * to exercise the 1:N model (owner negocio selector, D-12); TENANT_B stays
 * a single-negocio tenant so cross-TENANT isolation checks still compare
 * two distinct tenants. The owner (`perfil`) remains tied to the TENANT
 * (D-08/D-12), not to an individual negocio.
 *
 * Isolation: targets ONLY bdgufnitakelyialjoqg (SUPABASE_URL from .env).
 * Never any other, unrelated Supabase project. This seed never creates a
 * Vault secret (whatsapp_token_secret_id stays NULL, its column default —
 * SEC-01/Phase 7 dropped the plaintext whatsapp_token column entirely).
 *
 * Usage: pnpm exec tsx scripts/apply-seed.ts
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@turnosbot/db-types";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "FALTAN SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en .env — abortando.",
  );
  process.exit(1);
}

if (!SUPABASE_URL.includes("bdgufnitakelyialjoqg")) {
  console.error(
    `SUPABASE_URL (${SUPABASE_URL}) no apunta al proyecto TurnosBot (bdgufnitakelyialjoqg). Abortando por regla de aislamiento.`,
  );
  process.exit(1);
}

const supabaseAdmin = createClient<Database>(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type NegocioSeed = {
  negocioId: string;
  nombreNegocio: string;
  direccion: string;
  telefono: string;
  whatsappPhoneNumberId: string;
  wabaId: string;
  displayPhoneNumber: string;
  profesionalId: string;
  profesionalNombre: string;
  servicios: { id: string; nombre: string; descripcion: string; precio: number; duracion_min: number; orden: number }[];
  clienteId: string;
  clienteTelefono: string;
  clienteNombre: string;
  turnoId: string;
  turnoInicio: string;
  turnoFin: string;
  precioTurno: number;
};

type TenantSeed = {
  tenantId: string;
  nombreTenant: string;
  negocios: NegocioSeed[];
  ownerEmail: string;
  ownerPassword: string;
};

const TENANT_A: TenantSeed = {
  tenantId: "11111111-1111-1111-1111-111111111111",
  nombreTenant: "Grupo Norte",
  ownerEmail: "owner-norte@turnosbot-seed.test",
  ownerPassword: "TurnosBotSeed!Norte1",
  negocios: [
    {
      negocioId: "21111111-1111-1111-1111-111111111111",
      nombreNegocio: "Barbería Norte",
      direccion: "Av. Siempre Viva 123, CABA",
      telefono: "+54 9 11 0000-0001",
      whatsappPhoneNumberId: "fake-phone-number-id-norte",
      wabaId: "fake-waba-id-norte",
      displayPhoneNumber: "+54 9 11 0000-0001",
      profesionalId: "31111111-1111-1111-1111-111111111111",
      profesionalNombre: "Fede (Norte)",
      servicios: [
        { id: "41111111-1111-1111-1111-111111111111", nombre: "Corte clásico", descripcion: "Corte de pelo estándar", precio: 6000.0, duracion_min: 30, orden: 0 },
        { id: "42111111-1111-1111-1111-111111111111", nombre: "Corte + Barba", descripcion: "Corte y arreglo de barba", precio: 9000.0, duracion_min: 45, orden: 1 },
      ],
      clienteId: "51111111-1111-1111-1111-111111111111",
      clienteTelefono: "+5491100000010",
      clienteNombre: "Cliente Norte",
      turnoId: "61111111-1111-1111-1111-111111111111",
      // 15:00 America/Argentina/Buenos_Aires (fixed UTC-3, no DST) == 18:00Z — CORE-04.
      turnoInicio: "2026-07-10T18:00:00Z",
      turnoFin: "2026-07-10T18:30:00Z",
      precioTurno: 6000.0,
    },
    {
      // Segundo negocio del mismo tenant (D-12: 1 tenant -> N negocios),
      // ejercita el selector de negocio del owner (D-13).
      negocioId: "23111111-1111-1111-1111-111111111111",
      nombreNegocio: "Barbería Norte - Sucursal Palermo",
      direccion: "Av. Santa Fe 4500, CABA",
      telefono: "+54 9 11 0000-0003",
      whatsappPhoneNumberId: "fake-phone-number-id-norte-palermo",
      wabaId: "fake-waba-id-norte-palermo",
      displayPhoneNumber: "+54 9 11 0000-0003",
      profesionalId: "33111111-1111-1111-1111-111111111111",
      profesionalNombre: "Nico (Palermo)",
      servicios: [
        { id: "44111111-1111-1111-1111-111111111111", nombre: "Corte clásico", descripcion: "Corte de pelo estándar", precio: 6500.0, duracion_min: 30, orden: 0 },
      ],
      clienteId: "53111111-1111-1111-1111-111111111111",
      clienteTelefono: "+5491100000030",
      clienteNombre: "Cliente Palermo",
      turnoId: "63111111-1111-1111-1111-111111111111",
      turnoInicio: "2026-07-10T19:00:00Z",
      turnoFin: "2026-07-10T19:30:00Z",
      precioTurno: 6500.0,
    },
  ],
};

const TENANT_B: TenantSeed = {
  tenantId: "12222222-2222-2222-2222-222222222222",
  nombreTenant: "Grupo Sur",
  ownerEmail: "owner-sur@turnosbot-seed.test",
  ownerPassword: "TurnosBotSeed!Sur1",
  negocios: [
    {
      negocioId: "22222222-2222-2222-2222-222222222222",
      nombreNegocio: "Barbería Sur",
      direccion: "Calle Falsa 456, CABA",
      telefono: "+54 9 11 0000-0002",
      whatsappPhoneNumberId: "fake-phone-number-id-sur",
      wabaId: "fake-waba-id-sur",
      displayPhoneNumber: "+54 9 11 0000-0002",
      profesionalId: "32222222-2222-2222-2222-222222222222",
      profesionalNombre: "Gonzalo (Sur)",
      servicios: [
        { id: "42222222-2222-2222-2222-222222222222", nombre: "Corte clásico", descripcion: "Corte de pelo estándar", precio: 6500.0, duracion_min: 30, orden: 0 },
        { id: "43222222-2222-2222-2222-222222222222", nombre: "Perfilado de barba", descripcion: "Perfilado y arreglo de barba", precio: 4000.0, duracion_min: 20, orden: 1 },
      ],
      clienteId: "52222222-2222-2222-2222-222222222222",
      clienteTelefono: "+5491100000020",
      clienteNombre: "Cliente Sur",
      turnoId: "62222222-2222-2222-2222-222222222222",
      turnoInicio: "2026-07-10T18:00:00Z",
      turnoFin: "2026-07-10T18:30:00Z",
      precioTurno: 6500.0,
    },
  ],
};

async function upsertNegocio(tenantId: string, negocio: NegocioSeed) {
  const { error: negocioErr } = await supabaseAdmin.from("negocio").upsert({
    id: negocio.negocioId,
    tenant_id: tenantId,
    nombre: negocio.nombreNegocio,
    direccion: negocio.direccion,
    telefono: negocio.telefono,
    timezone: "America/Argentina/Buenos_Aires",
    granularidad_min: 30,
    whatsapp_phone_number_id: negocio.whatsappPhoneNumberId,
    waba_id: negocio.wabaId,
    display_phone_number: negocio.displayPhoneNumber,
    activo: true,
  });
  if (negocioErr) throw new Error(`negocio upsert (${negocio.nombreNegocio}): ${negocioErr.message}`);

  const { error: profesionalErr } = await supabaseAdmin.from("profesional").upsert({
    id: negocio.profesionalId,
    negocio_id: negocio.negocioId,
    nombre: negocio.profesionalNombre,
    activo: true,
  });
  if (profesionalErr) throw new Error(`profesional upsert (${negocio.nombreNegocio}): ${profesionalErr.message}`);

  for (const svc of negocio.servicios) {
    const { error: servicioErr } = await supabaseAdmin.from("servicio").upsert({
      id: svc.id,
      negocio_id: negocio.negocioId,
      nombre: svc.nombre,
      descripcion: svc.descripcion,
      precio: svc.precio,
      duracion_min: svc.duracion_min,
      orden: svc.orden,
      activo: true,
    });
    if (servicioErr) throw new Error(`servicio upsert (${negocio.nombreNegocio}/${svc.nombre}): ${servicioErr.message}`);
  }

  const { error: clienteErr } = await supabaseAdmin.from("cliente").upsert({
    id: negocio.clienteId,
    negocio_id: negocio.negocioId,
    telefono: negocio.clienteTelefono,
    nombre: negocio.clienteNombre,
  });
  if (clienteErr) throw new Error(`cliente upsert (${negocio.nombreNegocio}): ${clienteErr.message}`);

  const { error: turnoErr } = await supabaseAdmin.from("turno").upsert({
    id: negocio.turnoId,
    negocio_id: negocio.negocioId,
    profesional_id: negocio.profesionalId,
    cliente_id: negocio.clienteId,
    inicio: negocio.turnoInicio,
    fin: negocio.turnoFin,
    estado: "confirmado",
    precio_total: negocio.precioTurno,
  });
  if (turnoErr) throw new Error(`turno upsert (${negocio.nombreNegocio}): ${turnoErr.message}`);
}

async function upsertTenant(seed: TenantSeed) {
  const { error: tenantErr } = await supabaseAdmin.from("tenant").upsert({
    id: seed.tenantId,
    nombre: seed.nombreTenant,
    activo: true,
  });
  if (tenantErr) throw new Error(`tenant upsert (${seed.nombreTenant}): ${tenantErr.message}`);

  for (const negocio of seed.negocios) {
    await upsertNegocio(seed.tenantId, negocio);
  }
}

async function ensureOwner(seed: TenantSeed): Promise<string> {
  // Try to find an existing auth user with this email first (idempotent re-run).
  const { data: listData, error: listErr } = await supabaseAdmin.auth.admin.listUsers();
  if (listErr) throw new Error(`auth.admin.listUsers: ${listErr.message}`);
  const existing = listData.users.find((u) => u.email === seed.ownerEmail);

  let ownerId: string;
  if (existing) {
    ownerId = existing.id;
  } else {
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: seed.ownerEmail,
      password: seed.ownerPassword,
      email_confirm: true,
    });
    if (createErr || !created.user) {
      throw new Error(`auth.admin.createUser (${seed.ownerEmail}): ${createErr?.message}`);
    }
    ownerId = created.user.id;
  }

  // El owner sigue ligado al TENANT (D-08/D-12), no a un negocio individual;
  // alcanza los N negocios de ese tenant vía RLS (auth_negocio_ids()).
  const { error: perfilErr } = await supabaseAdmin.from("perfil").upsert({
    id: ownerId,
    tenant_id: seed.tenantId,
    rol: "owner",
    activo: true,
  });
  if (perfilErr) throw new Error(`perfil upsert (${seed.ownerEmail}): ${perfilErr.message}`);

  return ownerId;
}

async function main() {
  console.log("Aplicando seed en vivo contra bdgufnitakelyialjoqg (TurnosBot)...");

  await upsertTenant(TENANT_A);
  await upsertTenant(TENANT_B);
  console.log(
    `OK: tenants, negocios (Tenant A: ${TENANT_A.negocios.length} negocio(s), Tenant B: ${TENANT_B.negocios.length} negocio(s)), profesionales, servicios, clientes, turnos sembrados.`,
  );

  const ownerAId = await ensureOwner(TENANT_A);
  const ownerBId = await ensureOwner(TENANT_B);
  console.log(`OK: owner Tenant A (${TENANT_A.nombreTenant}) -> auth.users.id=${ownerAId}, email=${TENANT_A.ownerEmail}`);
  console.log(`OK: owner Tenant B (${TENANT_B.nombreTenant}) -> auth.users.id=${ownerBId}, email=${TENANT_B.ownerEmail}`);

  console.log("\nCredenciales para verify-isolation.ts (RLS path, anon key + JWT):");
  console.log(`  Tenant A: ${TENANT_A.ownerEmail} / ${TENANT_A.ownerPassword} (tenant_id=${TENANT_A.tenantId})`);
  console.log(`  Tenant B: ${TENANT_B.ownerEmail} / ${TENANT_B.ownerPassword} (tenant_id=${TENANT_B.tenantId})`);

  console.log("\nSeed aplicado correctamente.");
}

main().catch((err) => {
  console.error("ERROR aplicando seed:", err);
  process.exit(1);
});
