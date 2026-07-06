/**
 * src/whatsapp/payload.test.ts — cubre las cuatro conductas de
 * whatsappWebhookEventSchema / extractPhoneNumberId / extractFirstMessage
 * (WA-01): mensaje válido, evento de status sin messages[], forma inválida
 * (falta metadata.phone_number_id), y extracción defensiva.
 */
import { describe, expect, it } from "vitest";

import {
  extractFirstMessage,
  extractPhoneNumberId,
  whatsappWebhookEventSchema,
} from "./payload.js";

function buildEvent(overrides: {
  phoneNumberId?: string;
  messages?: Array<{ id: string; from: string; type: string; text?: { body: string } }>;
}) {
  return {
    entry: [
      {
        changes: [
          {
            value: {
              metadata: { phone_number_id: overrides.phoneNumberId ?? "1234567890" },
              ...(overrides.messages ? { messages: overrides.messages } : {}),
            },
          },
        ],
      },
    ],
  };
}

describe("whatsappWebhookEventSchema", () => {
  it("parses a valid inbound text-message event", () => {
    const event = buildEvent({
      messages: [{ id: "wamid.123", from: "5491122334455", type: "text", text: { body: "hola" } }],
    });
    const result = whatsappWebhookEventSchema.safeParse(event);
    expect(result.success).toBe(true);
  });

  it("parses a status-update event with no messages[] array", () => {
    const event = buildEvent({});
    const result = whatsappWebhookEventSchema.safeParse(event);
    expect(result.success).toBe(true);
  });

  it("fails validation when metadata.phone_number_id is missing", () => {
    const malformed = {
      entry: [{ changes: [{ value: { metadata: {} } }] }],
    };
    const result = whatsappWebhookEventSchema.safeParse(malformed);
    expect(result.success).toBe(false);
  });

  it("fails validation when entry is missing entirely", () => {
    const malformed = {};
    const result = whatsappWebhookEventSchema.safeParse(malformed);
    expect(result.success).toBe(false);
  });
});

describe("extractPhoneNumberId", () => {
  it("returns the phone_number_id from a valid event", () => {
    const event = buildEvent({ phoneNumberId: "9999999999" });
    expect(extractPhoneNumberId(event)).toBe("9999999999");
  });
});

describe("extractFirstMessage", () => {
  it("returns id/from/text.body for a text-message event", () => {
    const event = buildEvent({
      messages: [{ id: "wamid.abc", from: "5491100000000", type: "text", text: { body: "hola bot" } }],
    });
    const message = extractFirstMessage(event);
    expect(message?.id).toBe("wamid.abc");
    expect(message?.from).toBe("5491100000000");
    expect(message?.text?.body).toBe("hola bot");
  });

  it("returns undefined when messages[] is absent (status-update event)", () => {
    const event = buildEvent({});
    expect(extractFirstMessage(event)).toBeUndefined();
  });
});
