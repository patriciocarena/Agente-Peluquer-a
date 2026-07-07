/**
 * evals/judge.test.ts — cubre el bloque <behavior> de 06-06-PLAN.md Task 3.
 * `generateText` SIEMPRE inyectado vía `deps` — cero llamadas a Gemini live.
 */
import { describe, expect, it, vi } from "vitest";

import { judge, judgeSchema, type JudgeDeps, type JudgeInput } from "./judge.js";

function buildDeps(overrides: Partial<JudgeDeps> = {}): { deps: JudgeDeps; generateText: ReturnType<typeof vi.fn> } {
  const generateText = vi.fn().mockResolvedValue({
    output: { pasa: true, score: 5, motivo: "Todo lo que dice el bot está respaldado por tool-results." },
  });
  const deps: JudgeDeps = {
    generateText: generateText as unknown as JudgeDeps["generateText"],
    model: {} as JudgeDeps["model"],
    ...overrides,
  };
  return { deps, generateText };
}

const baseInput: JudgeInput = {
  dimension: "E2",
  transcript: "Cliente: cuanto sale el corte? Bot: el corte sale $5000 según nuestra lista de precios.",
  toolResults: [{ toolName: "consultarNegocio", output: { tipo: "precios", servicios: [{ nombre: "Corte", precio: 5000, duracionMin: 30 }] } }],
};

describe("judge — generateText + Output.object (E2/E6/E7/E8)", () => {
  it("con generateText inyectado que devuelve {pasa,score,motivo} -> devuelve esa estructura validada por el schema", async () => {
    const { deps } = buildDeps();
    const result = await judge(baseInput, deps);
    expect(judgeSchema.safeParse(result).success).toBe(true);
    expect(result).toEqual({ pasa: true, score: 5, motivo: expect.any(String) });
  });

  it("pasa el transcript + tool-results como DATOS en el prompt (no interpolados como instrucciones)", async () => {
    const { deps, generateText } = buildDeps();
    await judge(baseInput, deps);

    const callArgs = generateText.mock.calls[0]?.[0];
    expect(callArgs.prompt).toContain(baseInput.transcript);
    expect(callArgs.prompt).toContain("consultarNegocio");
    // El transcript/tool-results viajan en `prompt` (datos), nunca en `system`
    // (las instrucciones fijas del juez) — separación dura.
    expect(callArgs.system).not.toContain(baseInput.transcript);
  });

  it("selecciona una rubrica distinta segun la dimension pedida (E2 vs E7)", async () => {
    const { deps: depsE2, generateText: genE2 } = buildDeps();
    await judge({ ...baseInput, dimension: "E2" }, depsE2);

    const { deps: depsE7, generateText: genE7 } = buildDeps();
    await judge({ ...baseInput, dimension: "E7" }, depsE7);

    const systemE2 = genE2.mock.calls[0]?.[0].system as string;
    const systemE7 = genE7.mock.calls[0]?.[0].system as string;
    expect(systemE2).not.toEqual(systemE7);
  });

  it("nunca llama a Gemini live — generateText siempre es el mock inyectado", async () => {
    const { deps, generateText } = buildDeps();
    await judge(baseInput, deps);
    expect(generateText).toHaveBeenCalledTimes(1);
  });

  it("si generateText lanza dos veces, degrada a un resultado advisory seguro tras 1 retry, sin throw", async () => {
    const generateText = vi.fn().mockRejectedValue(new Error("429 rate limit"));
    const deps: JudgeDeps = { generateText: generateText as unknown as JudgeDeps["generateText"], model: {} as JudgeDeps["model"] };

    const result = await judge(baseInput, deps);

    expect(generateText).toHaveBeenCalledTimes(2);
    expect(result.pasa).toBe(false);
    expect(result.motivo).toContain("judge_error");
  });

  it("si el output es malformado (falla el schema), degrada a advisory tras 1 retry sin romper el runner", async () => {
    const generateText = vi.fn().mockResolvedValue({ output: { pasa: "no-es-boolean" } });
    const deps: JudgeDeps = { generateText: generateText as unknown as JudgeDeps["generateText"], model: {} as JudgeDeps["model"] };

    const result = await judge(baseInput, deps);

    expect(generateText).toHaveBeenCalledTimes(2);
    expect(result.pasa).toBe(false);
    expect(result.score).toBe(1);
    expect(result.motivo).toContain("judge_error");
  });

  it("nunca imprime la API key en el motivo de error", async () => {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "AIzaFAKE_TEST_KEY_DO_NOT_USE";
    const generateText = vi.fn().mockRejectedValue(new Error("auth failed"));
    const deps: JudgeDeps = { generateText: generateText as unknown as JudgeDeps["generateText"], model: {} as JudgeDeps["model"] };

    const result = await judge(baseInput, deps);
    expect(result.motivo).not.toContain("AIzaFAKE_TEST_KEY_DO_NOT_USE");
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  });
});
