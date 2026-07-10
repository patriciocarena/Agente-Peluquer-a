/**
 * apps/bot/src/db/negocioScoped.verify.ts — functional smoke test for
 * negocioScoped(negocioId) (CORE-03) AND, since Phase 7 (SEC-03 Success
 * Criterion #3), the FORMAL cross-negocio isolation proof for the bot's
 * service_role codepath.
 *
 * The bot service runs as a single shared process for every negocio using
 * supabaseAdmin (service_role), which BYPASSES Row Level Security entirely
 * (negocioScoped.ts header, PITFALLS.md Pitfall 7). RLS therefore gives this
 * codepath NO protection — isolation lives 100% in app code
 * (negocioScoped()'s baked-in `.eq('negocio_id', negocioId)` filter). A mock
 * would only test the layer under test itself, so this is deliberately a
 * live test against the two seeded tenants' primary negocios
 * (scripts/seed-fixtures.ts TENANT_A/TENANT_B.negocioId).
 *
 * SEC-03 Success Criterion #3 (D-04, 07-RESEARCH.md Pitfall 6): this is
 * explicitly the service_role codepath test — NOT scripts/verify-isolation.ts,
 * which tests the dashboard's RLS/anon+JWT codepath. Do not extend that
 * script for this purpose; they prove two entirely different things.
 *
 * Extended from a single turnos()-only check (Phase 3) to loop over all 12
 * read accessors negocioScoped() exposes today (negocio, profesionales,
 * horariosTrabajo, servicios, profesionalServicios, clientes, turnos,
 * turnoServicios, bloqueos, conversaciones, mensajes, recordatorios), plus a
 * tool-level check on `consultarNegocioTool` (BOT-05/06/08) with negocio A's
 * context, asserting it never surfaces a negocio-B servicio id.
 *
 * `negocio()` is a special case: it has no `negocio_id` column — it filters
 * by its own primary key `.eq('id', negocioId)` (negocioScoped.ts header
 * comment) — so its rows are asserted by `row.id`, not `row.negocio_id`.
 *
 * This is a functional smoke test, run directly via `pnpm exec tsx` (no test
 * framework wired yet for apps/bot) — NOT migrated to vitest.
 *
 * Sufijo `.verify.ts` (no `.test.ts`): este archivo NO corre bajo `pnpm test`.
 * Antes se llamaba `.test.ts` y estaba en el `exclude` de vitest.config.ts —
 * parecía cubierto por CI y no lo estaba (W-01 de 07-VERIFICATION.md).
 *
 * Run via: node --env-file=.env --import tsx apps/bot/src/db/negocioScoped.verify.ts
 * (tsx does NOT auto-load .env — pass --env-file=.env explicitly, D-05/07-04).
 */
import type {
  ConsultarNegocioInput,
  ConsultarNegocioResult,
} from "../conversation/tools/consultarNegocio.js";
import { consultarNegocioTool } from "../conversation/tools/consultarNegocio.js";
import { negocioScoped } from "./negocioScoped.js";

// Seeded fixture negocio IDs (mirrors scripts/seed-fixtures.ts TENANT_A/
// TENANT_B .negocioId — apps/bot cannot import from the root-level scripts/
// folder, so the two fixed IDs are duplicated here as literal constants tied
// to supabase/seed.sql). Each belongs to a DIFFERENT tenant, so this also
// exercises cross-tenant isolation, not just cross-negocio.
const NEGOCIO_A_ID = "21111111-1111-1111-1111-111111111111";
const NEGOCIO_B_ID = "22222222-2222-2222-2222-222222222222";

// TENANT_A.clienteId literal (scripts/seed-fixtures.ts) — duplicated here for
// the same reason as NEGOCIO_A_ID/NEGOCIO_B_ID above (apps/bot cannot import
// from scripts/). Only used to construct consultarNegocioTool's closure-
// captured clienteId (D-13/D-07) below — never a model-controllable input.
const CLIENTE_A_ID = "51111111-1111-1111-1111-111111111111";

/** The 12 read accessors negocioScoped() exposes today (negocioScoped.ts,
 * lines 64-82) — write accessors (insertMensaje, updateCliente, etc.) are
 * out of scope for this isolation check. */
const READ_ACCESSORS = [
  "negocio",
  "profesionales",
  "horariosTrabajo",
  "servicios",
  "profesionalServicios",
  "clientes",
  "turnos",
  "turnoServicios",
  "bloqueos",
  "conversaciones",
  "mensajes",
  "recordatorios",
] as const;

type ReadAccessor = (typeof READ_ACCESSORS)[number];

type ScopedRow = Record<string, unknown>;

interface SelectResult {
  data: ScopedRow[] | null;
  error: { message: string } | null;
}

/**
 * Pragmatic cast: negocioScoped()'s 12 read accessors each return a
 * differently-typed PostgrestFilterBuilder (one per table), which TypeScript
 * cannot call through a single dynamic string key without a union-call
 * error. Since this script only ever reads `data`/`error` generically (never
 * a table-specific column beyond `id`/`negocio_id`, asserted below), casting
 * to one shared shape is safe and avoids 12 hand-copied branches.
 */
