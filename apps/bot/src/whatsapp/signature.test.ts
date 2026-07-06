/**
 * src/whatsapp/signature.test.ts — cubre las seis conductas de
 * verifyWhatsappSignature (WA-01, D-06): firma válida, body/secreto/header
 * alterados, y el guard de longitud del Pitfall 2 (nunca debe lanzar).
 */
import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { verifyWhatsappSignature } from "./signature.js";

const APP_SECRET = "test-app-secret-05-02";

function sign(body: Buffer, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

describe("verifyWhatsappSignature", () => {
  it("returns true for a correctly-signed body", () => {
    const body = Buffer.from(JSON.stringify({ hello: "world" }), "utf8");
    const header = sign(body, APP_SECRET);
    expect(verifyWhatsappSignature(body, header, APP_SECRET)).toBe(true);
  });

  it("returns false when one byte of the body is tampered (same signature)", () => {
    const body = Buffer.from(JSON.stringify({ hello: "world" }), "utf8");
    const header = sign(body, APP_SECRET);
    const tamperedBody = Buffer.from(JSON.stringify({ hello: "worle" }), "utf8");
    expect(verifyWhatsappSignature(tamperedBody, header, APP_SECRET)).toBe(false);
  });

  it("returns false when the body is correct but the secret is wrong", () => {
    const body = Buffer.from(JSON.stringify({ hello: "world" }), "utf8");
    const header = sign(body, "wrong-secret");
    expect(verifyWhatsappSignature(body, header, APP_SECRET)).toBe(false);
  });

  it("returns false (no throw) when the header is undefined", () => {
    const body = Buffer.from(JSON.stringify({ hello: "world" }), "utf8");
    expect(() => verifyWhatsappSignature(body, undefined, APP_SECRET)).not.toThrow();
    expect(verifyWhatsappSignature(body, undefined, APP_SECRET)).toBe(false);
  });

  it("returns false when the header is missing the sha256= prefix", () => {
    const body = Buffer.from(JSON.stringify({ hello: "world" }), "utf8");
    const header = createHmac("sha256", APP_SECRET).update(body).digest("hex"); // no prefix
    expect(verifyWhatsappSignature(body, header, APP_SECRET)).toBe(false);
  });

  it("returns false (never a RangeError) on a truncated/length-mismatched signature", () => {
    const body = Buffer.from(JSON.stringify({ hello: "world" }), "utf8");
    const shortHeader = "sha256=deadbeef"; // far shorter than a real 64-char hex digest
    expect(() => verifyWhatsappSignature(body, shortHeader, APP_SECRET)).not.toThrow();
    expect(verifyWhatsappSignature(body, shortHeader, APP_SECRET)).toBe(false);
  });
});
