/**
 * components/negocio-selector.tsx — dropdown en el topbar que fija el
 * negocio activo (D-13). Si el tenant tiene un solo negocio, colapsa a una
 * etiqueta fija (sin dropdown interactivo) — el concepto de negocio activo
 * sigue existiendo, solo que no hay nada para elegir.
 *
 * `negocioActivoId` viene siempre resuelto server-side (lib/negocio-context.ts,
 * ya validado contra el tenant vía RLS); este componente solo dispara la
 * persistencia de un cambio de selección, nunca decide el negocio activo por
 * su cuenta.
 */
"use client";

import { useTransition } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { setNegocioActivo } from "@/app/actions/negocio-activo";
import type { Tables } from "@turnosbot/db-types";

type NegocioOption = Pick<Tables<"negocio">, "id" | "nombre">;

type Props = {
  negocios: NegocioOption[];
  negocioActivoId: string;
};

export function NegocioSelector({ negocios, negocioActivoId }: Props) {
  const [isPending, startTransition] = useTransition();

  if (negocios.length <= 1) {
    return (
      <span className="text-sm font-medium text-foreground">
        {negocios[0]?.nombre ?? "Sin negocio"}
      </span>
    );
  }

  return (
    <Select
      value={negocioActivoId}
      disabled={isPending}
      onValueChange={(value) => {
        startTransition(async () => {
          await setNegocioActivo(value);
        });
      }}
    >
      <SelectTrigger className="w-56" aria-label="Seleccionar negocio activo">
        <SelectValue placeholder="Elegí un negocio" />
      </SelectTrigger>
      <SelectContent>
        {negocios.map((negocio) => (
          <SelectItem key={negocio.id} value={negocio.id}>
            {negocio.nombre}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
