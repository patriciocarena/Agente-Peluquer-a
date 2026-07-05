/**
 * verify-admin-tenant-lifecycle.ts (SADMIN-01/02/03, T-02-22, T-02-24)
 *
 * Prueba, contra la base viva de TurnosBot, el ciclo de vida completo del
 * panel superadmin implementado en Plan 02-08:
 *
 *   (a) Pattern 3 (02-RESEARCH.md): el alta combinada Tenant + dueño +
 *       primer Negocio crea las tres filas correctamente, y el Negocio
 *       nunca persiste un `whatsapp_token` real (D-04/T-02-24).
 *   (b) La transacción compensatoria: si el insert de `perfil` falla
 *       DESPUÉS de crear el `auth.user` y el `tenant`/`negocio`, la
 *       compensación (delete tenant -> cascada a negocio/perfil vía ON
 *       DELETE CASCADE + deleteUser) deja CERO filas huérfanas (T-02-22).
 *   (c) SADMIN-03: el listado vía `service_role` ve el Tenant recién
 *       creado sin pasar por ningún JWT de owner (aislado de RLS).
 *
 * Esta es una prueba de infraestructura/DB, no un test end-to-end de HTTP:
 * NO levanta el dashboard ni ejecuta el middleware de Next.js. El gate de
 * rol de `/admin` (que un owner nunca lo alcance) está implementado en
 * middleware.ts + lib/auth/require-role.ts (código ya revisado en Plan
 * 02-08) — este script solo confirma programáticamente que el owner recién
 * creado por (a) tiene `perfil.rol = 'owner'` (nunca 'superadmin'), que es
 * la única señal que ese gate lee. La confirmación visual end-to-end
 * ("loguearse como el superadmin y ver /admin, loguearse como el owner y
 * NO verlo") es el paso 4 del `how-to-verify` del checkpoint humano de
 * 02-08-PLAN.md Task 3 — no se automatiza acá porque requiere un dashboard
 * corriendo con sesión de browser real.
 *
 * Usa datos DESCARTABLES (email/UUID únicos por corrida) y se limpia a sí
 * mismo al final (borra el Tenant de prueba, que cascadea a Negocio/perfil,
 * y borra los auth.users creados) — no deja residuos en la base viva sin
 * importar si termina en éxito o en error.
 *
 * Requiere SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (mismo guard de
 * aislamiento que apply-seed.ts / bootstrap-superadmin.ts). NO fue
 * ejecutado contra la base viva en este entorno (sin .env/credenciales
 * reales) — ver checkpoint:human-action de 02-08-PLAN.md Task 3.
 *
 * Usage: pnpm exec tsx scripts/verify-admin-tenant-lifecycle.ts
 */
import { randomUUID } from "node:crypto";
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

const RUN_ID = randomUUID();

async function findAuthUserByEmail(email: string) {
  const { data, error } = await supabaseAdmin.auth.admin.listUsers();
  if (error) throw new Error(`auth.admin.listUsers: ${error.message}`);
  return data.users.find((u) => u.email === email);
}

/**
 * (a) Camino feliz — alta combinada Tenant + dueño + primer Negocio
 * (Pattern 3), datos descartables. Devuelve los ids creados para que el
 * caller pueda limpiarlos al final.
 */
