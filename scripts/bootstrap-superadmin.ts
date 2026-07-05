/**
 * bootstrap-superadmin.ts (SADMIN-01/02/03 — Pitfall 3, 02-RESEARCH.md)
 *
 * Crea el PRIMER `perfil` con `rol = 'superadmin'` (`tenant_id = NULL`) en
 * la base viva de TurnosBot. Sin este script `/admin` es inalcanzable por
 * diseño: el seed de Fase 1 (`scripts/apply-seed.ts`) solo creó dos
 * `perfil` con `rol = 'owner'`, y no existe ningún alta self-service de
 * superadmin (D-06: el acceso cross-tenant nunca se auto-otorga).
 *
 * Mirrorea el patrón de `scripts/apply-seed.ts`: guard de aislamiento a
 * bdgufnitakelyialjoqg, cliente `service_role` (las filas de `auth.users`
 * NO se pueden crear con un INSERT SQL plano), e idempotencia (si el email
 * ya existe, reutiliza ese `auth.users.id` en vez de fallar).
 *
 * Credenciales del superadmin: SIEMPRE por variable de entorno, NUNCA
 * hardcodeadas en este archivo (T-02-25 / checkpoint:human-action de
 * 02-08-PLAN.md Task 3). Este script NO fue ejecutado contra la base viva
 * — requiere que el humano provea SUPERADMIN_EMAIL/SUPERADMIN_PASSWORD
 * reales y corra el comando de Usage a continuación.
 *
 * Usage:
 *   SUPERADMIN_EMAIL=admin@tudominio.com SUPERADMIN_PASSWORD='...' \
 *     pnpm exec tsx scripts/bootstrap-superadmin.ts
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@turnosbot/db-types";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPERADMIN_EMAIL = process.env.SUPERADMIN_EMAIL;
const SUPERADMIN_PASSWORD = process.env.SUPERADMIN_PASSWORD;

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

if (!SUPERADMIN_EMAIL || !SUPERADMIN_PASSWORD) {
  console.error(
    "FALTAN SUPERADMIN_EMAIL / SUPERADMIN_PASSWORD en el entorno — el primer " +
      "superadmin requiere credenciales reales provistas por el humano (nunca " +
      "hardcodeadas). Ejecutar:\n" +
      "  SUPERADMIN_EMAIL=admin@tudominio.com SUPERADMIN_PASSWORD='...' " +
      "pnpm exec tsx scripts/bootstrap-superadmin.ts",
  );
  process.exit(1);
}

const supabaseAdmin = createClient<Database>(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function ensureSuperadminAuthUser(email: string, password: string): Promise<string> {
  // Idempotente (mismo patrón que apply-seed.ts ensureOwner): si el email ya
  // existe en auth.users, reutiliza ese id en vez de fallar con "ya existe".
  const { data: listData, error: listErr } = await supabaseAdmin.auth.admin.listUsers();
  if (listErr) throw new Error(`auth.admin.listUsers: ${listErr.message}`);

  const existing = listData.users.find((u) => u.email === email);
  if (existing) {
    return existing.id;
  }

  const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createErr || !created.user) {
    throw new Error(`auth.admin.createUser (${email}): ${createErr?.message}`);
  }
  return created.user.id;
}

async function main() {
  console.log("Bootstrapeando el primer superadmin en bdgufnitakelyialjoqg (TurnosBot)...");

  const superadminId = await ensureSuperadminAuthUser(SUPERADMIN_EMAIL!, SUPERADMIN_PASSWORD!);

  // tenant_id = NULL (D-06): el superadmin es cross-tenant, no pertenece a
  // ningún Tenant individual — distinto del owner (D-08/D-12: 1 owner = 1
  // Tenant). El CHECK (rol IN ('owner','superadmin')) de la migración 0001
  // es la última línea de defensa si este valor se escribiera mal.
  const { error: perfilErr } = await supabaseAdmin.from("perfil").upsert({
    id: superadminId,
    tenant_id: null,
    rol: "superadmin",
    activo: true,
  });
  if (perfilErr) {
    throw new Error(`perfil upsert (superadmin ${SUPERADMIN_EMAIL}): ${perfilErr.message}`);
  }

  console.log(`OK: superadmin listo -> auth.users.id=${superadminId}, email=${SUPERADMIN_EMAIL}`);
  console.log(
    "Ahora podés iniciar sesión en el dashboard con ese email/contraseña y " +
      "vas a ser redirigido a /admin (middleware.ts, D-03).",
  );
}

main().catch((err) => {
  console.error("ERROR en bootstrap-superadmin.ts:", err);
  process.exit(1);
});
