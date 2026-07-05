# Deferred Items — Fase 03 (motor-de-disponibilidad)

Items descubiertos durante la ejecución de planes de esta fase que están
FUERA de alcance del task/plan que los encontró (scope boundary de
execute-plan.md) — no se arreglan aquí, se documentan para una fase/plan
posterior.

## 03-05: `scripts/verify-double-booking.ts` y `scripts/verify-timezone.ts` usan `tenant_id` en el insert de `turno`

**Descubierto durante:** 03-05, al correr un chequeo de tipos extendido
sobre todo `scripts/*.ts` (no gateado por el plan, solo diagnóstico) tras
agregar `"type": "module"` a la raíz para resolver `@turnosbot/availability-engine`
desde `scripts/verify-availability-engine.ts`.

**Síntoma:** `tsc` reporta `error TS2353: Object literal may only specify
known properties, and 'tenant_id' does not exist in type ...` en:
- `scripts/verify-double-booking.ts:70` (función `insertTurno`)
- `scripts/verify-timezone.ts:66` (insert directo)

**Causa:** ambos scripts predatan la migración 0003 (`tenant_id` →
`negocio_id` en `turno` y el resto de las tablas operativas) y nunca se
actualizaron — el propio `03-05-PLAN.md` ya señala esto explícitamente
("NOTA: usa tenant_id, hay que usar negocio_id" en `<interfaces>`).

**Por qué queda fuera de alcance de 03-05:** el plan de 03-05 solo modifica
`packages/availability-engine/src/{booking.ts,booking.test.ts,index.ts}` y
`scripts/verify-availability-engine.ts` (ver `files_modified` del frontmatter)
— arreglar `verify-double-booking.ts`/`verify-timezone.ts` es una corrección
en archivos no tocados por este plan (scope boundary de
`execute-plan.md`: "Only auto-fix issues DIRECTLY caused by the current
task's changes").

**Impacto actual:** estos dos scripts siguen siendo ejecutables vía `tsx`
tal cual (tsx no aplica un chequeo de tipos estricto en runtime), así que
NO están rotos en ejecución — el `insert` con `tenant_id` simplemente sería
rechazado en runtime por la DB real (columna inexistente) si alguien los
corriera hoy contra `bdgufnitakelyialjoqg`. El chequeo de tipos estático los
habría atrapado si `scripts/` estuviera bajo un build gateado, pero no lo
está (no hay `tsconfig.json` propio en `scripts/`, y el build raíz
`tsc -b` solo referencia `packages/availability-engine`,
`packages/db-types`, `packages/shared` — `scripts/` queda fuera del grafo
de proyecto).

**Acción recomendada para una fase/plan posterior:** actualizar
`insertTurno`/el insert directo en ambos scripts de `tenant_id` →
`negocio_id`, y considerar agregar `scripts/` a un tsconfig propio (o al
build raíz) para que este tipo de drift se detecte automáticamente en vez
de descubrirse ad-hoc.
