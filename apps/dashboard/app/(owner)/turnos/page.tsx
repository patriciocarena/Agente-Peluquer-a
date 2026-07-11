/**
 * app/(owner)/turnos/page.tsx — pantalla operativa diaria del dueño
 * (APPT-01/03, Goal de la Fase 4). Server Component: deriva el negocio
 * activo (`getNegocioActivo`, T-04-24 — `?fecha=` NUNCA influye el
 * scoping), lee `?fecha=` (default hoy en `negocio.timezone` vía `TZDate`,
 * Pitfall 2), llama `buildAvailabilityData` + `computeSlots` (AVAIL-04:
 * nunca calcula huecos a mano) por profesional activo para saber qué está
 * libre, y cruza con las filas crudas de `turno` (≠cancelado, D-06) y
 * `bloqueo` para pintar la grilla.
 *
 * "Libre" per slot de granularidad (D-01): `computeSlots` no acepta una
 * duración de "un slot de grilla" directamente — recibe `serviceIds` reales
 * y suma sus `duracion_min`. Para dimensionar la grilla a UN slot de
 * `negocio.granularidad_min` (en vez de a la duración de un servicio real
 * cualquiera), se arma un servicio SINTÉTICO local (`buildGridServicio`,
 * nunca persistido, solo para esta llamada) con `duracion_min =
 * granularidad_min` — sigue siendo el motor compartido quien calcula el
 * hueco, esta página no reimplementa `snapToGrid`/`subtractIntervals`.
 *
 * D-07 (el dueño no está atado a la disponibilidad "oficial"): una celda que
 * no está cubierta por un turno/bloqueo SIEMPRE se pinta "libre" y queda
 * clickeable, incluso si cae fuera del horario declarado de ese profesional
 * (el motor solo se usa acá para detectar profesionales SIN NINGÚN slot
 * libre ese día — `profesionalesSinHorario`, distinguiendo "sin horario
 * cargado" de "agenda completa" — nunca para des-habilitar una celda).
 */
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { TZDate } from "@date-fns/tz";

import { computeSlots, type AvailabilityData } from "@turnosbot/availability-engine";

import { buildAvailabilityData, fetchTurnoServicios } from "@/lib/availability-data";
import { getNegocioActivo } from "@/lib/negocio-context";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { DiaPicker } from "@/components/dia-picker";
import { GrillaTurnos, type GrillaCelda } from "@/components/grilla-turnos";
import {
  GrillaSemana,
  type SemanaDia,
  type SemanaBloque,
} from "@/components/grilla-semana";
import type { TurnoDetalle } from "@/components/turno-detail-sheet";
import type { Tables } from "@turnosbot/db-types";

const FECHA_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const GRID_SERVICIO_ID = "grid-slot";
const RANGO_DEFAULT_MIN = { inicioMin: 9 * 60, finMin: 20 * 60 };

function esFechaValida(fecha: string): boolean {
  if (!FECHA_REGEX.test(fecha)) return false;
  return !Number.isNaN(new Date(`${fecha}T12:00:00Z`).getTime());
}

