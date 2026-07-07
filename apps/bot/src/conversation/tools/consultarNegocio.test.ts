/**
 * consultarNegocio.test.ts — RED/GREEN del bloque <behavior> de
 * 06-03-PLAN.md Task 2. `negocioScoped` fake (sin DB real, sin Gemini) —
 * mismo estilo (Pattern 8) que `packages/availability-engine/src/booking.test.ts`.
 */
import type { Database } from "@turnosbot/db-types";
import { describe, expect, it, vi } from "vitest";

// consultarNegocio.ts importa negocioScoped.ts (para el tipo del default
// `deps` y su valor real) -> db/client.ts, que lanza sincrónicamente en
// import-time si faltan SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY (no seteadas
// en este entorno de test). Mismo fix que buscarHorarios.test.ts /
// inboundWorker.test.ts.
vi.mock("../../db/client.js", () => ({ supabaseAdmin: {} }));

import { negocioScoped as realNegocioScoped } from "../../db/negocioScoped.js";
import { consultarNegocioInputSchema, consultarNegocioTool } from "./consultarNegocio.js";

const NEGOCIO_ID = "00000000-0000-4000-8000-000000000001";
const CLIENTE_A_ID = "00000000-0000-4000-8000-0000000000c1";
const CLIENTE_B_ID = "00000000-0000-4000-8000-0000000000c2";
const PROFESIONAL_A_ID = "00000000-0000-4000-8000-0000000000a1";
const PROFESIONAL_B_ID = "00000000-0000-4000-8000-0000000000b1";

type ServicioRow = Database["public"]["Tables"]["servicio"]["Row"];
type HorarioRow = Database["public"]["Tables"]["horario_trabajo"]["Row"];
type TurnoRow = Database["public"]["Tables"]["turno"]["Row"];
type TurnoServicioRow = Database["public"]["Tables"]["turno_servicio"]["Row"];

