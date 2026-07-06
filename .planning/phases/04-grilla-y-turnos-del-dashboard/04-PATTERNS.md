# Phase 4: Grilla y turnos del dashboard - Pattern Map

**Mapped:** 2026-07-05
**Files analyzed:** 21 (new/modified)
**Analogs found:** 21 / 21

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `packages/availability-engine/src/types.ts` (extend) | model/types | transform | itself (extend in place) | exact — additive fields only |
| `packages/availability-engine/src/computeSlots.ts` (extend) | service (pure fn) | transform | itself (extend in place) | exact — conditional branch only |
| `packages/availability-engine/src/booking.ts` (extend: `rescheduleAppointment`) | service (pure+impure fn) | CRUD (update) | `bookAppointment` in same file | exact — sibling function, same file |
| `apps/dashboard/lib/availability-data.ts` (new) | utility (data fetch helper) | request-response / CRUD (read) | `app/(owner)/servicios/page.tsx` fetch block (lines 17-29) | role-match |
| `apps/dashboard/app/(owner)/turnos/page.tsx` (new) | route (Server Component) | request-response | `app/(owner)/servicios/page.tsx` | exact |
| `apps/dashboard/app/(owner)/turnos/loading.tsx` (new) | route (loading skeleton) | request-response | none exists yet in Fase 2/3 (`Skeleton` primitive already installed, no prior `loading.tsx` analog) | no analog — use RESEARCH.md guidance + `components/ui/skeleton.tsx` |
| `apps/dashboard/app/actions/turnos.ts` (new: `crearTurnoManual`, `cancelarTurno`, `reagendarTurno`) | controller (Server Actions) | CRUD | `app/actions/servicios.ts` | exact |
| `apps/dashboard/app/actions/bloqueos.ts` (new: `crearBloqueo`, `eliminarBloqueo`) | controller (Server Actions) | CRUD | `app/actions/servicios.ts` | exact |
| `apps/dashboard/app/actions/clientes.ts` (new: `buscarClientePorTelefono`, `crearClienteInline`) | controller (Server Actions) | CRUD (search + insert) | `app/actions/servicios.ts` (`createServicio` insert shape) | role-match |
| `apps/dashboard/components/grilla-turnos.tsx` (new) | component (Client, grid renderer + click state) | event-driven (click handlers) | `apps/dashboard/components/profesionales-table.tsx` (Client Component owning local state + Server Action calls) | role-match |
| `apps/dashboard/components/slot-popover.tsx` (new) | component (Client, Popover D-03) | event-driven | `components/profesionales-table.tsx`'s `ProfesionalActivoSwitch` (local `useState` + `useTransition` pattern) — no existing Popover in repo | role-match (pattern only, new primitive) |
| `apps/dashboard/components/turno-detail-sheet.tsx` (new) | component (Client, Sheet D-04) | request-response (read detail + dispatch actions) | `components/servicio-dialog.tsx` (Dialog shell + `useTransition` + toast), swap `Dialog`→`Sheet` | role-match |
| `apps/dashboard/components/bloqueo-popover.tsx` (new) | component (Client, Popover D-05) | event-driven | `components/profesionales-table.tsx`'s `ProfesionalActivoSwitch` (confirm + destructive action pattern) | role-match |
| `apps/dashboard/components/turno-form-dialog.tsx` (new: alta manual + reagendar) | component (Client, Dialog + react-hook-form) | CRUD (create/update) | `components/servicio-dialog.tsx` (create/edit dual-mode dialog via optional prop) | exact |
| `apps/dashboard/components/slot-selector.tsx` (new, shared D-10/D-13) | component (Client, slot picker) | request-response (calls `computeSlots` via Server Action) | no direct prior analog; closest structural cousin is `components/negocio-selector.tsx` (controlled selection component driven by server-resolved data) | role-match |
| `apps/dashboard/components/cliente-search.tsx` (new) | component (Client, search + inline create) | request-response | `components/negocio-selector.tsx` (controlled input calling a Server Action, `useTransition`) | role-match |
| `apps/dashboard/components/bloqueo-form-dialog.tsx` (new) | component (Client, Dialog) | CRUD (create) | `components/servicio-dialog.tsx` | exact |
| `apps/dashboard/components/owner-sidebar.tsx` (modify: add "Turnos" nav item) | component (Client, nav) | request-response | itself (modify in place) | exact |
| `apps/dashboard/lib/schemas/turno.ts` / `bloqueo.ts` (new, zod schemas) | model (validation schema) | transform | `lib/schemas/servicio.ts` | exact |
| `apps/dashboard/lib/schemas/cliente.ts` (new, zod schema) | model (validation schema) | transform | `lib/schemas/servicio.ts` | exact |
| `apps/dashboard/lib/negocio-context.ts` (consumed, not modified) | utility | request-response | itself (reference only) | exact — reused as-is |

