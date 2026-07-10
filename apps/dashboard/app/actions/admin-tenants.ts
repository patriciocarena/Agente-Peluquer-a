/**
 * app/actions/admin-tenants.ts — Server Actions del panel superadmin
 * `/admin` (SADMIN-01/02/03). ÚNICO archivo del dashboard que importa
 * `lib/supabase/admin.ts` (service_role, server-only) — convención de
 * file-boundary de 02-RESEARCH.md Pitfall 4: ningún archivo bajo
 * `app/(owner)/**` ni ningún Client Component debe importar el cliente
 * service_role directamente; todos los que necesitan datos cross-tenant
 * pasan por acá.
 *
 * `createTenantWithNegocio` implementa Pattern 3 (02-RESEARCH.md): el alta
 * de un Tenant nuevo crea, en un solo flujo, (1) el usuario dueño en
 * `auth.users` vía Admin API, (2) el `tenant` (solo `nombre`, post-
 * migración 0003), (3) su primer `negocio` (datos generales + WhatsApp
 * NO-secreta — nunca un token real, D-04/T-02-24), y (4) el `perfil` que
 * liga ese dueño al tenant (`rol: 'owner'`). `auth.users` (GoTrue) y
 * Postgres no comparten transacción: si CUALQUIER insert Postgres falla
 * después de crear el auth.user, se compensa borrando el tenant recién
 * creado (cascada a negocio/perfil) y el propio auth.user — nunca se deja
 * un login huérfano sin tenant/perfil (T-02-22).
 *
 * `updateTenant`/`deactivateTenant` y `createNegocio`/`updateNegocio`/
 * `deactivateNegocio` son mutaciones simples de una sola tabla (no
 * requieren compensación) — Pattern 3 solo aplica al alta combinada.
 *
 * Todas las mutaciones re-validan con los schemas de lib/schemas/admin.ts
 * (la validación client-side del dialog es solo UX, esta re-validación es
 * la que realmente importa — mismo principio que app/actions/auth.ts).
 */
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  createTenantWithNegocioSchema,
  negocioAdminSchema,
  tenantSchema,
  type CreateTenantWithNegocioInput,
  type NegocioAdminInput,
  type TenantInput,
} from "@/lib/schemas/admin";
import type { Tables } from "@turnosbot/db-types";

const GENERIC_ERROR = "No pudimos completar la operación. Intentá de nuevo.";

export type AdminActionResult<T = undefined> =
  | { data: T; error?: undefined }
  | { data?: undefined; error: string };

function negocioInsertPayload(tenantId: string, input: NegocioAdminInput) {
  return {
    tenant_id: tenantId,
    nombre: input.nombre,
    direccion: input.direccion ?? null,
    telefono: input.telefono ?? null,
    timezone: input.timezone,
    granularidad_min: input.granularidad_min,
    whatsapp_phone_number_id: input.whatsapp_phone_number_id ?? null,
    waba_id: input.waba_id ?? null,
    display_phone_number: input.display_phone_number ?? null,
    // El token real NUNCA se escribe acá: negocio.whatsapp_token fue
    // dropeada por la migración 0005 (SEC-01) — el único camino de
    // escritura sancionado es setWhatsappTokenSecret(), vía
    // .rpc('set_whatsapp_token_secret') hacia Supabase Vault.
  };
}

// Forma-only (8-4-4-4-12), no `z.uuid()` estricto: mismo fix que
// `uuidLike` en @turnosbot/availability-engine/booking.ts (Fase 3,
// T-03-15) -- `z.uuid()` exige version 1-8 + variante 8/9/a/b y rechazaría
// negocioIds reales generados con otros generadores de UUID.
const negocioIdShape = z
  .string()
  .regex(
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
    "negocioId inválido.",
  );

const setWhatsappTokenSecretSchema = z.object({
  negocioId: negocioIdShape,
  token: z.string().min(1, "El token no puede estar vacío."),
});

/**
 * SADMIN-03 — lista todos los Tenants, aislado de RLS (service_role
 * server-side). Ningún owner puede alcanzar este código: el gate de rol
 * vive en middleware.ts + lib/auth/require-role.ts, antes de que cualquier
 * página de `/admin` renderice.
 */
