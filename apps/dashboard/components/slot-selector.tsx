/**
 * components/slot-selector.tsx — selector de slot real compartido entre alta
 * manual y reagendado (D-10/D-13). Nunca calcula huecos a mano: profesionales
 * elegibles vienen de `profesionalesElegibles` (Pitfall 6 — un profesional
 * solo aparece si hace TODOS los `serviceIds` pedidos) y los horarios de
 * `obtenerSlotsDisponibles`, ambos wrappers de `computeSlots`
 * (`app/actions/slots.ts`, Plan 04).
 *
 * Conversión horario local (HH:mm, hora del negocio) → ISO timestamptz:
 * mismo criterio que `bloqueo-form-dialog.tsx` (Fase 4, Plan 06) — offset fijo
 * `-03:00` porque ninguna zona horaria de Argentina observa horario de verano
 * desde 2009. No se agrega `@date-fns/tz` al dashboard solo para esta cuenta;
 * ese paquete vive únicamente en el motor puro (`@turnosbot/availability-engine`).
 */
"use client";

import { useEffect, useState, useTransition } from "react";

import {
  obtenerSlotsDisponibles,
  profesionalesElegibles,
  type ProfesionalElegible,
} from "@/app/actions/slots";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AvailableSlot } from "@turnosbot/availability-engine";

// Argentina: offset fijo, sin DST desde 2009 (mismo criterio que bloqueo-form-dialog.tsx).
const ARGENTINA_OFFSET = "-03:00";

function slotHoraToIso(fecha: string, horaLocal: string): string {
  return new Date(`${fecha}T${horaLocal}:00${ARGENTINA_OFFSET}`).toISOString();
}

function formatFechaLegible(fecha: string): string {
  const [anio, mes, dia] = fecha.split("-").map(Number);
  return new Date(anio, mes - 1, dia).toLocaleDateString("es-AR", {
    day: "numeric",
    month: "long",
  });
}

type Props = {
  serviceIds: string[];
  fecha: string;
  onSelect: (sel: { profesionalId: string; inicio: string; fin: string }) => void;
  profesionalIdFijo?: string;
};

export function SlotSelector({ serviceIds, fecha, onSelect, profesionalIdFijo }: Props) {
  const [profesionales, setProfesionales] = useState<ProfesionalElegible[] | null>(null);
  const [profesionalId, setProfesionalId] = useState<string | undefined>(profesionalIdFijo);
  const [slots, setSlots] = useState<AvailableSlot[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const serviceIdsKey = serviceIds.join(",");

  // Profesionales elegibles para los serviceIds pedidos (Pitfall 6) — se
  // busca siempre, incluso con profesionalIdFijo, para poder mostrar su
  // nombre en el empty-copy de "sin horarios".
  useEffect(() => {
    setProfesionalId(profesionalIdFijo);
    setSlots(null);
    setError(null);
    if (serviceIds.length === 0) {
      setProfesionales([]);
      return;
    }
    startTransition(async () => {
      const result = await profesionalesElegibles(serviceIds);
      if ("error" in result) {
        setError(result.error);
        setProfesionales([]);
        return;
      }
      setProfesionales(result.profesionales);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceIdsKey, profesionalIdFijo]);

  // Slots reales del profesional elegido (fijo o seleccionado en el Select).
  useEffect(() => {
    if (!profesionalId || serviceIds.length === 0) {
      setSlots(null);
      return;
    }
    startTransition(async () => {
      const result = await obtenerSlotsDisponibles({ serviceIds, fecha, profesionalId });
      if ("error" in result) {
        setError(result.error);
        setSlots([]);
        return;
      }
      setError(null);
      setSlots(result.slots);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profesionalId, serviceIdsKey, fecha]);

  const profesionalNombre =
    profesionales?.find((profesional) => profesional.id === profesionalId)?.nombre ??
    "el profesional";

  return (
    <div className="space-y-3">
      {!profesionalIdFijo ? (
        <div className="space-y-1.5">
          <Label htmlFor="slot-selector-profesional">Profesional</Label>
          <Select
            value={profesionalId}
            onValueChange={(value) => setProfesionalId(value)}
            disabled={isPending || !profesionales || profesionales.length === 0}
          >
            <SelectTrigger id="slot-selector-profesional" className="w-full">
              <SelectValue placeholder="Elegí un profesional" />
            </SelectTrigger>
            <SelectContent>
              {(profesionales ?? []).map((profesional) => (
                <SelectItem key={profesional.id} value={profesional.id}>
                  {profesional.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {profesionales && profesionales.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No hay profesionales que hagan todos los servicios elegidos.
            </p>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      {profesionalId && slots && slots.length > 0 ? (
        <div className="grid grid-cols-4 gap-2">
          {slots.map((slot) => (
            <Button
              key={`${slot.professionalId}-${slot.start}`}
              type="button"
              variant="outline"
              onClick={() =>
                onSelect({
                  profesionalId: slot.professionalId,
                  inicio: slotHoraToIso(fecha, slot.start),
                  fin: slotHoraToIso(fecha, slot.end),
                })
              }
            >
              {slot.start}
            </Button>
          ))}
        </div>
      ) : null}

      {profesionalId && slots && slots.length === 0 && !error ? (
        <p className="text-sm text-muted-foreground">
          No hay horarios disponibles para {profesionalNombre} el{" "}
          {formatFechaLegible(fecha)}. Probá otro día o profesional.
        </p>
      ) : null}
    </div>
  );
}
