/**
 * components/admin/tenant-activo-switch.tsx — toggle de soft-delete de un
 * Tenant (grupo), en la row de admin/page.tsx (SADMIN-01). Reactivar
 * (Switch on) aplica directo; desactivar (Switch off) abre el AlertDialog
 * destructivo con el copy exacto de 02-UI-SPEC.md §Copywriting Contract.
 */
"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { setTenantActivo } from "@/app/actions/admin-tenants";
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
  nombre: string;
  activo: boolean;
};

export function TenantActivoSwitch({ tenantId, nombre, activo }: Props) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function apply(nextActivo: boolean) {
    startTransition(async () => {
      const result = await setTenantActivo(tenantId, nextActivo);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success(nextActivo ? "Grupo reactivado." : "Grupo desactivado.");
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
            <AlertDialogTitle>¿Desactivar el grupo {nombre}?</AlertDialogTitle>
            <AlertDialogDescription>
              El dueño no va a poder iniciar sesión hasta reactivarlo. Esto no
              desactiva sus peluquerías por separado.
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