## Pattern Assignments

### `packages/availability-engine/src/types.ts` (model/types, transform)

**Analog:** itself — extend in place, same file conventions

**Existing shape to extend** (`packages/availability-engine/src/types.ts` lines 43-57, 103-117):
```typescript
export interface ComputeSlotsInput {
  negocioId: string;
  serviceIds: string[];
  professionalId?: string;
  date: string;
}

export interface BookAppointmentInput {
  negocioId: string;
  profesionalId: string;
  clienteId: string;
  serviceIds: string[];
  inicio: string;
  fin: string;
}
```

**Pattern to add** (per RESEARCH.md Pattern 2, D-08): add `skipBookingWindow?: boolean` to BOTH interfaces, with the exact doc-comment convention already used in this file (Spanish, references the decision ID, explains the default):
```typescript
/** D-08 (Fase 4): si true, no aplica la ventana de reserva
 * (BOOKING_MIN_LEAD_MINUTES/BOOKING_MAX_ADVANCE_DAYS). Default false
 * preserva el comportamiento del bot (D-04/D-05, Fase 3). SOLO el
 * dashboard debe pasar true. */
skipBookingWindow?: boolean;
```
Also add a new `RescheduleAppointmentInput` interface (sibling to `BookAppointmentInput`) per RESEARCH.md Pattern 3 — follow the same JSDoc density/style as the rest of this file (every field commented, references decision IDs).

**Row alias convention** (lines 22-27) — if a new row type is ever needed (not expected for this phase), always derive via `Database["public"]["Tables"]["<tabla>"]["Row"]`, never hand-declare a shape.

---

### `packages/availability-engine/src/computeSlots.ts` (service, transform)

**Analog:** itself — single conditional branch at the existing window-filter step

**Exact interception point** (lines 107-108, 135-138):
```typescript
const minStart = now + BOOKING_MIN_LEAD_MINUTES * 60_000;
const maxStart = now + BOOKING_MAX_ADVANCE_DAYS * 24 * 60 * 60_000;
...
const slotsEnVentana = slotsIntervalos.filter(
  (slotInterval) => slotInterval.start >= minStart && slotInterval.start <= maxStart,
);
```
**Becomes:**
```typescript
const slotsEnVentana = input.skipBookingWindow
  ? slotsIntervalos
  : slotsIntervalos.filter(
      (slotInterval) => slotInterval.start >= minStart && slotInterval.start <= maxStart,
    );
```
No other lines in this file change — steps before/after this filter are untouched (RESEARCH.md Pattern 2, verified against live source this session).

---

### `packages/availability-engine/src/booking.ts` (service, CRUD — new `rescheduleAppointment`)

