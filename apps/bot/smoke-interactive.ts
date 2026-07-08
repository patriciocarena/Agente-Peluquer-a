/**
 * apps/bot/smoke-interactive.ts — SMOKE EN VIVO INTERACTIVO (Gemini + DB reales)
 *
 * Verifica end-to-end el fix de bot-no-agenda-uuid-y-fecha.md (06-UAT.md test 2):
 *   1. El modelo resuelve los UUID reales de servicio/profesional vía
 *      consultarNegocio y los cita en buscarHorarios/confirmarTurno (Bug B).
 *   2. Usa el "hoy" real inyectado (año/día correctos) al resolver fechas
 *      relativas como "este viernes" (Bug fecha).
 *   3. Agenda un turno REAL (turno_id persistido) conversando.
 *
 * SEGURIDAD (lección del incidente del smoke anterior): este script NO borra
 * NADA. Solo crea/lee. Si agenda un turno, imprime su turno_id y lo dejás en
 * la DB; la limpieza la hacés a mano desde el dashboard (test 1 ya valida que
 * cancelar un turno desde la grilla funciona). Nunca borra "los N más recientes".
 *
 * Uso (desde la raíz del repo, con las env vars del .env cargadas):
 *   set -a && . ./.env && set +a && pnpm --filter @turnosbot/bot exec tsx smoke-interactive.ts
 *
 * Escribí como el cliente y apretá Enter. Comandos: /reset (limpia el historial
 * de la conversación de prueba), /salir (termina).
 */
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import { google } from "@ai-sdk/google";
import { generateText as aiGenerateText } from "ai";

import { buildDateContext } from "./src/conversation/dateContext.js";
import {
  buildResponderTools,
  responder,
  type ResponderDeps,
  type ResponderGenerateTextResult,
} from "./src/conversation/responder.js";
import { findOrCreateCliente } from "./src/conversation/findOrCreateCliente.js";
import { findOrCreateConversacion } from "./src/conversation/findOrCreateConversacion.js";
import { negocioScoped } from "./src/db/negocioScoped.js";

// Barbería Norte (id != tenant_id — el caso que destapó Bug A) + su cliente seed.
const NEGOCIO_ID = "21111111-1111-1111-1111-111111111111";
// Cliente Norte (seed, YA tiene nombre) por defecto. Pasá otro teléfono como
// primer argumento para probar el flujo de captura de nombre con un cliente
// NUEVO (nombre:null): `... tsx smoke-interactive.ts +5491100000099`.
const CLIENTE_TEL = process.argv[2] ?? "+5491100000010";

// Captura los steps del último generateText para poder mostrar el trace de
// tools sin cambiar la firma de responder() (que solo devuelve el texto final).
let lastSteps: ResponderGenerateTextResult["steps"] = [];

const smokeDeps: ResponderDeps = {
  model: google("gemini-3.1-flash-lite"),
  buildTools: buildResponderTools,
  negocioScoped,
  now: () => Date.now(), // reloj REAL — así se prueba de verdad el date grounding
  log: (obj, msg) => console.log(`   · [log] ${msg}`, obj),
  generateText: (async (opts: Parameters<typeof aiGenerateText>[0]) => {
    const result = await aiGenerateText(opts);
    lastSteps = result.steps;
    return result;
  }) as typeof aiGenerateText,
};

function printTrace() {
  let turnoId: string | null = null;
  let sawConsultarPrecios = false;
  let nombreGuardado: string | null = null;
  for (const [i, step] of lastSteps.entries()) {
    for (const call of step.toolCalls ?? []) {
      const input = JSON.stringify(call.input);
      console.log(`   → tool[${i}] ${call.toolName}(${input})`);
      if (call.toolName === "consultarNegocio" && input.includes("precios")) sawConsultarPrecios = true;
      if (call.toolName === "guardarNombreCliente") {
        nombreGuardado = (call.input as { nombre?: string }).nombre ?? "(?)";
      }
    }
    for (const res of step.toolResults ?? []) {
      const out = res.output as { ok?: boolean; turnoId?: string } | undefined;
      const brief = JSON.stringify(res.output);
      console.log(`   ← res [${i}] ${res.toolName} → ${brief.slice(0, 240)}${brief.length > 240 ? "…" : ""}`);
      if ((res.toolName === "confirmarTurno" || res.toolName === "reagendarTurno") && out?.ok && out.turnoId) {
        turnoId = out.turnoId;
      }
    }
  }
  if (sawConsultarPrecios) console.log("   ✓ el modelo consultó precios (con id real) antes de agendar");
  if (nombreGuardado) console.log(`   ✓ el modelo guardó el nombre del cliente: "${nombreGuardado}"`);
  if (turnoId) console.log(`\n   🎉 TURNO REAL AGENDADO — turno_id = ${turnoId}\n   (queda en la DB; cancelalo desde el dashboard si querés limpiar)`);
}

async function main() {
  console.log("=== SMOKE INTERACTIVO — Barbería Norte (Gemini + DB reales) ===");
  console.log(`negocio: ${NEGOCIO_ID}  |  cliente tel: ${CLIENTE_TEL}`);
  const { fechaHoy, diaSemanaHoy } = buildDateContext(Date.now(), "America/Argentina/Buenos_Aires");
  console.log(`hoy (inyectado al prompt): ${diaSemanaHoy} ${fechaHoy}\n`);

  const clienteId = await findOrCreateCliente(NEGOCIO_ID, CLIENTE_TEL);
  const conv = await findOrCreateConversacion(NEGOCIO_ID, clienteId);
  // Arranque limpio: resetea el historial de ESTA conversación de prueba (id
  // conocido, único UPDATE acotado — nunca borra filas).
  await negocioScoped(NEGOCIO_ID).updateConversacion(conv.id, { context: {} });
  console.log(`conversación de prueba: ${conv.id} (historial reseteado)\n`);
  console.log("Escribí como el cliente. Comandos: /reset · /salir\n");

  const rl = createInterface({ input, output });
  try {
    for (;;) {
      let raw: string;
      try {
        raw = await rl.question("👤 vos: ");
      } catch {
        break; // stdin cerrado (EOF / pipe) — salir limpio, sin stack trace
      }
      const line = raw.trim();
      if (!line) continue;
      if (line === "/salir") break;
      if (line === "/reset") {
        await negocioScoped(NEGOCIO_ID).updateConversacion(conv.id, { context: {} });
        console.log("   (historial reseteado)\n");
        continue;
      }
      // Re-fetch para leer el context persistido por el turno anterior.
      const fresh = await findOrCreateConversacion(NEGOCIO_ID, clienteId);
      lastSteps = [];
      const reply = await responder(fresh, line, smokeDeps);
      console.log(`\n🤖 bot: ${reply}`);
      printTrace();
      console.log("");
    }
  } finally {
    rl.close();
  }
  console.log("\n=== fin del smoke ===");
}

main().catch((err) => {
  console.error("ERROR en el smoke:", err);
  process.exit(1);
});