export async function listTenants(): Promise<Tables<"tenant">[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tenant")
    .select("*")
    .order("nombre", { ascending: true });

  if (error) {
    throw new Error("No pudimos cargar los grupos.");
  }
  return data ?? [];
}

/**
 * SADMIN-03 — un Tenant + sus Negocios, aislado de RLS. Devuelve `null` si
 * el tenantId no existe (la página responde con notFound()).
 */
export async function getTenantWithNegocios(tenantId: string): Promise<{
  tenant: Tables<"tenant">;
  negocios: Tables<"negocio">[];
} | null> {
  const admin = createAdminClient();

  const { data: tenant, error: tenantError } = await admin
    .from("tenant")
    .select("*")
    .eq("id", tenantId)
    .single();

  if (tenantError || !tenant) {
    return null;
  }

  const { data: negocios, error: negocioError } = await admin
    .from("negocio")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("nombre", { ascending: true });

  if (negocioError) {
    throw new Error("No pudimos cargar las peluquerías de este grupo.");
  }

  return { tenant, negocios: negocios ?? [] };
}

/**
 * Pattern 3 — alta atómica-por-compensación de Tenant + dueño + primer
 * Negocio (SADMIN-01 + SADMIN-02 combinados, D-08/D-12: 1 owner = 1
 * Tenant). Orden: auth.admin.createUser -> insert tenant -> insert negocio
 * -> insert perfil(rol='owner'). Cualquier fallo Postgres después de crear
 * el auth.user compensa borrando el tenant (cascada a negocio/perfil vía
 * ON DELETE CASCADE) y el auth.user.
 */
export async function createTenantWithNegocio(
  input: CreateTenantWithNegocioInput,
): Promise<AdminActionResult<{ tenantId: string; negocioId: string }>> {
  const parsed = createTenantWithNegocioSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Revisá los datos del grupo, el dueño y la peluquería." };
  }
  const { tenantNombre, ownerEmail, ownerPassword, negocio } = parsed.data;

  const admin = createAdminClient();

  const { data: authUser, error: authError } = await admin.auth.admin.createUser({
    email: ownerEmail,
    password: ownerPassword,
    email_confirm: true,
  });
  if (authError || !authUser.user) {
    return { error: "No se pudo crear el usuario dueño." };
  }

  const { data: tenant, error: tenantError } = await admin
    .from("tenant")
    .insert({ nombre: tenantNombre })
    .select()
    .single();

  if (tenantError || !tenant) {
    await admin.auth.admin.deleteUser(authUser.user.id); // compensación
    return { error: "No se pudo crear el grupo." };
  }

  const { data: negocioRow, error: negocioError } = await admin
    .from("negocio")
    .insert(negocioInsertPayload(tenant.id, negocio))
    .select()
    .single();

  let perfilError: { message: string } | null = null;
  if (!negocioError && negocioRow) {
    const { error } = await admin
      .from("perfil")
      .insert({ id: authUser.user.id, tenant_id: tenant.id, rol: "owner" });
    perfilError = error;
  }

  if (negocioError || perfilError) {
    // Compensación: borrar el tenant cascadea a negocio/perfil (ON DELETE
    // CASCADE), y borrar el auth.user evita un login huérfano sin
    // tenant/perfil (T-02-22).
    await admin.from("tenant").delete().eq("id", tenant.id);
    await admin.auth.admin.deleteUser(authUser.user.id);
    return { error: "No se pudo completar el alta del grupo y su primera peluquería." };
  }

  revalidatePath("/admin");
  return { data: { tenantId: tenant.id, negocioId: negocioRow.id } };
}

/** SADMIN-01 — editar el nombre de un Tenant existente. */
export async function updateTenant(
  tenantId: string,
  input: TenantInput,
): Promise<AdminActionResult> {
  const parsed = tenantSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "El nombre del grupo es obligatorio." };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("tenant")
    .update({ nombre: parsed.data.nombre })
    .eq("id", tenantId);

  if (error) {
    return { error: GENERIC_ERROR };
  }

  revalidatePath("/admin");
  return { data: undefined };
}

