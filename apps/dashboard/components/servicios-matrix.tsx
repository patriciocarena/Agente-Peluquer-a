/**
 * components/servicios-matrix.tsx — matriz de servicios que realiza un
 * profesional + precio personalizado opcional (PRO-03/04), usada en
 * `app/(owner)/profesionales/[id]/editar/page.tsx`.
 *
 * Una fila por servicio ACTIVO del negocio activo: checkbox "Realiza" |
 * Servicio | Precio base (solo lectura, muted, es-AR) | Precio personalizado
 * (Input numérico, deshabilitado salvo que "Realiza" esté tildado,
 * placeholder = precio base formateado — 02-UI-SPEC.md §Services + Custom
 * Price Matrix). Destildar "Realiza" limpia el precio custom de esa fila al
 * guardar (sin confirmación aparte — no es una acción destructiva a nivel
 * cuenta, es un simple toggle de campo).
 *
 * Estado 100% client-side, guardado explícito vía "Guardar cambios" que
 * llama a la Server Action `updateServiciosMatrix` (02-07 Task 3) — la
 * validación de precio_custom >= 0 acá es solo UX, la Server Action
 * re-valida (T-02-20).
 */
"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { Tables } from "@turnosbot/db-types";

import { updateServiciosMatrix } from "@/app/actions/profesionales";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Servicio = Tables<"servicio">;
type ProfesionalServicioRow = Tables<"profesional_servicio">;

type FilaMatrix = {
  servicioId: string;
  nombre: string;
  precioBase: number;
  realiza: boolean;
  /** Controlado como string ("" = sin precio custom) para no pelear con el
   * estado intermedio de un `<input type="number">` mientras se tipea. */
  precioCustom: string;
};

type Props = {
  profesionalId: string;
  /** Servicios activos del negocio activo, ya ordenados por `orden`. */
  servicios: Servicio[];
  /** Filas existentes de `profesional_servicio` para este profesional. */
  asignaciones: ProfesionalServicioRow[];
};

const formatearPrecio = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

function filasIniciales(servicios: Servicio[], asignaciones: ProfesionalServicioRow[]): FilaMatrix[] {
  return servicios.map((servicio) => {
    const asignacion = asignaciones.find((a) => a.servicio_id === servicio.id);
    return {
      servicioId: servicio.id,
      nombre: servicio.nombre,
      precioBase: servicio.precio,
      realiza: Boolean(asignacion),
      precioCustom: asignacion?.precio_custom != null ? String(asignacion.precio_custom) : "",
    };
  });
}

export function ServiciosMatrix({ profesionalId, servicios, asignaciones }: Props) {
  const [filas, setFilas] = useState<FilaMatrix[]>(() => filasIniciales(servicios, asignaciones));
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  function actualizarFila(servicioId: string, cambios: Partial<FilaMatrix>) {
    setServerError(null);
    setFilas((current) =>
      current.map((fila) => (fila.servicioId === servicioId ? { ...fila, ...cambios } : fila)),
    );
  }

  function handleGuardar() {
    setServerError(null);

    const precioInvalido = filas.some(
      (fila) => fila.realiza && fila.precioCustom.trim() !== "" && Number(fila.precioCustom) < 0,
    );
    if (precioInvalido) {
      setServerError("El precio personalizado no puede ser negativo.");
      return;
    }

    const asignacionesAGuardar = filas.map((fila) => ({
      servicio_id: fila.servicioId,
      realiza: fila.realiza,
      // Destildar "Realiza" limpia el precio custom al guardar.
      precio_custom:
        fila.realiza && fila.precioCustom.trim() !== "" ? Number(fila.precioCustom) : null,
    }));

    startTransition(async () => {
      const result = await updateServiciosMatrix(profesionalId, asignacionesAGuardar);
      if (result?.error) {
        setServerError(result.error);
        return;
      }
      toast.success("Servicios guardados.");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Servicios que realiza</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">Realiza</TableHead>
              <TableHead>Servicio</TableHead>
              <TableHead>Precio base</TableHead>
              <TableHead>Precio personalizado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filas.map((fila) => (
              <TableRow key={fila.servicioId}>
                <TableCell>
                  <Checkbox
                    checked={fila.realiza}
                    aria-label={`Realiza ${fila.nombre}`}
                    onCheckedChange={(checked) =>
                      actualizarFila(fila.servicioId, {
                        realiza: checked === true,
                        precioCustom: checked === true ? fila.precioCustom : "",
                      })
                    }
                  />
                </TableCell>
                <TableCell className="font-medium">{fila.nombre}</TableCell>
                <TableCell className="text-muted-foreground">
                  {formatearPrecio.format(fila.precioBase)}
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    disabled={!fila.realiza}
                    placeholder={formatearPrecio.format(fila.precioBase)}
                    value={fila.precioCustom}
                    onChange={(event) =>
                      actualizarFila(fila.servicioId, { precioCustom: event.target.value })
                    }
                    className="w-32"
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {serverError ? (
          <p className="text-sm text-destructive" role="alert">
            {serverError}
          </p>
        ) : null}

        <Button type="button" onClick={handleGuardar} disabled={isPending}>
          Guardar cambios
        </Button>
      </CardContent>
    </Card>
  );
}
