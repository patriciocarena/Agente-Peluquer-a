# Phase 7: Hardening y listo para producción - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-09
**Phase:** 07-hardening-y-listo-para-produccion
**Areas discussed:** Alcance de SEC-01 (Vault), Tooling del test de concurrencia (SEC-02), Test de aislamiento cross-tenant (SEC-03), Dónde corren los tests (CI)

---

## Alcance de SEC-01 (Vault)

| Option | Description | Selected |
|--------|-------------|----------|
| Flujo Vault completo | Migración (secret_id, dropear plana) + escritura superadmin vía vault.create_secret + lectura bot vía decrypted_secrets + test 'no-plaintext'. Sin tokens que migrar → bajo riesgo, production-ready | ✓ |
| Solo mecanismo + test, wiring mínimo | Habilitar Vault + test, dejar wiring para cuando haya WABA real | |

**User's choice:** Flujo Vault completo
**Notes:** El mecanismo (Vault vs AES-GCM) ya estaba decidido antes en 07-SEC-01-DECISION.md. Acá se decidió el ALCANCE: implementar todo el flujo ahora aprovechando que no hay tokens reales que migrar.

---

## Tooling del test de concurrencia (SEC-02)

| Option | Description | Selected |
|--------|-------------|----------|
| Script Node/TS con Promise.all | N reservas concurrentes al mismo slot contra bookAppointment real; asertar 1 éxito + resto slot_taken (23P01). Reusa verify-*.ts, sin tooling nuevo | ✓ |
| Herramienta externa (k6 / pgbench) | Carga con herramienta dedicada; más setup, mide throughput (no el objetivo) | |

**User's choice:** Script Node/TS con Promise.all
**Notes:** El objetivo es correctitud bajo concurrencia, no throughput — el script ejercita directo la GiST existente.

---

## Test de aislamiento cross-tenant (SEC-03)

| Option | Description | Selected |
|--------|-------------|----------|
| Integración contra DB live, 2 negocios seed | Ejercita negocioScoped + tools del bot con contexto del negocio A, asserta cero filas del B. Extiende verify-isolation (fase 1) | ✓ |
| Unit test mockeado | Corre en CI pero mockea la capa bajo prueba — no prueba aislamiento real | |

**User's choice:** Integración contra DB live, 2 negocios seed
**Notes:** El service_role bypassa RLS, así que solo un test LIVE prueba el aislamiento; un mock sería insuficiente para SEC-03.

---

## Dónde corren los tests (CI)

| Option | Description | Selected |
|--------|-------------|----------|
| Scripts verify-*.ts gated, a mano | Mismo patrón que fases previas, contra DB live con guard de aislamiento, fuera de vitest | ✓ |
| Crear .github/workflows y correr en CI | Montar CI real ahora; infra nueva, excede scope de las 3 SEC | |

**User's choice:** Scripts verify-*.ts gated, a mano
**Notes:** No hay CI todavía; crear CI se registró como deferred idea.

---

## Claude's Discretion

- Nombres exactos de archivos/columnas, forma de la migración SQL, parametrización de N en el test de concurrencia.
- Habilitar la extensión `supabase_vault` si hace falta (gated).

## Deferred Ideas

- Montar CI (`.github/workflows`) para unit tests + verify-*.ts.
- Rotación automatizada de secretos de WhatsApp.
- Rate-limiting adicional / hardening del webhook más allá de la fase 5.
