/**
 * components/admin/tenant-dialog.tsx — Dialog de alta/edición de un Tenant
 * (grupo), SADMIN-01.
 *
 * Modo EDITAR (`tenant` presente): un único campo `nombre`, per
 * 02-UI-SPEC.md §CRUD Interaction Pattern ("Superadmin Tenant (grupo):
 * Dialog con un único campo: nombre").
 *
 * Modo CREAR (`tenant` ausente): el Tenant post-migración 0003 es un
 * contenedor sin más datos propios que `nombre` — pero D-08/D-12 fijan
 * "1 owner = 1 Tenant" y Pattern 3 (02-RESEARCH.md) crea el Tenant, su
 * dueño y su primer Negocio en UNA transacción compensatoria (si falla
 * cualquier insert Postgres se borra el auth.user recién creado). Sin
 * capturar acá el email/contraseña del dueño y los datos mínimos del
 * primer Negocio, el alta de un grupo nuevo dejaría un Tenant sin ningún
 * usuario que pueda iniciar sesión — por eso el formulario de "crear"
 * agrega las secciones "Dueño" y "Primera peluquería" además del nombre
 * del grupo (deviation Rule 2 sobre el UI-SPEC, documentada en el
 * Summary de este plan).
 */
"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { createTenantWithNegocio, updateTenant } from "@/app/actions/admin-tenants";
import {
  createTenantWithNegocioSchema,
  tenantSchema,
  type CreateTenantWithNegocioFormValues,
  type CreateTenantWithNegocioInput,
  type TenantInput,
} from "@/lib/schemas/admin";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import type { Tables } from "@turnosbot/db-types";

type Props = {
  tenant?: Tables<"tenant">;
  trigger: React.ReactNode;
};

const DEFAULT_TIMEZONE = "America/Argentina/Buenos_Aires";
const DEFAULT_GRANULARIDAD = 30;

export function TenantDialog({ tenant, trigger }: Props) {
  const isEdit = Boolean(tenant);
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const createForm = useForm<
    CreateTenantWithNegocioFormValues,
    unknown,
    CreateTenantWithNegocioInput
  >({
    resolver: zodResolver(createTenantWithNegocioSchema),
    defaultValues: {
      tenantNombre: "",
      ownerEmail: "",
      ownerPassword: "",
      negocio: {
        nombre: "",
        direccion: "",
        telefono: "",
        timezone: DEFAULT_TIMEZONE,
        granularidad_min: DEFAULT_GRANULARIDAD,
        whatsapp_phone_number_id: "",
        waba_id: "",
        display_phone_number: "",
      },
    },
  });

  const editForm = useForm<TenantInput>({
    resolver: zodResolver(tenantSchema),
    values: { nombre: tenant?.nombre ?? "" },
  });

  function onCreateSubmit(values: CreateTenantWithNegocioInput) {
    setServerError(null);
    startTransition(async () => {
      const result = await createTenantWithNegocio(values);
      if (result?.error) {
        setServerError(result.error);
        return;
      }
      toast.success("Grupo y primera peluquería creados.");
      createForm.reset();
      setOpen(false);
    });
  }

  function onEditSubmit(values: TenantInput) {
    if (!tenant) return;
    setServerError(null);
    startTransition(async () => {
      const result = await updateTenant(tenant.id, values);
      if (result?.error) {
        setServerError(result.error);
        return;
      }
      toast.success("Grupo actualizado.");
      setOpen(false);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setServerError(null);
        setOpen(nextOpen);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className={isEdit ? "sm:max-w-sm" : "sm:max-w-lg"}>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar grupo" : "Nuevo grupo"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Actualizá el nombre de este grupo."
              : "Creá el grupo, su dueño y su primera peluquería."}
          </DialogDescription>
        </DialogHeader>

        {isEdit ? (
          <Form {...editForm}>
            <form
              onSubmit={editForm.handleSubmit(onEditSubmit)}
              className="space-y-4"
              noValidate
            >
              <FormField
                control={editForm.control}
                name="nombre"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre del grupo</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {serverError ? (
                <p className="text-sm text-destructive" role="alert">
                  {serverError}
                </p>
              ) : null}
              <DialogFooter>
                <Button type="submit" disabled={isPending}>
                  Guardar cambios
                </Button>
              </DialogFooter>
            </form>
          </Form>
        ) : (
          <Form {...createForm}>
            <form
              onSubmit={createForm.handleSubmit(onCreateSubmit)}
              className="space-y-4"
              noValidate
            >
              <p className="text-sm font-semibold text-foreground">Grupo</p>
              <FormField
                control={createForm.control}
                name="tenantNombre"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre del grupo</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Separator />
              <p className="text-sm font-semibold text-foreground">Dueño</p>
              <FormField
                control={createForm.control}
                name="ownerEmail"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" autoComplete="off" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={createForm.control}
                name="ownerPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contraseña provisoria</FormLabel>
                    <FormControl>
                      <Input type="password" autoComplete="off" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Separator />
              <p className="text-sm font-semibold text-foreground">Primera peluquería</p>
              <FormField
                control={createForm.control}
                name="negocio.nombre"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={createForm.control}
                name="negocio.timezone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Timezone</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {serverError ? (
                <p className="text-sm text-destructive" role="alert">
                  {serverError}
                </p>
              ) : null}
              <DialogFooter>
                <Button type="submit" disabled={isPending}>
                  Crear grupo
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
