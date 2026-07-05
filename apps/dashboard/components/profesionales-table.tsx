/**
 * components/profesionales-table.tsx — tabla de Profesionales del negocio
 * activo (PRO-01). Client Component: Tabs "Todos/Activos/Inactivos" (filtro
 * local, sin URL — la lista completa ya llega server-side scoped al negocio
 * activo), Switch de soft-delete por fila (apagar abre un AlertDialog
 * destructivo con el copy exacto; encender reactiva sin confirmación), filas
 * inactivas muteadas con badge gris "Inactivo" (no rojo — 02-UI-SPEC.md
 * §Soft-Delete Presentation), y link "Editar" por fila. Sin reordenamiento:
 * los profesionales no se ordenan por drag (a diferencia de Servicios,
 * SVC-02).
 */
"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";

import { toggleProfesionalActivo } from "@/app/actions/profesionales";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { Tables } from "@turnosbot/db-types";

type Profesional = Tables<"profesional">;

const ESTADO_FILTERS = [
  { value: "todos", label: "Todos" },
  { value: "activos", label: "Activos" },
  { value: "inactivos", label: "Inactivos" },
] as const;

type EstadoFilter = (typeof ESTADO_FILTERS)[number]["value"];

function ProfesionalActivoSwitch({ profesional }: { profesional: Profesional }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function apply(nextActivo: boolean) {
    startTransition(async () => {
      const result = await toggleProfesionalActivo(profesional.id, nextActivo);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success(nextActivo ? "Profesional reactivado." : "Profesional desactivado.");
      setConfirmOpen(false);
    });
  }

  return (
    <>
      <Switch
        checked={profesional.activo}
        disabled={isPending}
        aria-label={
          profesional.activo
            ? `Desactivar ${profesional.nombre}`
            : `Reactivar ${profesional.nombre}`
        }
        onCheckedChange={(checked) => {
          if (checked) {
            apply(true);
          } else {
            setConfirmOpen(true);
          }
        }}
      />
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Desactivar a {profesional.nombre}?</AlertDialogTitle>
            <AlertDialogDescription>
              Ya no va a aparecer disponible para nuevos turnos, pero se
              conserva su historial.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isPending}
              onClick={(event) => {
                event.preventDefault();
                apply(false);
              }}
            >
              Desactivar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function ProfesionalesTable({ profesionales }: { profesionales: Profesional[] }) {
  const [estado, setEstado] = useState<EstadoFilter>("todos");

  const filtered = profesionales.filter((profesional) => {
    if (estado === "activos") return profesional.activo;
    if (estado === "inactivos") return !profesional.activo;
    return true;
  });

  return (
    <div className="space-y-4">
      <Tabs value={estado} onValueChange={(value) => setEstado(value as EstadoFilter)}>
        <TabsList>
          {ESTADO_FILTERS.map((filter) => (
            <TabsTrigger key={filter.value} value={filter.value}>
              {filter.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((profesional) => (
            <TableRow key={profesional.id} className={cn(!profesional.activo && "opacity-60")}>
              <TableCell className="font-medium">{profesional.nombre}</TableCell>
              <TableCell>
                <Badge variant={profesional.activo ? "default" : "secondary"}>
                  {profesional.activo ? "Activo" : "Inactivo"}
                </Badge>
              </TableCell>
              <TableCell>
                <div className="flex items-center justify-end gap-3">
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/profesionales/${profesional.id}/editar`}>Editar</Link>
                  </Button>
                  <ProfesionalActivoSwitch profesional={profesional} />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
