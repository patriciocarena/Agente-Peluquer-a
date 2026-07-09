---
phase: 07-hardening-y-listo-para-produccion
requirement: SEC-01
type: decision
status: decided
decided: 2026-07-09
---

# SEC-01 — Encriptación de tokens de WhatsApp: decisión de diseño

> Decisión adelantada (fuera del ciclo de planning) para destrabar `/gsd-plan-phase 7`.
> El planner debe tratar esto como LOCKED salvo que aparezca evidencia nueva.

## Contexto

Cada negocio tiene un **token de acceso de larga duración de la WhatsApp Cloud API**
en `negocio.whatsapp_token`. Hoy está en **texto plano** (null en el seed). Ese token
puede **enviar mensajes como ese negocio** y generar cargos en Meta. Superficie de fuga:
cualquier dump/backup/réplica de la DB, o un `SELECT` con el service_role del bot.

- Lo **escribe** el superadmin: `apps/dashboard/app/actions/admin-tenants.ts`.
- Lo **lee** el bot para enviar mensajes: `apps/bot/src/whatsapp/getWhatsappToken.ts`.

## Opciones evaluadas

| Opción | Pros | Contras |
|--------|------|---------|
| **(A) Supabase Vault** (`vault.create_secret` / `vault.decrypted_secrets`) | Cifrado autenticado (aead) gestionado por Supabase; clave fuera de la tabla; patrón oficial recomendado; sin manejar claves ni IV/nonce a mano | Acoplado a Supabase; el descifrado se hace vía la vista `decrypted_secrets` (service_role) |
| (B) AES-256-GCM a nivel app | Portable, independiente del proveedor | HAY que custodiar la clave maestra (¿otro secreto en el env?), rotarla, manejar IV/nonce y AAD sin errores — superficie de bug alta; STACK.md desaconseja rodar cripto propia |
| (C) pgcrypto / TCE directo | — | Supabase **desaconseja explícitamente** pgsodium/Transparent Column Encryption por riesgo de misconfiguración |

## Decisión: **(A) Supabase Vault**

Alineado con la investigación propia del proyecto (STACK.md → "What NOT to Use":
*"Storing the WhatsApp long-lived access token in plaintext… → Use Supabase Vault
(`vault.create_secret` / `vault.decrypted_secrets`)"*). Es el camino de menor
superficie de error: no custodiamos ninguna clave maestra en el env ni rodamos
AES a mano. Si en el futuro se sale de Supabase, se migra a envelope-encryption con
KMS — pero eso no aplica hoy.

## Esqueleto de implementación (para el planner)

1. **Migración**: dejar de guardar el token en `negocio.whatsapp_token` (texto plano).
   En su lugar guardar en `negocio` un `whatsapp_token_secret_id` (uuid) que referencia
   el secreto en Vault. Backfill: los negocios existentes tienen `whatsapp_token = null`,
   así que no hay datos que migrar; dropear/deprecar la columna plana.
2. **Escritura** (superadmin, `admin-tenants.ts`): al setear el token, llamar
   `vault.create_secret(token, name, description)` y guardar el `secret_id` devuelto en
   `negocio.whatsapp_token_secret_id`. Rotación = nuevo secreto + update del id.
3. **Lectura** (bot, `getWhatsappToken.ts`): resolver el token vía
   `select decrypted_secret from vault.decrypted_secrets where id = <secret_id>`
   (con el service_role del bot), cacheando en memoria por TTL corto si hace falta
   (no re-leer Vault en cada mensaje).
4. **Verificación** (SEC-01 del ROADMAP): test que confirme que un `SELECT` directo a
   `negocio` NO devuelve el token en claro (solo el `secret_id`), y que el bot puede
   enviar un mensaje resolviendo el token vía Vault.
5. **Aislamiento** (CLAUDE.md): todo contra `bdgufnitakelyialjoqg`, nunca el restaurante.

## Notas

- Verificar la disponibilidad/enabling de la extensión `supabase_vault` en el proyecto
  `bdgufnitakelyialjoqg` al planificar (puede requerir habilitarla).
- SEC-02 (concurrencia sobre el mismo slot) y SEC-03 (aislamiento cross-tenant del
  service_role del bot) son independientes de esta decisión.
