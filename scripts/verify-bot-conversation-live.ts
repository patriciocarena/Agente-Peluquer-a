/**
 * verify-bot-conversation-live.ts (fase 06, ítem 1.2 del HANDOFF — GATED)
 *
 * Prueba EN VIVO, contra Gemini real + Supabase real (`bdgufnitakelyialjoqg`),
 * que los dos fixes de la fase 06 eliminan sus síntomas originales. Hasta hoy
 * la única cobertura eran tests unitarios que MOCKEAN `generateText`: prueban
 * nuestra lógica, no el comportamiento del modelo.
 *
 *   BUG 1 — memoria multi-turno (responder-history-drops-user-messages):
 *     `responder()` no persistía el mensaje del cliente, así que el bot
 *     re-preguntaba datos ya contestados y nunca avanzaba el agendamiento.
 *
 *   BUG 2 — texto vacío tras tool-result (responder-empty-text-after-tool-call):
 *     Gemini a veces cierra el turno con `finishReason:"stop"` y texto vacío
 *     después de un tool-call exitoso. El fix es en dos capas: instrucción
 *     positiva en el system prompt + guard con reintento sin tools y
 *     SAFE_FALLBACK_MESSAGE.
 *
 * Aserciones DURAS sobre estado observable (no sobre la redacción del modelo,
 * que es no-determinista):
 *
 *   A1  tras 3 turnos, `conversacion.context.messages` contiene EXACTAMENTE
 *       los 3 mensajes role:"user" enviados, con su texto literal y en orden.
 *   A2  el history persistido tras el turno N ya incluye el mensaje del turno N
 *       (o sea: el turno N+1 lo va a ver).
 *   A3  ninguna respuesta de `responder()` es cadena vacía.
 *   A4  ante una consulta de precio, la respuesta es no vacía. Que además
 *       contenga el número exacto es señal fuerte pero NO obligatoria (WARN).
 *
 * NO envía WhatsApp: llama `responder()` directo, nunca `sendWhatsappMessage`.
 * Crea un cliente + conversación DESCARTABLES y los borra en `cleanup()`, que
 * corre en todos los caminos (éxito, fallo y excepción).
 *
 * Un 429/503 de Gemini (free tier, ~30 RPM) se reporta como SKIPPED por rate
 * limit, nunca como fallo del fix.
 *
 * Requiere `.env` con SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY y
 * GOOGLE_GENERATIVE_AI_API_KEY. Run via:
 *   node --env-file=.env --import tsx scripts/verify-bot-conversation-live.ts
 * (pnpm no está en PATH; tsx no autocarga .env)
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@turnosbot/db-types";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GEMINI_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY;

/** Barbería Norte (seed). Su servicio "Corte clásico" es el que consultamos. */
const NEGOCIO_ID = "21111111-1111-1111-1111-111111111111";
/**
 * Teléfonos descartables, fuera de cualquier rango real. Hacen falta DOS
 * clientes distintos: la tabla `conversacion` tiene una constraint única
 * `conversacion_unica_por_cliente` (un cliente ⇒ a lo sumo una conversación),
 * y los dos escenarios necesitan historiales independientes.
 */
const TELEFONO_ESCENARIO_1 = "5491100000042";
const TELEFONO_ESCENARIO_2 = "5491100000043";

// ---------------------------------------------------------------- guardas

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("FALTAN SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en .env — abortando.");
  process.exit(1);
}

// Regla dura de CLAUDE.md: este script NUNCA debe tocar otro proyecto.
if (!SUPABASE_URL.includes("bdgufnitakelyialjoqg")) {
  console.error(`SUPABASE_URL no apunta a TurnosBot (bdgufnitakelyialjoqg). Abortando: ${SUPABASE_URL}`);
  process.exit(1);
}

if (!GEMINI_KEY) {
  console.error("FALTA GOOGLE_GENERATIVE_AI_API_KEY en .env — este script necesita el modelo REAL.");
  process.exit(1);
}

if (process.env.WHATSAPP_LIVE === "true") {
  console.error("WHATSAPP_LIVE=true — abortando para no mandar mensajes reales. Este script no los necesita.");
  process.exit(1);
}

