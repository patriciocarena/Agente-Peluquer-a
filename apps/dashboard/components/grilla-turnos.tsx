/**
 * components/grilla-turnos.tsx — grilla profesionales×horas de un día
 * (APPT-01, D-01/D-02). Client Component: recibe TODO pre-computado desde
 * `page.tsx` (Server Component) — nunca calcula huecos de disponibilidad a
 * mano, solo pinta el shape `celdas` que el server ya resolvió cruzando
 * `computeSlots` con las filas crudas de `turno`/`bloqueo` (D-06: cancelado
 * no se pinta).
 *
 * Densidad (04-UI-SPEC.md): alto de fila 40px, columna de horas `sticky
 * left-0`, columnas de profesional `minmax(160px, 1fr)` (o 160px fijo +
 * `overflow-x-auto` con ≥6 profesionales activos).
 *
 * Continuación de bloque multi-slot (D-02 "abarca varias filas"): en vez de
 * requerir un campo `span` numérico pre-computado por el server, cada celda
 * compara su `turno.id`/`bloqueo.id` contra el slot anterior/siguiente de la
 * MISMA columna — si coinciden, se trata como continuación del mismo bloque
 * (se fusiona el borde, el texto solo se muestra en la celda de inicio). Las
 * celdas "libre" NUNCA se fusionan entre sí: cada slot libre es independiente
 * y clickeable (D-03).
 *
 * Interacciones: celda libre monta `SlotPopover` (D-03); celda
 * confirmado/pendiente abre `TurnoDetailSheet` (D-04); celda bloqueo monta
 * `BloqueoPopover` (D-05), anclado a la celda de inicio del bloque.
 *
 * Empty state por columna (D-07/UI-SPEC "Un profesional específico sin
 * horario ese día"): overlay informativo NO bloqueante (`pointer-events-none`)
 * — las celdas debajo siguen siendo clickeables, el dueño puede operar igual.
 */
"use client";

import { useState } from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { BloqueoPopover } from "@/components/bloqueo-popover";
import { SlotPopover } from "@/components/slot-popover";
import { TurnoDetailSheet, type TurnoDetalle } from "@/components/turno-detail-sheet";
import { cn } from "@/lib/utils";
import type { Tables } from "@turnosbot/db-types";

export type GrillaProfesional = { id: string; nombre: string };

export type GrillaCeldaEstado = "libre" | "confirmado" | "pendiente" | "bloqueo";

export type GrillaCeldaBloqueo = { id: string; motivo: string | null };

export type GrillaCelda = {
  estado: GrillaCeldaEstado;
  turno?: TurnoDetalle;
  bloqueo?: GrillaCeldaBloqueo;
};

type Props = {
  profesionales: GrillaProfesional[];
  /** "HH:mm" por slot de `negocio.granularidad_min`, eje vertical (D-01). */
  horas: string[];
  /** celdas[profesionalId][hora] — TODO pre-computado por page.tsx. */
  celdas: Record<string, Record<string, GrillaCelda>>;
  /** ids de profesionales sin ningún horario cargado para este día. */
  profesionalesSinHorario: string[];
  fecha: string;
  timezone: string;
  servicios: Tables<"servicio">[];
};

const CELDA_LIBRE: GrillaCelda = { estado: "libre" };

// D-02: amarillo ámbar tenue puntual (no existe token --warning en el
// proyecto — ver 04-UI-SPEC.md "Nota sobre el amarillo de Pendiente").
const PENDIENTE_ESTILO = {
  backgroundColor: "oklch(0.87 0.15 95 / 0.35)",
  borderColor: "oklch(0.87 0.15 95 / 0.5)",
};

// D-02: rayado diagonal CSS puro (sin librería) sobre --muted.
const BLOQUEO_ESTILO = {
  backgroundImage:
    "repeating-linear-gradient(45deg, var(--muted), var(--muted) 6px, color-mix(in oklch, var(--muted), var(--foreground) 14%) 6px, color-mix(in oklch, var(--muted), var(--foreground) 14%) 12px)",
};

function iniciales(nombre: string): string {
  return nombre
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((palabra) => palabra[0]?.toUpperCase() ?? "")
    .join("");
}

/** ¿`actual` continúa en `siguiente`? (mismo turno/bloqueo, bloque contiguo). */
function continuaEn(actual: GrillaCelda, siguiente: GrillaCelda | undefined): boolean {
  if (!siguiente) return false;
  if (actual.estado === "confirmado" || actual.estado === "pendiente") {
    return Boolean(actual.turno) && siguiente.turno?.id === actual.turno?.id;
  }
  if (actual.estado === "bloqueo") {
    return Boolean(actual.bloqueo) && siguiente.bloqueo?.id === actual.bloqueo?.id;
  }
  return false;
}

function etiquetaCelda(celda: GrillaCelda): string {
  if (celda.estado === "bloqueo") {
    return celda.bloqueo?.motivo ?? "Bloqueado";
  }
  if (celda.turno) {
    return celda.turno.clienteNombre ?? celda.turno.clienteTelefono;
  }
  return "";
}

