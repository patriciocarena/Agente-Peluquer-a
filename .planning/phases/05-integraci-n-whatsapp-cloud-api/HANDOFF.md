# Handoff — Fase 5: Integración WhatsApp Cloud API

**Para:** quien continúe el desarrollo en su propia computadora, en una sesión nueva de Claude Code.
**Estado al momento de este handoff:** Fase 5 **planificada al 100%** (6 planes, verificados por el plan-checker) y **en ejecución** — Waves 1 y 2 completas y fusionadas a la rama (4/6 planes), Wave 3 (05-05) es el próximo paso. Se frenó acá por límite de tokens de la sesión anterior, no por ningún bloqueante técnico.

---

## 0. Setup (una sola vez)

```bash
git clone https://github.com/patriciocarena/Agente-Peluquer-a.git
cd Agente-Peluquer-a
git checkout claude-phase-04-uat-fixes   # rama activa — NO está en main todavía
pnpm install
```

> ⚠️ **CREDENCIALES (bloqueante):** el archivo `.env` está gitigneado y **no viaja en el repo**. Pedile las claves a Augusto o Patricio y creá tu propio `.env` en la raíz **y otro en `apps/dashboard/.env`** (Next.js sólo lee `.env` de su propio directorio, no del root del monorepo — ver `.env.example` en la raíz para el formato). La única base de datos de este proyecto es Supabase **`bdgufnitakelyialjoqg`** — ver reglas de aislamiento abajo. Sin esto, `pnpm -r run build` falla en `apps/dashboard` (necesita `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` reales para generar `/admin` en build time).

Después abrí Claude Code dentro de la carpeta del proyecto.

---

## 1. Reglas duras del proyecto (leer sí o sí)

- **`CLAUDE.md`** en la raíz es autoritativo: stack, pitfalls y "What NOT to Use".
- **Aislamiento:** este proyecto (TurnosBot) **no tiene nada que ver** con el proyecto del restaurante. Nunca tocar Supabase `hzgunbftloevclkohcdf`. La única DB es `bdgufnitakelyialjoqg`.
- **Workflow GSD:** no editar archivos por fuera de un comando GSD. Se entra por `/gsd-plan-phase`, `/gsd-execute-phase`, etc.

---

## 2. Qué está hecho

Todo commiteado en `claude-phase-04-uat-fixes`:

- **Planificación completa**: `.planning/phases/05-integraci-n-whatsapp-cloud-api/05-CONTEXT.md`, `05-RESEARCH.md`, `05-VALIDATION.md`, `05-PATTERNS.md`, y los **6 planes** `05-01-PLAN.md` .. `05-06-PLAN.md` (4 waves), todos verificados por el plan-checker sin bloqueantes.
- **Ejecución — Wave 1** (`05-01`, fusionado): dependencias nuevas (`pg-boss`, `@fastify/rate-limit`, `@fastify/helmet`, `zod`), vitest corriendo en `apps/bot`, variables de entorno de WhatsApp en `env.ts`/`.env.example`, accesores de **escritura** en `negocioScoped` (antes sólo lectura), migración idempotente `0004_mensaje_wa_message_id_unique.sql` (documenta el UNIQUE que ya existía desde `0001`, no rompe nada).
- **Ejecución — Wave 2** (`05-02`, `05-03`, `05-04`, fusionados, corrieron en paralelo sin conflicto de archivos):
  - `05-02`: `signature.ts` (verificación HMAC constant-time) + `payload.ts` (zod schema del payload de Meta).
  - `05-03`: `getWhatsappToken.ts` (choke point D-04) + `graphClient.ts` (envío saliente, gateado por `WHATSAPP_LIVE`).
  - `05-04`: `findOrCreateCliente.ts` (match exacto por `wa_id`), `findOrCreateConversacion.ts` (ventana 24h), `responder.ts` (stub determinístico, lo reemplaza la Fase 6).
- **Post-merge gates**: build (`pnpm -r --if-present run build`) y test (`pnpm -r --if-present run test`) en verde después de cada wave. `apps/bot` tiene 24 tests pasando.
- **Tracking**: `.planning/ROADMAP.md` y `.planning/STATE.md` actualizados y commiteados después de cada wave (`summary_count: 4` de 6).

---

## 3. El siguiente paso — Wave 3 y 4

