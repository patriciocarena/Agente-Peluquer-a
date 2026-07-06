# Handoff — Fase 5: Integración WhatsApp Cloud API

**Para:** quien continúe el desarrollo en su propia computadora, en una sesión nueva de Claude Code.
**Estado al momento del handoff:** Fase 5 **planificada a medias** — el contexto, la investigación, la estrategia de validación y el mapa de patrones están listos y commiteados. **Falta generar los PLAN.md** (se cortó justo antes de correr el planner) y después ejecutar.

---

## 0. Setup (una sola vez)

```bash
git clone https://github.com/patriciocarena/Agente-Peluquer-a.git
cd Agente-Peluquer-a
git checkout claude-phase-04-uat-fixes   # rama activa — NO está en main todavía
pnpm install
```

> ⚠️ **CREDENCIALES (bloqueante):** el archivo `.env` está gitigneado y **no viaja en el repo**. Sin él no funciona nada (Supabase, Gemini, App Secret de WhatsApp). Pedíselo a Augusto (o que te pase las claves) y creá tu propio `.env` en la raíz antes de arrancar. La única base de datos de este proyecto es Supabase **`bdgufnitakelyialjoqg`** — ver reglas de aislamiento abajo.

Después abrí Claude Code dentro de la carpeta del proyecto.

---

## 1. Reglas duras del proyecto (leer sí o sí)

- **`CLAUDE.md`** en la raíz es autoritativo: stack, pitfalls y "What NOT to Use".
- **Aislamiento:** este proyecto (TurnosBot) **no tiene nada que ver** con el proyecto del restaurante. Nunca tocar Supabase `hzgunbftloevclkohcdf`. La única DB es `bdgufnitakelyialjoqg`.
- **Workflow GSD:** no editar archivos por fuera de un comando GSD. Se entra por `/gsd-plan-phase`, `/gsd-execute-phase`, etc.

---

## 2. Qué está hecho (commiteado en la rama)

Todo en `.planning/phases/05-integraci-n-whatsapp-cloud-api/`:

| Archivo | Qué es |
|---|---|
| `05-CONTEXT.md` | Decisiones del usuario **D-01..D-12** (casi todas fijadas). Delegadas a Claude con criterio técnico. |
| `05-RESEARCH.md` | Investigación técnica: firma HMAC sobre body crudo, pg-boss session-mode, payload de Meta, ventana 24h, estrategia de test local sin Meta. |
| `05-VALIDATION.md` | Estrategia de validación Nyquist (vitest, mapa de verificación por tarea). |
| `05-PATTERNS.md` | Mapa de patrones: cada archivo nuevo apuntado a un análogo real del repo. |

---

## 3. El siguiente paso — generar los planes

En Claude Code, correr:

```
/gsd-plan-phase 5
```

- Va a **reusar la RESEARCH.md existente** (no vuelve a investigar) y el PATTERNS.md existente.
- Va a spawnear el **planner** (opus) → crea los `05-*-PLAN.md`, luego el **plan-checker** (sonnet) los verifica.
- Al terminar: `/gsd-execute-phase 5` para ejecutar los planes.

---

## 4. Alcance de la Fase 5 (para no desviarse)

Es **infraestructura de mensajería, NO el agente de IA** (eso es la Fase 6). Cinco requisitos:

- **WA-01** — webhook Fastify + verificación de firma `X-Hub-Signature-256` **sobre el body crudo** (HMAC-SHA256 con App Secret, `crypto.timingSafeEqual` con guard de longitud). Firma inválida → 403.
- **WA-02** — resolver el tenant por `phone_number_id` (query a `negocio`); si no matchea → descartar (log + 200), nunca adivinar tenant.
- **WA-03** — responder 200 rápido a Meta + procesar async con **pg-boss** (conexión directa/session-mode **5432**, nunca el pooler 6543) + **dedup** por `messages[].id`.
- **WA-04** — envío saliente por Cloud API dentro de la ventana de 24h, detrás del gate `WHATSAPP_LIVE` (en dev mockea el POST, no pega a Graph API). Respuesta stub determinista (placeholder de Fase 6).
- **WA-05** — persistir `conversacion`/`mensaje`; estado del bot en `conversacion.context` (jsonb).

**Fuera de alcance:** UI del superadmin (Fase 2), encriptar token en reposo (Fase 7 / SEC-01 — por ahora choke point `getWhatsappToken`), recordatorios con plantilla HSM y Embedded Signup (backlog).

---

## 5. Correcciones clave encontradas (que el planner ya tiene en cuenta)

Descubiertas al mapear patrones — **no propagar los valores viejos**:

1. **`mensaje.wa_message_id` YA tiene UNIQUE** (global) en `supabase/migrations/0001_schema_core.sql`. **No hace falta una migración nueva** para el dedup durable. (Resuelve la "Open Question 2" de la RESEARCH.)
2. **`mensaje.direccion`** usa valores en español: `CHECK (direccion IN ('entrante','saliente'))` — **no** `'in'`/`'out'`.
3. **`findOrCreateCliente`** debe usar match exacto `.eq("telefono", waId)` (nunca el `.ilike` de búsqueda parcial del dashboard). `wa_id` viene en formato internacional sólo-dígitos.
4. **`negocioScoped`** hoy sólo tiene accessors de lectura (`.select("*")`); la Fase 5 es probablemente el **primer escritor** por esa capa.

---

## 6. Testing y el blocker de Meta (D-01)

- **No hay cuenta de Meta verificada todavía** (verificación de Meta Business/Tech Provider tarda 2-7+ días — blocker en `STATE.md`). **No debe bloquear el desarrollo.**
- Toda la Fase 5 se verifica **localmente con payloads de webhook firmados** (un script arma un POST firmado con un App Secret de dev y lo dispara al endpoint local → prueba firma → dedup → persistencia → envío mockeado, sin Meta).
- El test en vivo real (túnel HTTPS tipo ngrok/cloudflared + WABA + número de prueba + un mensaje ida y vuelta) es una **pasada de verificación posterior**, NO código de esta fase. Se hace cuando Augusto tenga la cuenta Meta lista.
- `apps/bot` **no tiene infra de test todavía** → la Wave 0 del plan agrega `apps/bot/vitest.config.ts` + script `test` (espejando `packages/availability-engine`).

---

## 7. Referencias autoritativas

- `CLAUDE.md` (raíz) — stack + pitfalls.
- `.planning/REQUIREMENTS.md` §"Integración WhatsApp Cloud API (WA)" — texto normativo WA-01..05.
- `.planning/ROADMAP.md` §"Phase 5" — goal + success criteria.
- `packages/db-types/src/database.types.ts` — tablas existentes (`conversacion`, `mensaje`, columnas de `negocio`). **No crear tablas nuevas.**
- Docs de Meta: https://developers.facebook.com/docs/whatsapp/cloud-api — verificar contra la versión viva de Graph API (cambia seguido; usar una env var `WHATSAPP_GRAPH_API_VERSION`, no hardcodear).

---

*Handoff generado el 2026-07-06. Rama: `claude-phase-04-uat-fixes`. Próximo comando: `/gsd-plan-phase 5`.*
