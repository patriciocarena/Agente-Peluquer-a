/**
 * components/admin/negocio-dialog.tsx — Dialog de alta/edición de un
 * Negocio (peluquería) dentro de un Tenant, SADMIN-02.
 *
 * Dos secciones en un solo form, per 02-UI-SPEC.md §CRUD Interaction
 * Pattern: "Datos generales" (nombre, dirección, teléfono, timezone,
 * granularidad) y "WhatsApp" (phone_number_id, waba_id, número visible).
 * NUNCA incluye un campo para la credencial de acceso de WhatsApp — esa
 * carga (y su cifrado) queda diferida a Fase 7 / SEC-01 (D-04, T-02-24).
 */
"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { createNegocio, updateNegocio } from "@/app/actions/admin-tenants";
import {
  negocioAdminSchema,
  type NegocioAdminFormValues,
  type NegocioAdminInput,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import type { Tables } from "@turnosbot/db-types";

type Props = {
  tenantId: string;
  negocio?: Tables<"negocio">;
  trigger: React.ReactNode;
};

const DEFAULT_TIMEZONE = "America/Argentina/Buenos_Aires";

export function NegocioDialog({ tenantId, negocio, trigger }: Props) {
  const isEdit = Boolean(negocio);
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<NegocioAdminFormValues, unknown, NegocioAdminInput>({
    resolver: zodResolver(negocioAdminSchema),
    values: {
      nombre: negocio?.nombre ?? "",
      direccion: negocio?.direccion ?? "",
      telefono: negocio?.telefono ?? "",
      timezone: negocio?.timezone ?? DEFAULT_TIMEZONE,
      granularidad_min: (negocio?.granularidad_min === 15 ? 15 : 30) as 15 | 30,
      whatsapp_phone_number_id: negocio?.whatsapp_phone_number_id ?? "",
      waba_id: negocio?.waba_id ?? "",
      display_phone_number: negocio?.display_phone_number ?? "",
    },
  });

  function onSubmit(values: NegocioAdminInput) {
    setServerError(null);
    startTransition(async () => {
      const result = isEdit
        ? await updateNegocio(negocio!.id, tenantId, values)
        : await createNegocio(tenantId, values);
      if (result?.error) {
        setServerError(result.error);
        return;
      }
      toast.success(isEdit ? "Peluquería actualizada." : "Peluquería creada.");
      if (!isEdit) {
        form.reset();
      }
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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar peluquería" : "Nueva peluquería"}</DialogTitle>
          <DialogDescription>
            Datos generales y configuración de WhatsApp de la peluquería. La
            credencial de acceso de WhatsApp se agrega en una fase posterior.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <p className="text-sm font-semibold text-foreground">Datos generales</p>
            <FormField
              control={form.control}
              name="nombre"
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
              control={form.control}
              name="direccion"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Dirección</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="telefono"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Teléfono</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="timezone"
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
            <FormField
              control={form.control}
              name="granularidad_min"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Granularidad de grilla</FormLabel>
                  <Select
                    value={String(field.value)}
                    onValueChange={(value) => field.onChange(Number(value))}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="15">15 minutos</SelectItem>
                      <SelectItem value="30">30 minutos</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Separator />
            <p className="text-sm font-semibold text-foreground">WhatsApp</p>
            <FormField
              control={form.control}
              name="whatsapp_phone_number_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone number ID</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="waba_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>WABA ID</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="display_phone_number"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Número visible</FormLabel>
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
                {isEdit ? "Guardar cambios" : "Crear peluquería"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
