/**
 * buildBotAvailabilityData.test.ts — cubre el fix de WR-01 (06-REVIEW.md):
 * `negocioScoped(negocioId).negocio()` filtra por `tenant_id` (no `id`) y
 * puede devolver más de una fila para un tenant con varios negocios;
 * `buildBotAvailabilityData` debe matchear por `id` exacto en vez de tomar
 * `.data?.[0]` a ciegas, para no mezclar silenciosamente datos de otra
 * sucursal del mismo tenant.
 */
import { describe, expect, it, vi } from "vitest";

// Mismo fix que buscarHorarios.test.ts: evita que db/client.ts lance en
// import-time por falta de env vars (negocioScoped.ts importa db/client.ts
// transitivamente).
vi.mock("../db/client.js", () => ({ supabaseAdmin: {} }));

import { buildBotAvailabilityData } from "./buildBotAvailabilityData.js";

const NEGOCIO_ID = "11111111-1111-1111-1111-111111111111";
const OTRO_NEGOCIO_ID_MISMO_TENANT = "22222222-2222-2222-2222-222222222222";

function makeNegocioRow(id: string) {
  return { id, timezone: "America/Argentina/Buenos_Aires", granularidad_min: 15, tenant_id: "tenant-1" };
}

function fakeNegocioScoped(negocioRows: Array<ReturnType<typeof makeNegocioRow>>) {
  const negocio = vi.fn(async () => ({ data: negocioRows, error: null }));
  const horariosTrabajo = vi.fn(async () => ({ data: [], error: null }));
  const bloqueos = vi.fn(async () => ({ data: [], error: null }));
  const turnos = vi.fn(async () => ({ data: [], error: null }));
  const servicios = vi.fn(async () => ({ data: [], error: null }));
  const negocioScopedFn = vi.fn((_negocioId: string) => ({
    negocio,
    horariosTrabajo,
    bloqueos,
    turnos,
    servicios,
  }));
  const negocioScoped = negocioScopedFn as unknown as typeof import("../db/negocioScoped.js").negocioScoped;
  return { negocioScoped };
}

describe("buildBotAvailabilityData (WR-01)", () => {
  it("tenant con UN solo negocio -> devuelve ese negocio (caso feliz preexistente)", async () => {
    const { negocioScoped } = fakeNegocioScoped([makeNegocioRow(NEGOCIO_ID)]);

    const result = await buildBotAvailabilityData(NEGOCIO_ID, { negocioScoped });

    expect(result.negocio.id).toBe(NEGOCIO_ID);
  });

  it("tenant con VARIOS negocios (multi-location) -> matchea por id exacto, nunca .data?.[0] a ciegas", async () => {
    // El negocio pedido (NEGOCIO_ID) aparece SEGUNDO en el array -- si el
    // código tomara `.data?.[0]` a ciegas, devolvería el negocio equivocado.
    const { negocioScoped } = fakeNegocioScoped([
      makeNegocioRow(OTRO_NEGOCIO_ID_MISMO_TENANT),
      makeNegocioRow(NEGOCIO_ID),
    ]);

    const result = await buildBotAvailabilityData(NEGOCIO_ID, { negocioScoped });

    expect(result.negocio.id).toBe(NEGOCIO_ID);
  });

  it("negocioId pedido no aparece entre las filas devueltas -> lanza en vez de devolver un negocio equivocado", async () => {
    const { negocioScoped } = fakeNegocioScoped([makeNegocioRow(OTRO_NEGOCIO_ID_MISMO_TENANT)]);

    await expect(buildBotAvailabilityData(NEGOCIO_ID, { negocioScoped })).rejects.toThrow(
      /no se pudo cargar el negocio esperado/i,
    );
  });

  it("negocioRes.error -> lanza (nunca devuelve un AvailabilityData parcial/silencioso)", async () => {
    const negocio = vi.fn(async () => ({ data: null, error: { message: "boom" } }));
    const horariosTrabajo = vi.fn(async () => ({ data: [], error: null }));
    const bloqueos = vi.fn(async () => ({ data: [], error: null }));
    const turnos = vi.fn(async () => ({ data: [], error: null }));
    const servicios = vi.fn(async () => ({ data: [], error: null }));
    const negocioScopedFn = vi.fn((_negocioId: string) => ({
      negocio,
      horariosTrabajo,
      bloqueos,
      turnos,
      servicios,
    }));
    const negocioScoped = negocioScopedFn as unknown as typeof import("../db/negocioScoped.js").negocioScoped;

    await expect(buildBotAvailabilityData(NEGOCIO_ID, { negocioScoped })).rejects.toThrow(/boom/);
  });
});
