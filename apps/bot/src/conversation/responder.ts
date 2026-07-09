/**
 * apps/bot/src/conversation/responder.ts — el ensamblaje del agente (D-02
 * swap point). Fase 5: stub determinista. Fase 6 (este archivo): tool-loop
 * real de Vercel AI SDK v7 + Gemini, PRESERVANDO la firma posicional
 * `responder(conversacion, mensajeEntrante): Promise<string>` (06-RESEARCH.md
 * "Firma de responder", Opción 1) — el call site de `inboundWorker.ts` (plan
 * 06-05 Task 2) no cambia de forma.
 *
 * Orquestación por turno:
 *   1. Derivar `negocioId`/`clienteId` de `conversacion` y `history` de
 *      `parseConversationContext(conversacion.context)` (nunca del mensaje
 *      del cliente — D-13).
 *   2. Construir las 5 tools de los planes 06-03/06-04, cerradas sobre
 *      `negocioId`/`clienteId` ANTES de invocar al modelo (Pattern 1,
 *      D-13/BOT-11) — ninguna tool recibe esos ids como parámetro que el
 *      modelo pueda llenar.
 *   3. `generateText({ ..., stopWhen: isStepCount(6) })` — el tool-loop
 *      (Pitfall 1 de 06-AI-SPEC.md: sin `stopWhen` el loop no continúa tras
 *      el primer tool call).
 *   4. Gate D-12 (en código, Pitfall 3): el léxico de cierre viene de
 *      `closingLanguage.ts` (fuente única, nunca redeclarado acá). Si el
 *      texto del modelo suena a confirmación pero `result.steps` no tiene un
 *      `confirmarTurno`/`reagendarTurno` exitoso con `turno_id` real NI un
 *      `cancelarTurno` exitoso (CR-01 — cancelar no tiene id que alucinar),
 *      se sustituye por un mensaje seguro Y se marca `needsHuman = true`. El
 *      mensaje seguro se envía ESTE turno (es el `Promise<string>` que este
 *      turno devuelve) — `needsHuman` se persiste para que el PRÓXIMO inbound
 *      de este hilo lo salte (D-11, lo ejecuta `inboundWorker.ts`, plan
 *      06-05 Task 2), nunca para suprimir la respuesta actual.
 *   5. Persistir `{ messages: [...history, ...messagesToPersist], needsHuman }`
 *      en `conversacion.context` vía `negocioScoped(negocioId)
 *      .updateConversacion` — el único colaborador de escritura, inyectable
 *      (Pattern 3 de 06-PATTERNS.md). `messagesToPersist` es
 *      `result.response.messages` SALVO que el gate haya disparado (CR-02):
 *      en ese caso se sustituye el texto del último mensaje `assistant` por
 *      el mensaje seguro (`replaceLastAssistantText`) antes de persistir —
 *      el historial que el modelo lee el PRÓXIMO turno nunca debe afirmar una
 *      confirmación fantasma que este mismo gate acaba de bloquear.
 *
 * `generateText` se envuelve en try/catch: `NoSuchToolError`/
 * `InvalidToolInputError` se loguean distinto de un error genérico — un
 * error de tool NUNCA se narra como éxito (Section 3 Key Abstractions,
 * T-06-20).
 *
 * Fix Bug fecha (bot-no-agenda-uuid-y-fecha.md, 06-UAT.md Gaps): antes de
 * armar `system`, se fetchea `negocio.timezone` (mismo patrón que
 * `buildBotAvailabilityData.ts`/`inboundWorker.ts` — este último ya lee
 * `negocio.timezone` en cada evento entrante pero lo descartaba, nunca lo
 * propagaba hasta acá) y se resuelve `fechaHoy`/`diaSemanaHoy` vía
 * `dateContext.ts` a partir de un reloj inyectable (`deps.now`, mismo
 * patrón que `ProcessInboundWhatsappEventDeps.now` de `inboundWorker.ts`)
 * — sin esto el modelo no tenía ningún "hoy" real en contexto y usaba años
 * inventados al resolver fechas relativas.
 */