**Analog:** `bookAppointment` in the SAME file (lines 220-300) — structurally mirror it, do not create a new module (CONTEXT.md Claude's Discretion resolved by RESEARCH.md: keep in `booking.ts`).

**Imports pattern** (already present at top of file, lines 47-58) — reuse unchanged:
```typescript
import { TZDate } from "@date-fns/tz";
import { z } from "zod";

import { computeSlots } from "./computeSlots.js";
import type {
  AvailabilityData,
  BookAppointmentInput,
  ComputeSlotsInput,
  ServicioRow,
} from "./types.js";
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@turnosbot/db-types";
```

**Validation pattern** (lines 71-85) — mirror `uuidLike` + `bookAppointmentInputSchema` exactly for a new `rescheduleAppointmentInputSchema`:
```typescript
export const rescheduleAppointmentInputSchema = z.object({
  negocioId: uuidLike,
  turnoId: uuidLike,
  profesionalId: uuidLike,
  inicio: z.iso.datetime(),
  fin: z.iso.datetime(),
});
```

**Core pattern — freshness revalidation + self-exclusion** (mirrors lines 220-250 of `bookAppointment`, with the self-exclusion addition from RESEARCH.md Pattern 3):
```typescript
export async function rescheduleAppointment(
  rawInput: z.infer<typeof rescheduleAppointmentInputSchema>,
  deps: BookAppointmentDeps,
): Promise<BookAppointmentResult> {
  const parsed = rescheduleAppointmentInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      reason: "validation_error",
      issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    };
  }
  const input = parsed.data;
  const { supabase, freshData, now = Date.now() } = deps;

  // Self-exclusion (D-14): the turno being moved must not block its own new slot.
  const dataExcludingSelf: AvailabilityData = {
    ...freshData,
    turnos: freshData.turnos.filter((t) => t.id !== input.turnoId),
  };

  const date = isoDateInZone(input.inicio, freshData.negocio.timezone);
  const computeInput: ComputeSlotsInput = {
    negocioId: input.negocioId,
    serviceIds: [], // reschedule doesn't change services — see Open Question in RESEARCH.md
    professionalId: input.profesionalId,
    date,
    skipBookingWindow: true, // D-07
  };
  const freshSlots = await computeSlots(computeInput, dataExcludingSelf, now);
  // ... same stillAvailable check as bookAppointment (lines 244-249), then:
  // UPDATE turno SET inicio, fin, profesional_id WHERE id = turnoId AND negocio_id = negocioId
  // Reuse isSlotTakenConcurrently(error) unchanged for the 23P01 branch (lines 271-276 pattern).
}
```

**Error handling pattern** (lines 271-276, reused verbatim):
```typescript
if (turnoError) {
  if (isSlotTakenConcurrently(turnoError)) {
    return { ok: false, reason: "slot_taken" };
  }
  return { ok: false, reason: "insert_error", message: turnoError.message };
}
```
Note: no `turno_servicio` insert/compensating-delete needed for reschedule (D-14 explicitly scopes to `inicio`/`fin`/`profesional_id` only) — this is the one structural divergence from `bookAppointment`.

**Barrel export** — add to `packages/availability-engine/src/index.ts` (currently lines 19-23):
```typescript
export { rescheduleAppointment } from "./booking.js";
```

---

### `apps/dashboard/lib/availability-data.ts` (utility, request-response/CRUD-read)

**Analog:** fetch block of `apps/dashboard/app/(owner)/servicios/page.tsx` (lines 17-29)

**Pattern to follow** (negocio-scoped read via RLS client, `.eq("negocio_id", negocio.id)`):
```typescript
const { negocio } = await getNegocioActivo();
const supabase = await createClient();

const { data: servicios, error } = await supabase
  .from("servicio")
  .select("*")
  .eq("negocio_id", negocio.id)
  .order("orden", { ascending: true });

if (error) {
  throw new Error("No pudimos cargar los servicios.");
}
```
Extrapolate to `Promise.all([...])` across the six tables (`horario_trabajo`, `bloqueo`, `turno`, `servicio`, `profesional`, `negocio`) per RESEARCH.md Pattern 1 code example. This helper is imported both by `page.tsx` (grid render) and by every Server Action in `turnos.ts` that needs `deps.freshData` for `bookAppointment`/`rescheduleAppointment` — single source of fetch logic (RESEARCH.md explicit intent, avoid drift).

---

### `apps/dashboard/app/(owner)/turnos/page.tsx` (route, request-response)

**Analog:** `apps/dashboard/app/(owner)/servicios/page.tsx` (full file, 55 lines)

**Structure to copy:**
```typescript
import { getNegocioActivo } from "@/lib/negocio-context";
import { createClient } from "@/lib/supabase/server";
// ... turnos-specific imports

export default async function TurnosPage({ searchParams }: { searchParams: Promise<{ fecha?: string }> }) {
  const { negocio } = await getNegocioActivo();
  const { fecha } = await searchParams; // ?fecha=YYYY-MM-DD per UI-SPEC Layout & Navigation
  // buildAvailabilityData(negocio.id) + computeSlots + raw turno/bloqueo rows for coloring
  // empty states per UI-SPEC (no profesionales activos / sin horario ese día)
  return ( /* header with day-nav + GrillaTurnos */ );
}
```
Header layout (title + single accent CTA) mirrors lines 34-38 of `servicios/page.tsx`; empty-state block (lines 40-49) mirrors the "Todavía no tenés profesionales activos" / "Sin horario cargado para este día" states from UI-SPEC.

---

### `apps/dashboard/app/actions/turnos.ts` (controller, CRUD)

**Analog:** `apps/dashboard/app/actions/servicios.ts` (full file, 162 lines)

**Imports pattern** (lines 17-24):
```typescript
"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/require-role";
import { getNegocioActivo } from "@/lib/negocio-context";
import { createClient } from "@/lib/supabase/server";
import { turnoSchema, type TurnoInput } from "@/lib/schemas/turno";
```

**Auth + negocio-scoping pattern** (lines 42-52, applies to every action):
```typescript
export async function crearTurnoManual(input: TurnoInput): Promise<TurnoActionResult> {
  await requireRole("owner");

  const parsed = turnoSchema.safeParse(input);
  if (!parsed.success) {
    return { error: SAVE_ERROR_COPY };
  }

  const { negocio } = await getNegocioActivo(); // negocio_id NEVER from client input (T-02-13 equivalent)
  const supabase = await createClient();
  // buildAvailabilityData(negocio.id) → deps.freshData
  // bookAppointment({ ...input, negocioId: negocio.id, skipBookingWindow: true }, { supabase, freshData })
}
```

**Error handling / result type convention** (lines 26-30):
```typescript
const SAVE_ERROR_COPY = "No pudimos guardar los cambios. Revisá los datos marcados e intentá de nuevo.";
const GENERIC_ERROR_COPY = "No pudimos completar la operación. Intentá de nuevo.";
export type TurnoActionResult = { error: string } | { success: true };
```
Map `bookAppointment`/`rescheduleAppointment`'s `BookAppointmentResult` union (`ok:false, reason:"slot_taken"` → UI-SPEC copy "Ese horario se acaba de ocupar...", `reason:"insert_error"` → `GENERIC_ERROR_COPY`) onto this same `{error}`/`{success:true}` shape so the dialog components (`turno-form-dialog.tsx`) don't need a different result contract than `servicio-dialog.tsx` already expects.

**revalidatePath pattern** (line 74, 103, 127, 159 — end of every write): `revalidatePath("/turnos")` at the end of every action in this file (Pitfall 4 — do not forget this on the new route).

---

### `apps/dashboard/app/actions/bloqueos.ts` (controller, CRUD)

**Analog:** `apps/dashboard/app/actions/servicios.ts` `createServicio`/`toggleServicioActivo` (lines 42-76, 108-129) — plain insert/update, no engine involvement (bloqueo creation is a direct table write, not routed through `bookAppointment`).

```typescript
export async function crearBloqueo(input: BloqueoInput): Promise<BloqueoActionResult> {
  await requireRole("owner");
  const parsed = bloqueoSchema.safeParse(input);
  if (!parsed.success) return { error: SAVE_ERROR_COPY };
  const { negocio } = await getNegocioActivo();
  const supabase = await createClient();
  const { error } = await supabase.from("bloqueo").insert({ negocio_id: negocio.id, ...parsed.data });
  if (error) return { error: GENERIC_ERROR_COPY };
  revalidatePath("/turnos");
  return { success: true };
}

export async function eliminarBloqueo(bloqueoId: string): Promise<BloqueoActionResult> {
  await requireRole("owner");
  const { negocio } = await getNegocioActivo();
  const supabase = await createClient();
  const { error } = await supabase
    .from("bloqueo")
    .delete()
    .eq("id", bloqueoId)
    .eq("negocio_id", negocio.id); // defensa en profundidad, same as servicios.ts line 97
  if (error) return { error: GENERIC_ERROR_COPY };
  revalidatePath("/turnos");
  return { success: true };
}
```

---

### `apps/dashboard/app/actions/clientes.ts` (controller, CRUD search+insert)

**Analog:** RESEARCH.md Pattern 4 (already a concrete, ready-to-copy skeleton), structurally following `servicios.ts`'s auth/scoping conventions:
```typescript
"use server";
export async function buscarClientePorTelefono(telefono: string) {
  await requireRole("owner");
  const { negocio } = await getNegocioActivo();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cliente")
    .select("id, nombre, telefono")
    .eq("negocio_id", negocio.id)
    .eq("telefono", telefono.trim());
  if (error) return { error: GENERIC_ERROR_COPY };
  return { clientes: data ?? [] };
}

export async function crearClienteInline(telefono: string, nombre?: string) {
  await requireRole("owner");
  const { negocio } = await getNegocioActivo();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cliente")
    .insert({ negocio_id: negocio.id, telefono: telefono.trim(), nombre: nombre?.trim() || null })
    .select("id")
    .single();
  if (error) return { error: GENERIC_ERROR_COPY };
  return { clienteId: data.id };
}
```

---

### `apps/dashboard/components/turno-form-dialog.tsx` (component, CRUD create/update)

**Analog:** `apps/dashboard/components/servicio-dialog.tsx` (full file, 178 lines) — reuse the exact create/edit dual-mode-via-optional-prop pattern.

**Imports pattern** (lines 8-37):
```typescript
"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { crearTurnoManual, reagendarTurno } from "@/app/actions/turnos";
import { turnoSchema, type TurnoInput } from "@/lib/schemas/turno";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
```

**Dual create/edit mode via optional prop** (lines 39-58, 60-76):
```typescript
type Props = { turno?: TurnoConDetalle; negocioId: string; /* + pre-loaded profesionalId/horaInicio for D-03 */ };

export function TurnoFormDialog({ turno, ... }: Props) {
  const isReagendar = Boolean(turno);
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  function onSubmit(values: TurnoInput) {
    setServerError(null);
    startTransition(async () => {
      const result = isReagendar
        ? await reagendarTurno(turno!.id, values)
        : await crearTurnoManual(values);
      if ("error" in result) {
        setServerError(result.error);
        return;
      }
      toast.success(isReagendar ? "Turno reagendado." : "Turno creado.");
      setOpen(false);
    });
  }
  // ... Dialog/Form JSX mirrors servicio-dialog.tsx structure; fields replaced with
  // cliente-search.tsx + slot-selector.tsx per D-09/D-10 instead of plain Input/Textarea.
}
```
**Loading-state copy** per UI-SPEC ("Guardando…"): swap the plain `disabled={isPending}` submit button label for conditional text, matching UI-SPEC's "Durante useTransition" convention (`servicio-dialog.tsx` itself doesn't do inline loading text — this is a UI-SPEC-mandated addition on top of the base pattern).

