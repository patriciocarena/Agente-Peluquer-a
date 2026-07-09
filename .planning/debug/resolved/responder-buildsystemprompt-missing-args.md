---
status: resolved
trigger: "apps/bot no typechequea en main (35172ef, pre-existente, ajeno a SEC-01): responder.ts:365 llama buildSystemPrompt() sin args cuando la firma pide 4 (TS2554: Expected 4 arguments, but got 0), dentro del path de retry del guard de empty-text-after-tool-call."
created: 2026-07-09T00:00:00Z
updated: 2026-07-09T00:00:00Z
---

## Current Focus

hypothesis: "CONFIRMADA. Regresión por call-site perdido: la firma de buildSystemPrompt cambió a 4 args y se actualizó la llamada principal pero no la del retry."
next_action: "N/A — resuelto y verificado."

## Symptoms

expected: |
  `pnpm --filter @turnosbot/bot run typecheck` pasa limpio.
actual: |
  src/conversation/responder.ts(365,17): error TS2554: Expected 4 arguments,
  but got 0. Confirmado pre-existente en main: con los edits de db-types de
  07-01 stasheados, el typecheck de apps/bot igual reportaba responder.ts(365).
errors: |
  TS2554: Expected 4 arguments, but got 0.
started: |
  Regresión latente: introducida cuando el "gap nombre" (06-UAT) cambió la
  firma de buildSystemPrompt a (fechaHoy, diaSemanaHoy, timezone, clienteNombre),
  actualizando la llamada principal (responder.ts:273) pero NO la del guard de
  empty-text-retry (responder.ts:365), que venía del fix de la sesión
  responder-empty-text-after-tool-call (escrita cuando buildSystemPrompt() no
  tomaba args). Nunca se detectó porque el build de main quedó sin verificar.

## Evidence

- timestamp: 2026-07-09T00:00:00Z
  checked: apps/bot/src/conversation/systemPrompt.ts:81 + responder.ts (todas las llamadas)
  found: |
    buildSystemPrompt(fechaHoy: string, diaSemanaHoy: string, timezone: string,
    clienteNombre: string | null): string. Dos call-sites en responder.ts:
    - 273 (principal): buildSystemPrompt(fechaHoy, diaSemanaHoy, timezone, clienteNombre) ✓
    - 365 (retry empty-text): buildSystemPrompt() ✗ — 0 args.
    Las 4 variables (fechaHoy/diaSemanaHoy en :255, timezone, clienteNombre en
    :267) están declaradas en la misma función, antes de :365 y en scope.
  implication: |
    Fix determinista: replicar los 4 args de la llamada principal en la del
    retry. No cambia comportamiento (el retry siempre debió usar el mismo
    system prompt contextualizado).

## Resolution

root_cause: |
  Call-site perdido en un cambio de firma. El "gap nombre" (06-UAT) hizo
  buildSystemPrompt paramétrico (4 args de contexto fecha/tz/nombre) y
  actualizó responder.ts:273 pero no responder.ts:365 (el guard de
  empty-text-retry, agregado por el fix de responder-empty-text-after-tool-call
  cuando buildSystemPrompt aún era sin-args). El build de main quedó sin
  verificar, así que la regresión de tipos pasó desapercibida.
fix: |
  responder.ts:365 — buildSystemPrompt() → buildSystemPrompt(fechaHoy,
  diaSemanaHoy, timezone, clienteNombre). El retry ahora usa el mismo system
  prompt contextualizado que el intento principal (comportamiento correcto: el
  reintento debe conocer la fecha real y el nombre del cliente igual que el
  intento original).
verification: |
  `corepack pnpm --filter @turnosbot/bot run typecheck` ya no reporta
  responder.ts:365. Los únicos errores restantes en apps/bot son los ESPERADOS
  de 07-02 (getWhatsappToken.ts referencia la columna whatsapp_token dropeada
  por 0005), que 07-02 migra.
files_changed:
  - apps/bot/src/conversation/responder.ts
