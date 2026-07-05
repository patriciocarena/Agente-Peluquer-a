/**
 * src/booking.ts — bookAppointment: el único camino de escritura del motor de
 * disponibilidad (AVAIL-03, AVAIL-04, T-03-11..T-03-15).
 *
 * AVAIL-03 (congelado de snapshots): al agendar se congelan
 * nombre/precio/duración de cada servicio en `turno_servicio.{nombre,precio,
 * duracion}_snapshot`, y `turno.precio_total` se calcula sumando esos
 * snapshots en la MISMA transacción. Un cambio posterior a `servicio.precio`
 * NUNCA debe reescribir el total de un turno ya agendado (Pitfall 3,
 * T-03-11) — por eso `sumPrecioTotal` opera solo sobre los snapshots ya
 * congelados, jamás sobre un join vivo a `servicio`.
 *
 * Anti-patrón respetado (03-RESEARCH.md "never cache computed availability",
 * T-03-13): `bookAppointment` re-valida el slot pedido contra
 * `computeSlots(freshData)` inmediatamente antes de insertar — nunca confía
 * en un slot calculado en un turno de conversación previo.
 *
 * Manejo de concurrencia (CORE-05, T-03-12): la GiST EXCLUDE del DB
 * (`turno_no_overlap`, ya viva) es la última línea de defensa anti-doble-
 * reserva. Si el insert de `turno` dispara el SQLSTATE `23P01`
 * (exclusion_violation), se devuelve `{ok:false, reason:"slot_taken"}` en vez
 * de lanzar un 500 — y NUNCA se reintenta ciegamente el mismo insert (eso solo
 * reproduciría la falla o, peor, reservaría un slot distinto sin que el
 * usuario lo haya confirmado).
 *
 * Límite puro/impuro explícito (03-RESEARCH.md Open Question 2): las
 * funciones `buildTurnoServicioSnapshots`/`sumPrecioTotal`/
 * `isSlotTakenConcurrently` son PURAS (sin I/O) y se testean con fixtures en
 * `booking.test.ts`. Solo `bookAppointment` toca la DB, y lo hace recibiendo
 * el cliente Supabase INYECTADO vía `deps.supabase` — este módulo no importa
 * `@supabase/supabase-js` como dependencia runtime (solo type-only, ver
 * imports abajo), preservando la pureza por defecto del paquete (AVAIL-04) y
 * su testabilidad sin una DB live.
 *
 * Gap de atomicidad documentado (T-03-11, decisión de 03-05-PLAN.md): no hay
 * una RPC/función de Postgres que envuelva `turno` + `turno_servicio` en una
 * única transacción de base de datos disponible en este momento del proyecto
 * (ninguna migración de fase previa la crea). Por eso este módulo inserta
 * `turno` y luego `turno_servicio` en dos llamadas separadas y, si la segunda
 * falla, hace un DELETE compensatorio best-effort del `turno` recién creado
 * para no dejar un turno huérfano sin sus filas de servicio. Este gap es
 * aceptado explícitamente por el plan de esta fase (03-05-PLAN.md, Feature 1
 * <action>) — cerrarlo con una RPC transaccional real queda fuera de alcance
 * de AVAIL-03/04 y debería evaluarse en una fase posterior si la ventana de
 * inconsistencia demuestra ser un problema en producción.
 */
import { TZDate } from "@date-fns/tz";
import { z } from "zod";

import { computeSlots } from "./computeSlots.js";
import type {
  AvailabilityData,
  BookAppointmentInput,
  ComputeSlotsInput,
  ServicioRow,
} from "./types.js";
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@turnosbot/db-types";

// ---------------------------------------------------------------------------
// Validación de input (V5 Input Validation, T-03-15) — corta input LLM-driven
// manipulable (BOT-11, Fase 6) con un error claro en el límite del paquete.
// ---------------------------------------------------------------------------

export const bookAppointmentInputSchema = z.object({
  negocioId: z.uuid(),
  profesionalId: z.uuid(),
  clienteId: z.uuid(),
  serviceIds: z.array(z.uuid()).min(1, "serviceIds no puede estar vacío"),
  inicio: z.iso.datetime(),
  fin: z.iso.datetime(),
}) satisfies z.ZodType<BookAppointmentInput, unknown>;

// ---------------------------------------------------------------------------
// Snapshots congelados (AVAIL-03, Pitfall 3) — funciones PURAS.
// ---------------------------------------------------------------------------

/** Fila `turno_servicio` con el nombre/precio/duración del servicio congelados
 * al momento de agendar. Nunca se re-deriva de `servicio` después de creada. */