/** SADMIN-01 — activar/desactivar un Tenant (soft delete, Tabs/Switch). */
export async function setTenantActivo(
  tenantId: string,
  activo: boolean,
): Promise<AdminActionResult> {
  const admin = createAdminClient();
  const { error } = await admin.from("tenant").update({ activo }).eq("id", tenantId);

  if (error) {
    return { error: GENERIC_ERROR };
  }

  revalidatePath("/admin");
  return { data: undefined };
}

/** SADMIN-02 — crear un Negocio adicional dentro de un Tenant existente. */
export async function createNegocio(
  tenantId: string,
  input: NegocioAdminInput,
): Promise<AdminActionResult<{ negocioId: string }>> {
  const parsed = negocioAdminSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Revisá los datos de la peluquería." };
  }

  const admin = createAdminClient();
  const { data: negocio, error } = await admin
    .from("negocio")
    .insert(negocioInsertPayload(tenantId, parsed.data))
    .select()
    .single();

  if (error || !negocio) {
    return { error: GENERIC_ERROR };
  }

  revalidatePath(`/admin/${tenantId}`);
  return { data: { negocioId: negocio.id } };
}

/** SADMIN-02 — editar datos generales + WhatsApp no-secreta de un Negocio. */
export async function updateNegocio(
  negocioId: string,
  tenantId: string,
  input: NegocioAdminInput,
): Promise<AdminActionResult> {
  const parsed = negocioAdminSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Revisá los datos de la peluquería." };
  }

  const admin = createAdminClient();
  const { nombre, direccion, telefono, timezone, granularidad_min, whatsapp_phone_number_id, waba_id, display_phone_number } =
    parsed.data;
  const { error } = await admin
    .from("negocio")
    .update({
      nombre,
      direccion: direccion ?? null,
      telefono: telefono ?? null,
      timezone,
      granularidad_min,
      whatsapp_phone_number_id: whatsapp_phone_number_id ?? null,
      waba_id: waba_id ?? null,
      display_phone_number: display_phone_number ?? null,
    })
    .eq("id", negocioId);

  if (error) {
    return { error: GENERIC_ERROR };
  }

  revalidatePath(`/admin/${tenantId}`);
  return { data: undefined };
}

/**
 * SEC-01 (D-02 b/c) — rota/setea el token de la WhatsApp Cloud API de un
 * Negocio vía Supabase Vault. Único camino de escritura sancionado: nunca
 * una columna plana, siempre `.rpc('set_whatsapp_token_secret', ...)`
 * (SECURITY DEFINER, decripta/encripta del lado de la DB). Devuelve el
 * `secret_id` (uuid de `vault.secrets`) que queda referenciado desde
 * `negocio.whatsapp_token_secret_id`.
 */
export async function setWhatsappTokenSecret(
  negocioId: string,
  token: string,
): Promise<AdminActionResult<{ secretId: string }>> {
  const parsed = setWhatsappTokenSecretSchema.safeParse({ negocioId, token });
  if (!parsed.success) {
    return { error: "Revisá el token de WhatsApp." };
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("set_whatsapp_token_secret", {
    p_negocio_id: parsed.data.negocioId,
    p_token: parsed.data.token,
    p_name: `whatsapp-token-${parsed.data.negocioId}`,
  });

  if (error || !data) {
    return { error: GENERIC_ERROR };
  }

  // No recibimos tenantId en la firma (solo negocioId) -- revalidamos todo
  // el árbol /admin en vez de adivinar la ruta exacta del tenant.
  revalidatePath("/admin", "layout");
  return { data: { secretId: data } };
}

/** SADMIN-02 — activar/desactivar un Negocio (soft delete, Tabs/Switch). */
export async function setNegocioActivo(
  negocioId: string,
  tenantId: string,
  activo: boolean,
): Promise<AdminActionResult> {
  const admin = createAdminClient();
  const { error } = await admin.from("negocio").update({ activo }).eq("id", negocioId);

  if (error) {
    return { error: GENERIC_ERROR };
  }

  revalidatePath(`/admin/${tenantId}`);
  return { data: undefined };
}
