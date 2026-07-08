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
 *
 * Fix Bug B (bot-no-agenda-uuid-y-fecha.md, 06-UAT.md Gaps): `buscarHorarios`/
 * `confirmarTurno`/`asignarProfesional` exigen `servicioIds`/`profesionalId`
 * con forma de UUID real (`uuidLike`) — pero hasta este fix NINGUNA tool le
 * daba al modelo el `id` real de un servicio o profesional para citarlo, así
 * que el modelo inventaba un slug ("corte_clasico") que siempre fallaba la
 * validación zod. `tipo: "precios"` ahora incluye `id` en cada
 * `PrecioServicioView`, y se agrega `tipo: "profesionales"` (lista
 * `{id, nombre}` de los profesionales activos) para el caso en que el
 * cliente pide un profesional puntual por nombre — el caso "sin preferencia"
 * ya estaba cubierto por `asignarProfesional`, que devuelve su propio
 * `profesionalId` real. El system prompt (systemPrompt.ts) instruye al
 * modelo a resolver SIEMPRE estos ids vía `consultarNegocio` antes de llamar
 * cualquier tool que los exija, en vez de inventarlos.
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
  tipo: z.enum(["precios", "horarios_profesional", "estado_turno", "profesionales"]),
  profesionalId: uuidLike.optional(),
});

export type ConsultarNegocioInput = z.infer<typeof consultarNegocioInputSchema>;

/** `id` real del servicio (Bug B) — el modelo debe citar este valor tal cual
 * en `servicioIds` de `buscarHorarios`/`confirmarTurno`/`asignarProfesional`,
 * nunca inventar un slug a partir de `nombre`. */
export interface PrecioServicioView {
  id: string;
  nombre: string;
  precio: number;
  duracionMin: number;
}

export interface BloqueHorarioView {
  diaSemana: number;
  horaInicio: string;
  horaFin: string;
}

/** `id` real del profesional (Bug B, hallazgo adicional) — usado cuando el
 * cliente pide un profesional puntual por nombre; el modelo debe citar este
 * `id` tal cual en `profesionalId`, nunca inventarlo. El caso "sin
 * preferencia" no necesita este listado: `asignarProfesional` ya devuelve su
 * propio `profesionalId` real. */
export interface ProfesionalView {
  id: string;
  nombre: string;
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
  | { tipo: "estado_turno"; turnos: EstadoTurnoView[] }
  | { tipo: "profesionales"; profesionales: ProfesionalView[] };

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
      "Consulta precios de servicios (con su id real), la lista de profesionales (con su id real), horarios de trabajo de un profesional, o el estado de los turnos del cliente actual. Todo dato devuelto es real, leído del negocio — nunca inventes un precio, horario, id o estado de turno que esta herramienta no devolvió. Llamá esta tool con tipo:'precios' (y con tipo:'profesionales' si el cliente pidió un profesional puntual por nombre) ANTES de buscarHorarios/confirmarTurno para obtener los id reales que esas herramientas exigen — nunca inventes un id a partir del nombre de un servicio o profesional.",
    inputSchema: consultarNegocioInputSchema,
    execute: async (input: ConsultarNegocioInput): Promise<ConsultarNegocioResult> => {
      const db = deps.negocioScoped(negocioId);

      if (input.tipo === "precios") {
        const { data } = await db.servicios();
        const servicios = (data ?? [])
          .filter((servicio) => servicio.activo)
          .map((servicio) => ({
            id: servicio.id,
            nombre: servicio.nombre,
            precio: servicio.precio,
            duracionMin: servicio.duracion_min,
          }));
        return { tipo: "precios", servicios };
      }

      if (input.tipo === "profesionales") {
        const { data } = await db.profesionales();
        const profesionales = (data ?? [])
          .filter((profesional) => profesional.activo)
          .map((profesional) => ({ id: profesional.id, nombre: profesional.nombre }));
        return { tipo: "profesionales", profesionales };
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
