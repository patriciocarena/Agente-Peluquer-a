/**
 * apps/bot/src/db/tenantScoped.ts — mandatory tenant-scoped query layer (CORE-03)
 *
 * The bot service runs as a single shared process for every tenant, using
 * the service_role client (./client.ts), which BYPASSES Row Level Security
 * entirely. RLS therefore provides NO safety net for this codepath
 * (PITFALLS.md Pitfall 7) — the only thing standing between one tenant's
 * data and another's is application code remembering to filter by
 * `tenant_id` on every single query.
 *
 * `tenantScoped(tenantId)` is the ONLY sanctioned way the bot service reads
 * or writes tenant-scoped tables. Every accessor below bakes in
 * `.eq('tenant_id', tenantId)` before returning the query builder, so a
 * caller cannot construct a tenant-unscoped query through this layer — the
 * mistake of "just this once, forgot the WHERE" becomes structurally
 * impossible rather than a matter of code-review discipline.
 *
 * Scope note: this plan (01-05) wires only the pattern/structure. No
 * booking/agent logic is implemented here — that is Phase 6. The formal
 * automated cross-tenant service_role test suite (SEC-03) is deferred to
 * Phase 7; this file's own smoke test (tenantScoped.test.ts) proves the
 * pattern holds against the two seeded tenants.
 */
import { supabaseAdmin } from "./client.js";

export function tenantScoped(tenantId: string) {
  return {
    negocio: () => supabaseAdmin.from("negocio").select("*").eq("tenant_id", tenantId),
    profesionales: () => supabaseAdmin.from("profesional").select("*").eq("tenant_id", tenantId),
    horariosTrabajo: () => supabaseAdmin.from("horario_trabajo").select("*").eq("tenant_id", tenantId),
    servicios: () => supabaseAdmin.from("servicio").select("*").eq("tenant_id", tenantId),
    profesionalServicios: () =>
      supabaseAdmin.from("profesional_servicio").select("*").eq("tenant_id", tenantId),
    clientes: () => supabaseAdmin.from("cliente").select("*").eq("tenant_id", tenantId),
    turnos: () => supabaseAdmin.from("turno").select("*").eq("tenant_id", tenantId),
    turnoServicios: () => supabaseAdmin.from("turno_servicio").select("*").eq("tenant_id", tenantId),
    bloqueos: () => supabaseAdmin.from("bloqueo").select("*").eq("tenant_id", tenantId),
    conversaciones: () => supabaseAdmin.from("conversacion").select("*").eq("tenant_id", tenantId),
    mensajes: () => supabaseAdmin.from("mensaje").select("*").eq("tenant_id", tenantId),
    recordatorios: () => supabaseAdmin.from("recordatorio").select("*").eq("tenant_id", tenantId),
  } as const;
}