async function verifyHappyPath() {
  const ownerEmail = `verify-lifecycle-happy-${RUN_ID}@turnosbot-verify.test`;

  const { data: authUser, error: authErr } = await supabaseAdmin.auth.admin.createUser({
    email: ownerEmail,
    password: `Verify!${RUN_ID.slice(0, 12)}`,
    email_confirm: true,
  });
  if (authErr || !authUser.user) {
    throw new Error(`(a) auth.admin.createUser falló inesperadamente: ${authErr?.message}`);
  }

  const { data: tenant, error: tenantErr } = await supabaseAdmin
    .from("tenant")
    .insert({ nombre: `Grupo Verify ${RUN_ID.slice(0, 8)}` })
    .select()
    .single();
  if (tenantErr || !tenant) {
    await supabaseAdmin.auth.admin.deleteUser(authUser.user.id);
    throw new Error(`(a) insert tenant falló inesperadamente: ${tenantErr?.message}`);
  }

  const { data: negocio, error: negocioErr } = await supabaseAdmin
    .from("negocio")
    .insert({
      tenant_id: tenant.id,
      nombre: `Peluquería Verify ${RUN_ID.slice(0, 8)}`,
      timezone: "America/Argentina/Buenos_Aires",
      granularidad_min: 30,
      whatsapp_phone_number_id: "verify-fake-phone-number-id",
      waba_id: "verify-fake-waba-id",
      display_phone_number: "+54 9 11 0000-0000",
      whatsapp_token: null,
    })
    .select()
    .single();
  if (negocioErr || !negocio) {
    await supabaseAdmin.from("tenant").delete().eq("id", tenant.id);
    await supabaseAdmin.auth.admin.deleteUser(authUser.user.id);
    throw new Error(`(a) insert negocio falló inesperadamente: ${negocioErr?.message}`);
  }

  const { error: perfilErr } = await supabaseAdmin
    .from("perfil")
    .insert({ id: authUser.user.id, tenant_id: tenant.id, rol: "owner" });
  if (perfilErr) {
    await supabaseAdmin.from("tenant").delete().eq("id", tenant.id);
    await supabaseAdmin.auth.admin.deleteUser(authUser.user.id);
    throw new Error(`(a) insert perfil falló inesperadamente: ${perfilErr.message}`);
  }

  if (negocio.whatsapp_token !== null) {
    throw new Error(
      "(a) FUGA -- el Negocio recién creado tiene whatsapp_token no-null (viola D-04/T-02-24).",
    );
  }
  console.log("OK (a): Tenant + dueño + primer Negocio creados; whatsapp_token quedó NULL.");

  const { data: perfil, error: perfilReadErr } = await supabaseAdmin
    .from("perfil")
    .select("rol, tenant_id, activo")
    .eq("id", authUser.user.id)
    .single();
  if (perfilReadErr || !perfil) {
    throw new Error(`(a) no se pudo releer el perfil recién creado: ${perfilReadErr?.message}`);
  }
  if (perfil.rol !== "owner" || perfil.tenant_id !== tenant.id) {
    throw new Error(
      `(a) FUGA -- el perfil del dueño no quedó como owner/tenant esperado (rol=${perfil.rol}, tenant_id=${perfil.tenant_id}).`,
    );
  }
  console.log(
    "OK (a): perfil.rol = 'owner' (nunca 'superadmin') -- el gate de rol de /admin " +
      "(middleware.ts) rechazará a este usuario en /admin/* (ver Nota (c) más abajo).",
  );

  return { tenantId: tenant.id, negocioId: negocio.id, authUserId: authUser.user.id, ownerEmail };
}

/**
 * (b) Rollback — fuerza un fallo REAL (violación del CHECK
 * `rol IN ('owner','superadmin')` de la migración 0001) en el insert de
 * `perfil`, después de que el auth.user y el tenant/negocio ya existen, y
 * confirma que la compensación de Pattern 3 (delete tenant -> cascada +
 * deleteUser) no deja NINGÚN auth.user huérfano.
 */
