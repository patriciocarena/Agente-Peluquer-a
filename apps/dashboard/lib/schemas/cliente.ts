/**
 * lib/schemas/cliente.ts — schemas zod para el flujo "buscar/crear cliente al
 * vuelo" (D-09, `turno-form-dialog.tsx`, Plan 03/04 de esta fase).
 *
 * El teléfono se normaliza con `.trim()` antes de guardar/buscar
 * (04-UI-SPEC.md Formatting) — nunca se guarda ni se busca con espacios al
 * inicio/fin. `clienteInlineSchema` valida el alta inline de un cliente
 * nuevo (nombre es opcional, D-09); `clienteBusquedaSchema` valida el input
 * del buscador por teléfono (umbral más bajo — se busca con menos dígitos de
 * los que requiere un teléfono completo, para permitir búsqueda incremental).
 */
import { z } from "zod";

export const clienteInlineSchema = z.object({
  telefono: z.string().trim().min(6, "Teléfono inválido.").max(30),
  nombre: z.string().trim().max(120).optional(),
});

export type ClienteInlineInput = z.infer<typeof clienteInlineSchema>;

export const clienteBusquedaSchema = z.object({
  telefono: z.string().trim().min(3, "Ingresá al menos 3 dígitos."),
});

export type ClienteBusquedaInput = z.infer<typeof clienteBusquedaSchema>;
