import fastifyHelmet from "@fastify/helmet";
import fastifyRateLimit from "@fastify/rate-limit";
import Fastify from "fastify";

import { loadEnv } from "./config/env.js";
import { boss, startQueue, stopQueue } from "./queue/boss.js";
import { registerWhatsappWebhook } from "./whatsapp/webhook.js";

const env = loadEnv();

const app = Fastify({
  logger: true,
});

// D-12 (public-endpoint hardening): security headers + rate limiting,
// registered immediately after constructing the app, before any route —
// the project's first `app.register(...)` calls (05-PATTERNS.md).
app.register(fastifyHelmet);
app.register(fastifyRateLimit, { max: 100, timeWindow: "1 minute" });

// Pattern 1 (05-RESEARCH.md): capture the raw request body as a Buffer
// BEFORE JSON parsing, and BEFORE the webhook routes are registered below —
// X-Hub-Signature-256 (WA-01) must be verified over the EXACT bytes Meta
// sent. Re-serializing the parsed JSON (JSON.stringify) does not reliably
// round-trip key order/whitespace/escaping and silently breaks verification
// (Pitfall 1). Sets `statusCode = 400` on a parse failure instead of
// throwing an unhandled error.
app.addContentTypeParser(
  "application/json",
  { parseAs: "buffer" },
  (req, body, done) => {
    (req as { rawBody?: Buffer }).rawBody = body as Buffer;
    try {
      const json = JSON.parse((body as Buffer).toString("utf8"));
      done(null, json);
    } catch (err) {
      (err as { statusCode?: number }).statusCode = 400;
      done(err as Error, undefined);
    }
  },
);

registerWhatsappWebhook(app, { env, boss });

// T-02-01 (Information Disclosure): health returns a minimal static body only —
// no env vars, versions, or DB state leaked.
app.get("/health", async () => {
  return { status: "ok" };
});

async function start() {
  try {
    // The whatsapp-inbound pg-boss worker must be running before the HTTP
    // listener accepts traffic, so an inbound webhook is never enqueued into
    // a queue nobody is draining yet (D-03).
    await startQueue();
    await app.listen({ port: env.PORT, host: "0.0.0.0" });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

async function shutdown(signal: string) {
  app.log.info({ signal }, "Received shutdown signal — closing pg-boss and the HTTP server");
  try {
    await stopQueue();
    await app.close();
    process.exit(0);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

start();
