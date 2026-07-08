/**
 * src/conversation/responder.test.ts — cubre el bloque <behavior> de
 * 06-05-PLAN.md Task 1: tool-loop + gate D-12 + persistencia de estado.
 * `generateText` se inyecta SIEMPRE fake vía `deps` — NUNCA se llama a
 * Gemini real. `responder.ts` importa las 5 factories de tools (06-03/06-04)
 * a nivel de módulo, que a su vez importan `../db/client.js` transitivamente
 * — mismo fix de import-time que buscarHorarios.test.ts/inboundWorker.test.ts:
 * mockear el módulo ANTES de importar responder.js.
 */
import type { ToolSet } from "ai";
import type { Tables } from "@turnosbot/db-types";
import { describe, expect, it, vi } from "vitest";

vi.mock("../db/client.js", () => ({ supabaseAdmin: {} }));

import { CLOSING_LANGUAGE_LEXICON } from "./closingLanguage.js";
import {
  responder,
  SAFE_FALLBACK_MESSAGE,
  type ResponderDeps,
  type ResponderGenerateTextResult,
} from "./responder.js";

const NEGOCIO_ID = "00000000-0000-4000-8000-000000000001";
const CLIENTE_ID = "00000000-0000-4000-8000-000000000002";
const CONVERSACION_ID = "00000000-0000-4000-8000-000000000003";
const TURNO_ID_REAL = "00000000-0000-4000-8000-000000000099";

function makeConversacion(overrides: Partial<Tables<"conversacion">> = {}): Tables<"conversacion"> {
  return {
    id: CONVERSACION_ID,
    negocio_id: NEGOCIO_ID,
    cliente_id: CLIENTE_ID,
    context: {},
    ventana_expira_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  } as Tables<"conversacion">;
}

/** Fabrica un `GenerateTextResult` mínimo — solo los campos que responder.ts
 * lee (`text`, `steps`, `response.messages`). */
function fakeResult(overrides: {
  text: string;
  steps?: ResponderGenerateTextResult["steps"];
  responseMessages?: unknown[];
}): ResponderGenerateTextResult {
  return {
    text: overrides.text,
    steps: overrides.steps ?? [],
    response: { messages: overrides.responseMessages ?? [] },
  } as unknown as ResponderGenerateTextResult;
}

function stepWithConfirmarTurno(output: unknown): ResponderGenerateTextResult["steps"][number] {
  return {
    toolResults: [{ type: "tool-result", toolCallId: "call_1", toolName: "confirmarTurno", input: {}, output }],
  } as unknown as ResponderGenerateTextResult["steps"][number];
}

function stepWithCancelarTurno(output: unknown): ResponderGenerateTextResult["steps"][number] {
  return {
    toolResults: [{ type: "tool-result", toolCallId: "call_1", toolName: "cancelarTurno", input: {}, output }],
  } as unknown as ResponderGenerateTextResult["steps"][number];
}

interface BuildDepsOptions {
  result?: ResponderGenerateTextResult;
  generateTextImpl?: () => Promise<ResponderGenerateTextResult>;
}

function buildDeps(options: BuildDepsOptions = {}) {
  const { result = fakeResult({ text: "ok" }), generateTextImpl } = options;

  const generateText = generateTextImpl ? vi.fn(generateTextImpl) : vi.fn().mockResolvedValue(result);
  const buildTools = vi.fn().mockReturnValue({ fakeTool: {} } as unknown as ToolSet);
  const updateConversacion = vi.fn().mockResolvedValue({ data: null, error: null });
  const negocioScoped = vi.fn().mockReturnValue({ updateConversacion });
  const log = vi.fn();

  const deps: ResponderDeps = {
    generateText: generateText as unknown as ResponderDeps["generateText"],
    model: {} as ResponderDeps["model"],
    buildTools: buildTools as unknown as ResponderDeps["buildTools"],
    negocioScoped: negocioScoped as unknown as ResponderDeps["negocioScoped"],
    log,
  };

  return { deps, spies: { generateText, buildTools, updateConversacion, negocioScoped, log } };
}