---

### `apps/dashboard/components/bloqueo-form-dialog.tsx` (component, CRUD create)

**Analog:** `apps/dashboard/components/servicio-dialog.tsx` — same Dialog+Form+useTransition+toast shell, single-mode (create only, no edit), fields: `profesionalId` (pre-loaded), `inicio`/`fin` (pre-loaded start, duration input), `motivo` (optional Textarea, mirrors the `descripcion` field pattern at lines 109-121).

---

### `apps/dashboard/components/turno-detail-sheet.tsx` (component, request-response)

**Analog:** `apps/dashboard/components/servicio-dialog.tsx` shell (Dialog→Sheet swap) for the `useTransition`+toast+error pattern, PLUS `apps/dashboard/components/profesionales-table.tsx`'s `ProfesionalActivoSwitch` (lines 54-114) for the "confirm destructive action via AlertDialog" sub-pattern (Cancelar turno, D-12).

**Sheet shell** (swap `Dialog`→`Sheet` per UI-SPEC D-04, same `components/ui/sheet.tsx` primitive already installed):
```typescript
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
```

**Cancelar-turno AlertDialog** — copy `profesionales-table.tsx` lines 88-111 verbatim in shape, swapping copy for UI-SPEC's exact strings:
```typescript
<AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>¿Seguro que querés cancelar este turno?</AlertDialogTitle>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel disabled={isPending}>Volver</AlertDialogCancel>
      <AlertDialogAction variant="destructive" disabled={isPending} onClick={(e) => { e.preventDefault(); apply(); }}>
        Confirmar
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```
Note UI-SPEC explicitly has NO `AlertDialogDescription`/motivo field (D-12) — simpler than the profesional-deactivate analog, which has a description line; omit it here.

