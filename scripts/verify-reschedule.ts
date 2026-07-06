/**
 * verify-reschedule.ts (D-14, T-04-01, 04-01-PLAN.md Task 2, verificación live
 * GATED — NO se ejecuta como parte de este plan)
 *
 * Estrategia PRIMARIA de validación de `rescheduleAppointment`: los unit
 * tests con fixtures en-memoria (`src/booking.test.ts`, `describe
 * ("rescheduleAppointment")`) — corren sin DB y ya prueban self-exclusion,
 * validation_error, 23P01->slot_taken (mockeado), insert_error y el caso
 * slot-no-disponible. ESTE script es un smoke test SECUNDARIO, opcional y
 * vivo (mismo patrón que `scripts/verify-availability-engine.ts` de la
 * Fase 3): confirma en vivo, contra `bdgufnitakelyialjoqg`, que el UPDATE de
 * `rescheduleAppointment` realmente dispara el `23P01` de la GiST EXCLUDE
 * (`turno_no_overlap`) cuando el nuevo horario choca con OTRO turno activo
 * del mismo profesional — es decir, que el constraint del DB se re-chequea
 * en UPDATE tanto como en INSERT (A1 de 04-RESEARCH.md).
 *
 * Para forzar el 23P01 real (no solo el guard de `computeSlots` en memoria)
 * el script fetchea `freshData` deliberadamente STALE: ANTES de crear el
 * turno "otro" que va a colisionar. Así `computeSlots(dataExcludingSelf)`
 * (que solo excluye el propio turno reagendado) NO ve ese turno "otro" y
 * reporta el slot como libre, dejando que `rescheduleAppointment` llegue
 * hasta el UPDATE real — que la GiST EXCLUDE de Postgres sí rechaza, porque
 * el turno "otro" YA existe en la base al momento del UPDATE. Mismo patrón
 * que el reintento con `freshData` stale de `verify-availability-engine.ts`.
 *
 * Todas las filas de prueba se limpian al final (y al inicio, para permitir
 * re-ejecuciones idempotentes tras una corrida interrumpida). Nunca toca
 * `servicio`/`horario_trabajo`/`bloqueo`/`turno` reales de `apply-seed.ts`
 * más allá de LEER el negocio/profesional/cliente ya sembrados (FKs).
 *
 * Targets ONLY bdgufnitakelyialjoqg (service_role). Requiere `.env` con
 * SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (ver `.env.example`). Run via:
 *   pnpm exec tsx scripts/verify-reschedule.ts
 *
 * NO se ejecuta en este plan (falta `.env` real en el entorno del executor,
 * igual que los checkpoints live que 03-05-PLAN.md dejó escritos y no
 * bloqueantes) — se corre manualmente cuando haya `.env`.
 */
import { createClient } from "@supabase/supabase-js";
import { rescheduleAppointment } from "@turnosbot/availability-engine";
import type { AvailabilityData } from "@turnosbot/availability-engine";
import type { Database } from "@turnosbot/db-types";

import { TENANT_A } from "./seed-fixtures.js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("FALTAN SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en .env — abortando.");
  process.exit(1);
}
// Guard de aislamiento verbatim (CLAUDE.md, regla dura) — NUNCA tocar
// ningún otro proyecto Supabase (de otro producto o cliente) que no sea
// TurnosBot.
if (!SUPABASE_URL.includes("bdgufnitakelyialjoqg")) {
  console.error(`SUPABASE_URL no apunta al proyecto TurnosBot. Abortando.`);
  process.exit(1);
}

const supabaseAdmin = createClient<Database>(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// --- FKs ya sembradas por apply-seed.ts (solo se LEEN, nunca se modifican) --
const NEGOCIO_ID = TENANT_A.negocioId;
const PROFESIONAL_ID = TENANT_A.profesionalId;
const CLIENTE_ID = TENANT_A.clienteId;

// --- Filas de prueba propias de este script (IDs claramente de test) -------
const TEST_SERVICIO_ID = "e6000000-0000-4000-8000-000000000001";
const TEST_HORARIO_ID = "e6000000-0000-4000-8000-000000000002";
const TEST_SERVICIO_DURACION_MIN = 30;
const TEST_SERVICIO_PRECIO = 6000;

/** America/Argentina/Buenos_Aires: offset fijo UTC-3, sin DST (mismo hecho
 * que ya usa scripts/verify-availability-engine.ts). */
const AR_OFFSET_HOURS = 3;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function dateStrFromUtcNoon(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

function diaSemanaFor(d: Date): number {
  return d.getUTCDay();
}

/** Próximo lunes (calendario AR) a >= hoy+2 días. */
function findTargetMonday(now: Date): Date {
  const candidate = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 2, 12, 0, 0),
  );
  const dow = diaSemanaFor(candidate);
  const diasHastaLunes = (1 - dow + 7) % 7;
  candidate.setUTCDate(candidate.getUTCDate() + diasHastaLunes);
  return candidate;
}

