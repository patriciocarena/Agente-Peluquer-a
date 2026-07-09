import { afterEach, describe, expect, it, vi } from "vitest";

// getWhatsappToken.ts importa ../db/client.js, que tira en tiempo de import
// sin SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY reales -- mockeamos ese
// module-boundary (no el SDK completo de Supabase), mismo patrón que
// graphClient.test.ts. También mockeamos ../config/env.js para controlar
// WHATSAPP_DEV_TOKEN sin acoplar a variables de entorno reales.
vi.mock("../db/client.js", () => ({
  supabaseAdmin: { rpc: vi.fn(), from: vi.fn() },
}));

vi.mock("../config/env.js", () => ({
  loadEnv: vi.fn(),
}));

const { supabaseAdmin } = await import("../db/client.js");
const { loadEnv } = await import("../config/env.js");
const { getWhatsappToken } = await import("./getWhatsappToken.js");

const NEGOCIO_ID = "11111111-1111-1111-1111-111111111111";

function mockEnv(whatsappDevToken?: string) {
  vi.mocked(loadEnv).mockReturnValue({
    PORT: 3001,
    WHATSAPP_LIVE: false,
    WHATSAPP_GRAPH_API_VERSION: "v23.0",
    WHATSAPP_DEV_TOKEN: whatsappDevToken,
  });
}

describe("getWhatsappToken (SEC-01 -- camino Vault vía RPC)", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("happy path: resuelve el token vía .rpc('get_whatsapp_token', { p_negocio_id })", async () => {
    mockEnv(undefined);
    vi.mocked(supabaseAdmin.rpc).mockResolvedValue({
      data: "token-real",
      error: null,
    } as never);

    const token = await getWhatsappToken(NEGOCIO_ID);

    expect(token).toBe("token-real");
    expect(supabaseAdmin.rpc).toHaveBeenCalledWith("get_whatsapp_token", {
      p_negocio_id: NEGOCIO_ID,
    });
  });

  it("error path: lanza cuando el RPC devuelve error o data null", async () => {
    mockEnv(undefined);
    vi.mocked(supabaseAdmin.rpc).mockResolvedValue({
      data: null,
      error: { message: "boom" },
    } as never);

    await expect(getWhatsappToken(NEGOCIO_ID)).rejects.toThrow(
      `No whatsapp_token found for negocioId=${NEGOCIO_ID}`,
    );
  });

  it("short-circuit: con WHATSAPP_DEV_TOKEN seteado, devuelve ese valor y NUNCA llama a .rpc", async () => {
    mockEnv("dev-token-override");

    const token = await getWhatsappToken(NEGOCIO_ID);

    expect(token).toBe("dev-token-override");
    expect(supabaseAdmin.rpc).not.toHaveBeenCalled();
  });
});