export interface TurnoServicioSnapshot {
  servicio_id: string;
  nombre_snapshot: string;
  precio_snapshot: number;
  duracion_snapshot: number;
}

/**
 * buildTurnoServicioSnapshots(serviceIds, servicios) — por cada `serviceId`,
 * congela nombre/precio/duración DESDE la fila de `servicio` provista (NUNCA
 * un join vivo, Pitfall 3). Preserva el orden de `serviceIds`.
 *
 * Lanza si algún `serviceId` no matchea ninguna fila de `servicios` — un
 * booking no puede congelar un snapshot de un servicio que no existe/no fue
 * fetcheado (bug guard, Rule 2: missing input validation sería un turno con
 * `precio_total` incorrecto silencioso).
 */
export function buildTurnoServicioSnapshots(
  serviceIds: string[],
  servicios: ServicioRow[],
): TurnoServicioSnapshot[] {
  return serviceIds.map((servicioId) => {
    const servicio = servicios.find((s) => s.id === servicioId);
    if (!servicio) {
      throw new Error(
        `buildTurnoServicioSnapshots: servicio con id="${servicioId}" no encontrado entre las filas provistas — no se puede congelar snapshot (AVAIL-03).`,
      );
    }
    return {
      servicio_id: servicio.id,
      nombre_snapshot: servicio.nombre,
      precio_snapshot: servicio.precio,
      duracion_snapshot: servicio.duracion_min,
    };
  });
}

/**
 * sumPrecioTotal(snapshots) — `turno.precio_total` = suma de los
 * `precio_snapshot` YA CONGELADOS. Nunca re-deriva de `servicio.precio`
 * "actual" (Pitfall 3): un cambio posterior de precio no debe alterar el
 * total de un turno ya agendado.
 */
export function sumPrecioTotal(snapshots: TurnoServicioSnapshot[]): number {
  return snapshots.reduce((sum, snapshot) => sum + snapshot.precio_snapshot, 0);
}

// ---------------------------------------------------------------------------
// Manejo de concurrencia (CORE-05, T-03-12) — función PURA.
// ---------------------------------------------------------------------------

/** SQLSTATE de `exclusion_violation` — la GiST EXCLUDE (`turno_no_overlap`)
 * dispara este código cuando dos turnos activos se solapan para el mismo
 * profesional (fuente: Postgres docs, cross-referenciado en 03-RESEARCH.md). */
const EXCLUSION_VIOLATION = "23P01";

/**
 * isSlotTakenConcurrently(error) — true si el error del insert de `turno` es
 * el `23P01` de la constraint GiST (slot tomado concurrentemente por otro
 * booking), false para cualquier otro código o `null`. El caller (bot tool /
 * dashboard action) branchea sobre esto para decidir UX (re-ofrecer slots)
 * en vez de recibir/mostrar un 500 crudo.
 */
export function isSlotTakenConcurrently(error: PostgrestError | null | undefined): boolean {
  return error?.code === EXCLUSION_VIOLATION;
}

// ---------------------------------------------------------------------------
// bookAppointment — la única función IMPURA de este módulo.
// ---------------------------------------------------------------------------

/** Dependencias inyectadas de `bookAppointment` (Open Question 2): el cliente
 * Supabase y las filas ya-fetcheadas necesarias para la re-validación de
 * freshness pre-insert. `now` es inyectable para tests determinísticos
 * (mismo patrón que el 3er parámetro de `computeSlots`). */
export interface BookAppointmentDeps {
  /** Cliente Supabase (service_role en el bot, RLS-scoped en el dashboard) —
   * inyectado por el caller; este módulo nunca crea/sostiene un cliente propio. */
  supabase: SupabaseClient<Database>;
  /** Filas ya-fetcheadas y scopeadas al `negocioId` del input, usadas para la
   * re-validación de freshness contra `computeSlots` (anti-cache, T-03-13). */
  freshData: AvailabilityData;
  /** Reloj inyectable (por defecto `Date.now()`), consistente con `computeSlots`. */
  now?: number;
}

export type BookAppointmentResult =
  | { ok: true; turnoId: string; precioTotal: number }
  | { ok: false; reason: "validation_error"; issues: string[] }
  | { ok: false; reason: "slot_taken" }
  | { ok: false; reason: "insert_error"; message: string };

/** Epoch ms de un ISO timestamp → "YYYY-MM-DD" en la zona del negocio (nunca
 * UTC-naive, Pitfall 2) — usado para derivar el `date` que espera
 * `ComputeSlotsInput` a partir de `input.inicio`. */
