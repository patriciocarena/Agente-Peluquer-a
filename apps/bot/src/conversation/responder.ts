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
import { parseConversationContext, serializeConversationContext } from "./conversationState.js";
import { buildSystemPrompt } from "./systemPrompt.js";
import { asignarProfesionalTool } from "./tools/asignarProfesional.js";
import { buscarHorariosTool } from "./tools/buscarHorarios.js";
import { cancelarTurnoTool } from "./tools/cancelarTurno.js";
import { confirmarTurnoTool } from "./tools/confirmarTurno.js";
import { consultarNegocioTool } from "./tools/consultarNegocio.js";
import { reagendarTurnoTool } from "./tools/reagendarTurno.js";

/** Mensaje seguro enviado ESTE turno cuando el gate D-12 dispara (Pitfall 3,
 * T-06-16) — nunca un texto de cierre sin turno_id real detrás. */
export const SAFE_FALLBACK_MESSAGE = "Dame un segundo que verifico y te confirmo 🙌";

/** Nombres de tool que pueden aportar un `turno_id` real al gate D-12 — las
 * únicas dos tools de escritura que crean/mueven un turno (BOT-04/BOT-10). */
const CONFIRMING_TOOL_NAMES = new Set(["confirmarTurno", "reagendarTurno"]);

/**
 * buildResponderTools(negocioId, clienteId) — cierra las 5 tools de los
 * planes 06-03/06-04 sobre el negocio/cliente de ESTA conversación (D-13),
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
}

/** Resultado de `generateText` con los defaults reales de tipo del SDK
 * (`Awaited<ReturnType<...>>` evita tener que repetir los 3 type args de
 * `GenerateTextResult<TOOLS, RUNTIME_CONTEXT, OUTPUT>` a mano). */
export type ResponderGenerateTextResult = Awaited<ReturnType<typeof aiGenerateText>>;

const defaultDeps: ResponderDeps = {
  generateText: aiGenerateText,
  model: google("gemini-2.5-flash-lite"),
  buildTools: buildResponderTools,
  negocioScoped: realNegocioScoped,
  log: (obj, msg) => console.log(msg, obj),
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

  const tools = deps.buildTools(negocioId, clienteId);

  let result: ResponderGenerateTextResult;
  try {
    result = await deps.generateText({
      model: deps.model,
      system: buildSystemPrompt(),
      messages: [...history, { role: "user", content: mensajeEntrante }],
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

    const newContext = serializeConversationContext({ messages: history, needsHuman: true });
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

  const newContext = serializeConversationContext({
    messages: [...history, ...messagesToPersist],
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
