/**
 * apps/bot/src/whatsapp/webhook.test.ts — registerWhatsappWebhook (WA-01/WA-03),
 * exercised via a scratch Fastify instance + `app.inject()` (no real listener,
 * no live queue). Mirrors the exact raw-body + route wiring server.ts performs
 * (05-06 Task 2), scoped to just this route for unit testing.
 */
import { createHmac } from "node:crypto";

import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";

// registerWhatsappWebhook imports WHATSAPP_INBOUND_QUEUE from ../queue/boss.js,
// which constructs a real PgBoss singleton at import time and throws if
// SUPABASE_DB_URL isn't set in this test environment (same import-time-throw
// concern already solved in inboundWorker.test.ts by mocking ../db/client.js).
// Mock the module so the test never touches the real queue/DB connection.
vi.mock("../queue/boss.js", () => ({ WHATSAPP_INBOUND_QUEUE: "whatsapp-inbound" }));

const { registerWhatsappWebhook } = await import("./webhook.js");

const APP_SECRET = "test-app-secret-05-06";
const VERIFY_TOKEN = "test-verify-token-05-06";

function sign(body: Buffer, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

function buildApp() {
  const app = Fastify();

  // Same raw-body-capture-before-JSON-parse wiring server.ts registers
  // app-wide (Pattern 1, 05-RESEARCH.md) — required for signature
  // verification to see the exact bytes.
  app.addContentTypeParser(
    "application/json",
    { parseAs: "buffer" },
    (req, body, done) => {
      (req as { rawBody?: Buffer }).rawBody = body as Buffer;
      try {
        done(null, JSON.parse((body as Buffer).toString("utf8")));
      } catch (err) {
        (err as { statusCode?: number }).statusCode = 400;
        done(err as Error, undefined);
      }
    },
  );

  const boss = { send: vi.fn().mockResolvedValue(undefined) };
  registerWhatsappWebhook(app, {
    env: { WHATSAPP_APP_SECRET: APP_SECRET, WHATSAPP_VERIFY_TOKEN: VERIFY_TOKEN },
    boss,
  });

  return { app, boss };
}

function messageEvent(messageId = "wamid.test123") {
  return {
    entry: [
      {
        changes: [
          {
            value: {
              metadata: { phone_number_id: "1234567890" },
              messages: [
                { id: messageId, from: "5491122334455", type: "text", text: { body: "Hola" } },
              ],
            },
          },
        ],
      },
    ],
  };
}

function statusEvent() {
  return {
    entry: [
      {
        changes: [
          {
            value: {
              metadata: { phone_number_id: "1234567890" },
              // no `messages[]` — a status update / read-receipt style event.
            },
          },
        ],
      },
    ],
  };
}

describe("GET /webhooks/whatsapp", () => {
  it("echoes hub.challenge when verify_token matches", async () => {
    const { app } = buildApp();
    const res = await app.inject({
      method: "GET",
      url: `/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=challenge-123`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe("challenge-123");
  });

  it("returns 403 when verify_token doesn't match", async () => {
    const { app } = buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong-token&hub.challenge=challenge-123",
    });
    expect(res.statusCode).toBe(403);
  });
});

describe("POST /webhooks/whatsapp", () => {
  it("returns 200 and enqueues once with singletonKey = messages[0].id on a valid signature", async () => {
    const { app, boss } = buildApp();
    const bodyObj = messageEvent("wamid.abc123");
    const body = Buffer.from(JSON.stringify(bodyObj), "utf8");
    const signature = sign(body, APP_SECRET);

    const res = await app.inject({
      method: "POST",
      url: "/webhooks/whatsapp",
      headers: { "content-type": "application/json", "x-hub-signature-256": signature },
      payload: body,
    });

    expect(res.statusCode).toBe(200);
    expect(boss.send).toHaveBeenCalledTimes(1);
    expect(boss.send).toHaveBeenCalledWith("whatsapp-inbound", bodyObj, {
      singletonKey: "wamid.abc123",
    });
  });

  it("returns 403 and does NOT enqueue when the signature is invalid", async () => {
    const { app, boss } = buildApp();
    const bodyObj = messageEvent();
    const body = Buffer.from(JSON.stringify(bodyObj), "utf8");

    const res = await app.inject({
      method: "POST",
      url: "/webhooks/whatsapp",
      headers: { "content-type": "application/json", "x-hub-signature-256": "sha256=deadbeef" },
      payload: body,
    });

    expect(res.statusCode).toBe(403);
    expect(boss.send).not.toHaveBeenCalled();
  });

  it("returns 403 and does NOT enqueue when the signature header is missing", async () => {
    const { app, boss } = buildApp();
    const bodyObj = messageEvent();
    const body = Buffer.from(JSON.stringify(bodyObj), "utf8");

    const res = await app.inject({
      method: "POST",
      url: "/webhooks/whatsapp",
      headers: { "content-type": "application/json" },
      payload: body,
    });

    expect(res.statusCode).toBe(403);
    expect(boss.send).not.toHaveBeenCalled();
  });

  it("returns 200 and does NOT enqueue for a non-message (status update) event", async () => {
    const { app, boss } = buildApp();
    const bodyObj = statusEvent();
    const body = Buffer.from(JSON.stringify(bodyObj), "utf8");
    const signature = sign(body, APP_SECRET);

    const res = await app.inject({
      method: "POST",
      url: "/webhooks/whatsapp",
      headers: { "content-type": "application/json", "x-hub-signature-256": signature },
      payload: body,
    });

    expect(res.statusCode).toBe(200);
    expect(boss.send).not.toHaveBeenCalled();
  });
});
