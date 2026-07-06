/**
 * components/slot-popover.tsx — Popover de dos opciones sobre una celda
 * libre de la grilla (D-03, APPT-01/02/06). `children` es la celda que actúa
 * de trigger (`PopoverTrigger asChild`); "Crear turno" abre
 * `TurnoFormDialog` en modo "alta" y "Bloquear" abre `BloqueoFormDialog`,
 * ambos con `profesionalId`/`horaInicio` PRE-CARGADOS vía props — nunca se
 * retipean (D-03).
 *
 * Estado local `dialog` decide cuál de los dos Dialogs está montado/abierto;
 * al cerrarse cualquiera de los dos (submit exitoso o cancelación) vuelve a
 * "none". El Popover en sí se cierra apenas se elige una opción, antes de
 * abrir el Dialog correspondiente.
 */
"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { Lock, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { BloqueoFormDialog } from "@/components/bloqueo-form-dialog";
import { TurnoFormDialog } from "@/components/turno-form-dialog";
import type { Tables } from "@turnosbot/db-types";

type DialogAbierto = "none" | "turno" | "bloqueo";

type Props = {
  /** Profesional dueño de este slot libre — pre-cargado, nunca re-tipeado. */
  profesionalId: string;
  /** Hora local del negocio, formato "HH:mm" (mismo formato que
   * `AvailableSlot.start` del motor). */
  horaInicio: string;
  /** Fecha local del negocio, formato "YYYY-MM-DD". */
  fecha: string;
  timezone: string;
  /** Servicios activos del negocio, para las checkboxes del modo alta de
   * `TurnoFormDialog`. */
  servicios: Tables<"servicio">[];
  /** La celda libre que actúa de trigger del Popover. */
  children: ReactNode;
};

export function SlotPopover({
  profesionalId,
  horaInicio,
  fecha,
  timezone,
  servicios,
  children,
}: Props) {
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState<DialogAbierto>("none");

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>{children}</PopoverTrigger>
        <PopoverContent align="start" className="w-56">
          <div className="flex flex-col gap-1">
            <Button
              type="button"
              variant="ghost"
              className="justify-start"
              onClick={() => {
                setOpen(false);
                setDialog("turno");
              }}
            >
              <Plus /> Crear turno
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="justify-start"
              onClick={() => {
                setOpen(false);
                setDialog("bloqueo");
              }}
            >
              <Lock /> Bloquear
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      <TurnoFormDialog
        mode="alta"
        servicios={servicios}
        profesionalIdPreload={profesionalId}
        horaInicioPreload={horaInicio}
        fecha={fecha}
        timezone={timezone}
        open={dialog === "turno"}
        onOpenChange={(nextOpen) => setDialog(nextOpen ? "turno" : "none")}
      />
      <BloqueoFormDialog
        profesionalId={profesionalId}
        horaInicio={horaInicio}
        fecha={fecha}
        open={dialog === "bloqueo"}
        onOpenChange={(nextOpen) => setDialog(nextOpen ? "bloqueo" : "none")}
      />
    </>
  );
}