En Claude Code, correr:

```
/gsd-execute-phase 5
```

Esto va a detectar que `05-01`..`05-04` ya tienen `SUMMARY.md` y arrancar directamente en:

- **Wave 3 — `05-05`** (depende de `05-02/03/04`, ya completos): el worker de pg-boss (`inboundWorker.ts` + `boss.ts`) — tenant resolution estricta por `phone_number_id`, dedup durable, gate de ventana 24h, conexión pg-boss en modo sesión puerto 5432 (nunca el pooler 6543).
- **Wave 4 — `05-06`** (depende de `05-02` y `05-05`): el webhook de Fastify (handshake GET + POST verificar-encolar-200) + `server.ts` + script de verificación local firmada (sin necesitar cuenta de Meta real).

---

## 4. Detalle técnico para quien ejecute (landmine ya encontrada — no lo repitas)

**Bug en el paso de limpieza de worktrees (Windows):** después de que `gsd_run query worktree.cleanup-wave` mergea exitosamente la rama del executor, el paso final de `git worktree remove` falla con:
```
fatal: validation failed, cannot remove working tree: '.../.git' does not exist
```
El merge **sí se aplica** (se ve en `git log`), sólo falla el cleanup del directorio. Solución manual que ya funcionó dos veces en esta sesión:
```bash
git worktree remove "<path>" --force   # falla igual, ignorar
git worktree prune
git branch -D worktree-agent-<id>
rm -rf "<path>"
```
Si el manifest JSON tiene más de una entrada y una ya se limpió a mano, hay que **sacarla del manifest** (editar el JSON) antes de reintentar `cleanup-wave`, porque el comando no tolera re-procesar una entrada cuyo directorio ya no existe.

**Otro bug ya corregido en esta sesión:** el executor a veces reporta su **propio último commit** como `expected_base` en el bloque `<worktree_metadata>` de retorno, en vez del commit real donde forkeó el worktree. Si `worktree.cleanup-wave` da `base_mismatch`, verificar con `git merge-base <rama-main> <rama-worktree>` y corregir el campo `expected_base` en el manifest JSON a mano antes de reintentar. En esta sesión, para los agentes de Wave 2 se les pidió explícitamente en el prompt que usaran el valor literal de base pasado por el orquestador (no su propio HEAD), y funcionó bien las 3 veces — recomendado seguir haciendo eso para Waves 3 y 4.

**node_modules desincronizado tras cada merge:** cada executor corre su propio `pnpm install` dentro de su worktree aislado; al mergear, el `pnpm-lock.yaml` cambia pero el `node_modules` de la carpeta principal NO se actualiza solo. Correr `pnpm install` en la raíz después de cada wave, antes del build/test gate.

---

## 5. Alcance de la Fase 5 (para no desviarse)

Es **infraestructura de mensajería, NO el agente de IA** (eso es la Fase 6). Fuera de alcance: UI del superadmin (Fase 2, ya existe), encriptar token en reposo (Fase 7 / SEC-01), recordatorios con plantilla HSM y Embedded Signup (backlog).

---

## 6. Testing y el blocker de Meta

- **No hay cuenta de Meta verificada todavía.** No debe bloquear el desarrollo.
- Toda la Fase 5 se verifica **localmente con payloads de webhook firmados** — el script de la Wave 4 (`scripts/verify-whatsapp-webhook.ts`) arma un POST firmado con un App Secret de dev, sin pegarle a Meta.

---

## 7. Referencias autoritativas

- `CLAUDE.md` (raíz) — stack + pitfalls.
- `.planning/REQUIREMENTS.md` §"Integración WhatsApp Cloud API (WA)" — texto normativo WA-01..05.
- `.planning/ROADMAP.md` §"Phase 5" — goal + success criteria + estado de cada plan.
- `.planning/phases/05-integraci-n-whatsapp-cloud-api/05-0{1..6}-PLAN.md` — los 6 planes de ejecución.
- `.planning/phases/05-integraci-n-whatsapp-cloud-api/05-0{1..4}-SUMMARY.md` — resúmenes de lo ya ejecutado.

---

*Handoff actualizado el 2026-07-06. Rama: `claude-phase-04-uat-fixes`. Próximo comando: `/gsd-execute-phase 5`.*
