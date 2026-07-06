/**
 * src/conversation/responder.test.ts — valida el contrato mínimo del stub
 * de Fase 5 (D-02) antes de que exista responder.ts (TDD RED).
 */
import { describe, expect, it } from "vitest";

import { responder } from "./responder.js";

describe("responder (D-02 stub)", () => {
  it("returns the deterministic placeholder reply regardless of input", async () => {
    const reply = await responder({} as any, "cualquier mensaje");
    expect(reply).toContain("Recibimos tu mensaje");
  });
});