function hoyEnZona(timezone: string): string {
  const ahora = new TZDate(Date.now(), timezone);
  const year = ahora.getFullYear();
  const month = String(ahora.getMonth() + 1).padStart(2, "0");
  const day = String(ahora.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function shiftFecha(fecha: string, deltaDias: number): string {
  const date = new Date(`${fecha}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + deltaDias);
  return date.toISOString().slice(0, 10);
}

function formatEtiquetaFecha(fecha: string): string {
  const date = new Date(`${fecha}T12:00:00Z`);
  return new Intl.DateTimeFormat("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(date);
}

function formatDiaSemana(fecha: string): string {
  const date = new Date(`${fecha}T12:00:00Z`);
  return new Intl.DateTimeFormat("es-AR", { weekday: "long", timeZone: "UTC" }).format(date);
}

function partesFecha(fecha: string): [number, number, number] {
  const [year, month, day] = fecha.split("-").map(Number);
  return [year, month, day];
}

function inicioDelDiaEpoch(fecha: string, timezone: string): number {
  const [year, month, day] = partesFecha(fecha);
  return new TZDate(year, month - 1, day, 0, 0, 0, timezone).getTime();
}

function finDelDiaEpoch(fecha: string, timezone: string): number {
  const [year, month, day] = partesFecha(fecha);
  return new TZDate(year, month - 1, day + 1, 0, 0, 0, timezone).getTime();
}

function epochDeHora(fecha: string, hora: string, timezone: string): number {
  const [year, month, day] = partesFecha(fecha);
  const [horas, minutos] = hora.split(":").map(Number);
  return new TZDate(year, month - 1, day, horas, minutos, 0, timezone).getTime();
}

/** "HH:mm" o "HH:mm:ss" (PostgREST serializa `time` con segundos) → minutos
 * desde medianoche. Mismo criterio tolerante que
 * `packages/availability-engine/src/schedule.ts` (parseHoraMinuto). */
function parseHoraMin(hora: string): number {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + m;
}

function minutosAHHmm(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Rango horario de la grilla: unión de todos los `horario_trabajo`
 * cargados (cualquier día) — fallback 09:00-20:00 si el negocio no cargó
 * ningún horario todavía (para que la grilla igual se pueda usar, D-07). */
function computeRangoGrilla(horarios: Tables<"horario_trabajo">[]): {
  inicioMin: number;
  finMin: number;
} {
  if (horarios.length === 0) return RANGO_DEFAULT_MIN;
  let inicioMin = Infinity;
  let finMin = -Infinity;
  for (const horario of horarios) {
    inicioMin = Math.min(inicioMin, parseHoraMin(horario.hora_inicio));
    finMin = Math.max(finMin, parseHoraMin(horario.hora_fin));
  }
  return { inicioMin, finMin };
}

/** Servicio sintético (nunca persistido) usado SOLO para dimensionar
 * `computeSlots` a un único slot de `granularidad_min` — ver comentario de
 * cabecera. */
function buildGridServicio(negocio: Tables<"negocio">): Tables<"servicio"> {
  return {
    id: GRID_SERVICIO_ID,
    negocio_id: negocio.id,
    nombre: "__grid__",
    descripcion: null,
    precio: 0,
    duracion_min: negocio.granularidad_min,
    activo: true,
    orden: 0,
    created_at: negocio.created_at,
    updated_at: negocio.updated_at,
  };
}

/** Lunes (inicio de semana es-AR) de la semana que contiene `fecha`. */
function lunesDeLaSemana(fecha: string): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  const dow = d.getUTCDay(); // 0=Dom .. 6=Sáb
  const offset = dow === 0 ? -6 : 1 - dow;
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

/** Minutos desde medianoche (hora LOCAL del negocio) de un instante ISO. */
function minutosLocalDeIso(iso: string, timezone: string): number {
  const d = new TZDate(new Date(iso).getTime(), timezone);
  return d.getHours() * 60 + d.getMinutes();
}

function formatDiaCorto(fecha: string): string {
  const date = new Date(`${fecha}T12:00:00Z`);
  const s = new Intl.DateTimeFormat("es-AR", { weekday: "short", timeZone: "UTC" }).format(date);
  return (s.charAt(0).toUpperCase() + s.slice(1)).replace(".", "");
}

function formatMesCorto(fecha: string): string {
  const date = new Date(`${fecha}T12:00:00Z`);
  return new Intl.DateTimeFormat("es-AR", { month: "short", timeZone: "UTC" })
    .format(date)
    .replace(".", "");
}

/**
 * Arma los 7 días de la semana (Lun–Dom) que contiene `fechaActiva`, con sus
 * turnos/bloqueos como bloques posicionados por hora. Reusa `data` (ya cargada,
 * sin fetch extra de turnos) y solo consulta los nombres de cliente de la semana.
 */
async function construirDiasSemana(
  supabase: Awaited<ReturnType<typeof createClient>>,
  negocio: Tables<"negocio">,
  data: AvailabilityData,
  fechaActiva: string,
  profFiltro: string | null,
): Promise<{ dias: SemanaDia[]; horas: string[]; inicioMin: number }> {
  const lunes = lunesDeLaSemana(fechaActiva);
  const fechas = Array.from({ length: 7 }, (_, i) => shiftFecha(lunes, i));
  const weekStart = inicioDelDiaEpoch(fechas[0], negocio.timezone);
  const weekEnd = finDelDiaEpoch(fechas[6], negocio.timezone);
  const hoy = hoyEnZona(negocio.timezone);

  const turnosSemana = data.turnos.filter((t) => {
    if (t.estado === "cancelado") return false; // D-06
    if (profFiltro && t.profesional_id !== profFiltro) return false;
    const ini = new Date(t.inicio).getTime();
    return ini >= weekStart && ini < weekEnd;
  });
  const bloqueosSemana = data.bloqueos.filter((b) => {
    if (profFiltro && b.profesional_id !== profFiltro) return false;
    const ini = new Date(b.inicio).getTime();
    return ini >= weekStart && ini < weekEnd;
  });

  const clienteIds = Array.from(new Set(turnosSemana.map((t) => t.cliente_id)));
  const clientesRes =
    clienteIds.length > 0
      ? await supabase
          .from("cliente")
          .select("id, nombre, telefono")
          .eq("negocio_id", negocio.id)
          .in("id", clienteIds)
      : { data: [] as { id: string; nombre: string | null; telefono: string }[] };
  const clientePorId = new Map((clientesRes.data ?? []).map((c) => [c.id, c]));

  const { inicioMin, finMin } = computeRangoGrilla(data.horarios);
  const horas: string[] = [];
  for (let m = inicioMin; m < finMin; m += negocio.granularidad_min) {
    horas.push(minutosAHHmm(m));
  }

  const fmtPrecio = (n: number) => `$ ${Math.round(n).toLocaleString("es-AR")}`;

  const dias: SemanaDia[] = fechas.map((fecha) => {
    const dayStart = inicioDelDiaEpoch(fecha, negocio.timezone);
    const dayEnd = finDelDiaEpoch(fecha, negocio.timezone);
    const bloques: SemanaBloque[] = [];

    for (const t of turnosSemana) {
      const ini = new Date(t.inicio).getTime();
      if (ini < dayStart || ini >= dayEnd) continue;
      const cliente = clientePorId.get(t.cliente_id);
      bloques.push({
        id: t.id,
        estado: t.estado === "confirmado" ? "confirmado" : "pendiente",
        inicioMin: minutosLocalDeIso(t.inicio, negocio.timezone),
        durMin: Math.max(
          (new Date(t.fin).getTime() - ini) / 60000,
          negocio.granularidad_min,
        ),
        titulo: cliente?.nombre ?? cliente?.telefono ?? "Turno",
        subtitulo: fmtPrecio(t.precio_total),
      });
    }
    for (const b of bloqueosSemana) {
      const ini = new Date(b.inicio).getTime();
      if (ini < dayStart || ini >= dayEnd) continue;
      bloques.push({
        id: b.id,
        estado: "bloqueo",
        inicioMin: minutosLocalDeIso(b.inicio, negocio.timezone),
        durMin: Math.max(
          (new Date(b.fin).getTime() - ini) / 60000,
          negocio.granularidad_min,
        ),
        titulo: b.motivo ?? "Bloqueo",
      });
    }
    bloques.sort((a, b) => a.inicioMin - b.inicioMin);

    const [, , numero] = partesFecha(fecha);
    return {
      fecha,
      etiqueta: formatDiaCorto(fecha),
      numero,
      esHoy: fecha === hoy,
      bloques,
    };
  });

  return { dias, horas, inicioMin };
}

export default async function TurnosPage({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string; vista?: string; prof?: string }>;
}) {
  const { negocio } = await getNegocioActivo();
  const { fecha: fechaParam, vista: vistaParam, prof: profParam } = await searchParams;
  const vista: "dia" | "semana" = vistaParam === "semana" ? "semana" : "dia";

  // T-04-25: `?fecha=` se valida como YYYY-MM-DD antes de usarla; nunca se
  // interpola cruda ni influye el scoping (T-04-24 — el negocio siempre sale
  // de getNegocioActivo()).
  const fechaActiva =
    fechaParam && esFechaValida(fechaParam) ? fechaParam : hoyEnZona(negocio.timezone);

  const supabase = await createClient();

  let profesionales: Tables<"profesional">[] = [];
  let data: AvailabilityData | null = null;
  let errorCarga = false;

  try {
    const [profesionalesRes, availability] = await Promise.all([
      supabase
        .from("profesional")
        .select("*")
        .eq("negocio_id", negocio.id)
        .eq("activo", true)
        .order("nombre", { ascending: true }),
      buildAvailabilityData(negocio.id),
    ]);

    if (profesionalesRes.error) {
      throw new Error("No pudimos cargar los profesionales.");
    }

    profesionales = profesionalesRes.data ?? [];
    data = availability;
  } catch {
    errorCarga = true;
  }

  const diaAnterior = shiftFecha(fechaActiva, -1);
  const diaSiguiente = shiftFecha(fechaActiva, 1);
  const etiquetaFecha = formatEtiquetaFecha(fechaActiva);

  const lunesSemana = lunesDeLaSemana(fechaActiva);
  const finSemana = shiftFecha(lunesSemana, 6);
  const semanaAnterior = shiftFecha(lunesSemana, -7);
  const semanaSiguiente = shiftFecha(lunesSemana, 7);
  const etiquetaSemana = `${partesFecha(lunesSemana)[2]}–${partesFecha(finSemana)[2]} ${formatMesCorto(finSemana)} ${partesFecha(finSemana)[0]}`;

  // Filtro de profesional (solo aplica a la vista Semana): id válido o null=Todos.
  const profSeleccionado =
    profParam && profesionales.some((p) => p.id === profParam) ? profParam : null;

  let contenido: React.ReactNode;

  if (errorCarga || !data) {
    contenido = (
      <div className="rounded-lg border border-dashed p-10 text-center">
        <p className="text-sm text-muted-foreground">
          Hubo un problema al cargar la agenda. Recargá la página o intentá más tarde.
        </p>
      </div>
    );
  } else if (profesionales.length === 0) {
    contenido = (
      <div className="rounded-lg border border-dashed p-10 text-center">
        <h2 className="text-lg font-semibold">Todavía no tenés profesionales activos</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Activá al menos un profesional en la sección Profesionales para poder cargar turnos.
        </p>
      </div>
    );
  } else if (vista === "semana") {
    const { dias, horas, inicioMin } = await construirDiasSemana(
      supabase,
      negocio,
      data,
      fechaActiva,
      profSeleccionado,
    );
    contenido = (
      <GrillaSemana
        dias={dias}
        horas={horas}
        inicioMin={inicioMin}
        granularidadMin={negocio.granularidad_min}
      />
    );
  } else {
    const granularidadMin = negocio.granularidad_min;
    const { inicioMin, finMin } = computeRangoGrilla(data.horarios);
    const horas: string[] = [];
    for (let min = inicioMin; min < finMin; min += granularidadMin) {
      horas.push(minutosAHHmm(min));
    }

    const gridServicio = buildGridServicio(negocio);
    const dataParaGrilla: AvailabilityData = {
      ...data,
      servicios: [...data.servicios, gridServicio],
    };

    // AVAIL-04: "libre" SIEMPRE vía el motor compartido, una llamada por
    // profesional activo (computeSlots con professionalId fijo devuelve solo
    // sus propios slots, no auto-asigna).
    const librePorProfesional = new Map<string, Set<string>>();
    await Promise.all(
      profesionales.map(async (profesional) => {
        const slots = await computeSlots(
          {
            negocioId: negocio.id,
            serviceIds: [gridServicio.id],
            professionalId: profesional.id,
            date: fechaActiva,
            skipBookingWindow: true,
          },
          dataParaGrilla,
        );
        librePorProfesional.set(profesional.id, new Set(slots.map((slot) => slot.start)));
      }),
    );

    const dayStart = inicioDelDiaEpoch(fechaActiva, negocio.timezone);
    const dayEnd = finDelDiaEpoch(fechaActiva, negocio.timezone);

    const turnosDelDia = data.turnos.filter((turno) => {
      if (turno.estado === "cancelado") return false; // D-06
      const inicio = new Date(turno.inicio).getTime();
      return inicio >= dayStart && inicio < dayEnd;
    });

    const bloqueosDelDia = data.bloqueos.filter((bloqueo) => {
      const inicio = new Date(bloqueo.inicio).getTime();
      return inicio >= dayStart && inicio < dayEnd;
    });

    // Pitfall 5 (dato de UI, fuera del contrato del motor): turno_servicio +
    // cliente solo para los turnos visibles hoy, no para todo el historial.
    const turnoIds = turnosDelDia.map((turno) => turno.id);
    const clienteIds = Array.from(new Set(turnosDelDia.map((turno) => turno.cliente_id)));

    const [turnoServiciosPorTurno, clientesRes] = await Promise.all([
      Promise.all(turnoIds.map((id) => fetchTurnoServicios(negocio.id, id))),
      clienteIds.length > 0
        ? supabase
            .from("cliente")
            .select("id, nombre, telefono")
            .eq("negocio_id", negocio.id)
            .in("id", clienteIds)
        : Promise.resolve({ data: [] as { id: string; nombre: string | null; telefono: string }[] }),
    ]);

    const profesionalNombrePorId = new Map(profesionales.map((p) => [p.id, p.nombre]));
    const clientePorId = new Map((clientesRes.data ?? []).map((cliente) => [cliente.id, cliente]));
    const turnoServiciosPorTurnoId = new Map(
      turnoIds.map((id, index) => [id, turnoServiciosPorTurno[index]]),
    );

    const turnoDetallePorId = new Map<string, TurnoDetalle>();
    for (const turno of turnosDelDia) {
      const cliente = clientePorId.get(turno.cliente_id);
      const servicios = turnoServiciosPorTurnoId.get(turno.id) ?? [];
      turnoDetallePorId.set(turno.id, {
        id: turno.id,
        clienteNombre: cliente?.nombre ?? null,
        clienteTelefono: cliente?.telefono ?? "",
        profesionalNombre: profesionalNombrePorId.get(turno.profesional_id) ?? "",
        inicio: turno.inicio,
        fin: turno.fin,
        precioTotal: turno.precio_total,
        servicios: servicios.map((servicio) => ({
          nombre_snapshot: servicio.nombre_snapshot,
          precio_snapshot: servicio.precio_snapshot,
        })),
        serviceIds: servicios.map((servicio) => servicio.servicio_id),
        profesionalId: turno.profesional_id,
      });
    }

    const celdas: Record<string, Record<string, GrillaCelda>> = {};
    const ocupadoCount: Record<string, number> = {};

    for (const profesional of profesionales) {
      celdas[profesional.id] = {};
      ocupadoCount[profesional.id] = 0;

      const turnosDeEsteProf = turnosDelDia.filter(
        (turno) => turno.profesional_id === profesional.id,
      );
      const bloqueosDeEsteProf = bloqueosDelDia.filter(
        (bloqueo) => bloqueo.profesional_id === profesional.id,
      );

      for (const hora of horas) {
        const slotEpoch = epochDeHora(fechaActiva, hora, negocio.timezone);

        const turno = turnosDeEsteProf.find((t) => {
          const inicio = new Date(t.inicio).getTime();
          const fin = new Date(t.fin).getTime();
          return slotEpoch >= inicio && slotEpoch < fin;
        });

        if (turno) {
          ocupadoCount[profesional.id] += 1;
          celdas[profesional.id][hora] = {
            estado: turno.estado === "confirmado" ? "confirmado" : "pendiente",
            turno: turnoDetallePorId.get(turno.id),
          };
          continue;
        }

        const bloqueo = bloqueosDeEsteProf.find((b) => {
          const inicio = new Date(b.inicio).getTime();
          const fin = new Date(b.fin).getTime();
          return slotEpoch >= inicio && slotEpoch < fin;
        });

        if (bloqueo) {
          ocupadoCount[profesional.id] += 1;
          celdas[profesional.id][hora] = {
            estado: "bloqueo",
            bloqueo: { id: bloqueo.id, motivo: bloqueo.motivo },
          };
          continue;
        }

        // D-07: nada la ocupa → libre e interactiva, sin atarse a si
        // `computeSlots` la hubiera ofrecido oficialmente o no.
        celdas[profesional.id][hora] = { estado: "libre" };
      }
    }

    // "Sin horario cargado" (per-columna) = cero slots libres según el motor
    // Y cero slots ocupados por turno/bloqueo — distingue de "agenda llena"
    // (cero libres pero con turnos/bloqueos sí presentes).
    const profesionalesSinHorario = profesionales
      .filter(
        (profesional) =>
          (librePorProfesional.get(profesional.id)?.size ?? 0) === 0 &&
          ocupadoCount[profesional.id] === 0,
      )
      .map((profesional) => profesional.id);

    const todosSinHorario = profesionalesSinHorario.length === profesionales.length;

    contenido = (
      <div className="relative">
        {todosSinHorario ? (
          <div className="pointer-events-none absolute inset-x-0 top-2 z-20 mx-auto max-w-md rounded-lg bg-popover/95 p-3 text-center shadow-md ring-1 ring-foreground/10">
            <p className="text-sm font-semibold">Sin horario cargado para este día</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Ningún profesional tiene horario de trabajo configurado para{" "}
              {formatDiaSemana(fechaActiva)}. Podés cargar un horario en la ficha de cada
              profesional, o bloquear/crear un turno igual si es una excepción puntual.
            </p>
          </div>
        ) : null}
        <GrillaTurnos
          profesionales={profesionales.map((profesional) => ({
            id: profesional.id,
            nombre: profesional.nombre,
          }))}
          horas={horas}
          celdas={celdas}
          profesionalesSinHorario={profesionalesSinHorario}
          fecha={fechaActiva}
          timezone={negocio.timezone}
          servicios={data.servicios}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Turnos</h1>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <div className="mr-1 inline-flex rounded-lg border border-border bg-muted p-0.5">
          <Button asChild variant={vista === "dia" ? "default" : "ghost"} size="sm">
            <Link href={`/turnos?fecha=${fechaActiva}&vista=dia`}>Día</Link>
          </Button>
          <Button asChild variant={vista === "semana" ? "default" : "ghost"} size="sm">
            <Link href={`/turnos?fecha=${fechaActiva}&vista=semana`}>Semana</Link>
          </Button>
        </div>

        {vista === "dia" ? (
          <>
            <Button asChild variant="ghost" size="icon" aria-label="Día anterior">
              <Link href={`/turnos?fecha=${diaAnterior}`}>
                <ChevronLeft />
              </Link>
            </Button>
            <span className="min-w-48 text-center text-sm font-medium">{etiquetaFecha}</span>
            <DiaPicker fecha={fechaActiva} />
            <Button asChild variant="ghost" size="icon" aria-label="Día siguiente">
              <Link href={`/turnos?fecha=${diaSiguiente}`}>
                <ChevronRight />
              </Link>
            </Button>
          </>
        ) : (
          <>
            <Button asChild variant="ghost" size="icon" aria-label="Semana anterior">
              <Link href={`/turnos?fecha=${semanaAnterior}&vista=semana`}>
                <ChevronLeft />
              </Link>
            </Button>
            <span className="min-w-40 text-center text-sm font-medium">{etiquetaSemana}</span>
            <Button asChild variant="ghost" size="icon" aria-label="Semana siguiente">
              <Link href={`/turnos?fecha=${semanaSiguiente}&vista=semana`}>
                <ChevronRight />
              </Link>
            </Button>
          </>
        )}
      </div>

      {vista === "semana" && profesionales.length > 0 ? (
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          <Link
            href={`/turnos?fecha=${fechaActiva}&vista=semana`}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
              !profSeleccionado
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-muted"
            }`}
          >
            Todos
          </Link>
          {profesionales.map((profesional) => (
            <Link
              key={profesional.id}
              href={`/turnos?fecha=${fechaActiva}&vista=semana&prof=${profesional.id}`}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                profSeleccionado === profesional.id
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-muted"
              }`}
            >
              {profesional.nombre}
            </Link>
          ))}
        </div>
      ) : null}

      {contenido}
    </div>
  );
}
