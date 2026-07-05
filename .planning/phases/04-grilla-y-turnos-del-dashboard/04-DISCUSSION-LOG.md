# Phase 4: Grilla y turnos del dashboard - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-05
**Phase:** 04-grilla-y-turnos-del-dashboard
**Areas discussed:** Layout e interacción de la grilla, Ventana de reserva para el dueño, Alta manual de turno, Cancelar y reagendar

---

## Layout e interacción de la grilla

| Option | Description | Selected |
|--------|-------------|----------|
| Columnas = profesionales, un día | Eje vertical = horas del día, columnas = profesionales activos, navegación día por día | ✓ |
| Lista por profesional (tabs) | Un tab por profesional con lista vertical de horarios | |
| Semana completa por profesional | Columnas = días, para un profesional a la vez | |

**Notas:** Se eligió por ser el layout estándar de software de turnos de peluquería/barbería.

| Option (Estados visuales) | Description | Selected |
|--------|-------------|----------|
| Color por estado | Verde/celeste=confirmado, amarillo=pendiente, gris rayado=bloqueo, blanco=libre | ✓ |
| Solo texto/etiqueta | Sin color, solo etiquetas | |

| Option (Interacción crear) | Description | Selected |
|--------|-------------|----------|
| Click en slot libre → menú | Popover con "Crear turno"/"Bloquear", abre modal con datos pre-cargados | ✓ |
| Botón fijo + selección manual | Botones arriba de la grilla, sin click directo en celdas | |

| Option (Click turno existente) | Description | Selected |
|--------|-------------|----------|
| Abre panel de detalle | Cliente, servicios, precio, horario + acciones Cancelar/Reagendar | ✓ |
| Abre menú directo de acciones | Popover chico sin detalle intermedio | |

| Option (Click bloqueo existente) | Description | Selected |
|--------|-------------|----------|
| Ver motivo + eliminar | Popover con motivo (si hay) + botón desbloquear | ✓ |
| Solo eliminar | Sin ver detalle | |

| Option (Post-cancelación) | Description | Selected |
|--------|-------------|----------|
| Desaparece, slot libre | Celda vuelve a blanco al instante; turno persiste en DB como historial | ✓ |
| Queda tachado | Celda se mantiene visible tachada/gris | |

---

## Ventana de reserva para el dueño

| Option | Description | Selected |
|--------|-------------|----------|
| El dueño no tiene límites | Puede cargar turnos sin las reglas de 60min/30d pensadas para el bot | ✓ |
| Mismas reglas que el bot | Consistencia total entre ambos caminos | |
| Sin lead time, sí máx 30 días | Híbrido | |

**Notas:** Se identificó una implicancia técnica — `computeSlots` aplica el filtro internamente y `bookAppointment` siempre revalida contra `computeSlots`. Se preguntó si el usuario quería especificar la forma exacta del bypass o delegarlo.

| Option (Forma del bypass) | Description | Selected |
|--------|-------------|----------|
| Que lo decida el planner | Se registra como requisito funcional, el planner elige la forma técnica | ✓ |
| Flag explícito en el input | `skipBookingWindow?: boolean` en el input | |

---

## Alta manual de turno (cliente que llama/viene)

| Option (Cliente inexistente) | Description | Selected |
|--------|-------------|----------|
| Buscar o crear al vuelo | Búsqueda por teléfono/nombre, formulario inline si no hay match | ✓ |
| Requiere cliente ya existente | Pantalla aparte para crear cliente primero | |

| Option (Elección de slot) | Description | Selected |
|--------|-------------|----------|
| Reutiliza la grilla real de disponibilidad | Muestra huecos calculados por `computeSlots` | ✓ |
| Hora libre por selector numérico | Input de hora directo, validación al guardar | |

---

## Cancelar y reagendar

| Option (Reagendar UX) | Description | Selected |
|--------|-------------|----------|
| Modal con la grilla de disponibilidad | Reutiliza el selector de slot del alta manual | ✓ |
| Drag-and-drop directo sobre la grilla | Arrastrar celda a nuevo hueco | |

| Option (Cancelar) | Description | Selected |
|--------|-------------|----------|
| Confirmación simple, sin motivo | Diálogo Confirmar/Volver | ✓ |
| Confirmación + motivo opcional | Campo de texto opcional | |

| Option (Reagendar — modelo de datos) | Description | Selected |
|--------|-------------|----------|
| Mismo turno, UPDATE inicio/fin | Preserva `turno_id`, requiere nueva función `rescheduleAppointment` | ✓ |
| Cancelar + crear nuevo | Reutiliza 100% el camino de alta existente, pierde continuidad de id | |

**Notas:** Se marcó como relevante también para el bot en Fase 6 (BOT-10 exige "misma lógica de dominio que el dashboard").

---

## Claude's Discretion

- Forma exacta del bypass de ventana de reserva (nombre del flag, dónde vive).
- Forma exacta de `rescheduleAppointment` (firma, manejo de errores).
- Densidad exacta de la grilla / comportamiento con muchos profesionales.
- Patrón de fetch/revalidación (Server Component + revalidatePath vs. cliente con refetch).
- Empty state de la grilla (negocio sin profesionales activos o sin horario ese día).

## Deferred Ideas

- Drag-and-drop de turnos sobre la grilla (reagendar) — v2/mejora futura.
- Motivo de cancelación como campo de schema — requeriría migración, no en v1.
- Bloqueos recurrentes — la tabla `bloqueo` solo soporta instancias puntuales; el horario semanal regular ya cubre la recurrencia.