---

### `apps/dashboard/components/bloqueo-popover.tsx` (component, event-driven)

**Analog:** `profesionales-table.tsx`'s `ProfesionalActivoSwitch` for the confirm+destructive-action wiring pattern (`useState` + `useTransition` + `toast`), with `Popover`/`PopoverContent`/`PopoverTrigger` (new primitive, not yet in repo — install via `shadcn add popover` per UI-SPEC) replacing the `AlertDialog` shell since D-05 is "info + single destructive button", not a full confirm dialog.

---

### `apps/dashboard/components/slot-popover.tsx` (component, event-driven, D-03)

**Analog:** No exact prior analog (Popover not yet used in repo) — closest pattern is the `useTransition`/local-state wiring from `profesionales-table.tsx`, combined with the two-button layout described in UI-SPEC:
```typescript
<Popover open={open} onOpenChange={setOpen}>
  <PopoverTrigger asChild>{/* the empty grid cell button */}</PopoverTrigger>
  <PopoverContent className="w-48 p-2">
    <div className="flex flex-col gap-1">
      <Button variant="ghost" onClick={() => { setOpen(false); setDialog("turno"); }}>
        <Plus /> Crear turno
      </Button>
      <Button variant="ghost" onClick={() => { setOpen(false); setDialog("bloqueo"); }}>
        <Lock /> Bloquear
      </Button>
    </div>
  </PopoverContent>
</Popover>
```
Pass `profesionalId` + `horaInicio` as props into the subsequently-opened `TurnoFormDialog`/`BloqueoFormDialog` (UI-SPEC D-03: "pre-cargados vía props, no vía re-tipeo").

