/**
 * src/__fixtures__/rows.ts — filas deterministas para los unit tests del
 * motor de disponibilidad.
 *
 * Estrategia PRIMARIA de validación (03-RESEARCH.md Pitfall 8): la DB live
 * tiene `horario_trabajo` y `bloqueo` VACÍOS, así que cualquier verificación
 * live-DB mostraría "disponible todo el día" y enmascararía bugs reales de
 * la resta de intervalos. Por eso el motor se prueba con estas filas
 * en-memoria, deterministas, tipadas contra los alias de `@turnosbot/db-types`
 * (sin shapes paralelos).
 *
 * Cada helper `makeX(partial)` construye una fila con defaults sensatos y
 * permite override solo de la dimensión que el test prueba, siguiendo el
 * estilo fixture-con-defaults de `apps/dashboard/lib/schemas/horario.test.ts`.
 */
import type {
  BloqueoRow,
  HorarioTrabajoRow,
  NegocioRow,
  ServicioRow,
  TurnoRow,
} from "../types.js";

// UUIDs fijos para que los tests sean reproducibles run-to-run.
export const NEGOCIO_ID = "00000000-0000-4000-8000-000000000001";
export const PROFESIONAL_A_ID = "00000000-0000-4000-8000-0000000000a1";
export const PROFESIONAL_B_ID = "00000000-0000-4000-8000-0000000000b1";
export const CLIENTE_ID = "00000000-0000-4000-8000-0000000000c1";
export const SERVICIO_CORTE_ID = "00000000-0000-4000-8000-0000000000d1";
export const SERVICIO_BARBA_ID = "00000000-0000-4000-8000-0000000000d2";

const FIXED_TS = "2026-07-06T00:00:00.000Z";

/**
 * Negocio de prueba: timezone AR (IANA, nunca offset -3 hardcodeado) y
 * granularidad de 30 min (D-01).
 */
export function makeNegocio(partial: Partial<NegocioRow> = {}): NegocioRow {
  return {
    activo: true,
    created_at: FIXED_TS,
    direccion: "Av. Siempreviva 742",
    display_phone_number: null,
    granularidad_min: 30,
    horario_general: null,
    id: NEGOCIO_ID,
    nombre: "Peluquería de Prueba",
    telefono: null,
    tenant_id: "00000000-0000-4000-8000-00000000ff01",
    timezone: "America/Argentina/Buenos_Aires",
    updated_at: FIXED_TS,
    waba_id: null,
    whatsapp_phone_number_id: null,
    whatsapp_token_secret_id: null,
    ...partial,
  };
}

/**
 * Horario de trabajo recurrente. Defaults: profesional A, lunes
 * (dia_semana=1, 0=domingo..6=sábado), 09:00-13:00. Los horarios de la tarde
 * (14:00-18:00) se arman con override de `hora_inicio`/`hora_fin`.
 */
export function makeHorario(
  partial: Partial<HorarioTrabajoRow> = {},
): HorarioTrabajoRow {
  return {
    activo: true,
    created_at: FIXED_TS,
    dia_semana: 1,
    hora_fin: "13:00:00",
    hora_inicio: "09:00:00",
    id: "00000000-0000-4000-8000-0000000010" + "01",
    negocio_id: NEGOCIO_ID,
    profesional_id: PROFESIONAL_A_ID,
    updated_at: FIXED_TS,
    ...partial,
  };
}

/** Dos bloques del lunes para el profesional A: mañana y tarde. */
export const HORARIOS_LUNES_A: HorarioTrabajoRow[] = [
  makeHorario({
    id: "00000000-0000-4000-8000-000000001001",
    hora_inicio: "09:00:00",
    hora_fin: "13:00:00",
  }),
  makeHorario({
    id: "00000000-0000-4000-8000-000000001002",
    hora_inicio: "14:00:00",
    hora_fin: "18:00:00",
  }),
];

/**
 * Bloqueo manual. Defaults: profesional A, un hueco de 10:00-10:30 hora AR
 * (representado en UTC = 13:00-13:30Z, dado UTC−3).
 */
export function makeBloqueo(partial: Partial<BloqueoRow> = {}): BloqueoRow {
  return {
    created_at: FIXED_TS,
    fin: "2026-07-06T13:30:00.000Z",
    id: "00000000-0000-4000-8000-000000002001",
    inicio: "2026-07-06T13:00:00.000Z",
    motivo: "Descanso",
    negocio_id: NEGOCIO_ID,
    profesional_id: PROFESIONAL_A_ID,
    updated_at: FIXED_TS,
    ...partial,
  };
}

/**
 * Turno. Default: profesional A, confirmado, 11:00-11:30 AR (14:00-14:30Z).
 * `estado` se override para probar Pitfall 4 (pendiente/confirmado bloquean,
 * cancelado libera).
 */
export function makeTurno(partial: Partial<TurnoRow> = {}): TurnoRow {
  return {
    cliente_id: CLIENTE_ID,
    created_at: FIXED_TS,
    estado: "confirmado",
    fin: "2026-07-06T14:30:00.000Z",
    id: "00000000-0000-4000-8000-000000003001",
    inicio: "2026-07-06T14:00:00.000Z",
    negocio_id: NEGOCIO_ID,
    precio_total: 6000,
    profesional_id: PROFESIONAL_A_ID,
    updated_at: FIXED_TS,
    ...partial,
  };
}

/** Un turno confirmado y uno cancelado — para probar Pitfall 4 (el cancelado
 * NO debe restar disponibilidad). */
export const TURNO_CONFIRMADO: TurnoRow = makeTurno({
  id: "00000000-0000-4000-8000-000000003001",
  estado: "confirmado",
});
export const TURNO_PENDIENTE: TurnoRow = makeTurno({
  id: "00000000-0000-4000-8000-000000003002",
  estado: "pendiente",
  inicio: "2026-07-06T15:00:00.000Z",
  fin: "2026-07-06T15:30:00.000Z",
});
export const TURNO_CANCELADO: TurnoRow = makeTurno({
  id: "00000000-0000-4000-8000-000000003003",
  estado: "cancelado",
  inicio: "2026-07-06T16:00:00.000Z",
  fin: "2026-07-06T16:30:00.000Z",
});

/**
 * Servicio. Defaults: "Corte", duración 30 min, precio 6000 ARS. "Barba"
 * (15 min) se arma con override para probar la suma multi-servicio (AVAIL-02).
 */
export function makeServicio(partial: Partial<ServicioRow> = {}): ServicioRow {
  return {
    activo: true,
    created_at: FIXED_TS,
    descripcion: null,
    duracion_min: 30,
    id: SERVICIO_CORTE_ID,
    negocio_id: NEGOCIO_ID,
    nombre: "Corte",
    orden: 0,
    precio: 6000,
    updated_at: FIXED_TS,
    ...partial,
  };
}

export const SERVICIO_CORTE: ServicioRow = makeServicio({
  id: SERVICIO_CORTE_ID,
  nombre: "Corte",
  duracion_min: 30,
  precio: 6000,
});
export const SERVICIO_BARBA: ServicioRow = makeServicio({
  id: SERVICIO_BARBA_ID,
  nombre: "Barba",
  duracion_min: 15,
  precio: 3000,
  orden: 1,
});
