/**
 * components/dia-picker.tsx — date-picker mínimo de la navegación de día de
 * `/turnos` (04-UI-SPEC.md Layout & Navigation: "Popover+Calendar... si
 * Calendar no está instalado, usar un input date simple con
 * aria-label='Elegir fecha', NO instalar librería de calendario nueva").
 * `Calendar` (shadcn) no está instalado en esta fase (04-UI-SPEC.md
 * Component Inventory solo agrega `popover`), así que se usa el input
 * nativo `type="date"` — cero dependencias nuevas.
 *
 * Única pieza interactiva de la navegación de día que necesita un boundary
 * de cliente: las flechas ChevronLeft/ChevronRight son `<Link>` calculados
 * server-side en `page.tsx` (no requieren JS para navegar); este input sí
 * necesita `onChange` para saltar a `?fecha=` sin un botón "Ir" aparte.
 */
"use client";

import { useRouter } from "next/navigation";

type Props = {
  /** Fecha activa actual, "YYYY-MM-DD". */
  fecha: string;
};

export function DiaPicker({ fecha }: Props) {
  const router = useRouter();

  return (
    <input
      key={fecha}
      type="date"
      aria-label="Elegir fecha"
      defaultValue={fecha}
      onChange={(event) => {
        if (event.target.value) {
          router.push(`/turnos?fecha=${event.target.value}`);
        }
      }}
      className="h-8 rounded-lg border border-border bg-background px-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
    />
  );
}