import { google } from "@ai-sdk/google";
import {
  generateText as aiGenerateText,
  InvalidToolInputError,
  isStepCount,
  NoSuchToolError,
} from "ai";
import type { LanguageModel, ToolSet } from "ai";
import { uuidLike } from "@turnosbot/availability-engine";
import type { Json, Tables } from "@turnosbot/db-types";

import { negocioScoped as realNegocioScoped } from "../db/negocioScoped.js";

import { hasClosingLanguage, hasSuccessfulCancel } from "./closingLanguage.js";
import { buildDateContext } from "./dateContext.js";
import { parseConversationContext, serializeConversationContext } from "./conversationState.js";
import { buildSystemPrompt } from "./systemPrompt.js";
import { asignarProfesionalTool } from "./tools/asignarProfesional.js";
import { buscarHorariosTool } from "./tools/buscarHorarios.js";
import { cancelarTurnoTool } from "./tools/cancelarTurno.js";
import { confirmarTurnoTool } from "./tools/confirmarTurno.js";
import { consultarNegocioTool } from "./tools/consultarNegocio.js";
import { guardarNombreClienteTool } from "./tools/guardarNombreCliente.js";
import { reagendarTurnoTool } from "./tools/reagendarTurno.js";

/** Mensaje seguro enviado ESTE turno cuando el gate D-12 dispara (Pitfall 3,
 * T-06-16) — nunca un texto de cierre sin turno_id real detrás. */
export const SAFE_FALLBACK_MESSAGE = "Dame un segundo que verifico y te confirmo 🙌";

/** Fallback si `negocio.timezone` no se pudo leer (fila no encontrada / error
 * de red) — todos los negocios de este proyecto son argentinos (CLAUDE.md:
 * "timezones argentinos"), así que degradar a Buenos Aires es más seguro que
 * dejar la fecha "hoy" sin resolver. NUNCA usarse cuando `negocio.timezone`
 * sí está disponible — ese valor real siempre tiene prioridad. */
const DEFAULT_TIMEZONE = "America/Argentina/Buenos_Aires";

/** Nombres de tool que pueden aportar un `turno_id` real al gate D-12 — las
 * únicas dos tools de escritura que crean/mueven un turno (BOT-04/BOT-10). */
const CONFIRMING_TOOL_NAMES = new Set(["confirmarTurno", "reagendarTurno"]);

/**
 * buildResponderTools(negocioId, clienteId) — cierra las tools de los
 * planes 06-03/06-04 (+ guardarNombreCliente, 06-UAT.md Gap "nombre") sobre el
 * negocio/cliente de ESTA conversación (D-13),
 * ANTES de que el modelo sea invocado. Extraído como función standalone (en
 * vez de inline en `responder`) para que el test pueda inyectar un espía en
 * `ResponderDeps.buildTools` y verificar con qué `negocioId`/`clienteId` se
 * construyeron las tools sin depender de las factories reales (DB/motor).
 */
export function buildResponderTools(negocioId: string, clienteId: string): ToolSet {
  return {
    buscarHorarios: buscarHorariosTool(negocioId),
    asignarProfesional: asignarProfesionalTool(negocioId),
    consultarNegocio: consultarNegocioTool(negocioId, clienteId),
    confirmarTurno: confirmarTurnoTool(negocioId, clienteId),
    reagendarTurno: reagendarTurnoTool(negocioId, clienteId),
    cancelarTurno: cancelarTurnoTool(negocioId, clienteId),
    guardarNombreCliente: guardarNombreClienteTool(negocioId, clienteId),
  };
}

/** Deps inyectables (Pattern 3 de 06-PATTERNS.md, mismo idioma que
 * `BookAppointmentDeps`): `generateText`/`model`/`buildTools`/`negocioScoped`
 * reales por defecto, sustituibles en tests por fakes deterministas — nunca
 * se llama a Gemini de verdad en un test. */
