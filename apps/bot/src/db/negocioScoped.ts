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
 * NOTE (in-place fix, Fase 03 Pitfall 7 + Fase 06 hotfix): this file/function
 * was originally `tenantScoped(tenantId)` and filtered every accessor by
 * `.eq('tenant_id', tenantId)`. Migration `0003_tenant_negocio_split.sql`
 * (applied live against bdgufnitakelyialjoqg) renamed the tenant column to
 * `negocio_id` on every operational table below — but NOT on `negocio`
 * itself, whose primary key is `id` and whose `tenant_id` column is the FK to
 * its parent `tenant` row. The `negocio()` accessor is therefore special: it
 * filters by `.eq('id', negocioId)` — the negocio's OWN primary key — because
 * `negocioId` here is a negocio id (e.g. a `conversacion.negocio_id`), NOT a
 * tenant id. It must NOT use `.eq('negocio_id', ...)` (`negocio` has no such
 * column) NOR `.eq('tenant_id', negocioId)` (that filters by parent-tenant id
 * and returns zero rows for every real negocio whose id ≠ its tenant_id —
 * the Fase 06 live smoke caught this: `buildBotAvailabilityData` threw
 * "no matching row" and `buscarHorarios` failed for every negocio, which is
 * why the unit tests — all mocking negocioScoped — never surfaced it).
 *
 * Scope note: this layer was first wired in Phase 1 as pattern/structure
 * only. Phase 03 (motor de disponibilidad) is the first real consumer —
 * the bot-side data-fetching that feeds `@turnosbot/availability-engine`'s
 * `computeSlots` reads through this layer. The cross-negocio service_role
 * isolation proof (SEC-03) lives in `negocioScoped.verify.ts` — a live-DB
 * script, NOT a vitest suite: `pnpm test` no lo corre. Verificado en vivo
 * el 2026-07-09 (12 accessors + tool consultarNegocio, 0 fugas, A→B y B→A).
 *
 * Write accessors (Fase 5, D-11): Phase 5 (integración WhatsApp Cloud API)
 * is the FIRST writer through this layer — every prior consumer only read.
 * `insertMensaje`/`insertConversacion`/`updateConversacion`/`insertCliente`
 * below preserve the same "impossible to forget negocio_id" guarantee as the
 * read accessors: each bakes `negocio_id` from the scope argument into the
 * insert row (via `{ ...row, negocio_id: negocioId }`) or into the update
 * filter (`.eq('negocio_id', negocioId)`), so a caller cannot construct a
 * negocio-unscoped write through this layer any more than an unscoped read.
 * Row params are typed against `TablesInsert<T>` with `negocio_id` omitted
 * (`@turnosbot/db-types`), so TypeScript itself refuses a caller-supplied
 * `negocio_id` that could silently override the scope argument.
 */
import type { TablesInsert, TablesUpdate } from "@turnosbot/db-types";

import { supabaseAdmin } from "./client.js";

type MensajeInsert = Omit<TablesInsert<"mensaje">, "negocio_id">;
type ConversacionInsert = Omit<TablesInsert<"conversacion">, "negocio_id">;
type ConversacionUpdate = Omit<TablesUpdate<"conversacion">, "negocio_id" | "id">;
type ClienteInsert = Omit<TablesInsert<"cliente">, "negocio_id">;
type ClienteUpdate = Omit<TablesUpdate<"cliente">, "negocio_id" | "id">;

export function negocioScoped(negocioId: string) {
  return {
    negocio: () => supabaseAdmin.from("negocio").select("*").eq("id", negocioId),
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

    // --- Write accessors (Fase 5, first writer through this layer, D-11) ---
    insertMensaje: (row: MensajeInsert) =>
      supabaseAdmin.from("mensaje").insert({ ...row, negocio_id: negocioId }),
    insertConversacion: (row: ConversacionInsert) =>
      supabaseAdmin
        .from("conversacion")
        .insert({ ...row, negocio_id: negocioId })
        .select("*")
        .single(),
    updateConversacion: (id: string, patch: ConversacionUpdate) =>
      supabaseAdmin
        .from("conversacion")
        .update(patch)
        .eq("negocio_id", negocioId)
        .eq("id", id),
    insertCliente: (row: ClienteInsert) =>
      supabaseAdmin
        .from("cliente")
        .insert({ ...row, negocio_id: negocioId })
        .select("id")
        .single(),
    updateCliente: (id: string, patch: ClienteUpdate) =>
      supabaseAdmin
        .from("cliente")
        .update(patch)
        .eq("negocio_id", negocioId)
        .eq("id", id),
  } as const;
}
