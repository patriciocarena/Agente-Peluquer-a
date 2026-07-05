/**
 * components/servicios-matrix.tsx — matriz de servicios que un profesional
 * realiza + precio custom opcional (PRO-03/04), 02-UI-SPEC.md §Services +
 * Custom Price Matrix. Client Component: una fila por servicio ACTIVO del
 * negocio, columnas [checkbox "Realiza"] | Servicio | Precio base
 * (solo-lectura, muted, es-AR) | Precio personalizado (Input, disabled salvo
 * que "Realiza" esté tildado, placeholder = precio base formateado).
 *
 * Estado 100% local (React state) hasta "Guardar cambios" en la página
 * contenedora — mismo patrón que `horario-editor.tsx`. Destildar "Realiza"
 * limpia el precio_custom de ese servicio en el estado local inmediatamente
 * (sin confirmación aparte, 02-UI-SPEC.md: "no es una acción destructiva a
 * nivel de cuenta").
 */
"use client";

import type { Tables } from "@turnosbot/db-types";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Servicio = Tables<"servicio">;

export type AsignacionServicio = {
  servicioId: string;
  realiza: boolean;
  precioCustom: number | null;
};

const formatearPrecio = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

/** Construye el estado inicial de la matriz a partir de los servicios activos
 * del negocio y las asignaciones ya persistidas (profesional_servicio) del
 * profesional que se está editando. */
export function matrizInicial(
  serviciosActivos: Servicio[],
  asignacionesExistentes: { servicio_id: string; precio_custom: number | null }[],
): AsignacionServicio[] {
  return serviciosActivos.map((servicio) => {
    const existente = asignacionesExistentes.find((a) => a.servicio_id === servicio.id);
    return {
      servicioId: servicio.id,
      realiza: Boolean(existente),
      precioCustom: existente?.precio_custom ?? null,
    };
  });
}

type Props = {
  servicios: Servicio[];
  value: AsignacionServicio[];
  onChange: (next: AsignacionServicio[]) => void;
};

export function ServiciosMatrix({ servicios, value, onChange }: Props) {
  function actualizar(servicioId: string, patch: Partial<AsignacionServicio>) {
    onChange(
      value.map((asignacion) =>
        asignacion.servicioId === servicioId ? { ...asignacion, ...patch } : asignacion,
      ),
    );
  }

  function toggleRealiza(servicioId: string, realiza: boolean) {
    if (realiza) {
      actualizar(servicioId, { realiza });
      return;
    }
    // Destildar limpia el precio custom (02-UI-SPEC.md: no es una acción
    // destructiva a nivel de cuenta, se aplica directo sin confirmación).
    actualizar(servicioId, { realiza, precioCustom: null });
  }

  if (servicios.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Todavía no hay servicios activos en este negocio para asignar.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10">
            <span className="sr-only">Realiza</span>
          </TableHead>
          <TableHead>Servicio</TableHead>
          <TableHead>Precio base</TableHead>
          <TableHead>Precio personalizado</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {servicios.map((servicio) => {
          const asignacion = value.find((a) => a.servicioId === servicio.id) ?? {
            servicioId: servicio.id,
            realiza: false,
            precioCustom: null,
          };

          return (
            <TableRow key={servicio.id}>
              <TableCell>
                <Checkbox
                  checked={asignacion.realiza}
                  aria-label={`Realiza ${servicio.nombre}`}
                  onCheckedChange={(checked) => toggleRealiza(servicio.id, checked === true)}
                />
              </TableCell>
              <TableCell className="font-medium">{servicio.nombre}</TableCell>
              <TableCell className="text-muted-foreground">
                {formatearPrecio.format(servicio.precio)}
              </TableCell>
              <TableCell>
                <Label htmlFor={`precio-custom-${servicio.id}`} className="sr-only">
                  Precio personalizado de {servicio.nombre}
                </Label>
                <Input
                  id={`precio-custom-${servicio.id}`}
                  type="number"
                  min={0}
                  step="0.01"
                  inputMode="decimal"
                  disabled={!asignacion.realiza}
                  placeholder={formatearPrecio.format(servicio.precio)}
                  value={asignacion.precioCustom ?? ""}
                  onChange={(event) => {
                    const nuevoValor = event.target.value;
                    actualizar(servicio.id, {
                      precioCustom: nuevoValor === "" ? null : Number(nuevoValor),
                    });
                  }}
                  className="w-32"
                />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
