/**
 * guardarNombreCliente.test.ts — tool que persiste el nombre que el cliente dio
 * por chat (06-UAT.md Gap "nombre"). `negocioScoped` va mockeado: esta tool es
 * un update acotado, no motor. Sin Gemini, sin DB real.
 *
 * D-13: la tool cierra sobre negocioId Y clienteId — se verifica que el update
 * se scopea al cliente de la closure (nunca uno que venga del input del modelo).
 */
import { describe, expect, it, vi } from "vitest";

// Evita que db/client.ts lance en import-time por falta de env vars (mismo fix
// que el resto de los tests de tools).
vi.mock("../../db/client.js", () => ({ supabaseAdmin: {} }));

import { guardarNombreClienteInputSchema, guardarNombreClienteTool } from "./guardarNombreCliente.js";

const NEGOCIO_ID = "11111111-1111-1111-1111-111111111111";
const CLIENTE_ID = "22222222-2222-2222-2222-222222222222";

/** fakeNegocioScoped — `updateCliente` resuelve `{ error }`. Devuelve el spy
 * para inspeccionar con qué (id, patch) se llamó. */
function fakeNegocioScoped(error: unknown = null) {
  const updateCliente = vi.fn(async () => ({ error }));
  const negocioScopedFn = vi.fn((_negocioId: string) => ({ updateCliente }));
  const negocioScoped = negocioScopedFn as unknown as typeof import("../../db/negocioScoped.js").negocioScoped;
  return { negocioScoped, updateCliente, negocioScopedFn };
}

async function runExecute(t: ReturnType<typeof guardarNombreClienteTool>, input: unknown): Promise<unknown> {
  const execute = t.execute as unknown as (input: unknown, options: unknown) => Promise<unknown>;
  return execute(input, { toolCallId: "test", messages: [] });
}

describe("guardarNombreClienteTool", () => {
  it("persiste el nombre vía updateCliente(clienteId, {nombre}) — negocioId/clienteId de la closure", async () => {
    const { negocioScoped, updateCliente, negocioScopedFn } = fakeNegocioScoped();
    const t = guardarNombreClienteTool(NEGOCIO_ID, CLIENTE_ID, { negocioScoped });

    const result = await runExecute(t, { nombre: "Juan" });

    expect(negocioScopedFn).toHaveBeenCalledWith(NEGOCIO_ID);
    expect(updateCliente).toHaveBeenCalledWith(CLIENTE_ID, { nombre: "Juan" });
    expect(result).toEqual({ ok: true, nombre: "Juan" });
  });

  it("un error de DB devuelve { ok: false } (nunca narra éxito falso)", async () => {
    const { negocioScoped } = fakeNegocioScoped({ code: "23505", message: "boom" });
    const t = guardarNombreClienteTool(NEGOCIO_ID, CLIENTE_ID, { negocioScoped });

    const result = await runExecute(t, { nombre: "Juan" });

    expect(result).toEqual({ ok: false });
  });

  it("inputSchema recorta el nombre y rechaza vacío / solo-espacios", () => {
    expect(guardarNombreClienteInputSchema.parse({ nombre: "  Juan  " })).toEqual({ nombre: "Juan" });
    expect(guardarNombreClienteInputSchema.safeParse({ nombre: "" }).success).toBe(false);
    expect(guardarNombreClienteInputSchema.safeParse({ nombre: "   " }).success).toBe(false);
    expect(guardarNombreClienteInputSchema.safeParse({ nombre: "a".repeat(81) }).success).toBe(false);
  });
});
