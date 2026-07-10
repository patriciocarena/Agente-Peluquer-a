import { afterEach, describe, expect, it, vi } from "vitest";

// admin-tenants.ts importa @/lib/supabase/admin, que tira en tiempo de
// import sin SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY reales -- mockeamos ese
// module-boundary (no el SDK completo de Supabase), mismo patrón que
// apps/bot/src/whatsapp/getWhatsappToken.test.ts. `next/cache` también se
// mockea porque revalidatePath solo funciona dentro del runtime de Next.
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const { createAdminClient } = await import("@/lib/supabase/admin");
const { setWhatsappTokenSecret } = await import("./admin-tenants.js");

const NEGOCIO_ID = "11111111-1111-1111-1111-111111111111";

function mockAdminClient(rpcImpl: ReturnType<typeof vi.fn>) {
  vi.mocked(createAdminClient).mockReturnValue({
    rpc: rpcImpl,
  } as never);
}

describe("setWhatsappTokenSecret (SEC-01 -- camino Vault vía RPC)", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("happy path: llama .rpc('set_whatsapp_token_secret', ...) y devuelve el secretId", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "secret-uuid-123", error: null });
    mockAdminClient(rpc);

    const result = await setWhatsappTokenSecret(NEGOCIO_ID, "tok");

    expect(result).toEqual({ data: { secretId: "secret-uuid-123" } });
    expect(rpc).toHaveBeenCalledWith("set_whatsapp_token_secret", {
      p_negocio_id: NEGOCIO_ID,
      p_token: "tok",
      p_name: `whatsapp-token-${NEGOCIO_ID}`,
    });
  });

  it("validación: token vacío devuelve { error } sin llamar .rpc", async () => {
    const rpc = vi.fn();
    mockAdminClient(rpc);

    const result = await setWhatsappTokenSecret(NEGOCIO_ID, "");

    expect(result.error).toBeDefined();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("validación: negocioId inválido devuelve { error } sin llamar .rpc", async () => {
    const rpc = vi.fn();
    mockAdminClient(rpc);

    const result = await setWhatsappTokenSecret("no-es-un-uuid", "tok");

    expect(result.error).toBeDefined();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("error DB: con rpc devolviendo error, devuelve { error: GENERIC_ERROR } y no lanza", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
    mockAdminClient(rpc);

    const result = await setWhatsappTokenSecret(NEGOCIO_ID, "tok");

    expect(result.error).toBeDefined();
    expect(result.data).toBeUndefined();
  });
});
