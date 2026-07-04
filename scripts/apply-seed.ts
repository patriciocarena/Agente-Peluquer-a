/**
 * Applies supabase/seed.sql live to the TurnosBot Supabase project
 * (bdgufnitakelyialjoqg) via @supabase/supabase-js (service_role).
 *
 * This environment has no psql / Supabase CLI / SUPABASE_DB_URL access, so
 * this script is the mechanism that actually materializes supabase/seed.sql
 * against the live database (Plan 01-05, D-16). The row values below are
 * kept byte-identical to supabase/seed.sql; this script additionally creates
 * the two Supabase Auth owner users (impossible via plain SQL INSERT against
 * auth.users) and their matching `perfil` rows.
 *
 * Isolation: targets ONLY bdgufnitakelyialjoqg (SUPABASE_URL from .env).
 * Never any other, unrelated Supabase project. No real WhatsApp token is
 * ever written (whatsapp_token stays NULL — SEC-01 is Phase 7).
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

type TenantSeed = {
  tenantId: string;
  negocioId: string;
  profesionalId: string;
  servicios: { id: string; nombre: string; descripcion: string; precio: number; duracion_min: number; orden: number }[];
  clienteId: string;
  turnoId: string;
  whatsappPhoneNumberId: string;
  wabaId: string;
  displayPhoneNumber: string;
  nombreNegocio: string;
  direccion: string;
  telefono: string;
  clienteTelefono: string;
  clienteNombre: string;
  precioTurno: number;
  ownerEmail: string;
  ownerPassword: string;
};

const TENANT_A: TenantSeed = {
  tenantId: "11111111-1111-1111-1111-111111111111",
  negocioId: "21111111-1111-1111-1111-111111111111",
  profesionalId: "31111111-1111-1111-1111-111111111111",
  servicios: [
    { id: "41111111-1111-1111-1111-111111111111", nombre: "Corte clásico", descripcion: "Corte de pelo estándar", precio: 6000.0, duracion_min: 30, orden: 0 },
    { id: "42111111-1111-1111-1111-111111111111", nombre: "Corte + Barba", descripcion: "Corte y arreglo de barba", precio: 9000.0, duracion_min: 45, orden: 1 },
  ],
  clienteId: "51111111-1111-1111-1111-111111111111",
  turnoId: "61111111-1111-1111-1111-111111111111",
  whatsappPhoneNumberId: "fake-phone-number-id-norte",
  wabaId: "fake-waba-id-norte",
  displayPhoneNumber: "+54 9 11 0000-0001",
  nombreNegocio: "Barbería Norte",
  direccion: "Av. Siempre Viva 123, CABA",
  telefono: "+54 9 11 0000-0001",
  clienteTelefono: "+5491100000010",
  clienteNombre: "Cliente Norte",
  precioTurno: 6000.0,
  ownerEmail: "owner-norte@turnosbot-seed.test",
  ownerPassword: "TurnosBotSeed!Norte1",
};

const TENANT_B: TenantSeed = {
  tenantId: "12222222-2222-2222-2222-222222222222",
  negocioId: "22222222-2222-2222-2222-222222222222",
  profesionalId: "32222222-2222-2222-2222-222222222222",
  servicios: [
    { id: "42222222-2222-2222-2222-222222222222", nombre: "Corte clásico", descripcion: "Corte de pelo estándar", precio: 6500.0, duracion_min: 30, orden: 0 },
    { id: "43222222-2222-2222-2222-222222222222", nombre: "Perfilado de barba", descripcion: "Perfilado y arreglo de barba", precio: 4000.0, duracion_min: 20, orden: 1 },
  ],
  clienteId: "52222222-2222-2222-2222-222222222222",
  turnoId: "62222222-2222-2222-2222-222222222222",
  whatsappPhoneNumberId: "fake-phone-number-id-sur",
  wabaId: "fake-waba-id-sur",
  displayPhoneNumber: "+54 9 11 0000-0002",
  nombreNegocio: "Barbería Sur",
  direccion: "Calle Falsa 456, CABA",
  telefono: "+54 9 11 0000-0002",
  clienteTelefono: "+5491100000020",
  clienteNombre: "Cliente Sur",
  precioTurno: 6500.0,
  ownerEmail: "owner-sur@turnosbot-seed.test",
  ownerPassword: "TurnosBotSeed!Sur1",
};

async function upsertTenant(seed: TenantSeed) {
  const { error: tenantErr } = await supabaseAdmin.from("tenant").upsert({
    id: seed.tenantId,
    whatsapp_phone_number_id: seed.whatsappPhoneNumberId,
    waba_id: seed.wabaId,
    whatsapp_token: null,
    display_phone_number: seed.displayPhoneNumber,
    activo: true,
  });
  if (tenantErr) throw new Error(`tenant upsert (${seed.nombreNegocio}): ${tenantErr.message}`);

  const { error: negocioErr } = await supabaseAdmin.from("negocio").upsert({
    id: seed.negocioId,
    tenant_id: seed.tenantId,
    nombre: seed.nombreNegocio,
    direccion: seed.direccion,
    telefono: seed.telefono,
    timezone: "America/Argentina/Buenos_Aires",
    granularidad_min: 30,
  });
  if (negocioErr) throw new Error(`negocio upsert (${seed.nombreNegocio}): ${negocioErr.message}`);

  const { error: profesionalErr } = await supabaseAdmin.from("profesional").upsert({
    id: seed.profesionalId,
    tenant_id: seed.tenantId,
    nombre: seed.nombreNegocio.includes("Norte") ? "Fede (Norte)" : "Gonzalo (Sur)",
    activo: true,
  });
  if (profesionalErr) throw new Error(`profesional upsert (${seed.nombreNegocio}): ${profesionalErr.message}`);

  for (const svc of seed.servicios) {
    const { error: servicioErr } = await supabaseAdmin.from("servicio").upsert({
      id: svc.id,
      tenant_id: seed.tenantId,
      nombre: svc.nombre,
      descripcion: svc.descripcion,
      precio: svc.precio,
      duracion_min: svc.duracion_min,
      orden: svc.orden,
      activo: true,
    });
    if (servicioErr) throw new Error(`servicio upsert (${seed.nombreNegocio}/${svc.nombre}): ${servicioErr.message}`);
  }

  const { error: clienteErr } = await supabaseAdmin.from("cliente").upsert({
    id: seed.clienteId,
    tenant_id: seed.tenantId,
    telefono: seed.clienteTelefono,
    nombre: seed.clienteNombre,
  });
  if (clienteErr) throw new Error(`cliente upsert (${seed.nombreNegocio}): ${clienteErr.message}`);

  // 15:00 America/Argentina/Buenos_Aires (fixed UTC-3, no DST) == 18:00Z — CORE-04.
  const { error: turnoErr } = await supabaseAdmin.from("turno").upsert({
    id: seed.turnoId,
    tenant_id: seed.tenantId,
    profesional_id: seed.profesionalId,
    cliente_id: seed.clienteId,
    inicio: "2026-07-10T18:00:00Z",
    fin: "2026-07-10T18:30:00Z",
    estado: "confirmado",
    precio_total: seed.precioTurno,
  });
  if (turnoErr) throw new Error(`turno upsert (${seed.nombreNegocio}): ${turnoErr.message}`);
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
  console.log("OK: tenants, negocios, profesionales, servicios, clientes, turnos sembrados.");

  const ownerAId = await ensureOwner(TENANT_A);
  const ownerBId = await ensureOwner(TENANT_B);
  console.log(`OK: owner Tenant A (${TENANT_A.nombreNegocio}) -> auth.users.id=${ownerAId}, email=${TENANT_A.ownerEmail}`);
  console.log(`OK: owner Tenant B (${TENANT_B.nombreNegocio}) -> auth.users.id=${ownerBId}, email=${TENANT_B.ownerEmail}`);

  console.log("\nCredenciales para verify-isolation.ts (RLS path, anon key + JWT):");
  console.log(`  Tenant A: ${TENANT_A.ownerEmail} / ${TENANT_A.ownerPassword} (tenant_id=${TENANT_A.tenantId})`);
  console.log(`  Tenant B: ${TENANT_B.ownerEmail} / ${TENANT_B.ownerPassword} (tenant_id=${TENANT_B.tenantId})`);

  console.log("\nSeed aplicado correctamente.");
}

main().catch((err) => {
  console.error("ERROR aplicando seed:", err);
  process.exit(1);
});
