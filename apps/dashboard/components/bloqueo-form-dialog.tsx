/**
 * components/bloqueo-form-dialog.tsx — Dialog de creación de bloqueo manual
 * (D-03 rama "Bloquear", APPT-02). `Dialog` completamente controlado desde
 * afuera (lo abre el slot-popover de Plan 07 al hacer click en un slot
 * libre): `profesionalId` y la hora de inicio llegan PRE-CARGADOS vía props
 * (D-03: "no vía re-tipeo"), nunca se re-tipean en el formulario.
 *
 * Conversión de horario local → UTC (Pitfall de timezone): Argentina no
 * observa horario de verano desde 2009 — TODAS sus IANA zones
 * (Buenos_Aires, Cordoba, Mendoza, etc.) comparten el mismo offset fijo
 * `-03:00` todo el año. El paquete `@date-fns/tz` vive únicamente en
 * `@turnosbot/availability-engine` (motor puro); este componente cliente no
 * agrega esa dependencia solo para construir un timestamp — con el offset
 * fijo alcanza para producir el instante UTC correcto sin caer en el
 * anti-patrón "UTC-naive" que los docs del proyecto señalan explícitamente.
 */
"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { crearBloqueo } from "@/app/actions/bloqueos";
import { bloqueoSchema, type BloqueoInput } from "@/lib/schemas/bloqueo";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

// Argentina: offset fijo, sin DST (ver comentario de cabecera).
const ARGENTINA_OFFSET = "-03:00";

const DURACIONES_MIN = [15, 30, 45, 60, 90, 120] as const;

function toUtcIso(fecha: string, horaLocal: string): string {
  return new Date(`${fecha}T${horaLocal}:00${ARGENTINA_OFFSET}`).toISOString();
}

function sumarMinutosIso(iso: string, minutos: number): string {
  return new Date(new Date(iso).getTime() + minutos * 60_000).toISOString();
}

type Props = {
  profesionalId: string;
  /** Hora local del negocio, formato "HH:mm" (mismo formato que
   * `AvailableSlot.start` del motor). */
  horaInicio: string;
  /** Fecha local del negocio, formato "YYYY-MM-DD" (mismo formato que
   * `?fecha=` de la grilla). */
  fecha: string;
  /** Granularidad del negocio (15|30, BIZ-03) usada como duración default
   * del bloqueo — opcional: si no se pasa, el default es 30 min. */
  granularidadMin?: 15 | 30;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function BloqueoFormDialog({
  profesionalId,
  horaInicio,
  fecha,
  granularidadMin = 30,
  open,
  onOpenChange,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [duracionMin, setDuracionMin] = useState<number>(granularidadMin);

  const inicioIso = toUtcIso(fecha, horaInicio);

  const form = useForm<BloqueoInput>({
    resolver: zodResolver(bloqueoSchema),
    values: {
      profesionalId,
      inicio: inicioIso,
      fin: sumarMinutosIso(inicioIso, duracionMin),
      motivo: undefined,
    },
  });

  function onSubmit(values: BloqueoInput) {
    setServerError(null);
    startTransition(async () => {
      const result = await crearBloqueo(values);
      if ("error" in result) {
        setServerError(result.error);
        return;
      }
      toast.success("Horario bloqueado.");
      form.reset();
      onOpenChange(false);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setServerError(null);
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Bloquear horario</DialogTitle>
          <DialogDescription>Desde las {horaInicio}.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <div className="grid gap-2">
              <Label htmlFor="bloqueo-duracion">Duración</Label>
              <Select
                value={String(duracionMin)}
                onValueChange={(value) => setDuracionMin(Number(value))}
              >
                <SelectTrigger id="bloqueo-duracion" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DURACIONES_MIN.map((min) => (
                    <SelectItem key={min} value={String(min)}>
                      {min} min
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <FormField
              control={form.control}
              name="motivo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Motivo (opcional)</FormLabel>
                  <FormControl>
                    <Textarea {...field} value={field.value ?? ""} rows={3} />
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
                {isPending ? "Bloqueando…" : "Bloquear horario"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