export function GrillaTurnos({
  profesionales,
  horas,
  celdas,
  profesionalesSinHorario,
  fecha,
  timezone,
  servicios,
}: Props) {
  const [detalleAbierto, setDetalleAbierto] = useState<TurnoDetalle | null>(null);
  const [bloqueoAbiertoId, setBloqueoAbiertoId] = useState<string | null>(null);

  const sinHorario = new Set(profesionalesSinHorario);
  const columnasFijas = profesionales.length >= 6;

  function celdaDe(profesionalId: string, hora: string): GrillaCelda {
    return celdas[profesionalId]?.[hora] ?? CELDA_LIBRE;
  }

  return (
    <div className={cn(columnasFijas && "overflow-x-auto")}>
      <div
        className="grid"
        style={{
          gridTemplateColumns: `80px repeat(${profesionales.length}, ${
            columnasFijas ? "160px" : "minmax(160px, 1fr)"
          })`,
        }}
      >
        {/* Header de columnas */}
        <div className="sticky left-0 z-10 border-b border-border bg-muted" />
        {profesionales.map((profesional) => (
          <div
            key={profesional.id}
            className="flex items-center gap-2 border-b border-border bg-muted px-2 py-2"
          >
            <Avatar size="sm">
              <AvatarFallback>{iniciales(profesional.nombre)}</AvatarFallback>
            </Avatar>
            <span className="truncate text-xs font-semibold" title={profesional.nombre}>
              {profesional.nombre}
            </span>
          </div>
        ))}

        {/* Filas de hora */}
        {horas.map((hora, indiceHora) => (
          <div className="contents" key={hora}>
            <div className="sticky left-0 z-10 flex h-10 items-center border-b border-border bg-muted px-2 text-xs text-muted-foreground">
              {hora}
            </div>
            {profesionales.map((profesional) => {
              const celda = celdaDe(profesional.id, hora);
              const anterior =
                indiceHora > 0 ? celdaDe(profesional.id, horas[indiceHora - 1]) : undefined;
              const siguiente =
                indiceHora < horas.length - 1
                  ? celdaDe(profesional.id, horas[indiceHora + 1])
                  : undefined;
              const esContinuacion = anterior ? continuaEn(anterior, celda) : false;
              const esInicio = !esContinuacion;
              const fusionaConSiguiente = continuaEn(celda, siguiente);
              const etiqueta = etiquetaCelda(celda);

              const claseBase = cn(
                "flex h-10 w-full items-center px-1.5 text-left",
                fusionaConSiguiente ? "border-x border-b-0" : "border",
                celda.estado === "libre" && "cursor-pointer border-border bg-background hover:bg-muted",
                celda.estado === "confirmado" && "cursor-pointer border-primary/40 bg-primary/12",
                celda.estado === "pendiente" && "cursor-pointer",
                celda.estado === "bloqueo" && "cursor-pointer border-border text-muted-foreground",
              );

              const estiloEstado =
                celda.estado === "pendiente"
                  ? PENDIENTE_ESTILO
                  : celda.estado === "bloqueo"
                    ? BLOQUEO_ESTILO
                    : undefined;

              const contenido =
                esInicio && etiqueta ? (
                  <span className="truncate text-xs" title={etiqueta}>
                    {etiqueta}
                  </span>
                ) : null;

              if (celda.estado === "libre") {
                return (
                  <SlotPopover
                    key={profesional.id}
                    profesionalId={profesional.id}
                    horaInicio={hora}
                    fecha={fecha}
                    timezone={timezone}
                    servicios={servicios}
                  >
                    <button
                      type="button"
                      className={claseBase}
                      aria-label={`Crear turno o bloquear ${hora} — ${profesional.nombre}`}
                    />
                  </SlotPopover>
                );
              }

              if (celda.estado === "bloqueo" && celda.bloqueo) {
                const bloqueo = celda.bloqueo;
                const boton = (
                  <button
                    type="button"
                    className={claseBase}
                    style={estiloEstado}
                    aria-label={`Bloqueo ${hora} — ${profesional.nombre}`}
                    onClick={() => setBloqueoAbiertoId(bloqueo.id)}
                  >
                    {contenido}
                  </button>
                );

                if (esInicio) {
                  return (
                    <BloqueoPopover
                      key={profesional.id}
                      bloqueo={bloqueo}
                      open={bloqueoAbiertoId === bloqueo.id}
                      onOpenChange={(open) => !open && setBloqueoAbiertoId(null)}
                      anchor={boton}
                    />
                  );
                }
                return <div key={profesional.id}>{boton}</div>;
              }

              // confirmado / pendiente
              return (
                <button
                  key={profesional.id}
                  type="button"
                  className={claseBase}
                  style={estiloEstado}
                  aria-label={`Turno ${hora} — ${profesional.nombre}`}
                  onClick={() => celda.turno && setDetalleAbierto(celda.turno)}
                >
                  {contenido}
                </button>
              );
            })}
          </div>
        ))}

        {/* Overlay "sin horario" por columna — informativo, no bloqueante (D-07) */}
        {profesionales.map((profesional, indiceColumna) =>
          sinHorario.has(profesional.id) ? (
            <div
              key={`sin-horario-${profesional.id}`}
              className="pointer-events-none flex items-center justify-center px-2 text-center text-xs text-muted-foreground"
              style={{
                gridColumn: indiceColumna + 2,
                gridRow: `2 / span ${horas.length}`,
              }}
            >
              Sin horario este día
            </div>
          ) : null,
        )}
      </div>

      {detalleAbierto ? (
        <TurnoDetailSheet
          turno={detalleAbierto}
          fecha={fecha}
          timezone={timezone}
          open={Boolean(detalleAbierto)}
          onOpenChange={(open) => !open && setDetalleAbierto(null)}
        />
      ) : null}
    </div>
  );
}
