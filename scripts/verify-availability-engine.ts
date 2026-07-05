/**
 * verify-availability-engine.ts (AVAIL-01/AVAIL-03, Pitfall 8, 03-05-PLAN.md
 * Feature 3, SECUNDARIO)
 *
 * Estrategia PRIMARIA de validación de `@turnosbot/availability-engine`: los
 * unit tests con fixtures en-memoria (`src/*.test.ts`, incluyendo
 * `booking.test.ts`) — corren sin DB y ya prueban toda la lógica pura. ESTE
 * script es un smoke test SECUNDARIO, opcional y vivo: `horario_trabajo` y
 * `bloqueo` están VACÍOS en bdgufnitakelyialjoqg (Pitfall 8), así que
 * cualquier verificación contra la DB tal cual está hoy mostraría
 * "disponible todo el día" sin ejercitar la resta de intervalos. Este script
 * primero SIEMBRA un horario/bloqueo/servicio de prueba (con IDs claramente
 * de test, aislados de los datos sembrados por `apply-seed.ts`), fetchea esas
 * filas, llama `computeSlots` real y compara contra la disponibilidad
 * esperada; luego llama `bookAppointment` real y verifica:
 *
 *   1. `precio_total` insertado = suma de los `precio_snapshot` congelados
 *      (AVAIL-03) para el servicio de prueba (Pitfall 3).
 *   2. Subir `servicio.precio` DESPUÉS de agendar no altera el
 *      `precio_total` ya escrito en el turno (congelado histórico, AVAIL-03
 *      contra la DB real, no solo en memoria).
 *   3. Reintentar `bookAppointment` para el MISMO slot con la MISMA
 *      `freshData` (deliberadamente stale, sin el turno recién creado)
 *      dispara el `23P01` de la GiST EXCLUDE y `bookAppointment` lo traduce
 *      a `{ok:false, reason:"slot_taken"}` en vez de lanzar (CORE-05,
 *      T-03-12) — probado en vivo, no solo con un mock de error.
 *
 * Todas las filas de prueba se limpian al final (y al inicio, para permitir
 * re-ejecuciones idempotentes tras una corrida interrumpida). Nunca toca
 * `servicio`/`horario_trabajo`/`bloqueo`/`turno` reales de `apply-seed.ts`
 * más allá de LEER el negocio/profesional/cliente ya sembrados (FKs).
 *
 * Targets ONLY bdgufnitakelyialjoqg (service_role). Requiere `.env` con
 * SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (ver `.env.example`). Run via:
 *   pnpm exec tsx scripts/verify-availability-engine.ts
 */
import { createClient } from "@supabase/supabase-js";
import { bookAppointment, computeSlots } from "@turnosbot/availability-engine";
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
const TEST_SERVICIO_ID = "e5000000-0000-4000-8000-000000000001";
const TEST_HORARIO_ID = "e5000000-0000-4000-8000-000000000002";
const TEST_BLOQUEO_ID = "e5000000-0000-4000-8000-000000000003";
const TEST_SERVICIO_PRECIO_ORIGINAL = 6000;
const TEST_SERVICIO_PRECIO_ACTUALIZADO = 8000; // simula una subida de precio POSTERIOR al booking
const TEST_SERVICIO_DURACION_MIN = 30;

/** America/Argentina/Buenos_Aires: offset fijo UTC-3, sin DST (Pitfall 4,
 * mismo hecho que ya usa scripts/verify-timezone.ts) — construir timestamps
 * absolutos sumando 3h al horario de pared AR es seguro para este proyecto. */
const AR_OFFSET_HOURS = 3;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** "YYYY-MM-DD" a partir de una fecha construida siempre al mediodía UTC — el
 * mediodía UTC nunca cruza el borde de medianoche AR (offset de solo 3h), así
 * que el calendario UTC y el calendario AR coinciden sin ambigüedad. */
function dateStrFromUtcNoon(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/** 0=domingo..6=sábado — mismo dia_semana que usa el motor (computeSlots.ts). */
function diaSemanaFor(d: Date): number {
  return d.getUTCDay();
}

/** Próximo lunes (calendario AR) a >= hoy+2 días — despeja con margen el lead
 * de 60 min (D-04) y queda cómodo dentro de la ventana de 30 días (D-05). */
function findTargetMonday(now: Date): Date {
  const candidate = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 2, 12, 0, 0),
  );
  const dow = diaSemanaFor(candidate);
  const diasHastaLunes = (1 - dow + 7) % 7;
  candidate.setUTCDate(candidate.getUTCDate() + diasHastaLunes);
  return candidate;
}

/** "HH:mm" hora de pared AR, en la fecha `dateStr`, → ISO timestamptz UTC. */
function arWallClockToUtcIso(dateStr: string, hhmm: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const [hh, mm] = hhmm.split(":").map(Number);
  return new Date(Date.UTC(year, month - 1, day, hh + AR_OFFSET_HOURS, mm, 0)).toISOString();
}