export interface ResponderDeps {
  generateText: typeof aiGenerateText;
  model: LanguageModel;
  buildTools: typeof buildResponderTools;
  negocioScoped: typeof realNegocioScoped;
  log: (obj: unknown, msg: string) => void;
  /** Reloj inyectable (Bug fecha) para resolver "hoy" determinísticamente en
   * tests — mismo patrón que `ProcessInboundWhatsappEventDeps.now` de
   * `inboundWorker.ts`. */
  now: () => number;
}

/** Resultado de `generateText` con los defaults reales de tipo del SDK
 * (`Awaited<ReturnType<...>>` evita tener que repetir los 3 type args de
 * `GenerateTextResult<TOOLS, RUNTIME_CONTEXT, OUTPUT>` a mano). */
export type ResponderGenerateTextResult = Awaited<ReturnType<typeof aiGenerateText>>;

const defaultDeps: ResponderDeps = {
  generateText: aiGenerateText,
  model: google("gemini-3.1-flash-lite"),
  buildTools: buildResponderTools,
  negocioScoped: realNegocioScoped,
  log: (obj, msg) => console.log(msg, obj),
  now: () => Date.now(),
};

/**
 * extractRealTurnoId(steps) — escanea `result.steps` (NUNCA solo
 * `result.text`, Pitfall 3) buscando un tool-result exitoso de
 * `confirmarTurno`/`reagendarTurno` con un `turno_id` con forma de UUID real
 * (`uuidLike`, mismo validador de forma que el resto del codebase — Pattern
 * 2). Devuelve `null` si ningún step lo tiene — el caso por defecto,
 * "confirmación fantasma", el gate D-12 debe asumir.
 */
function extractRealTurnoId(steps: ResponderGenerateTextResult["steps"]): string | null {
  for (const step of steps) {
    for (const toolResult of step.toolResults ?? []) {
      if (!CONFIRMING_TOOL_NAMES.has(toolResult.toolName)) continue;

      const output = toolResult.output as { ok?: boolean; turnoId?: string } | undefined;
      if (
        output &&
        output.ok === true &&
        typeof output.turnoId === "string" &&
        uuidLike.safeParse(output.turnoId).success
      ) {
        return output.turnoId;
      }
    }
  }
  return null;
}

/** Gap 2b (texto vacío tras tool-result, T-06-07-04): mensaje sintético de
 * continuación usado SOLO en el reintento de generateText — nunca se
 * persiste como si el cliente lo hubiera dicho (se descarta del
 * `messagesToPersist` final si el reintento produce texto). */
const EMPTY_TEXT_RETRY_NUDGE = {
  role: "user" as const,
  content:
    "Contame en un mensaje de texto el resultado que la herramienta ya te devolvió, para pasárselo al cliente.",
};

/**
 * hadToolResult(steps) — true si algún step de `result.steps` tiene al
 * menos un `toolResults` no vacío. Dispara ante CUALQUIER tool-result
 * (consulta o escritura) — el guard de empty-text (Gap 2b) reintenta en
 * ambos casos, pero el reintento SIEMPRE va con `tools: {}` (ver
 * T-06-07-04), así que un tool-result de escritura exitosa no puede
 * derivar en una segunda escritura durante el reintento.
 */
function hadToolResult(steps: ResponderGenerateTextResult["steps"]): boolean {
  return steps.some((step) => (step.toolResults?.length ?? 0) > 0);
}

