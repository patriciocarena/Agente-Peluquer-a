/**
 * verify-concurrent-booking.ts (SEC-02, T-07-03, 07-04-PLAN.md Task 1,
 * verificación live GATED — NO se ejecuta automáticamente en CI/build)
 *
 * SEC-02 Success Criterion #2 (D-03): la constraint anti-doble-reserva
 * (GiST EXCLUDE `turno_no_overlap`, ya viva desde CORE-05/Fase 1) se sostiene
 * bajo N reservas CONCURRENTES al mismo slot, ejercitada a través de la
 * función de dominio real `bookAppointment` (nunca inserts crudos).
 *
 * `scripts/verify-double-booking.ts` (Step 5, N=8) ya probó la constraint
 * con inserts crudos vía `insertTurno`. Este script prueba que la garantía se
 * sostiene por el camino de aplicación COMPLETO: `bookAppointment`, con su
 * chequeo de frescura en memoria (`computeSlots(freshData)`) + su mapeo de
 * error `23P01` -> `{ok:false, reason:"slot_taken"}`.
 *
 * Pitfall 4 (07-RESEARCH.md): si cada llamada concurrente re-fetcheara su
 * propio `freshData`, el chequeo en memoria de `bookAppointment` cortocircuita
 * la carrera ANTES de que llegue a la GiST EXCLUDE real de Postgres -- el
 * test pasaría (o fallaría de forma errática, según el timing) sin probar
 * nada sobre la constraint del DB. Por eso este script fetchea `freshData`
 * UNA SOLA VEZ y comparte el MISMO objeto (por referencia) entre las N
 * llamadas concurrentes a `bookAppointment`, vía `Promise.allSettled`
 * (mismo patrón que `verify-reschedule.ts` usa con su `staleFreshData`).
 *
 * Assertion: EXACTAMENTE 1 `{ok:true}` y N-1 `{ok:false, reason:"slot_taken"}`
 * (nunca "al menos 1") -- el punto es que la GiST EXCLUDE rechaza a todos
 * menos uno.
 *
 * Todas las filas de prueba se limpian al final (y al inicio, para permitir
 * re-ejecuciones idempotentes tras una corrida interrumpida). Nunca toca
 * `servicio`/`horario_trabajo`/`bloqueo`/`turno` reales de `apply-seed.ts`
 * más allá de LEER el negocio/profesional/cliente ya sembrados (FKs).
 *
 * Targets ONLY bdgufnitakelyialjoqg (service_role). Requiere `.env` con
 * SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (ver `.env.example`). Run via:
 *   pnpm exec tsx scripts/verify-concurrent-booking.ts
 *
 * Independiente de la migración 0005 (Vault): `bookAppointment` no toca las
 * columnas de token de `negocio` -- este script puede correrse antes o
 * después de 07-01.
 */
import { createClient } from "@supabase/supabase-js";
import { bookAppointment } from "@turnosbot/availability-engine";
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
const TEST_SERVICIO_ID = "e7000000-0000-4000-8000-000000000001";
const TEST_HORARIO_ID = "e7000000-0000-4000-8000-000000000002";
const TEST_SERVICIO_DURACION_MIN = 30;
const TEST_SERVICIO_PRECIO = 6000;

/** N reservas concurrentes disparadas al mismo slot — parametrizable. */
const N = 10;

/** America/Argentina/Buenos_Aires: offset fijo UTC-3, sin DST (mismo hecho
 * que ya usan scripts/verify-availability-engine.ts y verify-reschedule.ts). */
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
  // También barre cualquier turno "ganador" de una corrida anterior que haya
  // quedado en el mismo slot bajo prueba (mismo negocio/profesional/horario).
  const slotInicio = arWallClockToUtcIso(FECHA, "09:00");
  const slotFin = arWallClockToUtcIso(FECHA, "09:30");
  const { data: turnosPrevios } = await supabaseAdmin
    .from("turno")
    .select("id")
    .eq("negocio_id", NEGOCIO_ID)
    .eq("profesional_id", PROFESIONAL_ID)
    .eq("inicio", slotInicio)
    .eq("fin", slotFin);
  for (const t of turnosPrevios ?? []) {
    await supabaseAdmin.from("turno_servicio").delete().eq("turno_id", t.id);
    await supabaseAdmin.from("turno").delete().eq("id", t.id);
  }
  await supabaseAdmin
    .from("turno_servicio")
    .delete()
    .eq("negocio_id", NEGOCIO_ID)
    .eq("servicio_id", TEST_SERVICIO_ID);
  await supabaseAdmin.from("horario_trabajo").delete().eq("id", TEST_HORARIO_ID);
  await supabaseAdmin.from("servicio").delete().eq("id", TEST_SERVICIO_ID);
}