const SERVICIOS: ServicioRow[] = [
  {
    id: "s1",
    negocio_id: NEGOCIO_ID,
    nombre: "Corte",
    precio: 6000,
    duracion_min: 30,
    activo: true,
    orden: 0,
    descripcion: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "s2",
    negocio_id: NEGOCIO_ID,
    nombre: "Descontinuado",
    precio: 1000,
    duracion_min: 10,
    activo: false,
    orden: 1,
    descripcion: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
];

const HORARIOS: HorarioRow[] = [
  {
    id: "h1",
    negocio_id: NEGOCIO_ID,
    profesional_id: PROFESIONAL_A_ID,
    dia_semana: 1,
    hora_inicio: "09:00:00",
    hora_fin: "13:00:00",
    activo: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "h2",
    negocio_id: NEGOCIO_ID,
    profesional_id: PROFESIONAL_B_ID,
    dia_semana: 2,
    hora_inicio: "14:00:00",
    hora_fin: "18:00:00",
    activo: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
];

const TURNOS: TurnoRow[] = [
  {
    id: "t1",
    negocio_id: NEGOCIO_ID,
    cliente_id: CLIENTE_A_ID,
    profesional_id: PROFESIONAL_A_ID,
    inicio: "2026-07-13T12:00:00.000Z",
    fin: "2026-07-13T12:30:00.000Z",
    estado: "confirmado",
    precio_total: 6000,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "t2-cancelado",
    negocio_id: NEGOCIO_ID,
    cliente_id: CLIENTE_A_ID,
    profesional_id: PROFESIONAL_A_ID,
    inicio: "2026-07-14T12:00:00.000Z",
    fin: "2026-07-14T12:30:00.000Z",
    estado: "cancelado",
    precio_total: 6000,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "t3-otro-cliente",
    negocio_id: NEGOCIO_ID,
    cliente_id: CLIENTE_B_ID,
    profesional_id: PROFESIONAL_B_ID,
    inicio: "2026-07-15T12:00:00.000Z",
    fin: "2026-07-15T12:30:00.000Z",
    estado: "confirmado",
    precio_total: 9999,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
];

const TURNO_SERVICIOS: TurnoServicioRow[] = [
  {
    id: "ts1",
    negocio_id: NEGOCIO_ID,
    turno_id: "t1",
    servicio_id: "s1",
    // Snapshot congelado: precio DISTINTO del precio "vivo" de s1 (6000) para
    // probar que la tool lee el snapshot y no el join vivo (T-06-10).
    nombre_snapshot: "Corte (precio viejo)",
    precio_snapshot: 5000,
    duracion_snapshot: 30,
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "ts3",
    negocio_id: NEGOCIO_ID,
    turno_id: "t3-otro-cliente",
    servicio_id: "s1",
    nombre_snapshot: "Corte",
    precio_snapshot: 6000,
    duracion_snapshot: 30,
    created_at: "2026-01-01T00:00:00Z",
  },
];

function fakeNegocioScoped(_negocioId: string): ReturnType<typeof realNegocioScoped> {
  return {
    servicios: async () => ({ data: SERVICIOS, error: null }),
    horariosTrabajo: async () => ({ data: HORARIOS, error: null }),
    turnos: async () => ({ data: TURNOS, error: null }),
    turnoServicios: async () => ({ data: TURNO_SERVICIOS, error: null }),
  } as unknown as ReturnType<typeof realNegocioScoped>;
}

async function runExecute(
  t: ReturnType<typeof consultarNegocioTool>,
  input: unknown,
): Promise<unknown> {
  const execute = t.execute as unknown as (input: unknown, options: unknown) => Promise<unknown>;
  return execute(input, { toolCallId: "test", messages: [] });
}

describe("consultarNegocioTool", () => {
  it('tipo "precios" devuelve solo servicios activos con nombre/precio/duracion', async () => {
    const t = consultarNegocioTool(NEGOCIO_ID, CLIENTE_A_ID, { negocioScoped: fakeNegocioScoped });
    const result = (await runExecute(t, { tipo: "precios" })) as {
      tipo: string;
      servicios: { nombre: string; precio: number; duracionMin: number }[];
    };

    expect(result.tipo).toBe("precios");
    expect(result.servicios).toEqual([{ nombre: "Corte", precio: 6000, duracionMin: 30 }]);
  });

  it('tipo "horarios_profesional" devuelve los bloques de ese profesional', async () => {
    const t = consultarNegocioTool(NEGOCIO_ID, CLIENTE_A_ID, { negocioScoped: fakeNegocioScoped });
    const result = (await runExecute(t, {
      tipo: "horarios_profesional",
      profesionalId: PROFESIONAL_A_ID,
    })) as { tipo: string; bloques: { diaSemana: number; horaInicio: string; horaFin: string }[] };

    expect(result.tipo).toBe("horarios_profesional");
    expect(result.bloques).toEqual([{ diaSemana: 1, horaInicio: "09:00:00", horaFin: "13:00:00" }]);
  });

  it('tipo "estado_turno" devuelve los turnos NO cancelados del clienteId capturado, con snapshots', async () => {
    const t = consultarNegocioTool(NEGOCIO_ID, CLIENTE_A_ID, { negocioScoped: fakeNegocioScoped });
    const result = (await runExecute(t, { tipo: "estado_turno" })) as {
      tipo: string;
      turnos: { turnoId: string; servicios: { nombre: string; precio: number }[] }[];
    };

    expect(result.tipo).toBe("estado_turno");
    expect(result.turnos).toHaveLength(1);
    expect(result.turnos[0].turnoId).toBe("t1");
    // Snapshot congelado (5000), NUNCA el precio vivo del servicio (6000) —
    // T-06-10.
    expect(result.turnos[0].servicios).toEqual([
      { nombre: "Corte (precio viejo)", precio: 5000, duracionMin: 30 },
    ]);
  });

  it("estado_turno NUNCA devuelve turnos de otro clienteId, aunque el mock tenga turnos de CLIENTE_B", async () => {
    const t = consultarNegocioTool(NEGOCIO_ID, CLIENTE_A_ID, { negocioScoped: fakeNegocioScoped });
    const result = (await runExecute(t, { tipo: "estado_turno" })) as {
      turnos: { turnoId: string }[];
    };

    expect(result.turnos.some((turno) => turno.turnoId === "t3-otro-cliente")).toBe(false);

    // El filtro es por el clienteId cerrado en la factory (CLIENTE_A_ID),
    // no por ningún campo del input del modelo — el inputSchema (abajo) ni
    // siquiera tiene un campo clienteId que el modelo pudiera intentar usar.
    const tParaB = consultarNegocioTool(NEGOCIO_ID, CLIENTE_B_ID, {
      negocioScoped: fakeNegocioScoped,
    });
    const resultB = (await runExecute(tParaB, { tipo: "estado_turno" })) as {
      turnos: { turnoId: string }[];
    };
    expect(resultB.turnos.map((turno) => turno.turnoId)).toEqual(["t3-otro-cliente"]);
  });

  it("el inputSchema no acepta negocioId ni clienteId como campos", () => {
    const shape = consultarNegocioInputSchema.shape;
    expect(Object.keys(shape)).not.toContain("negocioId");
    expect(Object.keys(shape)).not.toContain("clienteId");
  });
});
