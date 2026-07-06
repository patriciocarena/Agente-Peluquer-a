/**
 * app/(owner)/turnos/loading.tsx — skeleton de carga inicial de la grilla
 * (Server Component fetch de `page.tsx`). Replica la forma del grid (header
 * de columnas de profesional + filas de hora) con `Skeleton`, mismo patrón
 * ya establecido por Fase 2 para sus listados. No requiere datos ni
 * interactividad — Next.js lo muestra automáticamente mientras `page.tsx`
 * resuelve `buildAvailabilityData` + `computeSlots`.
 */
import { Skeleton } from "@/components/ui/skeleton";

const COLUMNAS_SKELETON = 4;
const FILAS_SKELETON = 10;

export default function TurnosLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-24" />
        <div className="flex items-center gap-2">
          <Skeleton className="size-8 rounded-lg" />
          <Skeleton className="h-5 w-40" />
          <Skeleton className="size-8 rounded-lg" />
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <div
          className="grid"
          style={{
            gridTemplateColumns: `80px repeat(${COLUMNAS_SKELETON}, minmax(160px, 1fr))`,
          }}
        >
          <div className="border-b border-border bg-muted" />
          {Array.from({ length: COLUMNAS_SKELETON }).map((_, columna) => (
            <div
              key={`header-${columna}`}
              className="flex items-center gap-2 border-b border-border bg-muted px-2 py-2"
            >
              <Skeleton className="size-6 rounded-full" />
              <Skeleton className="h-3 w-20" />
            </div>
          ))}

          {Array.from({ length: FILAS_SKELETON }).map((_, fila) => (
            <div key={`fila-${fila}`} className="contents">
              <div className="flex h-10 items-center border-b border-border bg-muted px-2">
                <Skeleton className="h-3 w-10" />
              </div>
              {Array.from({ length: COLUMNAS_SKELETON }).map((_, columna) => (
                <div
                  key={`celda-${fila}-${columna}`}
                  className="h-10 border-b border-border p-1"
                >
                  <Skeleton className="h-full w-full" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