function arWallClockToUtcIso(dateStr: string, hhmm: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const [hh, mm] = hhmm.split(":").map(Number);
  return new Date(Date.UTC(year, month - 1, day, hh + AR_OFFSET_HOURS, mm, 0)).toISOString();
}

const now = new Date();
const targetMonday = findTargetMonday(now);
const FECHA = dateStrFromUtcNoon(targetMonday); // "YYYY-MM-DD", un lunes

async function cleanup(turnoIds: string[] = []) {
  for (const id of turnoIds) {
    await supabaseAdmin.from("turno_servicio").delete().eq("turno_id", id);
    await supabaseAdmin.from("turno").delete().eq("id", id);
  }
  // Barrido de una corrida previa interrumpida, acotado a nuestro
  // servicio/horario de prueba — nunca toca filas reales de apply-seed.ts.
  await supabaseAdmin
    .from("turno_servicio")
    .delete()
    .eq("negocio_id", NEGOCIO_ID)
    .eq("servicio_id", TEST_SERVICIO_ID);
  await supabaseAdmin.from("horario_trabajo").delete().eq("id", TEST_HORARIO_ID);
  await supabaseAdmin.from("servicio").delete().eq("id", TEST_SERVICIO_ID);
}

async function insertTurno(inicio: string, fin: string): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("turno")
    .insert({
      negocio_id: NEGOCIO_ID,
      profesional_id: PROFESIONAL_ID,
      cliente_id: CLIENTE_ID,
      inicio,
      fin,
      estado: "confirmado",
      precio_total: TEST_SERVICIO_PRECIO,
    })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(`No se pudo insertar turno de prueba: ${error?.message}`);
  }
  return data.id;
}

