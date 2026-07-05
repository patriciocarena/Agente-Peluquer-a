/**
 * lib/schemas/horario.test.ts — RED del ciclo TDD del plan 02-07 Task 1.
 * Afirma el `<behavior>` declarado: horarioSchema rechaza hora_fin<=hora_inicio
 * en un bloque y bloques solapados dentro del mismo día; acepta un día con 0
 * bloques ("Cerrado") y múltiples bloques disjuntos ordenados en el mismo día.
 */
import { describe, expect, it } from "vitest";

import { bloquesSolapan, horarioSchema } from "./horario";

const diaVacio = { bloques: [] };
const diaUnBloque = { bloques: [{ hora_inicio: "09:00", hora_fin: "13:00" }] };
const diaDosBloquesDisjuntos = {
  bloques: [
    { hora_inicio: "09:00", hora_fin: "13:00" },
    { hora_inicio: "16:00", hora_fin: "20:00" },
  ],
};

function horarioConDia(dia: { bloques: { hora_inicio: string; hora_fin: string }[] }) {
  return {
    lunes: dia,
    martes: diaVacio,
    miercoles: diaVacio,
    jueves: diaVacio,
    viernes: diaVacio,
    sabado: diaVacio,
    domingo: diaVacio,
  };
}

describe("horarioSchema", () => {
  it("acepta un día vacío (Cerrado)", () => {
    const result = horarioSchema.safeParse(horarioConDia(diaVacio));
    expect(result.success).toBe(true);
  });

  it("acepta un día con un solo bloque", () => {
    const result = horarioSchema.safeParse(horarioConDia(diaUnBloque));
    expect(result.success).toBe(true);
  });

  it("acepta múltiples bloques disjuntos ordenados en el mismo día", () => {
    const result = horarioSchema.safeParse(horarioConDia(diaDosBloquesDisjuntos));
    expect(result.success).toBe(true);
  });

  it("rechaza hora_fin igual a hora_inicio en un bloque", () => {
    const result = horarioSchema.safeParse(
      horarioConDia({ bloques: [{ hora_inicio: "09:00", hora_fin: "09:00" }] }),
    );
    expect(result.success).toBe(false);
  });

  it("rechaza hora_fin menor a hora_inicio en un bloque", () => {
    const result = horarioSchema.safeParse(
      horarioConDia({ bloques: [{ hora_inicio: "13:00", hora_fin: "09:00" }] }),
    );
    expect(result.success).toBe(false);
  });

  it("rechaza bloques solapados dentro del mismo día", () => {
    const result = horarioSchema.safeParse(
      horarioConDia({
        bloques: [
          { hora_inicio: "09:00", hora_fin: "13:00" },
          { hora_inicio: "12:00", hora_fin: "14:00" },
        ],
      }),
    );
    expect(result.success).toBe(false);
  });

  it("rechaza bloques idénticos (solapamiento total) dentro del mismo día", () => {
    const result = horarioSchema.safeParse(
      horarioConDia({
        bloques: [
          { hora_inicio: "09:00", hora_fin: "13:00" },
          { hora_inicio: "09:00", hora_fin: "13:00" },
        ],
      }),
    );
    expect(result.success).toBe(false);
  });
});

describe("bloquesSolapan (helper puro reusable en el editor)", () => {
  it("devuelve false para bloques disjuntos", () => {
    expect(
      bloquesSolapan(
        { hora_inicio: "09:00", hora_fin: "13:00" },
        { hora_inicio: "16:00", hora_fin: "20:00" },
      ),
    ).toBe(false);
  });

  it("devuelve true para bloques que se solapan parcialmente", () => {
    expect(
      bloquesSolapan(
        { hora_inicio: "09:00", hora_fin: "13:00" },
        { hora_inicio: "12:00", hora_fin: "14:00" },
      ),
    ).toBe(true);
  });

  it("devuelve false para bloques contiguos (uno termina cuando el otro empieza)", () => {
    expect(
      bloquesSolapan(
        { hora_inicio: "09:00", hora_fin: "13:00" },
        { hora_inicio: "13:00", hora_fin: "18:00" },
      ),
    ).toBe(false);
  });
});
