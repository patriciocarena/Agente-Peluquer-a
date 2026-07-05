/**
 * components/horario-editor.tsx — editor del horario semanal recurrente de
 * un profesional (PRO-02), 02-UI-SPEC.md §Weekly Schedule Editor. Client
 * Component: 7 filas siempre visibles (Lunes–Domingo, nombres completos en
 * español, nunca abreviados), cada una con una lista horizontal de bloques
 * `[time]–[time][× quitar]` (aria-label="Quitar bloque horario"), botón
 * ghost "+ Agregar bloque", botón secundario "Copiar a todos los días" (con
 * undo toast Sonner de 5s), inputs `<input type="time">` con `step` según la
 * granularidad del negocio activo (BIZ-03), y "Cerrado" (12px, muted,
 * itálica) para un día sin bloques.
 *
 * Estado 100% local (React state) hasta que el owner presiona "Guardar
 * cambios" en la página contenedora — mismo espíritu que
 * `components/servicios-table.tsx` (estado optimista client-side, persistido
 * recién al final). El solapamiento se valida con `bloquesSolapan`
 * (lib/schemas/horario.ts) antes de permitir guardar: un bloque nuevo que
 * solapa con uno existente del mismo día se agrega igual (no bloqueamos la
 * edición en curso) pero se marca con un mensaje de error inline y deshabilita
 * el guardado hasta corregirlo.
 */
"use client";

import { useImperativeHandle, type Ref } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";

import { bloquesSolapan, DIAS_SEMANA, type Bloque, type DiaSemana, type HorarioInput } from "@/lib/schemas/horario";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const NOMBRE_DIA: Record<DiaSemana, string> = {
  lunes: "Lunes",
  martes: "Martes",
  miercoles: "Miércoles",
  jueves: "Jueves",
  viernes: "Viernes",
  sabado: "Sábado",
  domingo: "Domingo",
};

function diaVacio(): { bloques: Bloque[] } {
  return { bloques: [] };
}

export function horarioVacio(): HorarioInput {
  return {
    lunes: diaVacio(),
    martes: diaVacio(),
    miercoles: diaVacio(),
    jueves: diaVacio(),
    viernes: diaVacio(),
    sabado: diaVacio(),
    domingo: diaVacio(),
  };
}

function diaTieneSolapamiento(bloques: Bloque[]): boolean {
  for (let i = 0; i < bloques.length; i++) {
    for (let j = i + 1; j < bloques.length; j++) {
      if (bloquesSolapan(bloques[i], bloques[j])) return true;
    }
  }
  return false;
}

function diaTieneOrdenInvalido(bloques: Bloque[]): boolean {
  return bloques.some((bloque) => bloque.hora_inicio >= bloque.hora_fin);
}

export type HorarioEditorHandle = {
  /** true si algún día tiene un bloque inválido (orden u solapamiento). */
  tieneErrores: () => boolean;
};

type Props = {
  value: HorarioInput;
  onChange: (next: HorarioInput) => void;
  /** Granularidad de grilla del negocio activo (BIZ-03: 15 o 30 minutos). */
  granularidadMin: number;
  handleRef?: Ref<HorarioEditorHandle>;
};

export function HorarioEditor({ value, onChange, granularidadMin, handleRef }: Props) {
  useImperativeHandle(handleRef, () => ({
    tieneErrores: () =>
      DIAS_SEMANA.some((dia) => {
        const bloques = value[dia].bloques;
        return diaTieneOrdenInvalido(bloques) || diaTieneSolapamiento(bloques);
      }),
  }));

  function actualizarDia(dia: DiaSemana, bloques: Bloque[]) {
    onChange({ ...value, [dia]: { bloques } });
  }

  function agregarBloque(dia: DiaSemana) {
    actualizarDia(dia, [...value[dia].bloques, { hora_inicio: "09:00", hora_fin: "18:00" }]);
  }

  function quitarBloque(dia: DiaSemana, index: number) {
    actualizarDia(
      dia,
      value[dia].bloques.filter((_, i) => i !== index),
    );
  }

  function actualizarBloque(dia: DiaSemana, index: number, campo: keyof Bloque, nuevoValor: string) {
    actualizarDia(
      dia,
      value[dia].bloques.map((bloque, i) => (i === index ? { ...bloque, [campo]: nuevoValor } : bloque)),
    );
  }

  function copiarATodosLosDias() {
    const primerDiaConfigurado = DIAS_SEMANA.find((dia) => value[dia].bloques.length > 0);
    if (!primerDiaConfigurado) return;

    const bloquesFuente = value[primerDiaConfigurado].bloques;
    const anterior = value;
    const siguiente = DIAS_SEMANA.reduce((acc, dia) => {
      acc[dia] = { bloques: bloquesFuente.map((bloque) => ({ ...bloque })) };
      return acc;
    }, {} as HorarioInput);

    onChange(siguiente);

    toast("Horario copiado a todos los días.", {
      duration: 5000,
      action: {
        label: "Deshacer",
        onClick: () => {
          onChange(anterior);
        },
      },
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Definí los bloques horarios en los que este profesional atiende cada día.
        </p>
        <Button type="button" variant="secondary" size="sm" onClick={copiarATodosLosDias}>
          Copiar a todos los días
        </Button>
      </div>

      <div className="space-y-4">
        {DIAS_SEMANA.map((dia) => {
          const bloques = value[dia].bloques;
          const hayError = diaTieneOrdenInvalido(bloques) || diaTieneSolapamiento(bloques);

          return (
            <div key={dia} className="space-y-2">
              <Label className="text-sm font-medium">{NOMBRE_DIA[dia]}</Label>

              {bloques.length === 0 ? (
                <p className="text-xs italic text-muted-foreground">Cerrado</p>
              ) : (
                <div className="space-y-2">
                  {bloques.map((bloque, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <Input
                        type="time"
                        step={granularidadMin * 60}
                        value={bloque.hora_inicio}
                        onChange={(event) => actualizarBloque(dia, index, "hora_inicio", event.target.value)}
                        className="w-32"
                        aria-label={`Hora de inicio, bloque ${index + 1} de ${NOMBRE_DIA[dia]}`}
                      />
                      <span className="text-sm text-muted-foreground">–</span>
                      <Input
                        type="time"
                        step={granularidadMin * 60}
                        value={bloque.hora_fin}
                        onChange={(event) => actualizarBloque(dia, index, "hora_fin", event.target.value)}
                        className="w-32"
                        aria-label={`Hora de fin, bloque ${index + 1} de ${NOMBRE_DIA[dia]}`}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Quitar bloque horario"
                        onClick={() => quitarBloque(dia, index)}
                      >
                        <X className="size-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {hayError ? (
                <p className="text-xs text-destructive" role="alert">
                  Revisá los bloques de {NOMBRE_DIA[dia]}: la hora de fin debe ser posterior a la
                  de inicio y los bloques no pueden solaparse.
                </p>
              ) : null}

              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-xs"
                onClick={() => agregarBloque(dia)}
              >
                + Agregar bloque
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
