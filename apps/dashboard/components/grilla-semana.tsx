/**
 * components/grilla-semana.tsx — vista SEMANA del administrador de turnos.
 * Columnas = días (Lun–Dom), filas = horas. Cada turno/bloqueo se dibuja como
 * un bloque posicionado por su hora de inicio y con alto proporcional a su
 * duración real (no una celda por slot). Panorama semanal de un vistazo.
 *
 * v1 read-only: clickear un bloque (o el encabezado de un día) navega a la
 * vista Día de esa fecha, donde vive toda la interacción (crear/editar/cancelar).
 * Así el panorama semanal no reimplementa los popovers/sheets de la grilla diaria.
 */
"use client";

import { useRouter } from "next/navigation";

import { cn } from "@/lib/utils";

export type SemanaEstado = "confirmado" | "pendiente" | "bloqueo";

export type SemanaBloque = {
  id: string;
  estado: SemanaEstado;
  /** minutos desde medianoche (hora local del negocio) */
  inicioMin: number;
  /** duración en minutos */
  durMin: number;
  titulo: string;
  subtitulo?: string;
};

export type SemanaDia = {
  fecha: string; // YYYY-MM-DD
  etiqueta: string; // "Lun"
  numero: number; // 11
  esHoy: boolean;
  bloques: SemanaBloque[];
};

const ALTO_SLOT = 40; // px por cada 30 min (coherente con la vista Día: h-10)

// Bloques tipo evento de calendario: un tinte suave mezclado con el fondo de la
// tarjeta (se adapta solo a claro/oscuro sin enturbiarse) + una barra de acento
// sólida a la izquierda. Texto = foreground para máxima legibilidad.
type EstiloBloque = { backgroundColor?: string; backgroundImage?: string; borderLeftColor: string };

const ESTILO: Record<SemanaEstado, EstiloBloque> = {
  confirmado: {
    backgroundColor: "color-mix(in oklch, var(--card), oklch(0.62 0.17 150) 24%)",
    borderLeftColor: "oklch(0.62 0.17 150)",
  },
  pendiente: {
    backgroundColor: "color-mix(in oklch, var(--card), oklch(0.72 0.16 75) 28%)",
    borderLeftColor: "oklch(0.72 0.16 75)",
  },
  bloqueo: {
    backgroundColor: "color-mix(in oklch, var(--card), var(--muted-foreground) 20%)",
    borderLeftColor: "var(--muted-foreground)",
  },
};

export function GrillaSemana({
  dias,
  horas,
  inicioMin,
  granularidadMin,
}: {
  dias: SemanaDia[];
  /** etiquetas "HH:mm" del eje vertical */
  horas: string[];
  /** minutos desde medianoche de la primera fila */
  inicioMin: number;
  granularidadMin: number;
}) {
  const router = useRouter();
  const altoPorMin = ALTO_SLOT / granularidadMin;
  const altoTotal = horas.length * ALTO_SLOT;

  return (
    <div className="overflow-x-auto">
      <div
        className="grid min-w-[720px]"
        style={{ gridTemplateColumns: `56px repeat(${dias.length}, minmax(96px, 1fr))` }}
      >
        {/* encabezados */}
        <div className="sticky left-0 z-10 border-b border-border bg-muted" />
        {dias.map((dia) => (
          <button
            key={dia.fecha}
            type="button"
            onClick={() => router.push(`/turnos?fecha=${dia.fecha}`)}
            className={cn(
              "border-b border-l border-border bg-muted px-2 py-2 text-center hover:bg-background",
              dia.esHoy && "text-primary",
            )}
            title={`Ver el ${dia.etiqueta} ${dia.numero} en vista Día`}
          >
            <div className="text-xs font-semibold capitalize">
              {dia.etiqueta}
              {dia.esHoy ? " · hoy" : ""}
            </div>
            <div className="text-lg font-bold leading-none">{dia.numero}</div>
          </button>
        ))}

        {/* eje de horas */}
        <div className="sticky left-0 z-10 border-r border-border bg-muted">
          {horas.map((hora) => (
            <div
              key={hora}
              className="flex items-start justify-end px-2 pt-0.5 text-[11px] text-muted-foreground"
              style={{ height: ALTO_SLOT }}
            >
              {hora.endsWith(":00") ? hora : ""}
            </div>
          ))}
        </div>

        {/* pistas por día */}
        {dias.map((dia) => (
          <div
            key={dia.fecha}
            className={cn("relative border-l border-border", dia.esHoy && "bg-primary/5")}
            style={{ height: altoTotal }}
          >
            {/* líneas de slot */}
            {horas.map((hora, i) => (
              <div
                key={hora}
                className="absolute inset-x-0 border-b border-dashed border-border/70"
                style={{ top: i * ALTO_SLOT, height: ALTO_SLOT }}
              />
            ))}
            {/* bloques */}
            {dia.bloques.map((b) => {
              const top = (b.inicioMin - inicioMin) * altoPorMin;
              const alto = Math.max(b.durMin * altoPorMin - 4, 22);
              const est = ESTILO[b.estado];
              const mostrarSub = Boolean(b.subtitulo) && alto >= 42;
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => router.push(`/turnos?fecha=${dia.fecha}`)}
                  className="absolute left-1.5 right-1.5 flex flex-col justify-center gap-0.5 overflow-hidden rounded-md border border-border/40 px-2 text-left text-foreground shadow-sm transition hover:brightness-110"
                  style={{ top, height: alto, borderLeftWidth: 3, ...est }}
                  title={`${b.titulo}${b.subtitulo ? " · " + b.subtitulo : ""}`}
                >
                  <span className="truncate text-[11px] font-semibold leading-none">{b.titulo}</span>
                  {mostrarSub ? (
                    <span className="truncate text-[10px] leading-none text-muted-foreground">
                      {b.subtitulo}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
