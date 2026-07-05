/**
 * app/(owner)/negocio/negocio-form.tsx — Client Component del form de Perfil
 * del negocio (BIZ-01/02/03). Se separa de `page.tsx` porque `page.tsx` es un
 * Server Component (necesita `await getNegocioActivo()` para cargar el
 * negocio activo) y react-hook-form/zodResolver requieren "use client";
 * Next.js no permite mezclar ambas directivas en un mismo archivo.
 *
 * No estaba en el `files_modified` original del Task 2 (que solo listaba
 * page.tsx), pero es estructuralmente necesario por la razón de arriba —
 * mismo tipo de deviation (Rule 3) que `app/actions/negocio-activo.ts` en
 * Task 1. Documentado en el Summary.
 *
 * react-hook-form + zodResolver(negocioSchema) da UX client-side (mismo
 * patrón que `app/(auth)/login/page.tsx`); `updateNegocio` (Server Action)
 * re-valida y es la fuente de verdad real.
 */
"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { updateNegocio } from "@/app/actions/negocio";
import { negocioSchema, type NegocioInput } from "@/lib/schemas/negocio";
import type { Tables } from "@turnosbot/db-types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Props = {
  negocio: Tables<"negocio">;
};

// horario_general es jsonb "display only" (0001_schema_core.sql): en este
// form se edita como un resumen de texto libre; si algún dato legado no es
// un string plano, se muestra serializado para no perder la información.
function horarioGeneralComoTexto(valor: Tables<"negocio">["horario_general"]): string {
  if (typeof valor === "string") return valor;
  if (valor === null || valor === undefined) return "";
  return JSON.stringify(valor);
}

export function NegocioForm({ negocio }: Props) {
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<NegocioInput>({
    resolver: zodResolver(negocioSchema),
    defaultValues: {
      nombre: negocio.nombre,
      direccion: negocio.direccion ?? "",
      telefono: negocio.telefono ?? "",
      timezone: negocio.timezone,
      granularidad_min: negocio.granularidad_min === 15 ? 15 : 30,
      horario_general: horarioGeneralComoTexto(negocio.horario_general),
    },
    mode: "onBlur",
  });

  function onSubmit(values: NegocioInput) {
    setServerError(null);
    startTransition(async () => {
      const result = await updateNegocio(values);
      if ("error" in result) {
        setServerError(result.error);
        return;
      }
      toast.success("Cambios guardados.");
    });
  }

  return (
    <Card className="mt-4">
      <CardContent className="pt-6">
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
              name="direccion"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Dirección</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} />
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
                    <Input {...field} value={field.value ?? ""} />
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
                  <FormLabel>Zona horaria</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="America/Argentina/Buenos_Aires" />
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
                  <FormLabel>Granularidad de la grilla</FormLabel>
                  <Select
                    value={String(field.value)}
                    onValueChange={(value) => field.onChange(Number(value))}
                  >
                    <FormControl>
                      <SelectTrigger aria-label="Granularidad de la grilla">
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
            <FormField
              control={form.control}
              name="horario_general"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Horario general (resumen)</FormLabel>
                  <FormControl>
                    <Textarea {...field} value={field.value ?? ""} rows={3} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="space-y-1 rounded-md border border-dashed p-3">
              <p className="text-sm font-medium">WhatsApp vinculado</p>
              <p className="text-sm text-muted-foreground">
                {negocio.display_phone_number ?? "Sin número vinculado todavía"}
              </p>
              <p className="text-xs text-muted-foreground">
                Este dato lo configura el superadmin de la plataforma.
              </p>
            </div>
            {serverError ? (
              <p className="text-sm text-destructive" role="alert">
                {serverError}
              </p>
            ) : null}
            <Button type="submit" disabled={isPending}>
              Guardar cambios
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
