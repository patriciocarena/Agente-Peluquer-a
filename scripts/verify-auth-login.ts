/**
 * verify-auth-login.ts (AUTH-01/02, Plan 02-03)
 *
 * Ejercita, conductualmente y contra la DB LIVE de TurnosBot
 * (bdgufnitakelyialjoqg), el login (AUTH-01) y la persistencia de sesión a
 * través de un refresh (AUTH-02) — no valida por presencia de strings.
 * Mirrorea la estructura de guard-de-aislamiento + exit code de
 * scripts/verify-isolation.ts (Fase 1).
 *
 * Usa la anon key + las credenciales de un owner sembrado
 * (scripts/apply-seed.ts / scripts/seed-fixtures.ts):
 *   1. signInWithPassword con la contraseña correcta -> asserta que
 *      devuelve una session con access_token + refresh_token.
 *   2. signInWithPassword con una contraseña incorrecta -> asserta que NO
 *      devuelve session y sí un error.
 *   3. Toma el refresh_token de (1), lo rehidrata en un cliente NUEVO
 *      (refreshSession) simulando "el usuario refrescó la página" (como
 *      hace @supabase/ssr leyendo las cookies en cada request), y asserta
 *      que getUser() tras ese refresh sigue devolviendo el mismo user.id.
 *
 * Requiere SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY en .env. Se corre
 * en el merge de wave (no per-commit) — necesita credenciales live.
 *
 * Targets ONLY bdgufnitakelyialjoqg. Run via:
 *   pnpm exec tsx scripts/verify-auth-login.ts
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@turnosbot/db-types";
import { TENANT_A } from "./seed-fixtures.js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const PROJECT_REF = "bdgufnitakelyialjoqg";

if (!SUPABASE_URL) {
  console.error("FALTA SUPABASE_URL en .env — abortando.");
  process.exit(1);
}
if (!SUPABASE_URL.includes(PROJECT_REF)) {
  console.error(
    `SUPABASE_URL (${SUPABASE_URL}) no apunta al proyecto TurnosBot (${PROJECT_REF}). Abortando por regla de aislamiento.`,
  );
  process.exit(1);
}
if (!ANON_KEY) {
  console.error(
    "FALTA NEXT_PUBLIC_SUPABASE_ANON_KEY en .env — no se puede ejercitar signInWithPassword " +
      "(anon key + password). Agregar la clave anon/publishable del proyecto " +
      `${PROJECT_REF} a .env y volver a correr: pnpm exec tsx scripts/verify-auth-login.ts`,
  );
  process.exit(1);
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

async function verifyValidLogin(): Promise<{ userId: string; refreshToken: string }> {
  const client = createClient<Database>(SUPABASE_URL!, ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await client.auth.signInWithPassword({
    email: TENANT_A.ownerEmail,
    password: TENANT_A.ownerPassword,
  });

  assert(!error, `signInWithPassword con credenciales válidas falló: ${error?.message}`);
  assert(!!data.session, "signInWithPassword con credenciales válidas no devolvió session");
  assert(!!data.session?.access_token, "session sin access_token");
  assert(!!data.session?.refresh_token, "session sin refresh_token");
  assert(!!data.user?.id, "session sin user.id");
  console.log(
    `OK (AUTH-01): login válido de ${TENANT_A.ownerEmail} devuelve sesión con access_token + refresh_token.`,
  );

  return { userId: data.user!.id, refreshToken: data.session!.refresh_token };
}

async function verifyInvalidLogin(): Promise<void> {
  const client = createClient<Database>(SUPABASE_URL!, ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await client.auth.signInWithPassword({
    email: TENANT_A.ownerEmail,
    password: "contraseña-incorrecta-a-proposito",
  });

  assert(
    !!error,
    "signInWithPassword con contraseña incorrecta NO devolvió error (debería haber fallado)",
  );
  assert(
    !data.session,
    "signInWithPassword con contraseña incorrecta devolvió una session (fuga de autenticación)",
  );
  console.log("OK: login con contraseña incorrecta es rechazado y no devuelve sesión.");
}

async function verifySessionPersistsAcrossRefresh(
  userId: string,
  refreshToken: string,
): Promise<void> {
  // Cliente NUEVO, sin estado previo — simula "el usuario refrescó la
  // página" rehidratando la sesión solo a partir del refresh_token, tal
  // como hace @supabase/ssr al leer las cookies en cada request.
  const rehydrated = createClient<Database>(SUPABASE_URL!, ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: refreshed, error: refreshError } = await rehydrated.auth.refreshSession({
    refresh_token: refreshToken,
  });

  assert(!refreshError, `refreshSession falló: ${refreshError?.message}`);
  assert(!!refreshed.session, "refreshSession no devolvió una nueva session");

  const { data: userData, error: userError } = await rehydrated.auth.getUser();
  assert(!userError, `getUser() tras refresh falló: ${userError?.message}`);
  assert(
    userData.user?.id === userId,
    "getUser() tras refresh devolvió un user.id distinto al original",
  );

  console.log(
    "OK (AUTH-02): la sesión persiste a través de un refresh (mismo user.id tras refreshSession + getUser()).",
  );
}

async function main() {
  console.log(`Verificando login + persistencia de sesión en vivo contra ${PROJECT_REF}...`);

  const { userId, refreshToken } = await verifyValidLogin();
  await verifyInvalidLogin();
  await verifySessionPersistsAcrossRefresh(userId, refreshToken);

  console.log("\nverify-auth-login.ts: PASSED");
}

main().catch((err) => {
  console.error("ERROR inesperado en verify-auth-login.ts:", err);
  process.exit(1);
});
