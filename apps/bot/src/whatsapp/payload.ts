/**
 * src/whatsapp/payload.ts — whatsappWebhookEventSchema: valida en el borde
 * (zod-boundary-validation, mismo criterio que
 * packages/availability-engine/src/booking.ts) la forma del body ya
 * parseado del webhook de Meta (WA-01).
 *
 * Fail closed: un payload que no matchea la forma mínima esperada (falta
 * `entry`, falta `metadata.phone_number_id`, etc.) se rechaza en el borde —
 * el caller (plan 05-06, la ruta POST) descarta el evento con un log, nunca
 * lo procesa parcialmente. Las claves desconocidas se toleran (Meta agrega
 * campos con el tiempo — GET/webhooks payload no está versionado por campo),
 * por eso el schema NO usa `.strict()`.
 *
 * `messages` es opcional a propósito: los eventos de status (delivered/read)
 * y otros `changes[].value` no siempre traen `messages[]` — esos eventos
 * deben parsear igual (el worker, plan 05-05, decide qué hacer con ellos).
 */
import { z } from "zod";

const whatsappMessageSchema = z.object({
  id: z.string(),
  from: z.string(),
  type: z.string(),
  text: z.object({ body: z.string() }).optional(),
});

export const whatsappWebhookEventSchema = z.object({
  entry: z.array(
    z.object({
      changes: z.array(
        z.object({
          value: z.object({
            metadata: z.object({ phone_number_id: z.string() }),
            messages: z.array(whatsappMessageSchema).optional(),
          }),
        }),
      ),
    }),
  ),
});

export type WhatsappWebhookEvent = z.infer<typeof whatsappWebhookEventSchema>;
export type WhatsappMessage = z.infer<typeof whatsappMessageSchema>;

/**
 * Extrae `phone_number_id` del primer entry/change (WA-02, resolución de
 * tenant, plan 05-05) leyendo defensivamente — nunca lanza sobre una forma
 * inesperada, devuelve `undefined`.
 */
export function extractPhoneNumberId(event: WhatsappWebhookEvent): string | undefined {
  return event.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id;
}

/**
 * Extrae el primer mensaje entrante, si existe (los eventos de status no
 * traen `messages[]`) — el caller (webhook route / worker) decide si ignora
 * eventos sin mensaje.
 */
export function extractFirstMessage(event: WhatsappWebhookEvent): WhatsappMessage | undefined {
  return event.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
}
