/**
 * components/bloqueo-popover.tsx — Popover de detalle+eliminación de un
 * bloqueo manual existente (D-05, APPT-02). Muestra el `motivo` (o "Sin
 * motivo especificado" si es null, D-12: el motivo nunca es obligatorio) y
 * un botón destructivo "Eliminar bloqueo" con confirmación (`AlertDialog`,
 * molde de `profesionales-table.tsx`). Al eliminar, el slot vuelve a estar
 * disponible (T-04-17: `eliminarBloqueo` scopea server-side por
 * `negocio_id`, este componente no puede saltear ese scoping).
 *
 * Completamente controlado desde afuera (`open`/`onOpenChange`) — lo monta
 * la grilla (Plan 07) sobre la celda de bloqueo clickeada.
 *
 * `anchor` (Rule 2, Plan 07): prop opcional que resuelve el anclaje visual
 * dejado abierto por Plan 06 ("el anclaje visual contra la celda específica
 * queda a resolver por Plan 07 al montarlo") — sin ella, el `Popover` no
 * tiene `Trigger`/`Anchor` propio y Radix no puede calcular una posición
 * relativa a la celda clickeada. Si no se pasa, el comportamiento es
 * idéntico al de Plan 06 (Popover sin anchor explícito).
 */
"use client";

import { useState, useTransition } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";

import { eliminarBloqueo } from "@/app/actions/bloqueos";
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
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";

type Props = {
  bloqueo: { id: string; motivo: string | null };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Celda de bloqueo que este Popover debe anclar visualmente (Plan 07). */
  anchor?: ReactNode;
};

export function BloqueoPopover({ bloqueo, open, onOpenChange, anchor }: Props) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function eliminar() {
    startTransition(async () => {
      const result = await eliminarBloqueo(bloqueo.id);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Bloqueo eliminado.");
      setConfirmOpen(false);
      onOpenChange(false);
    });
  }

  return (
    <>
      <Popover open={open} onOpenChange={onOpenChange}>
        {anchor ? <PopoverAnchor asChild>{anchor}</PopoverAnchor> : null}
        <PopoverContent>
          {bloqueo.motivo ? (
            <p className="text-sm">{bloqueo.motivo}</p>
          ) : (
            <p className="text-sm text-muted-foreground">Sin motivo especificado</p>
          )}
          <Button
            type="button"
            variant="destructive"
            size="sm"
            aria-label="Eliminar bloqueo"
            disabled={isPending}
            onClick={() => setConfirmOpen(true)}
          >
            Eliminar bloqueo
          </Button>
        </PopoverContent>
      </Popover>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Eliminar este bloqueo? El horario vuelve a estar disponible.
            </AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isPending}
              onClick={(event) => {
                event.preventDefault();
                eliminar();
              }}
            >
              {isPending ? "Eliminando…" : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