/**
 * replaceLastAssistantText(messages, finalText) — CR-02: cuando el gate D-12
 * dispara, `finalText` (el mensaje seguro) es lo que se envía ESTE turno,
 * pero `result.response.messages` (crudo del AI SDK) seguía persistiéndose
 * tal cual en `conversacion.context.messages` — el propio historial que el
 * modelo lee en el PRÓXIMO turno terminaba afirmando una confirmación
 * fantasma que el gate acababa de bloquear. Reemplaza el contenido de texto
 * del ÚLTIMO mensaje `assistant` por `finalText`, preservando intactos
 * cualquier tool-call/tool-result part (esos SÍ reflejan la realidad —
 * ok:false o ninguna tool confirmante — y son contexto útil).
 */
function replaceLastAssistantText(
  messages: ResponderGenerateTextResult["response"]["messages"],
  finalText: string,
): ResponderGenerateTextResult["response"]["messages"] {
  let lastAssistantIndex = -1;
  messages.forEach((message, index) => {
    if (message.role === "assistant") lastAssistantIndex = index;
  });
  if (lastAssistantIndex === -1) return messages;

  return messages.map((message, index) => {
    if (index !== lastAssistantIndex || message.role !== "assistant") return message;

    if (typeof message.content === "string") {
      return { ...message, content: finalText };
    }

    const nonTextParts = message.content.filter((part) => part.type !== "text");
    return {
      ...message,
      content: [{ type: "text" as const, text: finalText }, ...nonTextParts],
    };
  });
}