function isoDateInZone(isoTimestamp: string, timezone: string): string {
  const zoned = new TZDate(new Date(isoTimestamp).getTime(), timezone);
  const year = zoned.getFullYear();
  const month = String(zoned.getMonth() + 1).padStart(2, "0");
  const day = String(zoned.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Epoch ms → "HH:mm" en la zona del negocio. Espeja el helper privado de
 * `computeSlots.ts` (no exportado desde ahí) para poder comparar el slot
 * pedido contra los `AvailableSlot.start` que devuelve `computeSlots`. */
function formatHHmmInZone(epochMs: number, timezone: string): string {
  const zoned = new TZDate(epochMs, timezone);
  const horas = String(zoned.getHours()).padStart(2, "0");
  const minutos = String(zoned.getMinutes()).padStart(2, "0");
  return `${horas}:${minutos}`;
}

/**
 * bookAppointment(rawInput, deps) — inserta atómicamente (dentro del gap de
 * atomicidad documentado arriba) el `turno` + sus `turno_servicio` con
 * snapshots congelados, tras:
 *   1. Validar `rawInput` con zod (V5).
 *   2. Re-validar el slot pedido contra `computeSlots(deps.freshData)`
 *      inmediatamente antes de insertar (anti-cache, T-03-13).
 *   3. Congelar snapshots (`buildTurnoServicioSnapshots`) y sumar
 *      `precio_total` (`sumPrecioTotal`) — Pitfall 3.
 *   4. Insertar `turno`; si `23P01`, devolver `{ok:false, reason:"slot_taken"}`
 *      sin lanzar ni reintentar ciegamente (CORE-05, T-03-12).
 *   5. Insertar `turno_servicio`; si falla, compensar con un DELETE del
 *      `turno` recién creado (gap de atomicidad documentado).
 */
export async function bookAppointment(
  rawInput: BookAppointmentInput,
  deps: BookAppointmentDeps,
): Promise<BookAppointmentResult> {
  const parsed = bookAppointmentInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      reason: "validation_error",
      issues: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
    };
  }
  const input = parsed.data;
  const { supabase, freshData, now = Date.now() } = deps;

  // --- Re-validación de freshness (anti-cache, T-03-13) ---------------------
  const date = isoDateInZone(input.inicio, freshData.negocio.timezone);
  const computeInput: ComputeSlotsInput = {
    negocioId: input.negocioId,
    serviceIds: input.serviceIds,
    professionalId: input.profesionalId,
    date,
  };
  const freshSlots = await computeSlots(computeInput, freshData, now);
  const requestedStart = formatHHmmInZone(new Date(input.inicio).getTime(), freshData.negocio.timezone);
  const stillAvailable = freshSlots.some(
    (slot) => slot.start === requestedStart && slot.professionalId === input.profesionalId,
  );
  if (!stillAvailable) {
    return { ok: false, reason: "slot_taken" };
  }

  // --- Snapshots congelados + precio_total (Pitfall 3) -----------------------
  const snapshots = buildTurnoServicioSnapshots(input.serviceIds, freshData.servicios);
  const precioTotal = sumPrecioTotal(snapshots);

  // --- Insert de turno (columna negocio_id, no la vieja columna pre-migración 0003) -------
  const { data: turnoRow, error: turnoError } = await supabase
    .from("turno")
    .insert({
      negocio_id: input.negocioId,
      profesional_id: input.profesionalId,
      cliente_id: input.clienteId,
      inicio: input.inicio,
      fin: input.fin,
      estado: "pendiente",
      precio_total: precioTotal,
    })
    .select("id")
    .single();

  if (turnoError) {
    if (isSlotTakenConcurrently(turnoError)) {
      return { ok: false, reason: "slot_taken" };
    }
    return { ok: false, reason: "insert_error", message: turnoError.message };
  }

  const turnoId = turnoRow.id;

  // --- Insert de turno_servicio (snapshots) ----------------------------------
  const { error: snapshotsError } = await supabase.from("turno_servicio").insert(
    snapshots.map((snapshot) => ({
      turno_id: turnoId,
      negocio_id: input.negocioId,
      servicio_id: snapshot.servicio_id,
      nombre_snapshot: snapshot.nombre_snapshot,
      precio_snapshot: snapshot.precio_snapshot,
      duracion_snapshot: snapshot.duracion_snapshot,
    })),
  );

  if (snapshotsError) {
    // Gap de atomicidad documentado arriba: compensar best-effort para no
    // dejar un `turno` huérfano sin sus filas `turno_servicio`.
    await supabase.from("turno").delete().eq("id", turnoId);
    return { ok: false, reason: "insert_error", message: snapshotsError.message };
  }

  return { ok: true, turnoId, precioTotal };
}
