/**
 * components/turno-detail-sheet.tsx — panel de detalle de un turno
 * confirmado (D-04, APPT-03), con acciones de reagendar y cancelar
 * (APPT-04/05). `Sheet` lateral (no `Dialog`) porque el detalle puede
 * coexistir visualmente con la grilla de fondo.
 *
 * Cancelar (D-12): confirmación simple SIN campo de motivo — mismo molde de
 * `AlertDialog` que `profesionales-table.tsx` usa para desactivar un
 * profesional, pero sin `AlertDialogDescription`. Llama `cancelarTurno`
 * (Plan 04); nunca borra la fila.
 *
 * Reagendar: abre el MISMO `turno-form-dialog.tsx` en `mode="reagendar"`
 * (Task 2), pasando los `serviceIds` del turno — no un flujo propio.
 */
"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { cancelarTurno } from "@/app/actions/turnos";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { TurnoFormDialog } from "@/components/turno-form-dialog";

const currencyFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

function formatHora(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: timezone,
  }).format(new Date(iso));
}

export type TurnoDetalle = {
  id: string;
  clienteNombre: string | null;
  clienteTelefono: string;
  profesionalNombre: string;
  inicio: string;
  fin: string;
  precioTotal: number | null;
  servicios: { nombre_snapshot: string; precio_snapshot: number }[];
  serviceIds: string[];
  profesionalId: string;
};

type Props = {
  turno: TurnoDetalle;
  fecha: string;
  timezone: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function TurnoDetailSheet({ turno, fecha, timezone, open, onOpenChange }: Props) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reagendarOpen, setReagendarOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function cancelar() {
    startTransition(async () => {
      const result = await cancelarTurno(turno.id);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Turno cancelado.");
      setConfirmOpen(false);
      onOpenChange(false);
    });
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right">
          <SheetHeader>
            <SheetTitle>Turno de {turno.clienteNombre ?? turno.clienteTelefono}</SheetTitle>
          </SheetHeader>
          <div className="flex-1 space-y-4 overflow-y-auto px-4">
            <div className="space-y-1.5">
              {turno.servicios.map((servicio, index) => (
                <div
                  key={`${servicio.nombre_snapshot}-${index}`}
                  className="flex items-center justify-between text-sm"
                >
                  <span>{servicio.nombre_snapshot}</span>
                  <span>{currencyFormatter.format(servicio.precio_snapshot)}</span>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between border-t border-border pt-2 text-sm font-semibold">
              <span>Total</span>
              <span>{currencyFormatter.format(turno.precioTotal ?? 0)}</span>
            </div>
            <div className="space-y-1 text-sm text-muted-foreground">
              <p>
                {formatHora(turno.inicio, timezone)} – {formatHora(turno.fin, timezone)}
              </p>
              <p>{turno.profesionalNombre}</p>
            </div>
          </div>
          <SheetFooter className="flex-row justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => setReagendarOpen(true)}
            >
              Reagendar
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={isPending}
              onClick={() => setConfirmOpen(true)}
            >
              Cancelar turno
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Seguro que querés cancelar este turno?</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Volver</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isPending}
              onClick={(event) => {
                event.preventDefault();
                cancelar();
              }}
            >
              {isPending ? "Cancelando…" : "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <TurnoFormDialog
        mode="reagendar"
        turno={{ id: turno.id, serviceIds: turno.serviceIds }}
        fecha={fecha}
        timezone={timezone}
        open={reagendarOpen}
        onOpenChange={setReagendarOpen}
        onSuccess={() => onOpenChange(false)}
      />
    </>
  );
}
