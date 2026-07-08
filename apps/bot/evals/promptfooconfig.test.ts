/**
 * evals/promptfooconfig.test.ts — WR-03 (06-REVIEW.md): promptfooconfig.yaml
 * `prompts` block (Gemini-real, nightly/gated eval) is a hand-maintained
 * prose synthesis of systemPrompt.ts's D-01/05/06/08/12/13 guardrails, with
 * NO automated check that it stays in sync — a wording change in
 * systemPrompt.ts could silently desync from what the nightly promptfoo run
 * actually exercises, since that suite never imports systemPrompt.ts.
 *
 * This file is a cheap, code-based (no Gemini call) freshness guard: it
 * imports `buildSystemPrompt()` directly and asserts the D-12 lexicon words
 * (single source: closingLanguage.ts's CLOSING_LANGUAGE_LEXICON) and the
 * D-13 isolation framing sentence still appear verbatim in its output. It
 * does NOT replace promptfooconfig.yaml's own hand-maintained prose (that
 * file targets Gemini's natural-language understanding, not byte-identical
 * matching) -- it only catches the specific regression of "someone renamed/
 * removed a guardrail phrase in systemPrompt.ts without updating the
 * dependent eval fixtures/config in the same PR", which today would fail
 * silently until the next nightly promptfoo run (if anyone reads it).
 */
import { describe, expect, it } from "vitest";

import { CLOSING_LANGUAGE_LEXICON } from "../src/conversation/closingLanguage.js";
import { buildSystemPrompt } from "../src/conversation/systemPrompt.js";

describe("promptfooconfig.yaml freshness guard (WR-03)", () => {
  it("cada palabra de CLOSING_LANGUAGE_LEXICON (D-12, fuente única) aparece verbatim en buildSystemPrompt()", () => {
    const prompt = buildSystemPrompt();
    for (const word of CLOSING_LANGUAGE_LEXICON) {
      expect(prompt).toContain(word);
    }
  });

  it("la frase de framing D-13 (aislamiento de negocio/cliente) sigue presente", () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain("El negocio de esta conversación es fijo");
  });

  it("la regla D-08 (confirmación explícita antes de cancelar) sigue presente", () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toMatch(/confirmación explícita/i);
  });

  it("Gap 2a — instrucción positiva de narrar en texto el resultado de una tool de consulta sigue presente", () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toMatch(/Siempre comunicá el resultado de una consulta/i);
  });
});
