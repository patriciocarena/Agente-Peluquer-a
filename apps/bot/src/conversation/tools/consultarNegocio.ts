/**
 * apps/bot/src/conversation/tools/consultarNegocio.ts — tool `consultarNegocio`
 * (BOT-05/06/08): responde precios de servicios, horarios de profesionales, y
 * estado de turnos existentes DEL CLIENTE de esta conversación — todo leído
 * exclusivamente vía `negocioScoped(negocioId)` (CORE-03), nunca con un
 * cliente Supabase directo (T-06-07/T-06-08).
 *
 * `consultarNegocioTool(negocioId, clienteId, deps?)` cierra sobre AMBOS
 * `negocioId` Y `clienteId` (Pattern 1 de 06-PATTERNS.md, D-13/D-07): el
 * `inputSchema` de abajo no incluye ninguno de los dos como campo que el
 * modelo pueda llenar. Para `estado_turno` en particular (T-06-07,
 * Information Disclosure — mitigate), el filtro por `clienteId` viene
 * SIEMPRE de la closure resuelta en `inboundWorker.ts`, nunca de un
 * parámetro que el modelo controle: un mensaje "mostrame los turnos de otro
 * cliente" no tiene ningún parámetro que pueda usar para cambiar ese scope.
 *
 * Para `estado_turno`, el precio/servicios de un turno EXISTENTE se leen de
 * los `turno_servicio.*_snapshot` congelados al momento de agendar (Pattern
 * 6, AVAIL-03) — NUNCA de un join vivo a `servicio.precio`, que podría
 * reflejar un cambio de precio posterior al turno ya agendado (T-06-10).
 */
import { uuidLike } from "@turnosbot/availability-engine";
import { tool } from "ai";
import { z } from "zod";

import { negocioScoped as realNegocioScoped } from "../../db/negocioScoped.js";

const ESTADOS_QUE_BLOQUEAN_CONSULTA = "cancelado";

/** inputSchema de `consultarNegocio`. Sin `negocioId` ni `clienteId` — ambos
 * closure-captured (D-13/D-07, T-06-07/T-06-08). `uuidLike` reusado del
 * barrel de `@turnosbot/availability-engine` (Pattern 2), no un regex
 * paralelo propio. */
export const consultarNegocioInputSchema = z.object({
  tipo: z.enum(["precios", "horarios_profesional", "estado_turno"]),
  profesionalId: uuidLike.optional(),
});

export type ConsultarNegocioInput = z.infer<typeof consultarNegocioInputSchema>;

export interface PrecioServicioView {
  nombre: string;
  precio: number;
  duracionMin: number;
}

export interface BloqueHorarioView {
  diaSemana: number;
  horaInicio: string;
  horaFin: string;
}

/** Servicio de un turno EXISTENTE, leído del snapshot congelado (Pattern 6) —
 * nunca del `servicio.precio` vivo. */
export interface ServicioSnapshotView {
  nombre: string;
  precio: number;
  duracionMin: number;
}

export interface EstadoTurnoView {
  turnoId: string;
  estado: string;
  inicio: string;
  fin: string;
  precioTotal: number | null;
  servicios: ServicioSnapshotView[];
}

export type ConsultarNegocioResult =
  | { tipo: "precios"; servicios: PrecioServicioView[] }
  | { tipo: "horarios_profesional"; bloques: BloqueHorarioView[] }
  | { tipo: "estado_turno"; turnos: EstadoTurnoView[] };

/** Deps inyectables (Pattern 3/8 de 06-PATTERNS.md): `negocioScoped` real por
 * defecto, sustituible en tests por un fake sin DB real. */
export interface ConsultarNegocioDeps {
  negocioScoped: typeof realNegocioScoped;
}

const defaultDeps: ConsultarNegocioDeps = { negocioScoped: realNegocioScoped };

/**
 * consultarNegocioTool(negocioId, clienteId, deps?) — factory que devuelve
 * la tool `consultarNegocio` del AI SDK, cerrada sobre `negocioId` Y
 * `clienteId` (D-13/D-07).
 */
export function consultarNegocioTool(
  negocioId: string,
  clienteId: string,
  deps: ConsultarNegocioDeps = defaultDeps,
) {
  return tool({
    description:
      "Consulta precios de servicios, horarios de trabajo de un profesional, o el estado de los turnos del cliente actual. Todo dato devuelto es real, leído del negocio — nunca inventes un precio, horario o estado de turno que esta herramienta no devolvió.",
    inputSchema: consultarNegocioInputSchema,
    execute: async (input: ConsultarNegocioInput): Promise<ConsultarNegocioResult> => {
      const db = deps.negocioScoped(negocioId);

      if (input.tipo === "precios") {
        const { data } = await db.servicios();
        const servicios = (data ?? [])
          .filter((servicio) => servicio.activo)
          .map((servicio) => ({
            nombre: servicio.nombre,
            precio: servicio.precio,
            duracionMin: servicio.duracion_min,
          }));
        return { tipo: "precios", servicios };
      }

      if (input.tipo === "horarios_profesional") {
        if (!input.profesionalId) {
          return { tipo: "horarios_profesional", bloques: [] };
        }
        const { data } = await db.horariosTrabajo();
        const bloques = (data ?? [])
          .filter((horario) => horario.profesional_id === input.profesionalId)
          .map((horario) => ({
            diaSemana: horario.dia_semana,
            horaInicio: horario.hora_inicio,
            horaFin: horario.hora_fin,
          }));
        return { tipo: "horarios_profesional", bloques };
      }

      // tipo === "estado_turno" (BOT-08) — filtra SIEMPRE por el clienteId
      // closure-captured (T-06-07), nunca por un parámetro del modelo.
      const [turnosRes, turnoServiciosRes] = await Promise.all([
        db.turnos(),
        db.turnoServicios(),
      ]);
      const turnosDelCliente = (turnosRes.data ?? []).filter(
        (turno) => turno.cliente_id === clienteId && turno.estado !== ESTADOS_QUE_BLOQUEAN_CONSULTA,
      );
      const turnoServicios = turnoServiciosRes.data ?? [];

      const turnos: EstadoTurnoView[] = turnosDelCliente.map((turno) => ({
        turnoId: turno.id,
        estado: turno.estado,
        inicio: turno.inicio,
        fin: turno.fin,
        precioTotal: turno.precio_total,
        // Snapshots congelados (Pattern 6, T-06-10) — nunca servicio.precio vivo.
        servicios: turnoServicios
          .filter((ts) => ts.turno_id === turno.id)
          .map((ts) => ({
            nombre: ts.nombre_snapshot,
            precio: ts.precio_snapshot,
            duracionMin: ts.duracion_snapshot,
          })),
      }));

      return { tipo: "estado_turno", turnos };
    },
  });
}
