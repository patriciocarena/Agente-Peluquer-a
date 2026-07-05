/**
 * components/profesional-form.tsx — Client Component del form de
 * "Datos generales" del profesional (PRO-01), usado tanto en
 * `app/(owner)/profesionales/nuevo/page.tsx` (alta) como en la futura
 * `app/(owner)/profesionales/[id]/editar/page.tsx` (edición, fuera de
 * alcance de este plan). Se separa de las páginas Server Component porque
 * react-hook-form/zodResolver requieren "use client" — mismo motivo que
 * `app/(owner)/negocio/negocio-form.tsx` (02-04).
 *
 * Estructura deliberadamente en secciones separadas por `xl` (32px,
 * 02-UI-SPEC.md §Spacing Scale) para que 02-07 pueda insertar debajo, sin
 * reescribir este componente, las secciones "Horario semanal" (PRO-02) y
 * "Servicios que realiza" (PRO-03/04) — el comentario `SECCIÓN 02-07` marca
 * exactamente dónde.
 */
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { createProfesional, updateProfesional } from "@/app/actions/profesionales";
import { profesionalSchema, type ProfesionalInput } from "@/lib/schemas/profesional";
import type { z } from "zod";
import type { Tables } from "@turnosbot/db-types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";

type Props = {
  profesional?: Tables<"profesional">;
};

// `profesionalSchema.activo` usa `.default(true)`: el tipo de ENTRADA del
// form (lo que react-hook-form maneja antes de validar) hace `activo`
// opcional, mientras que `ProfesionalInput` (z.infer, tipo de SALIDA tras
// aplicar el default) lo exige boolean. `useForm` se tipa con el de entrada
// (z.input) porque es lo que RHF realmente produce; `onSubmit` normaliza a
// `ProfesionalInput` antes de llamar a la Server Action.
type ProfesionalFormValues = z.input<typeof profesionalSchema>;

export function ProfesionalForm({ profesional }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<ProfesionalFormValues>({
    resolver: zodResolver(profesionalSchema),
    defaultValues: {
      nombre: profesional?.nombre ?? "",
      activo: profesional?.activo ?? true,
    },
    mode: "onBlur",
  });

  function onSubmit(values: ProfesionalFormValues) {
    setServerError(null);
    const parsedValues: ProfesionalInput = {
      nombre: values.nombre,
      activo: values.activo ?? true,
    };
    startTransition(async () => {
      const result = profesional
        ? await updateProfesional(profesional.id, parsedValues)
        : await createProfesional(parsedValues);

      if (result?.error) {
        setServerError(result.error);
        return;
      }

      toast.success(
        profesional ? "Profesional actualizado." : "Profesional creado.",
      );
      router.push("/profesionales");
      router.refresh();
    });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8" noValidate>
        <Card>
          <CardHeader>
            <CardTitle>Datos generales</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="nombre"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Ej: Juan Pérez" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/*
          SECCIÓN 02-07: acá se insertan, cada una en su propio Card
          separado por `space-y-8` (32px, xl) del anterior, sin tocar la
          sección de arriba:
            - "Horario semanal" (PRO-02, editor multi-bloque por día)
            - "Servicios que realiza" (PRO-03/04, matriz checkbox + precio
              custom)
        */}

        {serverError ? (
          <p className="text-sm text-destructive" role="alert">
            {serverError}
          </p>
        ) : null}

        <Button type="submit" disabled={isPending}>
          Guardar
        </Button>
      </form>
    </Form>
  );
}