async function main() {
  await cleanup();

  // --- Sembrar servicio/horario de prueba (Pitfall 8: horario_trabajo está
  // vacío en la DB live) -----------------------------------------------------
  const { error: servicioErr } = await supabaseAdmin.from("servicio").insert({
    id: TEST_SERVICIO_ID,
    negocio_id: NEGOCIO_ID,
    nombre: "Corte (smoke test 04-01 reschedule)",
    descripcion: "Servicio de prueba de scripts/verify-reschedule.ts — no confirmar turnos reales sobre este id.",
    precio: TEST_SERVICIO_PRECIO,
    duracion_min: TEST_SERVICIO_DURACION_MIN,
    orden: 99,
    activo: true,
  });
  if (servicioErr) {
    console.error("FAIL: no se pudo sembrar el servicio de prueba:", servicioErr.message);
    process.exit(1);
  }

  const { error: horarioErr } = await supabaseAdmin.from("horario_trabajo").insert({
    id: TEST_HORARIO_ID,
    negocio_id: NEGOCIO_ID,
    profesional_id: PROFESIONAL_ID,
    dia_semana: 1, // lunes
    hora_inicio: "09:00:00",
    hora_fin: "13:00:00",
    activo: true,
  });
  if (horarioErr) {
    console.error("FAIL: no se pudo sembrar el horario_trabajo de prueba:", horarioErr.message);
    await cleanup();
    process.exit(1);
  }
  console.log(`OK: sembrados servicio/horario_trabajo de prueba para el lunes ${FECHA}.`);

  // --- Turno A (el que se va a reagendar): 09:00-09:30 AR --------------------
  const turnoAInicio = arWallClockToUtcIso(FECHA, "09:00");
  const turnoAFin = arWallClockToUtcIso(FECHA, "09:30");
  const turnoAId = await insertTurno(turnoAInicio, turnoAFin);
  console.log(`OK: turno A creado (${turnoAId}), 09:00-09:30 AR.`);

  // --- Fetch de freshData DELIBERADAMENTE STALE: se fetchea ANTES de crear
  // el turno B, para que `computeSlots(dataExcludingSelf)` no lo vea y deje
  // pasar el reagendado hasta el UPDATE real (que la GiST EXCLUDE sí
  // rechaza porque el turno B ya existe en la base) -----------------------
  const { data: negocioRow, error: negocioErr } = await supabaseAdmin
    .from("negocio")
    .select("*")
    .eq("id", NEGOCIO_ID)
    .single();
  if (negocioErr || !negocioRow) {
    console.error("FAIL: no se pudo leer el negocio de prueba:", negocioErr?.message);
    await cleanup([turnoAId]);
    process.exit(1);
  }

  const [{ data: horarios }, { data: bloqueos }, { data: turnos }, { data: servicios }] = await Promise.all([
    supabaseAdmin.from("horario_trabajo").select("*").eq("negocio_id", NEGOCIO_ID),
    supabaseAdmin.from("bloqueo").select("*").eq("negocio_id", NEGOCIO_ID),
    supabaseAdmin.from("turno").select("*").eq("negocio_id", NEGOCIO_ID),
    supabaseAdmin.from("servicio").select("*").eq("negocio_id", NEGOCIO_ID),
  ]);

  const staleFreshData: AvailabilityData = {
    horarios: horarios ?? [],
    bloqueos: bloqueos ?? [],
    turnos: turnos ?? [], // incluye turno A, NO incluye turno B (todavía no existe)
    servicios: servicios ?? [],
    negocio: negocioRow,
  };

  // --- Turno B (el que va a colisionar): 10:00-10:30 AR, creado DESPUÉS del
  // fetch de arriba — freshData queda stale respecto de este turno --------
  const turnoBInicio = arWallClockToUtcIso(FECHA, "10:00");
  const turnoBFin = arWallClockToUtcIso(FECHA, "10:30");
  const turnoBId = await insertTurno(turnoBInicio, turnoBFin);
  console.log(`OK: turno B creado (${turnoBId}), 10:00-10:30 AR (después del fetch — freshData queda stale).`);

  // --- Reagendar turno A a 10:00-10:30 (choca con turno B) con la freshData
  // stale: computeSlots(dataExcludingSelf) NO ve a turno B y reporta el slot
  // como libre, dejando pasar el UPDATE real hasta la GiST EXCLUDE --------
  const result = await rescheduleAppointment(
    {
      negocioId: NEGOCIO_ID,
      turnoId: turnoAId,
      profesionalId: PROFESIONAL_ID,
      serviceIds: [TEST_SERVICIO_ID],
      inicio: turnoBInicio,
      fin: turnoBFin,
    },
    { supabase: supabaseAdmin, freshData: staleFreshData },
  );

  if (result.ok || result.reason !== "slot_taken") {
    console.error(
      `FAIL: reagendar turno A al horario de turno B debería chocar con la GiST EXCLUDE (23P01) y devolver reason="slot_taken", se obtuvo: ${JSON.stringify(result)}`,
    );
    await cleanup([turnoAId, turnoBId]);
    process.exit(1);
  }
  console.log(
    "OK: el UPDATE de rescheduleAppointment disparó la GiST EXCLUDE real (23P01) y fue traducido a slot_taken (A1, T-04-01).",
  );

  // --- Confirmar que turno A NO fue movido (el UPDATE fallido no debe haber
  // dejado el turno en un estado a medio actualizar) -----------------------
  const { data: turnoATrasIntento, error: turnoAReadErr } = await supabaseAdmin
    .from("turno")
    .select("inicio, fin")
    .eq("id", turnoAId)
    .single();
  if (turnoAReadErr || !turnoATrasIntento) {
    console.error("FAIL: no se pudo releer turno A tras el intento de reagendado:", turnoAReadErr?.message);
    await cleanup([turnoAId, turnoBId]);
    process.exit(1);
  }
  if (turnoATrasIntento.inicio !== turnoAInicio || turnoATrasIntento.fin !== turnoAFin) {
    console.error(
      `FAIL: turno A cambió de horario pese a que el UPDATE debía fallar. Esperado ${turnoAInicio}-${turnoAFin}, obtenido ${turnoATrasIntento.inicio}-${turnoATrasIntento.fin}.`,
    );
    await cleanup([turnoAId, turnoBId]);
    process.exit(1);
  }
  console.log("OK: turno A conservó su horario original — el UPDATE rechazado no dejó un estado inconsistente.");

  await cleanup([turnoAId, turnoBId]);

  console.log("\nverify-reschedule.ts: PASSED");
}

main().catch(async (err) => {
  console.error("ERROR inesperado en verify-reschedule.ts:", err);
  await cleanup();
  process.exit(1);
});
