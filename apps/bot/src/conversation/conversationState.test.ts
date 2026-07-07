/**
 * conversationState.test.ts — casos de parsing defensivo (T-06-06) del
 * bloque <behavior> de 06-02-PLAN.md. Sin red/DB, aserciones deterministas
 * (mismo estilo que whatsapp/payload.ts).
 */
import { describe, expect, it } from "vitest";

import {
  parseConversationContext,
  serializeConversationContext,
} from "./conversationState.js";

describe("parseConversationContext", () => {
  it("devuelve { messages: [], needsHuman: false } ante {}", () => {
    expect(parseConversationContext({})).toEqual({ messages: [], needsHuman: false });
  });

  it("devuelve { messages: [], needsHuman: false } ante null", () => {
    expect(parseConversationContext(null)).toEqual({ messages: [], needsHuman: false });
  });

  it("devuelve { messages: [], needsHuman: false } ante undefined", () => {
    expect(parseConversationContext(undefined)).toEqual({ messages: [], needsHuman: false });
  });

  it("preserva un shape válido intacto", () => {
    const valid = { messages: [{ role: "user", content: "hola" }], needsHuman: true };
    expect(parseConversationContext(valid)).toEqual(valid);
  });

  it("cae a messages: [] si `messages` no es Array", () => {
    const malformed = { messages: "no-es-array", needsHuman: true };
    expect(parseConversationContext(malformed)).toEqual({ messages: [], needsHuman: true });
  });

  it("cae a needsHuman: false si `needsHuman` no es boolean", () => {
    const malformed = { messages: [], needsHuman: "si" };
    expect(parseConversationContext(malformed)).toEqual({ messages: [], needsHuman: false });
  });
});

describe("serializeConversationContext", () => {
  it("hace round-trip: parse(serialize(x)) === x para shapes válidos", () => {
    const state = {
      messages: [{ role: "user" as const, content: "hola" }],
      needsHuman: true,
    };
    const serialized = serializeConversationContext(state);
    expect(parseConversationContext(serialized)).toEqual(state);
  });

  it("devuelve un objeto JSON-serializable", () => {
    const state = { messages: [], needsHuman: false };
    const serialized = serializeConversationContext(state);
    expect(() => JSON.stringify(serialized)).not.toThrow();
  });
});