---

### `apps/dashboard/components/grilla-turnos.tsx` (component, event-driven, grid renderer)

**Analog:** `apps/dashboard/components/profesionales-table.tsx` for the overall "Client Component owning per-cell interactive state, receiving pre-fetched server data as props" shape — no direct grid analog exists in the repo (this is the first grid-shaped UI). Structure per UI-SPEC Densidad section: CSS Grid, `sticky left-0` hour column, `minmax(160px, 1fr)` professional columns, `overflow-x-auto` when ≥6 professionals.

---

### `apps/dashboard/components/slot-selector.tsx` (component, request-response, shared D-10/D-13)

**Analog:** `apps/dashboard/components/negocio-selector.tsx` for the "controlled selection driven by server-resolved options, dispatch on click" shape (lines 32-65) — adapted from a `Select` dropdown to a grid of `Button variant="outline"` chips per UI-SPEC ("`grid-cols-4 gap-2`"). Options come from a Server Action wrapping `computeSlots` (not from `negocio-selector.tsx`'s direct table read) — the data-fetching half instead follows `buscarClientePorTelefono`'s Server Action skeleton (Pattern 4 above).

---

### `apps/dashboard/components/cliente-search.tsx` (component, request-response, D-09)

**Analog:** `apps/dashboard/components/negocio-selector.tsx` for the "Client Component, `useTransition`, calls a Server Action on interaction" shape; combined with `servicio-dialog.tsx`'s inline-form-field pattern (lines 109-121, `descripcion` Textarea with `value ?? ""` null-guard) for the inline "nombre opcional" field when no cliente match is found.

---

### `apps/dashboard/components/owner-sidebar.tsx` (modify — add nav item)

**Analog:** itself, `NAV_ITEMS` array (lines 30-34):
```typescript
const NAV_ITEMS = [
  { href: "/turnos", label: "Turnos", icon: CalendarDays }, // NEW — inserted FIRST per UI-SPEC Layout & Navigation
  { href: "/profesionales", label: "Profesionales", icon: Users },
  { href: "/servicios", label: "Servicios", icon: Scissors },
  { href: "/negocio", label: "Negocio", icon: Store },
] as const;
```
Add `CalendarDays` to the `lucide-react` import on line 16. No other change to this file — the `.map()` render loop (lines 50-63) already handles any array length/order.

---

### `apps/dashboard/lib/schemas/turno.ts`, `bloqueo.ts`, `cliente.ts` (model, transform)

**Analog:** `apps/dashboard/lib/schemas/servicio.ts` (full file, 27 lines) — exact structural template:
```typescript
import { z } from "zod";

export const turnoSchema = z.object({
  profesionalId: z.string().uuid(), // or the uuidLike regex pattern from booking.ts if consistency with the engine's validation is preferred
  clienteId: z.string().uuid(),
  serviceIds: z.array(z.string().uuid()).min(1, "Elegí al menos un servicio."),
  inicio: z.string(), // ISO datetime, populated from slot-selector.tsx selection
  // ...
});

export type TurnoInput = z.infer<typeof turnoSchema>;
```
Same doc-comment convention as `servicio.ts` (explain WHY each validation rule exists, reference decision IDs when relevant — e.g. D-12's "sin campo de motivo" justifies why `bloqueoSchema` has no `motivo`-required rule, only optional).

## Shared Patterns

### Server Action auth + negocio-scoping (applies to ALL new Server Actions in this phase)
**Source:** `apps/dashboard/app/actions/servicios.ts` lines 42-52, 90-97
**Apply to:** `app/actions/turnos.ts`, `app/actions/bloqueos.ts`, `app/actions/clientes.ts`
```typescript
export async function someAction(input: SomeInput): Promise<SomeActionResult> {
  await requireRole("owner");
  const parsed = someSchema.safeParse(input);
  if (!parsed.success) return { error: SAVE_ERROR_COPY };
  const { negocio } = await getNegocioActivo(); // negocio_id NEVER trusted from client
  const supabase = await createClient(); // RLS client, never service_role
  // ... .eq("negocio_id", negocio.id) as defense-in-depth on every write/delete
  revalidatePath("/turnos"); // MUST NOT be forgotten (Pitfall 4)
  return { success: true };
}
```

### Dialog shell: react-hook-form + zodResolver + useTransition + sonner
**Source:** `apps/dashboard/components/servicio-dialog.tsx` (full file)
**Apply to:** `turno-form-dialog.tsx`, `bloqueo-form-dialog.tsx`
```typescript
const form = useForm<Input>({ resolver: zodResolver(schema), values: { /* defaults from optional entity prop */ } });
const [isPending, startTransition] = useTransition();
function onSubmit(values: Input) {
  startTransition(async () => {
    const result = isEdit ? await updateX(id, values) : await createX(values);
    if ("error" in result) { setServerError(result.error); return; }
    toast.success(isEdit ? "X actualizado." : "X creado.");
    setOpen(false);
  });
}
```

### Destructive confirmation: AlertDialog
**Source:** `apps/dashboard/components/profesionales-table.tsx` lines 88-111 (`ProfesionalActivoSwitch`)
**Apply to:** cancel-turno confirmation (`turno-detail-sheet.tsx`), eliminar-bloqueo (`bloqueo-popover.tsx`)
```typescript
<AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
  <AlertDialogContent>
    <AlertDialogHeader><AlertDialogTitle>{copy}</AlertDialogTitle></AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel disabled={isPending}>Volver</AlertDialogCancel>
      <AlertDialogAction variant="destructive" disabled={isPending} onClick={(e) => { e.preventDefault(); apply(); }}>
        Confirmar
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

### Availability engine: pure-function extension discipline
**Source:** `packages/availability-engine/src/computeSlots.ts`, `booking.ts`, `types.ts`
**Apply to:** all engine changes (D-08, D-14)
- Never duplicate availability math in the dashboard — always call `computeSlots`/`bookAppointment`/new `rescheduleAppointment`.
- Every new/changed field gets a Spanish JSDoc comment referencing the decision ID (D-08, D-14) and its default behavior, matching the existing density of comments in these three files.
- `negocioId` is always caller-supplied and caller-trusted for scoping (`T-03-01` — the engine itself does not enforce isolation); every Server Action must derive it from `getNegocioActivo()`, never from client input.

### RLS-only Supabase client in the dashboard (never `service_role`)
**Source:** `apps/dashboard/lib/supabase/server.ts` (referenced, not modified), consistently used in `servicios.ts`/`profesionales.ts`
**Apply to:** every new Server Action and `lib/availability-data.ts` — `deps.supabase` passed into `bookAppointment`/`rescheduleAppointment` must be this same RLS client, never `lib/supabase/admin.ts`.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `apps/dashboard/app/(owner)/turnos/loading.tsx` | route (skeleton) | request-response | No prior `loading.tsx` exists in Fase 2/3 routes — follow RESEARCH.md's guidance (`Skeleton` primitive, replicate grid shape) rather than a codebase analog. |
| `apps/dashboard/components/grilla-turnos.tsx` (grid layout itself) | component | event-driven | First grid-shaped UI in this codebase — no prior CSS-Grid/table-grid component to copy structurally; follow 04-UI-SPEC.md "Densidad de la grilla" section directly. |
| Popover-based components (`slot-popover.tsx`, `bloqueo-popover.tsx`) | component | event-driven | `Popover` is a net-new shadcn primitive for this phase (not yet installed) — no existing Popover usage in the repo to copy; follow shadcn's generated `components/ui/popover.tsx` API directly, combined with the `useTransition`/state patterns listed above. |

## Metadata

**Analog search scope:** `apps/dashboard/app/`, `apps/dashboard/components/`, `apps/dashboard/lib/`, `packages/availability-engine/src/`
**Files scanned:** ~70 (via Glob) + 10 read in full
**Pattern extraction date:** 2026-07-05