const supabase = createClient<Database>(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ---------------------------------------------------------------- helpers

let fallos = 0;
let warns = 0;

function ok(msg: string): void {
  console.log(`OK: ${msg}`);
}

function assert(cond: boolean, msg: string): void {
  if (cond) ok(msg);
  else {
    console.error(`FALLO: ${msg}`);
    fallos++;
  }
}

function warn(msg: string): void {
  console.warn(`WARN: ${msg}`);
  warns++;
}

/** `true` si el error viene del rate limit del free tier de Gemini. */
function esRateLimit(err: unknown): boolean {
  const s = String((err as Error)?.message ?? err);
  return /429|503|rate.?limit|quota|overloaded|RESOURCE_EXHAUSTED/i.test(s);
}

interface CtxShape {
  messages?: { role?: string; content?: unknown }[];
}

/** Extrae, en orden, el `content` de los mensajes role:"user" del context. */
function mensajesDelUsuario(context: unknown): string[] {
  const msgs = (context as CtxShape)?.messages ?? [];
  return msgs
    .filter((m) => m?.role === "user")
    .map((m) => (typeof m.content === "string" ? m.content : JSON.stringify(m.content)));
}

// ---------------------------------------------------------------- fixture

const clienteIds: string[] = [];
const conversacionIds: string[] = [];

async function cleanup(): Promise<void> {
  // mensaje -> conversacion -> cliente (respeta las FKs).
  for (const cid of conversacionIds) {
    await supabase.from("mensaje").delete().eq("conversacion_id", cid);
    await supabase.from("conversacion").delete().eq("id", cid);
  }
  for (const cid of clienteIds) {
    await supabase.from("cliente").delete().eq("id", cid);
  }
}

/** Un cliente nuevo + su conversación vacía. Un cliente por escenario. */
async function crearConversacionDescartable(
  telefono: string,
): Promise<Database["public"]["Tables"]["conversacion"]["Row"]> {
  // Borrar restos de una corrida anterior que haya muerto antes del cleanup.
  await supabase.from("cliente").delete().eq("negocio_id", NEGOCIO_ID).eq("telefono", telefono);

  const { data: cliente, error: errCliente } = await supabase
    .from("cliente")
    .insert({ negocio_id: NEGOCIO_ID, telefono, nombre: "Cliente Verificación Live" })
    .select()
    .single();
  if (errCliente) throw new Error(`no pude crear el cliente de prueba: ${errCliente.message}`);
  clienteIds.push(cliente.id);

  const ventana = new Date(Date.now() + 23 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("conversacion")
    .insert({
      negocio_id: NEGOCIO_ID,
      cliente_id: cliente.id,
      context: { messages: [], needsHuman: false },
      ventana_expira_at: ventana,
    })
    .select()
    .single();
  if (error) throw new Error(`no pude crear la conversación de prueba: ${error.message}`);
  conversacionIds.push(data.id);
  return data;
}

/** Re-lee la fila, como hace inboundWorker entre turnos. */
async function releerConversacion(id: string): Promise<Database["public"]["Tables"]["conversacion"]["Row"]> {
  const { data, error } = await supabase.from("conversacion").select("*").eq("id", id).single();
  if (error) throw new Error(`no pude releer la conversación: ${error.message}`);
  return data;
}

// ---------------------------------------------------------------- main

async function main(): Promise<void> {
  const { responder, SAFE_FALLBACK_MESSAGE } = await import("../apps/bot/src/conversation/responder.js");

  console.log("=== Escenario 1: memoria multi-turno (BUG 1) ===\n");

  const turnos = [
    "hola quiero sacar un turno para un corte",
    "mañana a la tarde",
    "el corte clásico nomás",
  ];

  let conv = await crearConversacionDescartable(TELEFONO_ESCENARIO_1);

  for (const [i, mensaje] of turnos.entries()) {
    console.log(`  [cliente] ${mensaje}`);
    const reply = await responder(conv, mensaje);
    console.log(`  [bot]     ${reply || "(VACÍO)"}\n`);

    // A3 — el guard de empty-text nunca debe dejar pasar "".
    assert(reply.trim() !== "", `turno ${i + 1}: la respuesta del bot no es vacía`);
    if (reply === SAFE_FALLBACK_MESSAGE) {
      warn(
        `turno ${i + 1}: el bot devolvió SAFE_FALLBACK_MESSAGE — el guard de empty-text ACTUÓ. ` +
          `El fix contiene el bug, pero el modelo sigue cerrando turnos sin texto.`,
      );
    }

    conv = await releerConversacion(conv.id);

    // A2 — lo que el cliente acaba de decir ya está persistido, así que el
    // próximo turno lo va a ver en su `history`.
    const persistidos = mensajesDelUsuario(conv.context);
    assert(
      persistidos.includes(mensaje),
      `turno ${i + 1}: el mensaje del cliente sobrevive en el context persistido (lo verá el turno ${i + 2})`,
    );
  }

  // A1 — los 3 mensajes del usuario, literales y en orden.
  const finales = mensajesDelUsuario(conv.context);
  assert(
    finales.length === turnos.length && turnos.every((t, i) => finales[i] === t),
    `A1: context.messages tiene los ${turnos.length} mensajes role:"user" en orden ` +
      `(encontrados: ${finales.length})`,
  );

  if (finales.length === 0) {
    console.error("\n🚨 REGRESIÓN DE BUG 1: cero mensajes role:'user' en el context — el bot no recuerda nada.");
  }

  console.log("\n=== Escenario 2: consulta de precio, texto vacío tras tool-result (BUG 2) ===\n");

  const { data: servicio } = await supabase
    .from("servicio")
    .select("nombre,precio")
    .eq("negocio_id", NEGOCIO_ID)
    .eq("nombre", "Corte clásico")
    .single();

  const conv2 = await crearConversacionDescartable(TELEFONO_ESCENARIO_2);
  const preguntaPrecio = "hola cuanto sale el corte";
  console.log(`  [cliente] ${preguntaPrecio}`);
  const replyPrecio = await responder(conv2, preguntaPrecio);
  console.log(`  [bot]     ${replyPrecio || "(VACÍO)"}\n`);

  // A4 — no vacía es la aserción dura.
  assert(replyPrecio.trim() !== "", "A4: el bot responde con texto ante una consulta de precio");

  if (replyPrecio === SAFE_FALLBACK_MESSAGE) {
    warn(
      "consulta de precio: SAFE_FALLBACK_MESSAGE — el guard actuó. El cliente no recibe una " +
        "cadena vacía (el fix funciona), pero tampoco recibe el precio en este turno.",
    );
  } else if (servicio) {
    // Señal fuerte, no obligatoria: el modelo puede parafrasear o redondear.
    const precioStr = String(servicio.precio);
    const precioMiles = servicio.precio.toLocaleString("es-AR");
    if (replyPrecio.includes(precioStr) || replyPrecio.includes(precioMiles)) {
      ok(`la respuesta contiene el precio real de "${servicio.nombre}" ($${precioStr}) leído de la DB`);
    } else {
      warn(
        `la respuesta no contiene el precio literal ($${precioStr}). No es un fallo — el modelo ` +
          `puede parafrasear. Revisar la transcripción de arriba a ojo.`,
      );
    }
  }

  // ------------------------------------------------------------ veredicto
  console.log("");
  if (fallos > 0) {
    console.error(`🚨 verify-bot-conversation-live.ts: FAILED — ${fallos} aserción(es) dura(s) fallaron.`);
    process.exitCode = 1;
    return;
  }
  console.log(
    `✅ verify-bot-conversation-live.ts: PASSED` + (warns > 0 ? ` — con ${warns} warning(s), leer arriba.` : ""),
  );
}

main()
  .catch(async (err) => {
    if (esRateLimit(err)) {
      console.warn(`\n⏭  SKIPPED: rate limit del free tier de Gemini, no un fallo del fix. Reintentar en un minuto.`);
      console.warn(`   (${String((err as Error)?.message ?? err).slice(0, 120)})`);
      process.exitCode = 0;
      return;
    }
    console.error("\nERROR inesperado en verify-bot-conversation-live.ts:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await cleanup();
    console.log("cleanup: cliente y conversaciones de prueba eliminados.");
  });
