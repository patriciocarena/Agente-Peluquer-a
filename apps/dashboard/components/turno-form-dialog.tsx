/**
 * components/turno-form-dialog.tsx — Dialog dual-mode de alta manual y
 * reagendado de turno (APPT-05/06). Mismo shell que `servicio-dialog.tsx`
 * (Dialog + useTransition + toast + setServerError), pero sin
 * react-hook-form: los "campos" son sub-componentes que resuelven su propio
 * estado (`ClienteSearch`, `SlotSelector`, Plan 05 Task 1), no inputs planos.
 *
 * Modo "alta" (D-09/D-10/D-11): cliente → servicios → slot real, y llama
 * `crearTurnoManual`. Modo "reagendar" (D-13/D-14): NO pide cliente ni
 * servicios (fijos, vienen del turno existente), reusa el MISMO
 * `SlotSelector` ya restringido a profesionales elegibles, y llama
 * `reagendarTurno`. Ambos casos delegan el mapeo de error de dominio
 * (slot ocupado / genérico) al copy que ya devuelve la Server Action
 * (`app/actions/turnos.ts`, Plan 04) — nunca un texto hardcodeado distinto.
 */
"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { crearTurnoManual, reagendarTurno } from "@/app/actions/turnos";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ClienteSearch } from "@/components/cliente-search";
import { SlotSelector } from "@/components/slot-selector";
import type { Tables } from "@turnosbot/db-types";

type SlotSeleccionado = { profesionalId: string; inicio: string; fin: string };

function formatHora(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: timezone,
  }).format(new Date(iso));
}

type Props = {
  mode: "alta" | "reagendar";
  /** Solo requerido en modo "reagendar": el turno existente a mover. */
  turno?: { id: string; serviceIds: string[]; clienteId?: string };
  /** Servicios activos del negocio, para las checkboxes del modo "alta". */
  servicios?: Tables<"servicio">[];
  /** D-03: profesional pre-cargado desde el slot-popover de un slot libre. */
  profesionalIdPreload?: string;
  /** D-03: hora local pre-cargada, solo informativa (el dueño igual elige un
   * chip real de `SlotSelector` — nunca se retipea, D-03). */
  horaInicioPreload?: string;
  fecha: string;
  timezone: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function TurnoFormDialog({
  mode,
  turno,
  servicios = [],
  profesionalIdPreload,
  horaInicioPreload,
  fecha,
  timezone,
  open,
  onOpenChange,
}: Props) {
  const isReagendar = mode === "reagendar";

  const [clienteId, setClienteId] = useState<string | undefined>(undefined);
  const [clienteLabel, setClienteLabel] = useState<string | undefined>(undefined);
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [slotSel, setSlotSel] = useState<SlotSeleccionado | null>(null);
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  // Resetea el estado interno cada vez que el Dialog se abre — controlado
  // 100% desde afuera (slot-popover / turno-detail-sheet).
  useEffect(() => {
    if (open) {
      setClienteId(isReagendar ? turno?.clienteId : undefined);
      setClienteLabel(undefined);
      setServiceIds([]);
      setSlotSel(null);
      setServerError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const effectiveServiceIds = isReagendar ? (turno?.serviceIds ?? []) : serviceIds;

  function toggleServicio(servicioId: string, checked: boolean) {
    setServiceIds((prev) =>
      checked ? [...prev, servicioId] : prev.filter((id) => id !== servicioId),
    );
    setSlotSel(null);
  }

  const puedeElegirSlot = isReagendar || (Boolean(clienteId) && effectiveServiceIds.length > 0);
  const puedeGuardar = isReagendar
    ? Boolean(slotSel)
    : Boolean(clienteId) && effectiveServiceIds.length > 0 && Boolean(slotSel);

  function onSubmit() {
    if (!slotSel) return;
    setServerError(null);
    startTransition(async () => {
      const result =
        isReagendar && turno
          ? await reagendarTurno(turno.id, {
              profesionalId: slotSel.profesionalId,
              inicio: slotSel.inicio,
              fin: slotSel.fin,
            })
          : await crearTurnoManual({
              profesionalId: slotSel.profesionalId,
              clienteId: clienteId!,
              serviceIds: effectiveServiceIds,
              inicio: slotSel.inicio,
              fin: slotSel.fin,
            });

      if ("error" in result) {
        setServerError(result.error);
        return;
      }

      toast.success(isReagendar ? "Turno reagendado." : "Turno creado.");
      onOpenChange(false);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setServerError(null);
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isReagendar ? "Reagendar turno" : "Nuevo turno"}</DialogTitle>
          <DialogDescription>
            {isReagendar
              ? "Elegí un nuevo horario para este turno."
              : "Buscá o cargá un cliente, elegí los servicios y un horario disponible."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!isReagendar ? (
            <>
              <div className="space-y-1.5">
                <Label>Cliente</Label>
                {clienteId ? (
                  <div className="flex items-center justify-between rounded-lg border border-border p-2 text-sm">
                    <span>{clienteLabel}</span>
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      onClick={() => {
                        setClienteId(undefined);
                        setClienteLabel(undefined);
                        setSlotSel(null);
                      }}
                    >
                      Cambiar
                    </Button>
                  </div>
                ) : (
                  <ClienteSearch
                    onSelect={(id, label) => {
                      setClienteId(id);
                      setClienteLabel(label);
                    }}
                  />
                )}
              </div>

              <div className="space-y-1.5">
                <Label>Servicios</Label>
                <div className="space-y-2">
                  {servicios.map((servicio) => (
                    <label key={servicio.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={serviceIds.includes(servicio.id)}
                        onCheckedChange={(checked) =>
                          toggleServicio(servicio.id, checked === true)
                        }
                      />
                      {servicio.nombre}
                    </label>
                  ))}
                </div>
              </div>
            </>
          ) : null}

          {puedeElegirSlot ? (
            <div className="space-y-1.5">
              <Label>Horario</Label>
              {!isReagendar && horaInicioPreload && !profesionalIdPreload ? (
                <p className="text-sm text-muted-foreground">
                  Horario sugerido: {horaInicioPreload}.
                </p>
              ) : null}
              <SlotSelector
                serviceIds={effectiveServiceIds}
                fecha={fecha}
                profesionalIdFijo={profesionalIdPreload}
                onSelect={(sel) => setSlotSel(sel)}
              />
              {slotSel ? (
                <p className="text-sm text-muted-foreground">
                  Horario elegido: {formatHora(slotSel.inicio, timezone)} –{" "}
                  {formatHora(slotSel.fin, timezone)}
                </p>
              ) : null}
            </div>
          ) : null}

          {serverError ? (
            <p className="text-sm text-destructive" role="alert">
              {serverError}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" disabled={!puedeGuardar || isPending} onClick={onSubmit}>
            {isPending
              ? "Guardando…"
              : isReagendar
                ? "Confirmar nuevo horario"
                : "Crear turno"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
