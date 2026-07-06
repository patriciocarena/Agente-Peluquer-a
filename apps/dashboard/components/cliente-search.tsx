/**
 * components/cliente-search.tsx — búsqueda de cliente por teléfono + alta
 * inline si no hay match (D-09, backing de APPT-06). Vive dentro de
 * `turno-form-dialog.tsx` (modo alta): nunca navega a otra pantalla, todo el
 * flujo "buscar → sin resultados → cargar" ocurre en este mismo componente,
 * que solo devuelve el `clienteId` elegido al padre vía `onSelect`.
 *
 * Reusa `buscarClientePorTelefono`/`crearClienteInline` de
 * `app/actions/clientes.ts` (Plan 03) — nunca duplica el fetch/insert acá.
 */
"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  buscarClientePorTelefono,
  crearClienteInline,
  type ClienteResumen,
} from "@/app/actions/clientes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  onSelect: (clienteId: string, label: string) => void;
};

export function ClienteSearch({ onSelect }: Props) {
  const [telefono, setTelefono] = useState("");
  const [nombreInline, setNombreInline] = useState("");
  const [resultados, setResultados] = useState<ClienteResumen[] | null>(null);
  const [isPending, startTransition] = useTransition();

  function buscar() {
    const telefonoBuscado = telefono.trim();
    startTransition(async () => {
      const result = await buscarClientePorTelefono(telefonoBuscado);
      setResultados(result.clientes);
    });
  }

  function usarClienteNuevo() {
    startTransition(async () => {
      const result = await crearClienteInline({
        telefono: telefono.trim(),
        nombre: nombreInline.trim() || undefined,
      });
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      onSelect(result.clienteId, telefono.trim());
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-2">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="cliente-search-telefono">Teléfono</Label>
          <Input
            id="cliente-search-telefono"
            placeholder="Buscar por teléfono"
            value={telefono}
            onChange={(event) => {
              setTelefono(event.target.value);
              setResultados(null);
            }}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={isPending || telefono.trim().length < 3}
          onClick={buscar}
        >
          Buscar
        </Button>
      </div>

      {resultados && resultados.length > 0 ? (
        <div className="space-y-1">
          {resultados.map((cliente) => (
            <Button
              key={cliente.id}
              type="button"
              variant="ghost"
              className="w-full justify-start"
              onClick={() => onSelect(cliente.id, cliente.nombre ?? cliente.telefono)}
            >
              {cliente.nombre ?? cliente.telefono}
              {cliente.nombre ? ` · ${cliente.telefono}` : ""}
            </Button>
          ))}
        </div>
      ) : null}

      {resultados && resultados.length === 0 ? (
        <div className="space-y-2 rounded-lg border border-border p-3">
          <p className="text-sm text-muted-foreground">
            No encontramos un cliente con ese teléfono.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="cliente-search-nombre-inline">Cargar datos del cliente</Label>
            <p className="text-sm text-muted-foreground">Teléfono: {telefono.trim()}</p>
            <Input
              id="cliente-search-nombre-inline"
              placeholder="Nombre (opcional)"
              value={nombreInline}
              onChange={(event) => setNombreInline(event.target.value)}
            />
          </div>
          <Button type="button" size="sm" disabled={isPending} onClick={usarClienteNuevo}>
            Usar este cliente
          </Button>
        </div>
      ) : null}
    </div>
  );
}
