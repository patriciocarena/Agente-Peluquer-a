/**
 * src/config/env.test.ts — valida el parseo de las variables WhatsApp/pg-boss
 * (D-01/D-05/D-06) agregadas a loadEnv() antes de que ningún módulo de la
 * Fase 5 las consuma.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";

import { loadEnv } from "./env.js";

const ENV_KEYS = [
  "WHATSAPP_APP_SECRET",
  "WHATSAPP_VERIFY_TOKEN",
  "WHATSAPP_LIVE",
  "WHATSAPP_GRAPH_API_VERSION",
  "WHATSAPP_DEV_TOKEN",
] as const;

let originalEnv: Record<string, string | undefined>;

beforeEach(() => {
  originalEnv = {};
  for (const key of ENV_KEYS) {
    originalEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = originalEnv[key];
    }
  }
});

describe("loadEnv — WhatsApp/pg-boss vars", () => {
  it("WHATSAPP_LIVE es boolean false cuando la env var no está seteada", () => {
    expect(loadEnv().WHATSAPP_LIVE).toBe(false);
  });

  it("WHATSAPP_LIVE es boolean true solo para la literal string 'true'", () => {
    process.env.WHATSAPP_LIVE = "true";
    expect(loadEnv().WHATSAPP_LIVE).toBe(true);
  });

  it("WHATSAPP_LIVE es false para cualquier otro valor (p. ej. '1', 'TRUE')", () => {
    process.env.WHATSAPP_LIVE = "1";
    expect(loadEnv().WHATSAPP_LIVE).toBe(false);

    process.env.WHATSAPP_LIVE = "TRUE";
    expect(loadEnv().WHATSAPP_LIVE).toBe(false);
  });

  it("WHATSAPP_GRAPH_API_VERSION default a 'v23.0' cuando no está seteada", () => {
    expect(loadEnv().WHATSAPP_GRAPH_API_VERSION).toBe("v23.0");
  });

  it("WHATSAPP_GRAPH_API_VERSION respeta el override cuando está seteada", () => {
    process.env.WHATSAPP_GRAPH_API_VERSION = "v25.0";
    expect(loadEnv().WHATSAPP_GRAPH_API_VERSION).toBe("v25.0");
  });

  it("surfacea WHATSAPP_APP_SECRET, WHATSAPP_VERIFY_TOKEN, WHATSAPP_DEV_TOKEN y SUPABASE_DB_URL como strings cuando están seteadas", () => {
    process.env.WHATSAPP_APP_SECRET = "app-secret-dev";
    process.env.WHATSAPP_VERIFY_TOKEN = "verify-token-dev";
    process.env.WHATSAPP_DEV_TOKEN = "dev-token-dev";
    process.env.SUPABASE_DB_URL = "postgresql://postgres:pw@db.example.supabase.co:5432/postgres";

    const env = loadEnv();
    expect(env.WHATSAPP_APP_SECRET).toBe("app-secret-dev");
    expect(env.WHATSAPP_VERIFY_TOKEN).toBe("verify-token-dev");
    expect(env.WHATSAPP_DEV_TOKEN).toBe("dev-token-dev");
    expect(env.SUPABASE_DB_URL).toBe(
      "postgresql://postgres:pw@db.example.supabase.co:5432/postgres",
    );
  });
});
