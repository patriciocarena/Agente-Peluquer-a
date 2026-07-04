import Fastify from "fastify";
import { loadEnv } from "./config/env.js";

const env = loadEnv();

const app = Fastify({
  logger: true,
});

// T-02-01 (Information Disclosure): health returns a minimal static body only —
// no env vars, versions, or DB state leaked.
app.get("/health", async () => {
  return { status: "ok" };
});

async function start() {
  try {
    await app.listen({ port: env.PORT, host: "0.0.0.0" });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