function accessorQuery(
  negocioId: string,
  accessor: ReadAccessor,
): { select: (columns: string) => Promise<SelectResult> } {
  const scoped = negocioScoped(negocioId) as unknown as Record<
    ReadAccessor,
    () => { select: (columns: string) => Promise<SelectResult> }
  >;
  return scoped[accessor]();
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

/**
 * Ejercita negocioScoped(negocioId)[accessor]() y asserta que CERO filas
 * pertenecen a otherNegocioId. `negocio()` se asserta por `row.id` (su PK,
 * no tiene columna negocio_id — ver negocioScoped.ts); el resto por
 * `row.negocio_id`. Un resultado de longitud 0 (accessor sin seed data)
 * pasa vacuamente — 0 filas es 0 fugas, correcto.
 */
async function checkAccessor(
  label: "A" | "B",
  negocioId: string,
  otherLabel: "A" | "B",
  otherNegocioId: string,
  accessor: ReadAccessor,
): Promise<void> {
  const { data, error } = await accessorQuery(negocioId, accessor).select("*");
  assert(!error, `negocioScoped(${label}).${accessor}() no debería fallar: ${error?.message}`);
  const rows = data ?? [];

  if (accessor === "negocio") {
    assert(
      rows.every((row) => row.id === negocioId),
      `negocioScoped(${label}).negocio() devolvió una fila que NO pertenece al negocio ${label}.`,
    );
    assert(
      rows.every((row) => row.id !== otherNegocioId),
      `negocioScoped(${label}).negocio() devolvió filas del negocio ${otherLabel} -- FUGA CROSS-NEGOCIO.`,
    );
  } else {
    assert(
      rows.every((row) => row.negocio_id === negocioId),
      `negocioScoped(${label}).${accessor}() devolvió una fila que NO pertenece al negocio ${label}.`,
    );
    assert(
      rows.every((row) => row.negocio_id !== otherNegocioId),
      `negocioScoped(${label}).${accessor}() devolvió filas del negocio ${otherLabel} -- FUGA CROSS-NEGOCIO.`,
    );
  }

  console.log(
    `OK: negocioScoped(${label}).${accessor}() devuelve ${rows.length} fila(s), ninguna del negocio ${otherLabel}.`,
  );
}

/** `t.execute` tipado igual que buscarHorarios.test.ts's `runExecute` — evita
 * repetir el cast por cada llamada. */
async function runConsultarNegocioExecute(
  t: ReturnType<typeof consultarNegocioTool>,
  input: ConsultarNegocioInput,
): Promise<ConsultarNegocioResult> {
  const execute = t.execute as unknown as (
    input: ConsultarNegocioInput,
    options: unknown,
  ) => Promise<ConsultarNegocioResult>;
  return execute(input, { toolCallId: "sec03", messages: [] });
}

async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error(
      "FALTAN SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en .env — abortando smoke test.",
    );
    process.exit(1);
  }

  // Isolation guard (CLAUDE.md hard rule): never run this against any
  // project other than this repo's own bdgufnitakelyialjoqg.
  if (!process.env.SUPABASE_URL.includes("bdgufnitakelyialjoqg")) {
    console.error(
      `SUPABASE_URL no apunta al proyecto TurnosBot (bdgufnitakelyialjoqg). Abortando: ${process.env.SUPABASE_URL}`,
    );
    process.exit(1);
  }

  // Pasada 1: negocio A -- los 12 accessors, cero filas del negocio B.
  for (const accessor of READ_ACCESSORS) {
    await checkAccessor("A", NEGOCIO_A_ID, "B", NEGOCIO_B_ID, accessor);
  }

  // Pasada 2 (aislamiento simétrico): negocio B -- los 12 accessors, cero
  // filas del negocio A.
  for (const accessor of READ_ACCESSORS) {
    await checkAccessor("B", NEGOCIO_B_ID, "A", NEGOCIO_A_ID, accessor);
  }

  // Chequeo a nivel tool (SEC-03 Success Criterion #3, segunda mitad):
  // consultarNegocioTool con el contexto del negocio A nunca debe surfacear
  // un servicio del negocio B. Los ids del negocio B se derivan en vivo (no
  // hardcodeados) para no depender de que el seed no cambie.
  const { data: serviciosB, error: errServiciosB } = await negocioScoped(NEGOCIO_B_ID)
    .servicios()
    .select("*");
  assert(
    !errServiciosB,
    `negocioScoped(B).servicios() no debería fallar (setup del chequeo tool): ${errServiciosB?.message}`,
  );
  const KNOWN_NEGOCIO_B_SERVICIO_IDS = new Set((serviciosB ?? []).map((servicio) => servicio.id));

  const tool = consultarNegocioTool(NEGOCIO_A_ID, CLIENTE_A_ID);
  const preciosA = await runConsultarNegocioExecute(tool, { tipo: "precios" });
  assert(
    preciosA.tipo === "precios",
    "consultarNegocio(A) con tipo:'precios' no devolvió tipo:'precios'.",
  );
  const idsA = preciosA.servicios.map((servicio) => servicio.id);
  assert(
    idsA.every((id) => !KNOWN_NEGOCIO_B_SERVICIO_IDS.has(id)),
    "consultarNegocio(A) devolvió un servicio del negocio B -- FUGA CROSS-NEGOCIO.",
  );
  console.log(
    `OK: consultarNegocio(A) tipo:'precios' devuelve ${idsA.length} servicio(s), ninguno de los ${KNOWN_NEGOCIO_B_SERVICIO_IDS.size} servicio(s) conocidos del negocio B.`,
  );

  console.log("\nnegocioScoped.verify.ts: PASSED");
}

main().catch((err) => {
  console.error("ERROR inesperado en negocioScoped.verify.ts:", err);
  process.exit(1);
});
