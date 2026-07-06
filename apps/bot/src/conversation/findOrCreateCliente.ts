/**
 * apps/bot/src/conversation/findOrCreateCliente.ts — resolve-or-create the
 * `cliente` row for an inbound WhatsApp message (WA-02, D-08).
 *
 * Phone-normalization contract (05-RESEARCH.md Open Question 3, resolved):
 * `telefono` is stored EXACTLY as WhatsApp's `wa_id` arrives — digits-only,
 * NO leading `+`, no separators (e.g. "5491122334455"). This is a strict
 * superset-compatible format with the dashboard's ILIKE-based partial search
 * (apps/dashboard/app/actions/clientes.ts `buscarClientePorTelefono`), so a
 * dashboard user typing digits incrementally will still match rows created
 * here.
 *
 * Lookup uses an EXACT match (`.eq("telefono", waId)`), never a partial
 * ILIKE match. Partial ILIKE matching is the dashboard's live-search UX
 * feature (matches while the owner types) — reusing it here would
 * over-match distinct phone numbers that merely share a substring, silently
 * merging two different clientes' identities (Pitfall 7).
 *
 * All DB access goes through `negocioScoped(negocioId)` (D-11) — the write
 * accessor `insertCliente` bakes `negocio_id` into the insert row, so this
 * function structurally cannot create a cliente outside its own negocio.
 */
import { negocioScoped } from "../db/negocioScoped.js";

/**
 * Finds the cliente in `negocioId` whose `telefono` exactly matches `waId`,
 * or creates one (with `nombre: null`, filled in later by the conversation
 * flow) if absent. Returns the cliente's `id`.
 */
export async function findOrCreateCliente(negocioId: string, waId: string): Promise<string> {
  const { data: existing } = await negocioScoped(negocioId)
    .clientes()
    .select("id")
    .eq("telefono", waId)
    .maybeSingle();

  if (existing) {
    return existing.id;
  }

  const { data: created, error } = await negocioScoped(negocioId).insertCliente({
    telefono: waId,
    nombre: null,
  });

  if (error || !created) {
    // WR-02: check-then-act race — two inbound events for the same new waId
    // can both see `existing === null` and both attempt this insert. The DB's
    // `cliente_telefono_unico_por_negocio UNIQUE (negocio_id, telefono)`
    // constraint (0003_tenant_negocio_split.sql) makes the loser's insert
    // fail with 23505 instead of creating a duplicate row — re-select to
    // return the winner's id rather than throwing on a race that isn't
    // actually an error.
    if (error?.code === "23505") {
      const { data: winner, error: reselectError } = await negocioScoped(negocioId)
        .clientes()
        .select("id")
        .eq("telefono", waId)
        .maybeSingle();

      if (winner) {
        return winner.id;
      }

      throw new Error(
        `findOrCreateCliente: 23505 en insertCliente pero no se encontró el cliente al re-consultar (negocioId=${negocioId}, waId=${waId}): ${reselectError?.message}`,
      );
    }

    throw new Error(
      `findOrCreateCliente: no se pudo crear el cliente (negocioId=${negocioId}, waId=${waId}): ${error?.message}`,
    );
  }

  return created.id;
}