async function main() {
  await cleanup();

  // --- Sembrar servicio/horario de prueba (mismo idiom que
  // verify-reschedule.ts, Pitfall 8: horario_trabajo está vacío en la DB
  // live) ---------------------------------------------------------------
  const { error: servicioErr } = await supabaseAdmin.from("servicio").insert({
    id: TEST_SERVICIO_ID,
    negocio_id: NEGOCIO_ID,
    nombre: "Corte (smoke test 07-04 concurrent-booking)",
    descripcion:
      "Servicio de prueba de scripts/verify-concurrent-booking.ts — no confirmar turnos reales sobre este id.",
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

  // --- Slot objetivo bajo prueba: 09:00-09:30 AR, el primer slot del
  // horario de prueba sembrado arriba -------------------------------------
  const slotInicio = arWallClockToUtcIso(FECHA, "09:00");
  const slotFin = arWallClockToUtcIso(FECHA, "09:30");

  // --- Fetch de freshData UNA SOLA VEZ (Pitfall 4): compartido POR
  // REFERENCIA entre las N llamadas concurrentes de más abajo. NUNCA
  // re-fetchear dentro del bucle — eso dejaría que el chequeo en memoria de
  // `bookAppointment` corte la carrera antes de llegar a la GiST EXCLUDE
  // real de Postgres, invalidando el test (07-RESEARCH.md Pitfall 4). -----
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
  console.log(
    `OK: freshData fetcheado UNA vez (${(turnos ?? []).length} turnos existentes) — se comparte por referencia entre las ${N} llamadas concurrentes.`,
  );

  // --- Disparar N llamadas concurrentes a bookAppointment con el MISMO
  // freshData por referencia (nunca re-fetchear por llamada) --------------
  const results = await Promise.allSettled(
    Array.from({ length: N }, () =>
      bookAppointment(
        {
          negocioId: NEGOCIO_ID,
          profesionalId: PROFESIONAL_ID,
          clienteId: CLIENTE_ID,
          serviceIds: [TEST_SERVICIO_ID],
          inicio: slotInicio,
          fin: slotFin,
        },
        { supabase: supabaseAdmin, freshData },
      ),
    ),
  );

  const oks = results.filter(
    (r) => r.status === "fulfilled" && r.value.ok === true,
  ) as PromiseFulfilledResult<{ ok: true; turnoId: string; precioTotal: number }>[];
  const slotTaken = results.filter(
    (r) => r.status === "fulfilled" && r.value.ok === false && r.value.reason === "slot_taken",
  );
  const rejected = results.filter((r) => r.status === "rejected");
  const otrosFulfilled = results.filter(
    (r) =>
      r.status === "fulfilled" &&
      !(r.value.ok === true) &&
      !(r.value.ok === false && r.value.reason === "slot_taken"),
  );

  // Cleanup del/los turno(s) ganador(es) ANTES de assertar — así una
  // corrida fallida no deja basura para la siguiente (idempotencia).
  const turnoIdsGanadores = oks.map((r) => r.value.turnoId);

  if (oks.length !== 1 || slotTaken.length !== N - 1) {
    console.error(
      `FAIL: se esperaba EXACTAMENTE 1 éxito y ${N - 1} slot_taken de ${N} llamadas concurrentes a bookAppointment; se obtuvieron ${oks.length} éxitos, ${slotTaken.length} slot_taken.`,
    );
    if (otrosFulfilled.length > 0) {
      console.error(
        `Reasons inesperados (ni éxito ni slot_taken): ${JSON.stringify(
          otrosFulfilled.map((r) => (r as PromiseFulfilledResult<unknown>).value),
        )}`,
      );
    }
    if (rejected.length > 0) {
      console.error(
        `Llamadas que lanzaron (rejected, no debería pasar): ${JSON.stringify(
          rejected.map((r) => String((r as PromiseRejectedResult).reason)),
        )}`,
      );
    }
    await cleanup(turnoIdsGanadores);
    process.exit(1);
  }
  console.log(
    `OK: de ${N} llamadas concurrentes a bookAppointment sobre el MISMO slot, exactamente 1 tuvo éxito y ${N - 1} devolvieron reason="slot_taken" — la GiST EXCLUDE (23P01) decidió el único ganador (SEC-02 Success Criterion #2).`,
  );

  await cleanup(turnoIdsGanadores);

  console.log("\nverify-concurrent-booking.ts: PASSED");
}

main().catch(async (err) => {
  console.error("ERROR inesperado en verify-concurrent-booking.ts:", err);
  await cleanup();
  process.exit(1);
});