const now = new Date();
const targetMonday = findTargetMonday(now);
const FECHA = dateStrFromUtcNoon(targetMonday); // "YYYY-MM-DD", un lunes (dia_semana=1)

async function cleanup(turnoId?: string) {
  if (turnoId) {
    await supabaseAdmin.from("turno_servicio").delete().eq("turno_id", turnoId);
    await supabaseAdmin.from("turno").delete().eq("id", turnoId);
  }
  // Barrido de una corrida previa interrumpida en la MISMA fecha objetivo —
  // acotado a nuestro profesional de prueba + servicio de prueba, nunca toca
  // turnos reales de otros clientes/servicios.
  await supabaseAdmin
    .from("turno_servicio")
    .delete()
    .eq("negocio_id", NEGOCIO_ID)
    .eq("servicio_id", TEST_SERVICIO_ID);
  await supabaseAdmin.from("bloqueo").delete().eq("id", TEST_BLOQUEO_ID);
  await supabaseAdmin.from("horario_trabajo").delete().eq("id", TEST_HORARIO_ID);
  await supabaseAdmin.from("servicio").delete().eq("id", TEST_SERVICIO_ID);
}

async function main() {
  await cleanup();

  // --- Sembrar servicio/horario/bloqueo de prueba (Pitfall 8: horario_trabajo
  // y bloqueo están vacíos en la DB live) ------------------------------------
  const { error: servicioErr } = await supabaseAdmin.from("servicio").insert({
    id: TEST_SERVICIO_ID,
    negocio_id: NEGOCIO_ID,
    nombre: "Corte (smoke test 03-05)",
    descripcion: "Servicio de prueba de scripts/verify-availability-engine.ts — no confirmar turnos reales sobre este id.",
    precio: TEST_SERVICIO_PRECIO_ORIGINAL,
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

  const bloqueoInicio = arWallClockToUtcIso(FECHA, "10:00");
  const bloqueoFin = arWallClockToUtcIso(FECHA, "10:30");
  const { error: bloqueoErr } = await supabaseAdmin.from("bloqueo").insert({
    id: TEST_BLOQUEO_ID,
    negocio_id: NEGOCIO_ID,
    profesional_id: PROFESIONAL_ID,
    inicio: bloqueoInicio,
    fin: bloqueoFin,
    motivo: "smoke test 03-05",
  });
  if (bloqueoErr) {
    console.error("FAIL: no se pudo sembrar el bloqueo de prueba:", bloqueoErr.message);
    await cleanup();
    process.exit(1);
  }
  console.log(`OK: sembrados servicio/horario_trabajo/bloqueo de prueba para el lunes ${FECHA}.`);

  // --- Fetch (negocio-scoped) + computeSlots real ---------------------------
  const { data: negocioRow, error: negocioErr } = await supabaseAdmin
    .from("negocio")
    .select("*")
    .eq("id", NEGOCIO_ID)
    .single();
  if (negocioErr || !negocioRow) {
    console.error("FAIL: no se pudo leer el negocio de prueba:", negocioErr?.message);
    await cleanup();
    process.exit(1);
  }

  const [{ data: horarios }, { data: bloqueos }, { data: turnos }, { data: servicios }] = await Promise.all([
    supabaseAdmin.from("horario_trabajo").select("*").eq("negocio_id", NEGOCIO_ID),
    supabaseAdmin.from("bloqueo").select("*").eq("negocio_id", NEGOCIO_ID),
    supabaseAdmin.from("turno").select("*").eq("negocio_id", NEGOCIO_ID),
    supabaseAdmin.from("servicio").select("*").eq("negocio_id", NEGOCIO_ID),
  ]);

  const freshData: AvailabilityData = {
    horarios: horarios ?? [],
    bloqueos: bloqueos ?? [],
    turnos: turnos ?? [],
    servicios: servicios ?? [],
    negocio: negocioRow,
  };

  const slots = await computeSlots(
    { negocioId: NEGOCIO_ID, serviceIds: [TEST_SERVICIO_ID], professionalId: PROFESIONAL_ID, date: FECHA },
    freshData,
  );
  const starts = slots.map((s) => s.start);

  if (!starts.includes("09:00")) {
    console.error(`FAIL: se esperaba el slot 09:00 disponible (horario 09:00-13:00, sin bloqueo ahí), se obtuvo: ${starts.join(", ")}`);
    await cleanup();
    process.exit(1);
  }
  if (starts.includes("10:00")) {
    console.error(`FAIL: el slot 10:00 NO debería ofrecerse (bloqueo 10:00-10:30), se obtuvo: ${starts.join(", ")}`);
    await cleanup();
    process.exit(1);
  }
  console.log(`OK: computeSlots real resta el bloqueo correctamente — slots: ${starts.join(", ")}`);

  // --- bookAppointment real: round-trip + snapshots congelados (AVAIL-03) ---
  const inicio = arWallClockToUtcIso(FECHA, "09:00");
  const fin = arWallClockToUtcIso(FECHA, "09:30");

  const bookInput = {
    negocioId: NEGOCIO_ID,
    profesionalId: PROFESIONAL_ID,
    clienteId: CLIENTE_ID,
    serviceIds: [TEST_SERVICIO_ID],
    inicio,
    fin,
  };

  const result = await bookAppointment(bookInput, { supabase: supabaseAdmin, freshData });
  if (!result.ok) {
    console.error(`FAIL: bookAppointment debería agendar el slot 09:00 libre, se obtuvo: ${JSON.stringify(result)}`);
    await cleanup();
    process.exit(1);
  }
  if (result.precioTotal !== TEST_SERVICIO_PRECIO_ORIGINAL) {
    console.error(`FAIL: precio_total esperado ${TEST_SERVICIO_PRECIO_ORIGINAL}, se obtuvo ${result.precioTotal}`);
    await cleanup(result.turnoId);
    process.exit(1);
  }
  console.log(`OK: bookAppointment agendó el turno ${result.turnoId} con precio_total=${result.precioTotal}.`);

  // --- Congelado histórico (AVAIL-03) contra la DB REAL ---------------------
  const { error: precioUpdateErr } = await supabaseAdmin
    .from("servicio")
    .update({ precio: TEST_SERVICIO_PRECIO_ACTUALIZADO })
    .eq("id", TEST_SERVICIO_ID);
  if (precioUpdateErr) {
    console.error("FAIL: no se pudo simular la subida de precio posterior:", precioUpdateErr.message);
    await cleanup(result.turnoId);
    process.exit(1);
  }

  const { data: turnoTrasSubida, error: turnoReadErr } = await supabaseAdmin
    .from("turno")
    .select("precio_total")
    .eq("id", result.turnoId)
    .single();
  if (turnoReadErr || !turnoTrasSubida) {
    console.error("FAIL: no se pudo releer el turno tras la subida de precio:", turnoReadErr?.message);
    await cleanup(result.turnoId);
    process.exit(1);
  }
  if (turnoTrasSubida.precio_total !== TEST_SERVICIO_PRECIO_ORIGINAL) {
    console.error(
      `FAIL: precio_total del turno cambió tras subir servicio.precio — se esperaba que se mantuviera en ${TEST_SERVICIO_PRECIO_ORIGINAL} (congelado), se obtuvo ${turnoTrasSubida.precio_total}.`,
    );
    await cleanup(result.turnoId);
    process.exit(1);
  }

  const { data: turnoServicioRows, error: turnoServicioReadErr } = await supabaseAdmin
    .from("turno_servicio")
    .select("nombre_snapshot, precio_snapshot, duracion_snapshot")
    .eq("turno_id", result.turnoId);
  if (turnoServicioReadErr || !turnoServicioRows || turnoServicioRows.length !== 1) {
    console.error("FAIL: no se pudo releer turno_servicio del turno agendado:", turnoServicioReadErr?.message);
    await cleanup(result.turnoId);
    process.exit(1);
  }
  const snapshot = turnoServicioRows[0]!;
  if (snapshot.precio_snapshot !== TEST_SERVICIO_PRECIO_ORIGINAL || snapshot.duracion_snapshot !== TEST_SERVICIO_DURACION_MIN) {
    console.error(`FAIL: snapshot de turno_servicio inesperado: ${JSON.stringify(snapshot)}`);
    await cleanup(result.turnoId);
    process.exit(1);
  }
  console.log(
    `OK: precio_total del turno (${turnoTrasSubida.precio_total}) y turno_servicio.precio_snapshot (${snapshot.precio_snapshot}) se mantuvieron congelados pese a que servicio.precio ahora es ${TEST_SERVICIO_PRECIO_ACTUALIZADO} (AVAIL-03 en vivo).`,
  );

  // --- Concurrencia (CORE-05, T-03-12): reintentar el MISMO slot con la MISMA
  // freshData (deliberadamente stale, sin el turno recién creado) debe chocar
  // con la GiST EXCLUDE real y bookAppointment debe traducirlo a slot_taken --
  const retryResult = await bookAppointment(bookInput, { supabase: supabaseAdmin, freshData });
  if (retryResult.ok || retryResult.reason !== "slot_taken") {
    console.error(
      `FAIL: reintentar el mismo slot debería chocar con la GiST EXCLUDE (23P01) y devolver reason="slot_taken", se obtuvo: ${JSON.stringify(retryResult)}`,
    );
    await cleanup(result.turnoId);
    process.exit(1);
  }
  console.log("OK: reintentar el mismo slot con datos stale fue rechazado por la DB y traducido a slot_taken (CORE-05).");

  await cleanup(result.turnoId);

  console.log("\nverify-availability-engine.ts: PASSED");
}

main().catch(async (err) => {
  console.error("ERROR inesperado en verify-availability-engine.ts:", err);
  await cleanup();
  process.exit(1);
});
