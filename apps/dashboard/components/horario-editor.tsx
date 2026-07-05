/**
 * components/horario-editor.tsx — editor del horario semanal recurrente de
 * un profesional (PRO-02), usado en
 * `app/(owner)/profesionales/[id]/editar/page.tsx`.
 *
 * 7 filas siempre visibles (Lunes–Domingo, nombres completos en español —
 * 02-UI-SPEC.md §Weekly Schedule Editor), cada una con una lista de bloques
 * horarios `{hora_inicio, hora_fin}` editables con `<input type="time">`
 * (step según la granularidad del negocio activo, BIZ-03), "+ Agregar
 * bloque" por día, "Copiar a todos los días" (copia los bloques del primer
 * día configurado — en orden Lunes..Domingo — a los otros 6, con undo toast
 * Sonner de 5s), y un día sin bloques se muestra como "Cerrado".
 *
 * Estado 100% client-side (sin react-hook-form: la estructura anidada
 * 7-días-x-N-bloques con altas/bajas dinámicas es más simple de modelar con
 * `useState` + los helpers puros de `lib/schemas/horario.ts` que con
 * `useFieldArray` anidado). Valida solapamiento en vivo con
 * `tieneBloquesSolapados` antes de habilitar el guardado, y re-valida con
 * `horarioSchema` completo antes de llamar a la Server Action `updateHorario`
 * (02-07 Task 3) — la validación client-side es solo UX, la Server Action
 * es la fuente de verdad (02-RESEARCH.md Anti-Patterns).
 */
"use client";

import { useState, useTransition } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";

import { updateHorario } from "@/app/actions/profesionales";
import {
  DIAS_SEMANA_LABELS,
  DIAS_SEMANA_ORDEN_UI,
  horarioSchema,
  tieneBloquesSolapados,
  type BloqueHorario,
  type DiaHorario,
} from "@/lib/schemas/horario";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Props = {
  profesionalId: string;
  /** Siempre 7 entradas, una por cada `dia_semana` (0=domingo..6=sábado). */
  horarioInicial: DiaHorario[];
  /** `negocio.granularidad_min` (BIZ-03: 15 o 30) — step del input time en minutos. */
  stepMinutos: number;
};

function crearBloqueVacio(): BloqueHorario {
  return { hora_inicio: "09:00", hora_fin: "18:00" };
}

export function HorarioEditor({ profesionalId, horarioInicial, stepMinutos }: Props) {
  const [dias, setDias] = useState<DiaHorario[]>(horarioInicial);
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  function diaPorSemana(dia_semana: number): DiaHorario {
    return dias.find((d) => d.dia_semana === dia_semana) ?? { dia_semana, bloques: [] };
  }

  function actualizarDia(dia_semana: number, bloques: BloqueHorario[]) {
    setServerError(null);
    setDias((current) =>
      current.map((d) => (d.dia_semana === dia_semana ? { ...d, bloques } : d)),
    );
  }

  function agregarBloque(dia_semana: number) {
    const dia = diaPorSemana(dia_semana);
    actualizarDia(dia_semana, [...dia.bloques, crearBloqueVacio()]);
  }

  function quitarBloque(dia_semana: number, index: number) {
    const dia = diaPorSemana(dia_semana);
    actualizarDia(
      dia_semana,
      dia.bloques.filter((_, i) => i !== index),
    );
  }

  function actualizarBloque(
    dia_semana: number,
    index: number,
    campo: "hora_inicio" | "hora_fin",
    valor: string,
  ) {
    const dia = diaPorSemana(dia_semana);
    actualizarDia(
      dia_semana,
      dia.bloques.map((bloque, i) => (i === index ? { ...bloque, [campo]: valor } : bloque)),
    );
  }

  function copiarATodosLosDias() {
    const primerDiaConfigurado = DIAS_SEMANA_ORDEN_UI.map((d) => diaPorSemana(d)).find(
      (dia) => dia.bloques.length > 0,
    );
    if (!primerDiaConfigurado) return;

    const anterior = dias;
    setDias((current) =>
      current.map((d) =>
        d.dia_semana === primerDiaConfigurado.dia_semana
          ? d
          : { ...d, bloques: primerDiaConfigurado.bloques.map((bloque) => ({ ...bloque })) },
      ),
    );

    toast("Se copiaron los bloques a todos los días.", {
      duration: 5000,
      action: {
        label: "Deshacer",
        onClick: () => setDias(anterior),
      },
    });
  }

  function handleGuardar() {
    setServerError(null);

    const haySolapados = dias.some((dia) => tieneBloquesSolapados(dia.bloques));
    if (haySolapados) {
      setServerError("Hay bloques horarios solapados. Revisá los horarios marcados.");
      return;
    }

    const parsed = horarioSchema.safeParse({ dias });
    if (!parsed.success) {
      setServerError("Revisá los horarios: formato inválido o fin anterior al inicio.");
      return;
    }

    startTransition(async () => {
      const result = await updateHorario(profesionalId, parsed.data.dias);
      if (result?.error) {
        setServerError(result.error);
        return;
      }
      toast.success("Horario guardado.");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Horario semanal</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          {DIAS_SEMANA_ORDEN_UI.map((dia_semana) => {
            const dia = diaPorSemana(dia_semana);
            return (
              <div key={dia_semana} className="flex flex-col gap-2 sm:flex-row sm:items-start">
                <div className="w-28 shrink-0 pt-1 text-sm font-medium">
                  {DIAS_SEMANA_LABELS[dia_semana]}
                </div>
                <div className="flex flex-1 flex-col gap-2">
                  {dia.bloques.length === 0 ? (
                    <p className="text-xs italic text-muted-foreground">Cerrado</p>
                  ) : (
                    dia.bloques.map((bloque, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <Input
                          type="time"
                          step={stepMinutos * 60}
                          value={bloque.hora_inicio}
                          onChange={(event) =>
                            actualizarBloque(dia_semana, index, "hora_inicio", event.target.value)
                          }
                          className="w-28"
                        />
                        <span className="text-muted-foreground">–</span>
                        <Input
                          type="time"
                          step={stepMinutos * 60}
                          value={bloque.hora_fin}
                          onChange={(event) =>
                            actualizarBloque(dia_semana, index, "hora_fin", event.target.value)
                          }
                          className="w-28"
                        />
                        <button
                          type="button"
                          aria-label="Quitar bloque horario"
                          onClick={() => quitarBloque(dia_semana, index)}
                          className="text-muted-foreground transition-colors hover:text-destructive"
                        >
                          <X className="size-4" />
                        </button>
                      </div>
                    ))
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="w-fit text-xs"
                    onClick={() => agregarBloque(dia_semana)}
                  >
                    <Plus className="size-3" />
                    Agregar bloque
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        <Button type="button" variant="secondary" onClick={copiarATodosLosDias}>
          Copiar a todos los días
        </Button>

        {serverError ? (
          <p className="text-sm text-destructive" role="alert">
            {serverError}
          </p>
        ) : null}

        <div>
          <Button type="button" onClick={handleGuardar} disabled={isPending}>
            Guardar cambios
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
