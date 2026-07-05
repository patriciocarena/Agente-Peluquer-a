/**
 * components/profesional-editar-form.tsx — form combinado de la página de
 * edición de un profesional (PRO-01/02/03/04). Client Component: reusa
 * react-hook-form + zodResolver para "Datos generales" (mismo schema que
 * `components/profesional-form.tsx`), y estado local (useState) para el
 * horario semanal (`horario-editor.tsx`) y la matriz de servicios
 * (`servicios-matrix.tsx`) — ambos se persisten recién al presionar
 * "Guardar cambios", momento en el que se llaman en secuencia
 * `updateProfesional`, `updateHorario` y `updateServiciosMatrix`
 * (`app/actions/profesionales.ts`). Si alguna falla, se muestra el error y
 * no se navega — el owner puede reintentar sin perder lo ya tipeado (todo
 * sigue en estado local).
 */
"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import type { Tables } from "@turnosbot/db-types";
import type { z } from "zod";

import {
  updateHorario,
  updateProfesional,
  updateServiciosMatrix,
} from "@/app/actions/profesionales";
import { profesionalSchema, type ProfesionalInput } from "@/lib/schemas/profesional";
import type { HorarioInput } from "@/lib/schemas/horario";
import {
  HorarioEditor,
  type HorarioEditorHandle,
} from "@/components/horario-editor";
import {
  ServiciosMatrix,
  matrizInicial,
  type AsignacionServicio,
} from "@/components/servicios-matrix";
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

type ProfesionalFormValues = z.input<typeof profesionalSchema>;

type Props = {
  profesional: Tables<"profesional">;
  horarioInicial: HorarioInput;
  asignacionesExistentes: { servicio_id: string; precio_custom: number | null }[];
  serviciosActivos: Tables<"servicio">[];
  granularidadMin: number;
};

export function ProfesionalEditarForm({
  profesional,
  horarioInicial,
  asignacionesExistentes,
  serviciosActivos,
  granularidadMin,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [horario, setHorario] = useState<HorarioInput>(horarioInicial);
  const [matriz, setMatriz] = useState<AsignacionServicio[]>(
    matrizInicial(serviciosActivos, asignacionesExistentes),
  );
  const horarioHandleRef = useRef<HorarioEditorHandle>(null);

  const form = useForm<ProfesionalFormValues>({
    resolver: zodResolver(profesionalSchema),
    defaultValues: {
      nombre: profesional.nombre,
      activo: profesional.activo,
    },
    mode: "onBlur",
  });

  function onSubmit(values: ProfesionalFormValues) {
    setServerError(null);

    if (horarioHandleRef.current?.tieneErrores()) {
      setServerError(
        "Revisá los bloques horarios marcados: hay superposiciones u horas inválidas.",
      );
      return;
    }

    const parsedValues: ProfesionalInput = {
      nombre: values.nombre,
      activo: values.activo ?? true,
    };

    startTransition(async () => {
      const datosResult = await updateProfesional(profesional.id, parsedValues);
      if (datosResult?.error) {
        setServerError(datosResult.error);
        return;
      }

      const horarioResult = await updateHorario(profesional.id, horario);
      if (horarioResult?.error) {
        setServerError(horarioResult.error);
        return;
      }

      const matrizResult = await updateServiciosMatrix(profesional.id, matriz);
      if (matrizResult?.error) {
        setServerError(matrizResult.error);
        return;
      }

      toast.success("Profesional actualizado.");
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

        <Card>
          <CardHeader>
            <CardTitle>Horario semanal</CardTitle>
          </CardHeader>
          <CardContent>
            <HorarioEditor
              value={horario}
              onChange={setHorario}
              granularidadMin={granularidadMin}
              handleRef={horarioHandleRef}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Servicios que realiza</CardTitle>
          </CardHeader>
          <CardContent>
            <ServiciosMatrix servicios={serviciosActivos} value={matriz} onChange={setMatriz} />
          </CardContent>
        </Card>

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
  );
}
