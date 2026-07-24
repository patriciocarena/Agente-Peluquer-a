# Sketch Manifest

## Design Direction
Rediseño del administrador de turnos del dashboard (`/turnos`). El modelo actual (grilla de un
día, columnas = profesionales × filas = slots de 30min) es poco funcional con 1 profesional o
sin horario cargado. Objetivo: un calendario tipo herramienta del rubro (Fresha/Booksy/Square)
con vistas conmutables, adaptativo a 1 o varios profesionales, en Next.js + Tailwind v4 + shadcn
(base neutral, acento azul, Inter), es-AR, ARS. La grilla real está cableada al availability-engine.

## Reference Points
- Fresha, Booksy, Square Appointments, Salonist, open-salon (Tailwind + shadcn) — day calendar
  con columnas de staff + bloques de color, toggle día/semana, filtro por staff, agenda/lista.
- Google Calendar (vista semana).

## Sketches

| # | Name | Design Question | Winner | Tags |
|---|------|----------------|--------|------|
| 001 | modelo-agenda | ¿Qué modelo de vista usar para el administrador de turnos? | **Día (B) default + Semana (A) toggle**; Agenda (C) fast-follow móvil | layout, calendar, turnos, dashboard |
