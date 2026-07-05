/**
 * lib/schemas/admin.ts — schemas zod del panel superadmin `/admin`
 * (SADMIN-01/02), compartidos entre los dialogs (react-hook-form +
 * zodResolver, UX client-side) y `app/actions/admin-tenants.ts`
 * (re-validación server-side, fuente de verdad — mismo patrón que
 * lib/schemas/auth.ts).
 *
 * `tenantSchema`: el Tenant (grupo) post-migración 0003 solo tiene
 * `nombre` — sin datos operativos ni WhatsApp (02-CONTEXT.md D-09..D-13,
 * 02-UI-SPEC.md CRUD pattern "único campo: nombre").
 *
 * `negocioAdminSchema`: datos generales + config WhatsApp NO-secreta
 * (whatsapp_phone_number_id, waba_id, display_phone_number). NUNCA incluye
 * un campo de token — la carga/encriptación del token de acceso queda
 * diferida a Fase 7/SEC-01 (D-04). `.strict()` hace que cualquier campo no
 * declarado (p. ej. un intento de mandar `whatsapp_token`) falle la
 * validación en vez de ser ignorado silenciosamente — belt-and-suspenders
 * contra T-02-24 (se escribe un token real en plano).
 *
 * `createTenantWithNegocioSchema`: input combinado del alta atómica
 * Tenant+owner+primer Negocio (Pattern 3, 02-RESEARCH.md) — el Tenant
 * dialog en modo "crear" necesita capturar también el owner (email/
 * password) y el primer Negocio, porque D-08/D-12 fijan 1 owner = 1
 * Tenant y la transacción compensatoria crea las tres filas en un solo
 * flujo. En modo "editar" el dialog vuelve a usar solo `tenantSchema`
 * (nombre) — ver components/admin/tenant-dialog.tsx.
 */
import { z } from "zod";

export const tenantSchema = z.object({
  nombre: z.string().min(1, "El nombre es obligatorio."),
});

export type TenantInput = z.infer<typeof tenantSchema>;

export const GRANULARIDAD_OPTIONS = [15, 30] as const;

export const negocioAdminSchema = z
  .object({
    nombre: z.string().min(1, "El nombre es obligatorio."),
    direccion: z.string().optional(),
    telefono: z.string().optional(),
    timezone: z.string().min(1, "El timezone es obligatorio."),
    granularidad_min: z.union([z.literal(15), z.literal(30)]).default(30),
    whatsapp_phone_number_id: z.string().optional(),
    waba_id: z.string().optional(),
    display_phone_number: z.string().optional(),
  })
  .strict();

export type NegocioAdminInput = z.infer<typeof negocioAdminSchema>;

/**
 * Tipo "de entrada" (pre-parseo) del form — `granularidad_min` es opcional
 * acá porque el schema le aplica `.default(30)`. react-hook-form necesita
 * este tipo (no el de salida) como `TFieldValues` del form; el de salida
 * (`NegocioAdminInput`, con `granularidad_min` ya resuelto) es el que
 * recibe el submit handler — ver components/admin/negocio-dialog.tsx /
 * tenant-dialog.tsx (`useForm<FormValues, any, OutputValues>`).
 */
export type NegocioAdminFormValues = z.input<typeof negocioAdminSchema>;

export const createTenantWithNegocioSchema = z.object({
  tenantNombre: z.string().min(1, "El nombre del grupo es obligatorio."),
  ownerEmail: z.email("Ingresá un email válido para el dueño."),
  ownerPassword: z
    .string()
    .min(8, "La contraseña del dueño debe tener al menos 8 caracteres."),
  negocio: negocioAdminSchema,
});

export type CreateTenantWithNegocioInput = z.infer<
  typeof createTenantWithNegocioSchema
>;

/** Ver NegocioAdminFormValues — mismo motivo (negocio.granularidad_min). */
export type CreateTenantWithNegocioFormValues = z.input<
  typeof createTenantWithNegocioSchema
>;
