/**
 * src/conversation/closingLanguage.test.ts — unit test puro del léxico D-12
 * compartido (sin I/O, sin mocks de Gemini/DB).
 */
import { describe, expect, it } from "vitest";

import { CLOSING_LANGUAGE_LEXICON, hasClosingLanguage } from "./closingLanguage.js";

describe("hasClosingLanguage (léxico D-12 compartido)", () => {
  it("detecta lenguaje de cierre ('quedaste')", () => {
    expect(hasClosingLanguage("listo, quedaste el sábado")).toBe(true);
  });

  it("no detecta lenguaje de cierre en un mensaje intermedio", () => {
    expect(hasClosingLanguage("dame un segundo que verifico")).toBe(false);
  });

  it.each(CLOSING_LANGUAGE_LEXICON)("detecta la palabra de cierre '%s' de forma case-insensitive", (word) => {
    expect(hasClosingLanguage(`${word.toUpperCase()} !!`)).toBe(true);
  });

  it("no confunde una palabra parcial no relacionada con el léxico", () => {
    expect(hasClosingLanguage("¿qué servicios ofrecen?")).toBe(false);
  });
});
