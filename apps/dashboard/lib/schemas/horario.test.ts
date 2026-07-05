/**
 * lib/schemas/horario.test.ts — RED del ciclo TDD del plan 02-07 Task 1.
 * Afirma el `<behavior>` declarado: horarioSchema rechaza hora_fin<=hora_inicio
 * dentro de un bloque y bloques solapados dentro del mismo día; acepta un día
 * con 0 bloques (Cerrado) y múltiples bloques disjuntos ordenados.
 */
import { describe, expect, it } from "vitest";

import {
  bloquesSolapan,
  diaHorarioSchema,
  horarioSchema,
  tieneBloquesSolapados,
  type DiaHorario,
} from "./horario";

function diaConBloques(bloques: DiaHorario["bloques"], dia_semana = 1): DiaHorario {
  return { dia_semana, bloques };
}

function horarioSemanaCompleta(diaLunesBloques: DiaHorario["bloques"]) {
  return {
    dias: [0, 1, 2, 3, 4, 5, 6].map((dia_semana) =>
      diaConBloques(dia_semana === 1 ? diaLunesBloques : [], dia_semana),
    ),
  };
}

describe("bloquesSolapan", () => {
  it("detecta solapamiento cuando un bloque empieza antes de que termine el otro", () => {
    expect(
      bloquesSolapan(
        { hora_inicio: "09:00", hora_fin: "13:00" },
        { hora_inicio: "12:00", hora_fin: "14:00" },
      ),
    ).toBe(true);
  });

  it("no detecta solapamiento en bloques disjuntos y consecutivos", () => {
    expect(
      bloquesSolapan(
        { hora_inicio: "09:00", hora_fin: "13:00" },
        { hora_inicio: "13:00", hora_fin: "14:00" },
      ),
    ).toBe(false);
    expect(
      bloquesSolapan(
        { hora_inicio: "09:00", hora_fin: "13:00" },
        { hora_inicio: "16:00", hora_fin: "20:00" },
      ),
    ).toBe(false);
  });
});

describe("tieneBloquesSolapados", () => {
  it("devuelve false para una lista vacía (día Cerrado)", () => {
    expect(tieneBloquesSolapados([])).toBe(false);
  });

  it("devuelve false para bloques disjuntos", () => {
    expect(
      tieneBloquesSolapados([
        { hora_inicio: "09:00", hora_fin: "13:00" },
        { hora_inicio: "16:00", hora_fin: "20:00" },
      ]),
    ).toBe(false);
  });

  it("devuelve true si algún par se solapa", () => {
    expect(
      tieneBloquesSolapados([
        { hora_inicio: "09:00", hora_fin: "13:00" },
        { hora_inicio: "12:00", hora_fin: "14:00" },
      ]),
    ).toBe(true);
  });
});

describe("diaHorarioSchema", () => {
  it("rechaza un bloque con hora_fin igual a hora_inicio", () => {
    const result = diaHorarioSchema.safeParse(
      diaConBloques([{ hora_inicio: "09:00", hora_fin: "09:00" }]),
    );
    expect(result.success).toBe(false);
  });

  it("rechaza un bloque con hora_fin anterior a hora_inicio", () => {
    const result = diaHorarioSchema.safeParse(
      diaConBloques([{ hora_inicio: "13:00", hora_fin: "09:00" }]),
    );
    expect(result.success).toBe(false);
  });

  it("rechaza bloques solapados dentro del mismo día", () => {
    const result = diaHorarioSchema.safeParse(
      diaConBloques([
        { hora_inicio: "09:00", hora_fin: "13:00" },
        { hora_inicio: "12:00", hora_fin: "14:00" },
      ]),
    );
    expect(result.success).toBe(false);
  });

  it("acepta múltiples bloques disjuntos ordenados", () => {
    const result = diaHorarioSchema.safeParse(
      diaConBloques([
        { hora_inicio: "09:00", hora_fin: "13:00" },
        { hora_inicio: "16:00", hora_fin: "20:00" },
      ]),
    );
    expect(result.success).toBe(true);
  });

  it("acepta un día sin bloques (Cerrado)", () => {
    const result = diaHorarioSchema.safeParse(diaConBloques([]));
    expect(result.success).toBe(true);
  });
});

describe("horarioSchema", () => {
  it("acepta una semana con un solo día configurado y el resto cerrados", () => {
    const result = horarioSchema.safeParse(
      horarioSemanaCompleta([
        { hora_inicio: "09:00", hora_fin: "13:00" },
        { hora_inicio: "16:00", hora_fin: "20:00" },
      ]),
    );
    expect(result.success).toBe(true);
  });

  it("rechaza si algún día tiene bloques solapados", () => {
    const result = horarioSchema.safeParse(
      horarioSemanaCompleta([
        { hora_inicio: "09:00", hora_fin: "13:00" },
        { hora_inicio: "12:00", hora_fin: "14:00" },
      ]),
    );
    expect(result.success).toBe(false);
  });

  it("rechaza una semana con menos de 7 días", () => {
    const result = horarioSchema.safeParse({
      dias: [diaConBloques([], 0), diaConBloques([], 1)],
    });
    expect(result.success).toBe(false);
  });
});
