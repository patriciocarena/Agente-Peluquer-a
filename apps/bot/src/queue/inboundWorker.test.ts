/**
 * apps/bot/src/queue/inboundWorker.test.ts — processInboundWhatsappEvent
 * (WA-02/03/04/05), exercised entirely via injected fake deps: no network
 * call, no live DB, no live queue. Mirrors packages/availability-engine/src/
 * booking.test.ts's "chain of vi.fn() query-builder mocks" style for the
 * SupabaseClient-shaped dependency.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@turnosbot/db-types";
import { describe, expect, it, vi } from "vitest";

import type { WhatsappMessage, WhatsappWebhookEvent } from "../whatsapp/payload.js";

// inboundWorker.ts's default `deps` object imports the REAL collaborators
// (supabaseAdmin, negocioScoped, findOrCreateCliente/Conversacion, responder,
// sendWhatsappMessage) so the real singleton is threaded through when no
// `deps` override is supplied in production. Every test below always injects
// its own fake `deps` and never exercises these real, DB/network-backed
// modules — but the real `../db/client.js` (transitively imported by several
// of them) throws synchronously at import time when SUPABASE_URL /
// SUPABASE_SERVICE_ROLE_KEY aren't set, which is the case in this test
// environment. Mock the modules before importing inboundWorker.ts so that
// throwing import-time code never runs (same fix as 05-03's graphClient.test.ts).
vi.mock("../db/client.js", () => ({ supabaseAdmin: {} }));
vi.mock("../db/negocioScoped.js", () => ({ negocioScoped: vi.fn() }));
vi.mock("../conversation/findOrCreateCliente.js", () => ({ findOrCreateCliente: vi.fn() }));
vi.mock("../conversation/findOrCreateConversacion.js", () => ({ findOrCreateConversacion: vi.fn() }));
vi.mock("../conversation/responder.js", () => ({ responder: vi.fn() }));
vi.mock("../whatsapp/graphClient.js", () => ({ sendWhatsappMessage: vi.fn() }));

const { processInboundWhatsappEvent } = await import("./inboundWorker.js");
type ProcessInboundWhatsappEventDeps = NonNullable<Parameters<typeof processInboundWhatsappEvent>[1]>;

const PHONE_NUMBER_ID = "1234567890";
const NEGOCIO_ID = "00000000-0000-4000-8000-000000000001";
const CLIENTE_ID = "00000000-0000-4000-8000-000000000002";
const WA_ID = "5491122334455";

function buildEvent(
  options: { phoneNumberId?: string; message?: WhatsappMessage | null } = {},
): WhatsappWebhookEvent {
  const {
    phoneNumberId = PHONE_NUMBER_ID,
    message = { id: "wamid.abc123", from: WA_ID, type: "text", text: { body: "Hola" } },
  } = options;

  return {
    entry: [
      {
        changes: [
          {
            value: {
              metadata: { phone_number_id: phoneNumberId },
              messages: message ? [message] : undefined,
            },
          },
        ],
      },
    ],
  };
}

function makeMockSupabaseAdmin(result: {
  data: unknown;
  error: null;
}): Pick<SupabaseClient<Database>, "from"> {
  const maybeSingle = vi.fn().mockResolvedValue(result);
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });
  return { from } as unknown as Pick<SupabaseClient<Database>, "from">;
}

function makeConversacion(overrides: Partial<Tables<"conversacion">> = {}): Tables<"conversacion"> {
  return {
    id: "00000000-0000-4000-8000-000000000003",
    negocio_id: NEGOCIO_ID,
    cliente_id: CLIENTE_ID,
    context: {},
    ventana_expira_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  } as Tables<"conversacion">;
}

interface BuildDepsOptions {
  negocioResult?: { data: unknown; error: null };
  insertMensajeResult?: { data: unknown; error: { code: string; message: string } | null };
  conversacion?: Tables<"conversacion">;
  needsHuman?: boolean;
}

function buildDeps(options: BuildDepsOptions = {}) {
  const {
    negocioResult = {
      data: { id: NEGOCIO_ID, timezone: "America/Argentina/Buenos_Aires" },
      error: null,
    },
    insertMensajeResult = { data: null, error: null },
    conversacion = makeConversacion(),
    needsHuman = false,
  } = options;

  const supabaseAdmin = makeMockSupabaseAdmin(negocioResult);
  const insertMensaje = vi.fn().mockResolvedValue(insertMensajeResult);
  const negocioScoped = vi.fn().mockReturnValue({ insertMensaje });
  const sendWhatsappMessage = vi.fn().mockResolvedValue({ messages: [{ id: "mock.1" }] });
  const responder = vi.fn().mockResolvedValue("respuesta de prueba");
  const findOrCreateCliente = vi.fn().mockResolvedValue(CLIENTE_ID);
  const findOrCreateConversacion = vi.fn().mockResolvedValue(conversacion);
  const parseConversationContext = vi.fn().mockReturnValue({ messages: [], needsHuman });
  const log = vi.fn();

  const deps: ProcessInboundWhatsappEventDeps = {
    supabaseAdmin,
    findOrCreateCliente,
    findOrCreateConversacion,
    responder,
    sendWhatsappMessage,
    negocioScoped,
    parseConversationContext,
    log,
  };

  return {
    deps,
    spies: {
      insertMensaje,
      negocioScoped,
      parseConversationContext,
      sendWhatsappMessage,
      responder,
      findOrCreateCliente,
      findOrCreateConversacion,
      log,
    },
  };
}

describe("processInboundWhatsappEvent", () => {
  it("unknown phone_number_id: zero writes, no send (D-07)", async () => {
    const { deps, spies } = buildDeps({ negocioResult: { data: null, error: null } });

    await processInboundWhatsappEvent(buildEvent(), deps);

    expect(spies.findOrCreateCliente).not.toHaveBeenCalled();
    expect(spies.findOrCreateConversacion).not.toHaveBeenCalled();
    expect(spies.negocioScoped).not.toHaveBeenCalled();
    expect(spies.sendWhatsappMessage).not.toHaveBeenCalled();
  });

  it("non-message event (no messages[0]): no-op, zero writes", async () => {
    const { deps, spies } = buildDeps();

    await processInboundWhatsappEvent(buildEvent({ message: null }), deps);

    expect(spies.findOrCreateCliente).not.toHaveBeenCalled();
    expect(spies.negocioScoped).not.toHaveBeenCalled();
    expect(spies.sendWhatsappMessage).not.toHaveBeenCalled();
  });

  it("happy path: inserts one inbound + one outbound mensaje ('entrante'/'saliente'), calls send once", async () => {
    const { deps, spies } = buildDeps();

    await processInboundWhatsappEvent(buildEvent(), deps);

    expect(spies.findOrCreateCliente).toHaveBeenCalledWith(NEGOCIO_ID, WA_ID);
    expect(spies.findOrCreateConversacion).toHaveBeenCalledWith(NEGOCIO_ID, CLIENTE_ID);
    expect(spies.insertMensaje).toHaveBeenCalledTimes(2);
    expect(spies.insertMensaje.mock.calls[0]?.[0]).toMatchObject({ direccion: "entrante" });
    expect(spies.insertMensaje.mock.calls[1]?.[0]).toMatchObject({ direccion: "saliente" });
    expect(spies.responder).toHaveBeenCalledTimes(1);
    expect(spies.sendWhatsappMessage).toHaveBeenCalledTimes(1);
  });

  it("duplicate wa_message_id (23505): responder/send NOT called, no second persist (WA-03)", async () => {
    const { deps, spies } = buildDeps({
      insertMensajeResult: { data: null, error: { code: "23505", message: "duplicate key value" } },
    });

    await processInboundWhatsappEvent(buildEvent(), deps);

    expect(spies.insertMensaje).toHaveBeenCalledTimes(1);
    expect(spies.responder).not.toHaveBeenCalled();
    expect(spies.sendWhatsappMessage).not.toHaveBeenCalled();
  });

  it("sendWhatsappMessage rejecting: the job rejects loudly instead of silently succeeding (CR-02)", async () => {
    const { deps, spies } = buildDeps();
    const sendError = new Error("Graph API 503");
    spies.sendWhatsappMessage.mockRejectedValueOnce(sendError);

    await expect(processInboundWhatsappEvent(buildEvent(), deps)).rejects.toThrow("Graph API 503");

    expect(spies.log).toHaveBeenCalledWith(
      expect.objectContaining({ err: sendError }),
      expect.stringContaining("rethrowing for queue retry"),
    );
    // the inbound mensaje was already durably persisted before the send
    // failure — only the outbound mensaje (never reached) is missing.
    expect(spies.insertMensaje).toHaveBeenCalledTimes(1);
  });

  it("closed window (ventana_expira_at in the past): send NOT called, no outbound mensaje inserted", async () => {
    const pastConversacion = makeConversacion({
      ventana_expira_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    });
    const { deps, spies } = buildDeps({ conversacion: pastConversacion });

    await processInboundWhatsappEvent(buildEvent(), deps);

    expect(spies.responder).toHaveBeenCalledTimes(1);
    expect(spies.sendWhatsappMessage).not.toHaveBeenCalled();
    // only the inbound insert — the window-closed branch does not insert an outbound mensaje
    expect(spies.insertMensaje).toHaveBeenCalledTimes(1);
  });

  it("needsHuman === true (D-11): skips responder AND sendWhatsappMessage entirely, logs the skip", async () => {
    const { deps, spies } = buildDeps({ needsHuman: true });

    await processInboundWhatsappEvent(buildEvent(), deps);

    expect(spies.parseConversationContext).toHaveBeenCalledTimes(1);
    expect(spies.responder).not.toHaveBeenCalled();
    expect(spies.sendWhatsappMessage).not.toHaveBeenCalled();
    expect(spies.log).toHaveBeenCalledWith(
      expect.objectContaining({ conversacionId: expect.any(String) }),
      expect.stringContaining("D-11"),
    );
    // the inbound message was already durably persisted before the needsHuman check
    expect(spies.insertMensaje).toHaveBeenCalledTimes(1);
  });

  it("needsHuman === false: preserves the current flow — responder and sendWhatsappMessage (within window) still run", async () => {
    const { deps, spies } = buildDeps({ needsHuman: false });

    await processInboundWhatsappEvent(buildEvent(), deps);

    expect(spies.parseConversationContext).toHaveBeenCalledTimes(1);
    expect(spies.responder).toHaveBeenCalledTimes(1);
    expect(spies.sendWhatsappMessage).toHaveBeenCalledTimes(1);
  });
});
