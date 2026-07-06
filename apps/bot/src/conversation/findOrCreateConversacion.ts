/**
 * apps/bot/src/conversation/findOrCreateConversacion.ts — find-or-create the
 * `conversacion` row for a (negocio, cliente) pair and refresh its 24h
 * customer-service window on every inbound message (WA-05, D-09, D-10).
 *
 * `ventana_expira_at` is always bumped to now()+24h on every call — both on
 * the create path and the refresh-existing path — because WhatsApp's
 * customer-service window resets on each inbound message from the client
 * (D-09).
 *
 * Pitfall 8: the `context` column written on create is intentionally the
 * minimal `{}` shape. Phase 5 does NOT define what goes inside it — Phase 6
 * (the Vercel AI SDK agent) owns extending `context` (e.g. conversation
 * history, in-progress booking state). Stating this contract explicitly
 * here — rather than leaving it implicit — is the whole point of this
 * comment: Phase 6 must not assume any particular shape beyond "valid JSON
 * object" when it starts reading/writing this column.
 *
 * All DB access goes through `negocioScoped(negocioId)` (D-11).
 */
import type { Tables } from "@turnosbot/db-types";

import { negocioScoped } from "../db/negocioScoped.js";

/**
 * Returns the (negocioId, clienteId) conversacion, creating it with an empty
 * `context: {}` if absent, and always refreshing `ventana_expira_at` to
 * now()+24h (D-09/D-10).
 */
export async function findOrCreateConversacion(
  negocioId: string,
  clienteId: string,
): Promise<Tables<"conversacion">> {
  const ventanaExpiraIso = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const { data: existing } = await negocioScoped(negocioId)
    .conversaciones()
    .select("*")
    .eq("cliente_id", clienteId)
    .maybeSingle();

  if (!existing) {
    const { data: created, error } = await negocioScoped(negocioId).insertConversacion({
      cliente_id: clienteId,
      // Pitfall 8: minimal shape by design — Phase 6 owns extending this.
      context: {},
      ventana_expira_at: ventanaExpiraIso,
    });

    if (error || !created) {
      // WR-02: check-then-act race — two inbound events for the same new
      // (negocio, cliente) pair can both see `existing === null` and both
      // attempt this insert. The DB's `conversacion_unica_por_cliente
      // UNIQUE (negocio_id, cliente_id)` constraint
      // (0003_tenant_negocio_split.sql) makes the loser's insert fail with
      // 23505 instead of creating a duplicate row — re-select and refresh
      // the window on the winner's row rather than throwing on a race that
      // isn't actually an error.
      if (error?.code === "23505") {
        const { data: winner } = await negocioScoped(negocioId)
          .conversaciones()
          .select("*")
          .eq("cliente_id", clienteId)
          .maybeSingle();

        if (winner) {
          const { error: updateError } = await negocioScoped(negocioId).updateConversacion(
            winner.id,
            { ventana_expira_at: ventanaExpiraIso },
          );

          if (updateError) {
            throw new Error(
              `findOrCreateConversacion: no se pudo refrescar la ventana tras 23505 (conversacionId=${winner.id}): ${updateError.message}`,
            );
          }

          return { ...winner, ventana_expira_at: ventanaExpiraIso };
        }
      }

      throw new Error(
        `findOrCreateConversacion: no se pudo crear la conversacion (negocioId=${negocioId}, clienteId=${clienteId}): ${error?.message}`,
      );
    }

    return created;
  }

  const { error: updateError } = await negocioScoped(negocioId).updateConversacion(existing.id, {
    ventana_expira_at: ventanaExpiraIso,
  });

  if (updateError) {
    throw new Error(
      `findOrCreateConversacion: no se pudo refrescar la ventana (conversacionId=${existing.id}): ${updateError.message}`,
    );
  }

  return { ...existing, ventana_expira_at: ventanaExpiraIso };
}
