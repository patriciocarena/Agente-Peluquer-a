/**
 * components/servicios-table.tsx — tabla de Servicios (SVC-01/SVC-02).
 *
 * Tabs "Todos/Activos/Inactivos" (filtro local — esta tabla ya mantiene
 * estado client-side para el drag-and-drop, a diferencia del filtro por URL
 * de `components/admin/estado-filter-tabs.tsx`), Switch con AlertDialog
 * destructivo exacto al desactivar (reactivar aplica directo, sin
 * confirmación), filas inactivas muteadas (~60% opacidad) con badge gris
 * "Inactivo" (variant "secondary", NUNCA destructive/rojo — 02-UI-SPEC.md
 * §Soft-Delete Presentation), precio es-AR y duración en minutos, y
 * reordenamiento por drag-and-drop vía `@dnd-kit` (handle GripVertical,
 * aria-label="Reordenar servicio", keyboard sensor) que llama `reorder()`
 * (lib/reorder.ts) y persiste vía `reorderServicios` — UI optimista con
 * rollback + toast en caso de fallo.
 */
"use client";

import { useState } from "react";
import { toast } from "sonner";
import { GripVertical } from "lucide-react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Tables } from "@turnosbot/db-types";

import { reorderServicios, toggleServicioActivo } from "@/app/actions/servicios";
import { reorder } from "@/lib/reorder";
import { ServicioDialog } from "@/components/servicio-dialog";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

type Servicio = Tables<"servicio">;

const formatearPrecio = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

const ESTADO_FILTERS = [
  { value: "todos", label: "Todos" },
  { value: "activos", label: "Activos" },
  { value: "inactivos", label: "Inactivos" },
] as const;

type EstadoFilter = (typeof ESTADO_FILTERS)[number]["value"];

type Props = {
  servicios: Servicio[];
};

function firmaServicios(lista: Servicio[]): string {
  return JSON.stringify(
    lista.map((s) => ({
      id: s.id,
      orden: s.orden,
      activo: s.activo,
      precio: s.precio,
      duracion_min: s.duracion_min,
      nombre: s.nombre,
      descripcion: s.descripcion,
    })),
  );
}

export function ServiciosTable({ servicios: initialServicios }: Props) {
  const [servicios, setServicios] = useState<Servicio[]>(
    [...initialServicios].sort((a, b) => a.orden - b.orden),
  );
  const [estado, setEstado] = useState<EstadoFilter>("todos");

  // Re-sincronizar el estado local con las props revalidadas (ej. tras
  // editar un servicio por el diálogo, que dispara revalidatePath). Patrón
  // idiomático de React "ajustar estado durante el render" — NO useEffect.
  const firmaActual = firmaServicios(initialServicios);
  const [firmaPrevia, setFirmaPrevia] = useState(firmaActual);
  if (firmaActual !== firmaPrevia) {
    setServicios([...initialServicios].sort((a, b) => a.orden - b.orden));
    setFirmaPrevia(firmaActual);
  }

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const filtered = servicios.filter((servicio) => {
    if (estado === "activos") return servicio.activo;
    if (estado === "inactivos") return !servicio.activo;
    return true;
  });

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const previous = servicios;
    const reordered = reorder(servicios, String(active.id), String(over.id));
    setServicios(reordered);

    void reorderServicios(reordered.map((s) => ({ id: s.id, orden: s.orden }))).then(
      (result) => {
        if ("error" in result) {
          setServicios(previous);
          toast.error(result.error);
        }
      },
    );
  }

  function handleToggle(servicio: Servicio, nextActivo: boolean) {
    const previous = servicios;
    setServicios((current) =>
      current.map((s) => (s.id === servicio.id ? { ...s, activo: nextActivo } : s)),
    );
    void toggleServicioActivo(servicio.id, nextActivo).then((result) => {
      if ("error" in result) {
        setServicios(previous);
        toast.error(result.error);
        return;
      }
      toast.success(nextActivo ? "Servicio reactivado." : "Servicio desactivado.");
    });
  }

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

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10" />
              <TableHead>Nombre</TableHead>
              <TableHead>Precio</TableHead>
              <TableHead>Duración</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <SortableContext
            items={filtered.map((servicio) => servicio.id)}
            strategy={verticalListSortingStrategy}
          >
            <TableBody>
              {filtered.map((servicio) => (
                <ServicioRow key={servicio.id} servicio={servicio} onToggle={handleToggle} />
              ))}
            </TableBody>
          </SortableContext>
        </Table>
      </DndContext>
    </div>
  );
}

function ServicioRow({
  servicio,
  onToggle,
}: {
  servicio: Servicio;
  onToggle: (servicio: Servicio, nextActivo: boolean) => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: servicio.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <TableRow
      ref={setNodeRef}
      style={style}
      className={cn(!servicio.activo && "opacity-60", isDragging && "relative z-10")}
    >
      <TableCell>
        <button
          type="button"
          aria-label="Reordenar servicio"
          className="cursor-grab touch-none text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>
      </TableCell>
      <TableCell className="font-medium">{servicio.nombre}</TableCell>
      <TableCell>{formatearPrecio.format(servicio.precio)}</TableCell>
      <TableCell>{servicio.duracion_min} min</TableCell>
      <TableCell>
        <Badge variant={servicio.activo ? "default" : "secondary"}>
          {servicio.activo ? "Activo" : "Inactivo"}
        </Badge>
      </TableCell>
      <TableCell>
        <div className="flex items-center justify-end gap-3">
          <ServicioDialog
            servicio={servicio}
            trigger={
              <Button variant="outline" size="sm">
                Editar
              </Button>
            }
          />
          <Switch
            checked={servicio.activo}
            aria-label={
              servicio.activo ? `Desactivar ${servicio.nombre}` : `Reactivar ${servicio.nombre}`
            }
            onCheckedChange={(checked) => {
              if (checked) {
                onToggle(servicio, true);
              } else {
                setConfirmOpen(true);
              }
            }}
          />
          <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>¿Desactivar {servicio.nombre}?</AlertDialogTitle>
                <AlertDialogDescription>
                  Deja de poder asignarse a profesionales; los turnos ya creados no se ven
                  afectados.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  onClick={(event) => {
                    event.preventDefault();
                    onToggle(servicio, false);
                    setConfirmOpen(false);
                  }}
                >
                  Desactivar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </TableCell>
    </TableRow>
  );
}