export async function responder(conversacion: Tables<"conversacion">, mensajeEntrante: string, deps: ResponderDeps = defaultDeps): Promise<string> {
  const negocioId = conversacion.negocio_id;
  const clienteId = conversacion.cliente_id;
  const { messages: history } = parseConversationContext(conversacion.context);

  // Gap 1 (memoria multi-turno): única fuente del mensaje del cliente de
  // ESTE turno, reutilizada en la llamada a generateText Y en los 3 lugares
  // donde se persiste conversacion.context.messages (camino feliz y de
  // error) — `result.response.messages` (AI SDK v7) NUNCA incluye un echo
  // del input, así que sin este objeto el mensaje del cliente se perdía y
  // el modelo nunca veía turnos previos del cliente (.planning/debug/
  // responder-history-drops-user-messages.md).
  const userMessage = { role: "user" as const, content: mensajeEntrante };

  const tools = deps.buildTools(negocioId, clienteId);

  // Bug fecha: resolver "hoy" en la timezone REAL del negocio (nunca UTC-naive
  // ni un default duro cuando el dato existe) — mismo accessor negocio-scoped
  // que buildBotAvailabilityData.ts usa, buscando la fila cuyo `id` matchea
  // exactamente (un negocioScoped().negocio() puede devolver más de una fila
  // para un tenant multi-location, ver negocioScoped.ts).
  const { data: negocioRows } = await deps.negocioScoped(negocioId).negocio();
  const negocio = negocioRows?.find((row) => row.id === negocioId);
  const timezone = negocio?.timezone ?? DEFAULT_TIMEZONE;
  const { fechaHoy, diaSemanaHoy } = buildDateContext(deps.now(), timezone);

  // Gap "nombre" (06-UAT.md): el system prompt necesita saber si YA tenemos el
  // nombre de este cliente para decidir si pedírselo (findOrCreateCliente crea
  // la fila con nombre:null). Se lee acá — misma capa negocio-scoped — y se
  // pasa a buildSystemPrompt; si no se pudo leer, se trata como "sin nombre"
  // (peor caso: el bot lo vuelve a pedir, nunca inventa uno).
  const { data: clienteRow } = await deps
    .negocioScoped(negocioId)
    .clientes()
    .eq("id", clienteId)
    .maybeSingle();
  const clienteNombre = clienteRow?.nombre ?? null;

  let result: ResponderGenerateTextResult;
  try {
    result = await deps.generateText({
      model: deps.model,
      system: buildSystemPrompt(fechaHoy, diaSemanaHoy, timezone, clienteNombre),
      messages: [...history, userMessage],
      stopWhen: isStepCount(6),
      temperature: 0.3,
      maxOutputTokens: 512,
      maxRetries: 3,
      tools,
    });
  } catch (err) {
    // T-06-20: un error de tool NUNCA se narra como éxito — se loguea
    // distinto según sea un error de tool-call conocido o uno genérico, y se
    // deriva a humano (no se intenta improvisar una respuesta).
    if (NoSuchToolError.isInstance(err)) {
      deps.log(
        { negocioId, conversacionId: conversacion.id, err },
        "NoSuchToolError en generateText — el modelo llamó una tool inexistente",
      );
    } else if (InvalidToolInputError.isInstance(err)) {
      deps.log(
        { negocioId, conversacionId: conversacion.id, err },
        "InvalidToolInputError en generateText — input de tool inválido",
      );
    } else {
      deps.log({ negocioId, conversacionId: conversacion.id, err }, "Error inesperado en generateText");
    }

    // Gap 1: el mensaje que disparó el error también sobrevive en el
    // history — de lo contrario el propio input que causó el error se
    // pierde y el próximo turno el modelo no sabe qué se le pidió.
    const newContext = serializeConversationContext({ messages: [...history, userMessage], needsHuman: true });
    const { error: persistError } = await deps
      .negocioScoped(negocioId)
      .updateConversacion(conversacion.id, { context: newContext as unknown as Json });
    if (persistError) {
      deps.log(
        { negocioId, conversacionId: conversacion.id, persistError },
        "No se pudo persistir needsHuman tras un error de generateText",
      );
    }

    return SAFE_FALLBACK_MESSAGE;
  }

  const turnoIdReal = extractRealTurnoId(result.steps);
  const closingLanguageDetected = hasClosingLanguage(result.text);
  // CR-01: cancelarTurno no crea/mueve un turno, así que no hay ningún
  // turno_id que pueda alucinar — su propio ok:true (sin turno_id real)
  // también legitima el lenguaje de cierre (p.ej. su propio
  // CANCELADO_OK_COPY = "Listo, cancelamos tu turno." usa "listo" del
  // léxico D-12). Sin esta allowance, toda cancelación exitosa dispararía
  // el gate como si fuera una confirmación fantasma.
  const cancelacionExitosa = hasSuccessfulCancel(result.steps);

  let finalText = result.text;
  let needsHuman = false;
  let messagesToPersist = result.response.messages;

  if (closingLanguageDetected && !turnoIdReal && !cancelacionExitosa) {
    // Gate D-12 (T-06-16): lenguaje de cierre SIN turno_id real Y SIN una
    // cancelación exitosa detrás — confirmación fantasma. Se sustituye el
    // texto por el mensaje seguro (se envía este mismo turno) y se marca
    // needsHuman para que el PRÓXIMO inbound de este hilo lo salte (D-11,
    // inboundWorker.ts).
    deps.log(
      { negocioId, conversacionId: conversacion.id, modelText: result.text },
      "Gate D-12: lenguaje de cierre detectado sin turno_id real ni cancelación exitosa en result.steps — bloqueado",
    );
    finalText = SAFE_FALLBACK_MESSAGE;
    needsHuman = true;
    // CR-02: el historial persistido (lo que el modelo lee el PRÓXIMO turno)
    // debe reflejar finalText, NUNCA el texto crudo/fantasma de result.text —
    // si no, el propio contexto del modelo termina afirmando una
    // confirmación que el gate acaba de bloquear.
    messagesToPersist = replaceLastAssistantText(result.response.messages, finalText);
  }

  if (finalText.trim() === "" && hadToolResult(result.steps)) {
    // Gap 2b (T-06-07-02/04): texto vacío tras un tool-result evade el gate
    // D-12 (`hasClosingLanguage("")` es falso), así que este camino es real
    // y alcanzable incluso tras una escritura exitosa. Reintenta UNA vez
    // priorizando narrar el dato/resultado real ya obtenido, SIEMPRE con
    // `tools: {}` — el modelo no tiene acceso a NINGUNA tool durante el
    // reintento, así que es estructuralmente imposible una segunda
    // ejecución de confirmarTurno/reagendarTurno/cancelarTurno (nada de
    // doble-booking / reagenda / cancelación duplicada contra la DB real).
    deps.log(
      { negocioId, conversacionId: conversacion.id },
      "Guard de empty-text: result.text vacío tras un tool-result — reintentando una vez con tools:{}",
    );
    try {
      const retry = await deps.generateText({
        model: deps.model,
        system: buildSystemPrompt(fechaHoy, diaSemanaHoy, timezone, clienteNombre),
        messages: [...history, userMessage, ...result.response.messages, EMPTY_TEXT_RETRY_NUDGE],
        stopWhen: isStepCount(6),
        temperature: 0.3,
        maxOutputTokens: 512,
        maxRetries: 3,
        tools: {},
      });

      if (retry.text.trim() !== "" && hasClosingLanguage(retry.text) && !turnoIdReal && !cancelacionExitosa) {
        // CR-01 (gate D-12 en el reintento): el reintento corre con `tools:{}`,
        // así que su texto NUNCA puede tener un turno_id nuevo detrás. Se lo
        // pasa por el MISMO gate D-12 que el primer intento, evaluado contra
        // los tool-results REALES del primer intento (turnoIdReal /
        // cancelacionExitosa de result.steps): si narra lenguaje de cierre y
        // no hubo turno real ni cancelación exitosa, es confirmación fantasma
        // → se bloquea igual que en el camino principal (sin esto, el
        // reintento era un bypass del guardrail catastrófico #1).
        deps.log(
          { negocioId, conversacionId: conversacion.id, modelText: retry.text },
          "Gate D-12 (reintento): lenguaje de cierre sin turno_id real ni cancelación exitosa — bloqueado",
        );
        finalText = SAFE_FALLBACK_MESSAGE;
        needsHuman = true;
      } else if (retry.text.trim() !== "") {
        finalText = retry.text;
        // El nudge sintético NUNCA se persiste como si el cliente lo
        // hubiera dicho — solo lo generado por el modelo en ambos intentos.
        messagesToPersist = [...result.response.messages, ...retry.response.messages];
      } else {
        // CR-02: consistente con todo otro camino de SAFE_FALLBACK_MESSAGE
        // (gate D-12 y catch de generateText) — un fallback marca needsHuman
        // para que el PRÓXIMO inbound del hilo lo salte (D-11).
        finalText = SAFE_FALLBACK_MESSAGE;
        needsHuman = true;
      }
    } catch (retryErr) {
      deps.log(
        { negocioId, conversacionId: conversacion.id, err: retryErr },
        "Guard de empty-text: el reintento de generateText falló — degradando a SAFE_FALLBACK_MESSAGE",
      );
      finalText = SAFE_FALLBACK_MESSAGE;
      needsHuman = true; // CR-02: fallback → needsHuman (consistente)
    }
  } else if (finalText.trim() === "") {
    // Texto vacío SIN ningún tool-result en result.steps: no hay dato real
    // que priorizar narrar, así que se degrada directo sin reintento.
    finalText = SAFE_FALLBACK_MESSAGE;
    needsHuman = true; // CR-02: fallback → needsHuman (consistente)
  }

  const newContext = serializeConversationContext({
    // Gap 1: el userMessage queda ENTRE el history previo y lo generado por
    // el modelo esta llamada — respeta el orden cronológico real del turno.
    messages: [...history, userMessage, ...messagesToPersist],
    needsHuman,
  });

  const { error: persistError } = await deps
    .negocioScoped(negocioId)
    .updateConversacion(conversacion.id, { context: newContext as unknown as Json });
  if (persistError) {
    deps.log(
      { negocioId, conversacionId: conversacion.id, persistError },
      "No se pudo persistir el estado de la conversación tras generateText",
    );
  }

  return finalText;
}
