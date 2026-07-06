import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sendWhatsappMessage } from "./graphClient.js";

const NEGOCIO_ID = "11111111-1111-1111-1111-111111111111";

function buildDeps(fetchImpl: ReturnType<typeof vi.fn>) {
  return {
    fetch: fetchImpl,
    getWhatsappToken: vi.fn().mockResolvedValue("test-token"),
    getPhoneNumberId: vi.fn().mockResolvedValue("123456789"),
    log: vi.fn(),
  };
}

describe("sendWhatsappMessage (D-01 gate + Pitfall 6)", () => {
  const originalLive = process.env.WHATSAPP_LIVE;
  const originalVersion = process.env.WHATSAPP_GRAPH_API_VERSION;

  beforeEach(() => {
    process.env.WHATSAPP_GRAPH_API_VERSION = "v23.0";
  });

  afterEach(() => {
    if (originalLive === undefined) delete process.env.WHATSAPP_LIVE;
    else process.env.WHATSAPP_LIVE = originalLive;
    if (originalVersion === undefined) delete process.env.WHATSAPP_GRAPH_API_VERSION;
    else process.env.WHATSAPP_GRAPH_API_VERSION = originalVersion;
  });

  it("WHATSAPP_LIVE=false: never calls fetch, returns a synthetic mock.* id", async () => {
    process.env.WHATSAPP_LIVE = "false";
    const fetchSpy = vi.fn();
    const deps = buildDeps(fetchSpy);

    const result = await sendWhatsappMessage(NEGOCIO_ID, "5491122334455", "hola", deps);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.messages[0]?.id).toMatch(/^mock\./);
  });

  it("WHATSAPP_LIVE=true: POSTs to graph.facebook.com/{version}/{phone_number_id}/messages with Bearer token", async () => {
    process.env.WHATSAPP_LIVE = "true";
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ messages: [{ id: "wamid.real" }] }),
      text: async () => "",
    });
    const deps = buildDeps(fetchSpy);

    await sendWhatsappMessage(NEGOCIO_ID, "5491122334455", "hola", deps);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://graph.facebook.com/v23.0/123456789/messages");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toMatch(/^Bearer /);
  });

  it("throws on a non-ok HTTP response", async () => {
    process.env.WHATSAPP_LIVE = "true";
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({}),
      text: async () => "Unauthorized",
    });
    const deps = buildDeps(fetchSpy);

    await expect(sendWhatsappMessage(NEGOCIO_ID, "5491122334455", "hola", deps)).rejects.toThrow(
      /401/,
    );
  });

  it("throws (does not silently succeed) on an HTTP-200 response carrying an error body (Pitfall 6)", async () => {
    process.env.WHATSAPP_LIVE = "true";
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ error: { code: 131047, message: "Re-engagement message" } }),
      text: async () => "",
    });
    const deps = buildDeps(fetchSpy);

    await expect(sendWhatsappMessage(NEGOCIO_ID, "5491122334455", "hola", deps)).rejects.toThrow();
  });
});