describe("responder — tool-loop + gate D-12 + persistencia", () => {
  it("mantiene la firma posicional responder(conversacion, mensajeEntrante) -> Promise<string>", async () => {
    const { deps } = buildDeps();
    const reply = await responder(makeConversacion(), "hola", deps);
    expect(typeof reply).toBe("string");
  });

  it("deriva negocioId/clienteId/history y arma messages = [...history, {role:'user', content: mensajeEntrante}]", async () => {
    const history = [{ role: "assistant" as const, content: "¿en qué te ayudo?" }];
    const conversacion = makeConversacion({ context: { messages: history, needsHuman: false } });
    const { deps, spies } = buildDeps();

    await responder(conversacion, "quiero un corte", deps);

    expect(spies.buildTools).toHaveBeenCalledWith(NEGOCIO_ID, CLIENTE_ID);
    const callArgs = spies.generateText.mock.calls[0]?.[0];
    expect(callArgs.messages).toEqual([...history, { role: "user", content: "quiero un corte" }]);
    expect(callArgs.tools).toEqual({ fakeTool: {} });
  });

  it("stopWhen: isStepCount(6) presente en la llamada a generateText", async () => {
    const { deps, spies } = buildDeps();
    await responder(makeConversacion(), "hola", deps);

    const callArgs = spies.generateText.mock.calls[0]?.[0];
    expect(typeof callArgs.stopWhen).toBe("function");
    // Mismo comportamiento que isStepCount(6): true recién con 6 steps.
    expect(callArgs.stopWhen({ steps: new Array(6) })).toBe(true);
    expect(callArgs.stopWhen({ steps: new Array(5) })).toBe(false);
  });

  it("gate D-12: lenguaje de cierre SIN turno_id real -> mensaje seguro este turno + needsHuman=true persistido", async () => {
    const result = fakeResult({ text: `listo, ${CLOSING_LANGUAGE_LEXICON[2]} el sábado`, steps: [] });
    const { deps, spies } = buildDeps({ result });

    const reply = await responder(makeConversacion(), "confirmame el turno", deps);

    expect(reply).toBe(SAFE_FALLBACK_MESSAGE);
    expect(spies.updateConversacion).toHaveBeenCalledTimes(1);
    const [, patch] = spies.updateConversacion.mock.calls[0]!;
    expect((patch as { context: { needsHuman: boolean } }).context.needsHuman).toBe(true);
  });

  it("CR-02: cuando el gate D-12 dispara, el historial persistido guarda finalText, NUNCA el texto fantasma crudo", async () => {
    const phantomText = `listo, ${CLOSING_LANGUAGE_LEXICON[2]} el sábado`;
    const result = fakeResult({
      text: phantomText,
      steps: [],
      responseMessages: [
        { role: "assistant", content: phantomText },
      ],
    });
    const { deps, spies } = buildDeps({ result });

    const reply = await responder(makeConversacion(), "confirmame el turno", deps);

    expect(reply).toBe(SAFE_FALLBACK_MESSAGE);
    const [, patch] = spies.updateConversacion.mock.calls[0]!;
    const persistedMessages = (patch as { context: { messages: unknown[] } }).context.messages;
    // El último mensaje persistido debe llevar el mensaje seguro, no el texto
    // fantasma crudo del modelo -- si no, el propio contexto del modelo en
    // el próximo turno afirmaría una confirmación que el gate bloqueó.
    expect(persistedMessages).toContainEqual({ role: "assistant", content: SAFE_FALLBACK_MESSAGE });
    expect(persistedMessages).not.toContainEqual({ role: "assistant", content: phantomText });
  });

  it("CR-02: preserva tool-call/tool-result parts del último mensaje assistant al sustituir el texto (content en forma de array)", async () => {
    const phantomText = `listo, ${CLOSING_LANGUAGE_LEXICON[2]} el sábado`;
    const toolCallPart = { type: "tool-call", toolCallId: "call_1", toolName: "confirmarTurno", input: {} };
    const result = fakeResult({
      text: phantomText,
      steps: [],
      responseMessages: [
        { role: "assistant", content: [{ type: "text", text: phantomText }, toolCallPart] },
      ],
    });
    const { deps, spies } = buildDeps({ result });

    await responder(makeConversacion(), "confirmame el turno", deps);

    const [, patch] = spies.updateConversacion.mock.calls[0]!;
    const persistedMessages = (patch as { context: { messages: unknown[] } }).context.messages;
    const lastMessage = persistedMessages[persistedMessages.length - 1] as {
      role: string;
      content: Array<{ type: string; text?: string }>;
    };
    expect(lastMessage.content).toContainEqual(toolCallPart);
    expect(lastMessage.content).toContainEqual({ type: "text", text: SAFE_FALLBACK_MESSAGE });
    expect(lastMessage.content.some((part) => part.type === "text" && part.text === phantomText)).toBe(false);
  });

  it("gate D-12: lenguaje de cierre CON turno_id real (confirmarTurno ok) -> texto permitido, needsHuman=false", async () => {
    const step = stepWithConfirmarTurno({ ok: true, turnoId: TURNO_ID_REAL, precioTotal: 5000 });
    const result = fakeResult({
      text: `listo, quedaste el sábado a las 15hs`,
      steps: [step],
      responseMessages: [{ role: "assistant", content: "listo, quedaste el sábado a las 15hs" }],
    });
    const { deps, spies } = buildDeps({ result });

    const reply = await responder(makeConversacion(), "dale, confirmalo", deps);

    expect(reply).toBe("listo, quedaste el sábado a las 15hs");
    const [, patch] = spies.updateConversacion.mock.calls[0]!;
    expect((patch as { context: { needsHuman: boolean } }).context.needsHuman).toBe(false);
  });

  it("CR-01: cancelarTurno exitoso (ok:true, sin turno_id) legitima el lenguaje de cierre 'listo' -- no dispara el gate", async () => {
    const step = stepWithCancelarTurno({ ok: true, turnoId: "", mensaje: "Listo, cancelamos tu turno." });
    const result = fakeResult({
      text: "Listo, cancelamos tu turno.",
      steps: [step],
      responseMessages: [{ role: "assistant", content: "Listo, cancelamos tu turno." }],
    });
    const { deps, spies } = buildDeps({ result });

    const reply = await responder(makeConversacion(), "si, cancelalo nomas", deps);

    expect(reply).toBe("Listo, cancelamos tu turno.");
    const [, patch] = spies.updateConversacion.mock.calls[0]!;
    expect((patch as { context: { needsHuman: boolean } }).context.needsHuman).toBe(false);
  });

  it("CR-01: lenguaje de cierre 'listo' SIN cancelarTurno exitoso en steps sigue disparando el gate (no una allowance ciega)", async () => {
    const result = fakeResult({ text: "Listo, tu turno del viernes queda cancelado.", steps: [] });
    const { deps, spies } = buildDeps({ result });

    const reply = await responder(makeConversacion(), "cancelame el turno", deps);

    expect(reply).toBe(SAFE_FALLBACK_MESSAGE);
    const [, patch] = spies.updateConversacion.mock.calls[0]!;
    expect((patch as { context: { needsHuman: boolean } }).context.needsHuman).toBe(true);
  });

  it("persiste result.response.messages + needsHuman vía serializeConversationContext/updateConversacion", async () => {
    const history = [{ role: "user" as const, content: "hola" }];
    const conversacion = makeConversacion({ context: { messages: history, needsHuman: false } });
    const responseMessages = [{ role: "assistant", content: "¿qué servicio querés?" }];
    const result = fakeResult({ text: "¿qué servicio querés?", steps: [], responseMessages });
    const { deps, spies } = buildDeps({ result });

    await responder(conversacion, "hola de nuevo", deps);

    expect(spies.negocioScoped).toHaveBeenCalledWith(NEGOCIO_ID);
    expect(spies.updateConversacion).toHaveBeenCalledWith(CONVERSACION_ID, {
      context: { messages: [...history, ...responseMessages], needsHuman: false },
    });
  });

  it("un error de generateText (p.ej. NoSuchToolError) no se narra como éxito — mensaje seguro + needsHuman=true", async () => {
    const { NoSuchToolError } = await import("ai");
    const { deps, spies } = buildDeps({
      generateTextImpl: async () => {
        throw new NoSuchToolError({ toolName: "inventada", availableTools: ["buscarHorarios"] });
      },
    });

    const reply = await responder(makeConversacion(), "hola", deps);

    expect(reply).toBe(SAFE_FALLBACK_MESSAGE);
    const [, patch] = spies.updateConversacion.mock.calls[0]!;
    expect((patch as { context: { needsHuman: boolean } }).context.needsHuman).toBe(true);
    expect(spies.log).toHaveBeenCalledWith(
      expect.objectContaining({ negocioId: NEGOCIO_ID }),
      expect.stringContaining("NoSuchToolError"),
    );
  });
});
