/**
 * components/admin/negocio-activo-switch.tsx — toggle de soft-delete de un
 * Negocio, en la row de admin/[tenantId]/page.tsx (SADMIN-02). Mismo
 * patrón que tenant-activo-switch.tsx, copy destructivo propio de Negocio
 * (02-UI-SPEC.md §Copywriting Contract).
 */
"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { setNegocioActivo } from "@/app/actions/admin-tenants";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";

type Props = {
  tenantId: string;
  negocioId: string;
  nombre: string;
  activo: boolean;
};

export function NegocioActivoSwitch({ tenantId, negocioId, nombre, activo }: Props) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function apply(nextActivo: boolean) {
    startTransition(async () => {
      const result = await setNegocioActivo(negocioId, tenantId, nextActivo);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success(nextActivo ? "Peluquería reactivada." : "Peluquería desactivada.");
      setConfirmOpen(false);
    });
  }

  return (
    <>
      <Switch
        checked={activo}
        disabled={isPending}
        aria-label={activo ? `Desactivar ${nombre}` : `Reactivar ${nombre}`}
        onCheckedChange={(checked) => {
          if (checked) {
            apply(true);
          } else {
            setConfirmOpen(true);
          }
        }}
      />
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Desactivar {nombre}?</AlertDialogTitle>
            <AlertDialogDescription>
              Su WhatsApp deja de responder mensajes y no se pueden crear nuevos
              turnos hasta reactivarla; el login del dueño no se ve afectado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isPending}
              onClick={(event) => {
                event.preventDefault();
                apply(false);
              }}
            >
              Desactivar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
