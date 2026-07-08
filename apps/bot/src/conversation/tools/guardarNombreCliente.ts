/**
 * apps/bot/src/conversation/tools/guardarNombreCliente.ts — tool
 * `guardarNombreCliente`: persiste el nombre que el cliente dio por chat en su
 * fila `cliente` (BOT/06-UAT.md Gap "nombre").
 *
 * Contexto (06-UAT.md, hallazgo del smoke 2026-07-08): `findOrCreateCliente`
 * crea la fila con `nombre: null` ("filled in later by the conversation flow"),
 * pero ese "later" no existía — ninguna tool guardaba el nombre, así que el
 * turno de un cliente nuevo quedaba asociado solo a su teléfono. Esta tool es
 * ese "conversation flow": el modelo la llama cuando el cliente le dice cómo se
 * llama. El system prompt lo instruye a pedir el nombre (si aún no lo tiene)
 * antes de confirmar un turno.
 *
 * `guardarNombreClienteTool(negocioId, clienteId, deps?)` cierra sobre AMBOS
 * `negocioId` Y `clienteId` (Pattern 1, D-13): el `inputSchema` de abajo NUNCA
 * los incluye. El nombre solo puede escribirse sobre el cliente actual — un
 * cliente anónimo de WhatsApp no puede tocar la fila de otro (el `clienteId`
 * es closure-captured, no viene del input del modelo).
 */
import { tool } from "ai";
import { z } from "zod";

import { negocioScoped as realNegocioScoped } from "../../db/negocioScoped.js";

/** inputSchema de `guardarNombreCliente`. Sin `negocioId`/`clienteId` —
 * closure-captured (D-13). `nombre` se recorta y se acota para no persistir
 * cadenas vacías ni un texto arbitrariamente largo (p.ej. una frase entera
 * que el modelo confunda con un nombre). */
export const guardarNombreClienteInputSchema = z.object({
  nombre: z.string().trim().min(1).max(80),
});

export type GuardarNombreClienteInput = z.infer<typeof guardarNombreClienteInputSchema>;

export type GuardarNombreClienteResult = { ok: true; nombre: string } | { ok: false };

/** Deps inyectables (Pattern 3): `negocioScoped` real por defecto,
 * sustituible en tests por un fake sin DB real. */
export interface GuardarNombreClienteDeps {
  negocioScoped: typeof realNegocioScoped;
}

const defaultDeps: GuardarNombreClienteDeps = {
  negocioScoped: realNegocioScoped,
};

/**
 * guardarNombreClienteTool(negocioId, clienteId, deps?) — factory que devuelve
 * la tool `guardarNombreCliente` del AI SDK, cerrada sobre `negocioId` (D-13) y
 * `clienteId` (solo se escribe sobre el cliente actual).
 */
export function guardarNombreClienteTool(
  negocioId: string,
  clienteId: string,
  deps: GuardarNombreClienteDeps = defaultDeps,
) {
  return tool({
    description:
      "Guarda el nombre del cliente actual (el que te dio por chat) para que su turno quede asociado a su nombre y no solo a su teléfono. Llamala apenas el cliente te diga cómo se llama. No inventes un nombre: solo guardá lo que el cliente efectivamente dijo.",
    inputSchema: guardarNombreClienteInputSchema,
    execute: async (input: GuardarNombreClienteInput): Promise<GuardarNombreClienteResult> => {
      const { error } = await deps
        .negocioScoped(negocioId)
        .updateCliente(clienteId, { nombre: input.nombre });
      if (error) {
        return { ok: false };
      }
      return { ok: true, nombre: input.nombre };
    },
  });
}
