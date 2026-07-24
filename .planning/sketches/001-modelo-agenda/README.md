---
sketch: 001
name: modelo-agenda
question: "¿Qué modelo de vista usar para el administrador de turnos del dashboard?"
winner: "B (Día/staff) como default + A (Semana) como toggle; C (Agenda) fast-follow móvil"
tags: [layout, calendar, turnos, dashboard, agenda]
---

# Sketch 001: Modelo de agenda

## Design Question
El administrador de turnos actual (grilla de un día, columnas = profesionales × filas = slots
de 30min, navegación día por día) es poco funcional con 1 solo profesional (columna solitaria)
y con negocios sin horario cargado (pared de celdas vacías + overlay a pantalla completa).
¿Qué modelo de vista lo resuelve?

## How to View
- Servido: http://127.0.0.1:5299  (server estático temporal; puede estar apagado)
- Archivo: `open .planning/sketches/001-modelo-agenda/index.html`
- Los tabs A/B/C y el toggle "3 vs 1 profesional" (variante B) son interactivos en un
  navegador normal (el sandbox del preview de Claude bloquea el `<script>` inline; Safari/Chrome lo corren).

## Variants
- **★ A: Semana** — columnas = días (Lun–Dom), estilo Google Calendar. Panorama semanal, filtro por profesional. Resuelve "pensar en semanas".
- **★ B: Día (staff)** — columnas = profesionales, bloques con duración real + precio, línea de "ahora", empty-state por columna en línea (no overlay), adaptativo 1-vs-N profesionales. Modelo estándar del rubro, arreglado.
- **C: Agenda** — lista cronológica por día (Hoy/Mañana/…), tarjetas con cliente/servicio/profesional/precio/estado. Ideal móvil y días flojos.

## Winner / Decisión
**Día (B) por defecto en desktop + toggle a Semana (A).** Esos dos juntos matan las dos quejas
(operativo diario por profesional + panorama semanal). **Agenda (C)** queda como fast-follow y
default en móvil. Los tres son vistas del mismo calendario (como Fresha/Booksy/Square), no
modelos excluyentes.

## What to Look For
- A: ¿el panorama semanal ayuda a planificar? ¿los bloques de color se leen?
- B: ¿el empty-state en línea es mejor que el overlay? ¿el caso 1-profesional se siente bien?
- C: ¿la lista es más clara en días flojos / móvil?

## Notas de implementación (para la fase real)
- La grilla real ya está cableada al `availability-engine` (`computeSlots`, servicio sintético
  de grilla, D-07). La evolución es incremental sobre `apps/dashboard/components/grilla-turnos.tsx`
  + `app/(owner)/turnos/page.tsx`, NO un rewrite ni una librería (FullCalendar resource = pago;
  Schedule-X resource view = premium).
- Los mockups son HTML descartable con datos ficticios; nada de esto es código de producción.
