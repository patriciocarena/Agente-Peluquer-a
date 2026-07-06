/**
 * apps/bot/src/whatsapp/graphClient.ts — outbound WhatsApp Cloud API client
 *
 * `sendWhatsappMessage` is the SOLE outbound-HTTP-egress point of the bot
 * service to a third party (graph.facebook.com) — every worker send goes
 * through here (see 05-05).
 *
 * D-01 gate: with `WHATSAPP_LIVE=false` (default) this function never calls
 * `fetch` — it logs the would-be POST and returns a synthetic success, so the
 * whole phase verifies locally with no Meta account/credentials required.
 * Only the literal string "true" for `WHATSAPP_LIVE` flips this to a real
 * network call.
 *
 * Pitfall 6: Meta's Graph API can return HTTP 200 with an embedded `error`
 * object in the JSON body instead of a non-2xx status. Treating `res.ok` as
 * "the message was sent" is therefore not sufficient — the parsed body is
 * always inspected for an `error` key before declaring success.
 *
 * The API version is read exclusively from `WHATSAPP_GRAPH_API_VERSION`
 * (loadEnv()) — never hardcoded at this or any other call site (Open
 * Question 1 in 05-RESEARCH.md).
 *
 * Optional `deps` param (mirrors packages/availability-engine/src/booking.ts's
 * `BookAppointmentDeps` injected-dependency style) makes this unit-testable
 * without a real network call.
 */
import { loadEnv } from "../config/env.js";
import { getPhoneNumberId, getWhatsappToken } from "./getWhatsappToken.js";

export interface WhatsappSendResult {
  messages: { id: string }[];
}

interface WhatsappGraphErrorBody {
  error?: { code?: number; message?: string };
}

export interface SendWhatsappMessageDeps {
  fetch: typeof fetch;
  getWhatsappToken: (negocioId: string) => Promise<string>;
  getPhoneNumberId: (negocioId: string) => Promise<string>;
  log: (obj: unknown, msg: string) => void;
}

const defaultDeps: SendWhatsappMessageDeps = {
  fetch: (...args) => globalThis.fetch(...args),
  getWhatsappToken,
  getPhoneNumberId,
  log: (obj, msg) => console.log(msg, obj),
};

export async function sendWhatsappMessage(
  negocioId: string,
  to: string,
  body: string,
  deps: SendWhatsappMessageDeps = defaultDeps,
): Promise<WhatsappSendResult> {
  const env = loadEnv();
  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "text",
    text: { preview_url: false, body },
  };

  if (!env.WHATSAPP_LIVE) {
    deps.log(
      { negocioId, to, payload },
      "[WHATSAPP_LIVE=false] mock send — not calling Graph API",
    );
    return { messages: [{ id: `mock.${Date.now()}` }] };
  }

  const [phoneNumberId, token] = await Promise.all([
    deps.getPhoneNumberId(negocioId),
    deps.getWhatsappToken(negocioId),
  ]);
  const url = `https://graph.facebook.com/${env.WHATSAPP_GRAPH_API_VERSION}/${phoneNumberId}/messages`;

  const res = await deps.fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`WhatsApp send failed: ${res.status} ${await res.text()}`);
  }

  const json = (await res.json()) as WhatsappSendResult & WhatsappGraphErrorBody;
  if (json.error) {
    deps.log(
      { negocioId, to, error: json.error },
      "WhatsApp send returned HTTP 200 with an embedded error (Pitfall 6)",
    );
    throw new Error(
      `WhatsApp send failed: ${json.error.code ?? "unknown"} ${json.error.message ?? "unknown error"}`,
    );
  }

  return json;
}
