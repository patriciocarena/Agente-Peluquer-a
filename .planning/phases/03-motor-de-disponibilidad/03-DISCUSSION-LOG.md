# Phase 3: Motor de disponibilidad - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-04
**Phase:** 03-motor-de-disponibilidad
**Areas discussed:** Alineación a la grilla, Buffer entre turnos, Auto-asignación de profesional, Ventana de reserva

---

## Alineación a la grilla

| Option | Description | Selected |
|--------|-------------|----------|
| Siempre a la grilla | Slots en múltiplos de la granularidad (9:00, 9:30…); prolijo, puede dejar hueco muerto | ✓ |
| Encaje libre | Slots en cualquier minuto que quepa tras un turno (9:50, 10:35); aprovecha todo | |
| Híbrido | Grilla salvo encadenar pegado tras un turno existente | |

**User's choice:** Siempre a la grilla
**Notes:** Estándar en peluquerías y más legible por WhatsApp.

---

## Buffer entre turnos

| Option | Description | Selected |
|--------|-------------|----------|
| Sin buffer (v1) | Turnos back-to-back, máxima capacidad, sin campo nuevo de schema | ✓ |
| Buffer fijo por negocio | Colchón de X min configurable (negocio.buffer_min) | |
| Buffer por servicio | Cada servicio define su colchón | |

**User's choice:** Sin buffer (v1)
**Notes:** Buffer configurable queda como idea diferida.

---

## Auto-asignación de profesional (AVAIL-05)

| Option | Description | Selected |
|--------|-------------|----------|
| Hueco más temprano | El profesional que puede atender antes en el horario pedido | ✓ |
| Orden fijo del dueño | El primero de la lista del dueño que esté libre | |
| Reparto equitativo | El menos ocupado, para balancear carga | |

**User's choice:** Hueco más temprano
**Notes:** Maximiza que el cliente consiga turno cuanto antes.

---

## Ventana de reserva

| Option | Description | Selected |
|--------|-------------|----------|
| Mín. anticipación + máx. días | Configurable; evita reservas "para ya" y agenda infinita | ✓ |
| Simple v1: solo futuro | Cualquier slot futuro, sin límites | |
| Solo mín. anticipación | Mínimo sí, sin tope de días | |

**User's choice:** Mín. anticipación + máx. días
**Follow-up 1 — valores por defecto:** mínimo 1 hora de anticipación / máximo 30 días (free text del usuario).
**Follow-up 2 — dónde viven los límites:** Defaults fijos en v1 (hardcodeados en el motor; exponer como config por negocio se difiere a Fase 4).

---

## Claude's Discretion

- Estructura del algoritmo de intervalos, librería de fechas, y forma interna de la API más allá del contrato existente.
- Ubicación de la función de agendado (mismo paquete vs módulo booking adyacente).
- Criterio determinístico de desempate en la auto-asignación.

## Deferred Ideas

- Buffer configurable entre turnos (por negocio o por servicio).
- Ventana de reserva configurable por negocio (columnas + UI en perfil) → Fase 4.
- Reparto equitativo / balanceo de carga para auto-asignación.
