/**
 * components/servicio-dialog.tsx — Dialog de alta/edición de un Servicio
 * (SVC-01), 02-UI-SPEC.md §CRUD Interaction Pattern: modal simple de 4
 * campos (nombre, descripción, precio, duración) — mismo patrón que
 * `components/admin/negocio-dialog.tsx` (02-04), reutilizado create/edit vía
 * la prop opcional `servicio`.
 */
"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { createServicio, updateServicio } from "@/app/actions/servicios";
import { servicioSchema, type ServicioInput } from "@/lib/schemas/servicio";
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
import { Textarea } from "@/components/ui/textarea";
import type { Tables } from "@turnosbot/db-types";

type Props = {
  servicio?: Tables<"servicio">;
  trigger: React.ReactNode;
};

export function ServicioDialog({ servicio, trigger }: Props) {
  const isEdit = Boolean(servicio);
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<ServicioInput>({
    resolver: zodResolver(servicioSchema),
    values: {
      nombre: servicio?.nombre ?? "",
      descripcion: servicio?.descripcion ?? "",
      precio: servicio?.precio ?? 0,
      duracion_min: servicio?.duracion_min ?? 30,
    },
  });

  function onSubmit(values: ServicioInput) {
    setServerError(null);
    startTransition(async () => {
      const result = isEdit
        ? await updateServicio(servicio!.id, values)
        : await createServicio(values);
      if ("error" in result) {
        setServerError(result.error);
        return;
      }
      toast.success(isEdit ? "Servicio actualizado." : "Servicio creado.");
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar servicio" : "Nuevo servicio"}</DialogTitle>
          <DialogDescription>
            Nombre, descripción, precio y duración del servicio.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
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
              name="descripcion"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descripción</FormLabel>
                  <FormControl>
                    <Textarea {...field} value={field.value ?? ""} rows={3} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="precio"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Precio</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      inputMode="decimal"
                      {...field}
                      onChange={(event) => field.onChange(event.target.valueAsNumber)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="duracion_min"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Duración (minutos)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={1}
                      step="1"
                      inputMode="numeric"
                      {...field}
                      onChange={(event) => field.onChange(event.target.valueAsNumber)}
                    />
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
                {isEdit ? "Guardar cambios" : "Crear servicio"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