async function verifyRollback() {
  const ownerEmail = `verify-lifecycle-rollback-${RUN_ID}@turnosbot-verify.test`;

  const { data: authUser, error: authErr } = await supabaseAdmin.auth.admin.createUser({
    email: ownerEmail,
    password: `Verify!${RUN_ID.slice(0, 12)}`,
    email_confirm: true,
  });
  if (authErr || !authUser.user) {
    throw new Error(`(b) auth.admin.createUser falló inesperadamente: ${authErr?.message}`);
  }

  const { data: tenant, error: tenantErr } = await supabaseAdmin
    .from("tenant")
    .insert({ nombre: `Grupo Verify Rollback ${RUN_ID.slice(0, 8)}` })
    .select()
    .single();
  if (tenantErr || !tenant) {
    await supabaseAdmin.auth.admin.deleteUser(authUser.user.id);
    throw new Error(`(b) insert tenant falló inesperadamente: ${tenantErr?.message}`);
  }

  const { data: negocio, error: negocioErr } = await supabaseAdmin
    .from("negocio")
    .insert({
      tenant_id: tenant.id,
      nombre: `Peluquería Verify Rollback ${RUN_ID.slice(0, 8)}`,
      timezone: "America/Argentina/Buenos_Aires",
    })
    .select()
    .single();
  if (negocioErr || !negocio) {
    await supabaseAdmin.from("tenant").delete().eq("id", tenant.id);
    await supabaseAdmin.auth.admin.deleteUser(authUser.user.id);
    throw new Error(`(b) insert negocio falló inesperadamente: ${negocioErr?.message}`);
  }

  // Fallo DELIBERADO y REAL: 'no_es_un_rol_valido' viola el CHECK constraint
  // de la migración 0001 (rol IN ('owner','superadmin')) -- no es un mock,
  // es el mismo tipo de fallo Postgres que dispara la compensación en
  // app/actions/admin-tenants.ts::createTenantWithNegocio. `perfil.rol` está
  // tipado como `string` (no como union literal) en @turnosbot/db-types, así
  // que este valor pasa el chequeo de TypeScript y solo Postgres lo rechaza.
  const { error: perfilErr } = await supabaseAdmin
    .from("perfil")
    .insert({ id: authUser.user.id, tenant_id: tenant.id, rol: "no_es_un_rol_valido" });

  if (!perfilErr) {
    // Si esto pasara, el CHECK constraint dejó de existir -- limpiar y fallar fuerte.
    await supabaseAdmin.from("perfil").delete().eq("id", authUser.user.id);
    await supabaseAdmin.from("tenant").delete().eq("id", tenant.id);
    await supabaseAdmin.auth.admin.deleteUser(authUser.user.id);
    throw new Error(
      "(b) FUGA -- el insert de perfil con un rol inválido NO fue rechazado por el CHECK constraint.",
    );
  }
  console.log(`OK (b): insert de perfil con rol inválido rechazado por Postgres: ${perfilErr.message}`);

  // Compensación de Pattern 3 (mismo orden que admin-tenants.ts): borrar el
  // tenant cascadea a negocio/perfil (ON DELETE CASCADE), y borrar el
  // auth.user evita un login huérfano sin tenant/perfil.
  const { error: deleteTenantErr } = await supabaseAdmin.from("tenant").delete().eq("id", tenant.id);
  if (deleteTenantErr) {
    throw new Error(`(b) compensación -- delete tenant falló: ${deleteTenantErr.message}`);
  }
  const { error: deleteUserErr } = await supabaseAdmin.auth.admin.deleteUser(authUser.user.id);
  if (deleteUserErr) {
    throw new Error(`(b) compensación -- deleteUser falló: ${deleteUserErr.message}`);
  }

  const orphan = await findAuthUserByEmail(ownerEmail);
  if (orphan) {
    throw new Error(
      "(b) FUGA -- quedó un auth.user huérfano después de la compensación (T-02-22).",
    );
  }
  const { data: tenantAfter } = await supabaseAdmin
    .from("tenant")
    .select("id")
    .eq("id", tenant.id)
    .maybeSingle();
  if (tenantAfter) {
    throw new Error("(b) FUGA -- el tenant sigue existiendo después de la compensación.");
  }
  console.log(
    "OK (b): compensación completa -- CERO auth.users huérfanos, CERO tenant/negocio/perfil residuales.",
  );
}

/**
 * (c) SADMIN-03 -- listado vía service_role ve el Tenant recién creado por
 * (a), demostrando aislamiento de RLS (esta consulta NUNCA pasa por un JWT
 * de owner).
 */
async function verifyServiceRoleListing(tenantId: string) {
  const { data: tenants, error } = await supabaseAdmin.from("tenant").select("id, nombre, activo");
  if (error) {
    throw new Error(`(c) listado service_role falló: ${error.message}`);
  }
  const found = (tenants ?? []).find((t) => t.id === tenantId);
  if (!found) {
    throw new Error("(c) FUGA -- el listado service_role no incluyó el Tenant recién creado.");
  }
  console.log(
    `OK (c): el listado service_role (SADMIN-03) ve el Tenant de prueba entre ${tenants?.length ?? 0} tenant(s) totales -- aislado de RLS.`,
  );
}

async function main() {
  console.log("Verificando el ciclo de vida del panel superadmin en bdgufnitakelyialjoqg...\n");

  let happyPath: Awaited<ReturnType<typeof verifyHappyPath>> | undefined;
  try {
    happyPath = await verifyHappyPath();
    await verifyServiceRoleListing(happyPath.tenantId);
    await verifyRollback();

    console.log(
      "\nNota (c) -- verificación del gate /admin: este script confirmó a nivel de DB " +
        "que el dueño recién creado tiene perfil.rol = 'owner' (nunca 'superadmin'). " +
        "El gate real de /admin vive en middleware.ts (D-03) y solo se confirma " +
        "end-to-end logueándose en el dashboard -- paso 4 del how-to-verify del " +
        "checkpoint humano (02-08-PLAN.md Task 3).",
    );

    console.log("\nverify-admin-tenant-lifecycle.ts: PASSED");
  } finally {
    // Limpieza incondicional del camino feliz (b) ya se limpia a sí mismo.
    if (happyPath) {
      await supabaseAdmin.from("tenant").delete().eq("id", happyPath.tenantId); // cascada a negocio/perfil
      await supabaseAdmin.auth.admin.deleteUser(happyPath.authUserId);
      console.log(`\nLimpieza: Tenant/Negocio/perfil/auth.user de prueba (${happyPath.ownerEmail}) eliminados.`);
    }
  }
}

main().catch((err) => {
  console.error("ERROR en verify-admin-tenant-lifecycle.ts:", err);
  process.exit(1);
});
