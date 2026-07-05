/**
 * apps/bot/src/db/negocioScoped.ts — mandatory negocio-scoped query layer (CORE-03)
 *
 * The bot service runs as a single shared process for every negocio, using
 * the service_role client (./client.ts), which BYPASSES Row Level Security
 * entirely. RLS therefore provides NO safety net for this codepath
 * (PITFALLS.md Pitfall 7) — the only thing standing between one negocio's
 * data and another's is application code remembering to filter by
 * `negocio_id` on every single query.
 *
 * `negocioScoped(negocioId)` is the ONLY sanctioned way the bot service reads
 * or writes negocio-scoped tables. Every accessor below bakes in
 * `.eq('negocio_id', negocioId)` before returning the query builder, so a
 * caller cannot construct a negocio-unscoped query through this layer — the
 * mistake of "just this once, forgot the WHERE" becomes structurally
 * impossible rather than a matter of code-review discipline.
 *
 * NOTE (in-place fix, Fase 03 Pitfall 7): this file/function was originally
 * `tenantScoped(tenantId)` and filtered every accessor by `.eq('tenant_id',
 * tenantId)`. Migration `0003_tenant_negocio_split.sql` (applied live against
 * bdgufnitakelyialjoqg) renamed the tenant column to `negocio_id` on every
 * operational table below — but NOT on `negocio` itself, whose own
 * `tenant_id` column is the legitimate FK to its parent `tenant` row. The
 * `negocio()` accessor below intentionally keeps `.eq('tenant_id', ...)` —
 * do NOT "fix" it to `negocio_id`, that would break it (`negocio` has no
 * `negocio_id` column at all; its own primary key is `id`, and its FK to the
 * parent tenant is `tenant_id`, confirmed live in
 * packages/db-types/src/database.types.ts).
 *
 * Scope note: this layer was first wired in Phase 1 as pattern/structure
 * only. Phase 03 (motor de disponibilidad) is the first real consumer —
 * the bot-side data-fetching that feeds `@turnosbot/availability-engine`'s
 * `computeSlots` reads through this layer. The formal automated
 * cross-negocio service_role test suite (SEC-03) is deferred to Phase 7;
 * this file's own smoke test (negocioScoped.test.ts) proves the pattern
 * holds against the two seeded tenants' negocios, live.
 */
import { supabaseAdmin } from "./client.js";

export function negocioScoped(negocioId: string) {
  return {
    negocio: () => supabaseAdmin.from("negocio").select("*").eq("tenant_id", negocioId),
    profesionales: () => supabaseAdmin.from("profesional").select("*").eq("negocio_id", negocioId),
    horariosTrabajo: () =>
      supabaseAdmin.from("horario_trabajo").select("*").eq("negocio_id", negocioId),
    servicios: () => supabaseAdmin.from("servicio").select("*").eq("negocio_id", negocioId),
    profesionalServicios: () =>
      supabaseAdmin.from("profesional_servicio").select("*").eq("negocio_id", negocioId),
    clientes: () => supabaseAdmin.from("cliente").select("*").eq("negocio_id", negocioId),
    turnos: () => supabaseAdmin.from("turno").select("*").eq("negocio_id", negocioId),
    turnoServicios: () =>
      supabaseAdmin.from("turno_servicio").select("*").eq("negocio_id", negocioId),
    bloqueos: () => supabaseAdmin.from("bloqueo").select("*").eq("negocio_id", negocioId),
    conversaciones: () =>
      supabaseAdmin.from("conversacion").select("*").eq("negocio_id", negocioId),
    mensajes: () => supabaseAdmin.from("mensaje").select("*").eq("negocio_id", negocioId),
    recordatorios: () =>
      supabaseAdmin.from("recordatorio").select("*").eq("negocio_id", negocioId),
  } as const;
}
