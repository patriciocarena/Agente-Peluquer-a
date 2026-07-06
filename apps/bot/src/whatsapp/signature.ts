/**
 * src/whatsapp/signature.ts — verifyWhatsappSignature: la única puerta que
 * el POST /webhooks/whatsapp (plan 05-06) debe cruzar antes de encolar nada
 * (WA-01, D-06).
 *
 * El input DEBE ser los bytes crudos (`Buffer`) del body exactamente como
 * Meta los envió — NUNCA `JSON.stringify(request.body)` sobre el objeto ya
 * parseado. Meta calcula `X-Hub-Signature-256` sobre esos bytes crudos; el
 * orden de claves, el whitespace y el escaping de JSON no sobreviven un
 * round-trip `JSON.parse` → `JSON.stringify` de forma garantizada, así que
 * verificar contra el objeto re-serializado rompe la verificación en
 * silencio (Pitfall 1, 05-RESEARCH.md). El caller (plan 05-06) es
 * responsable de capturar el `Buffer` vía `addContentTypeParser` ANTES de
 * parsear JSON.
 *
 * La comparación usa `crypto.timingSafeEqual` (nunca `===`) para no exponer
 * un canal lateral de temporización. `timingSafeEqual` lanza un `RangeError`
 * si los buffers difieren en longitud — por eso el largo se compara ANTES
 * de invocarla; sin ese guard, un header corto/basura provocaría una
 * excepción no controlada (DoS del handler) en vez de un 403 limpio
 * (Pitfall 2, 05-RESEARCH.md).
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyWhatsappSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  appSecret: string,
): boolean {
  if (!signatureHeader?.startsWith("sha256=")) return false;

  const expected = createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const expectedBuf = Buffer.from(expected, "utf8");
  const receivedBuf = Buffer.from(signatureHeader.slice("sha256=".length), "utf8");

  // Guard de longitud (Pitfall 2): timingSafeEqual lanza RangeError si los
  // buffers no tienen el mismo largo — nunca dejar que eso escale a un 500.
  if (expectedBuf.length !== receivedBuf.length) return false;

  return timingSafeEqual(expectedBuf, receivedBuf);
}
