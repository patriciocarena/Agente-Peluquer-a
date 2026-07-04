---
phase: 01-fundaci-n-multitenant
plan: 02
subsystem: infra
tags: [fastify, docker, arm64, node24, healthcheck]

# Dependency graph
requires: []
provides:
  - "apps/bot standalone Fastify service exposing GET /health"
  - "Single env-access point (apps/bot/src/config/env.ts) reading fixed .env.example var names"
  - "Dockerfile targeting node:24 with ENV TZ=UTC and non-root USER, curl installed for healthcheck"
  - "docker-compose.yml bot service definition with healthcheck block"
affects: [01-fundaci-n-multitenant (later plans wiring apps/bot into the pnpm workspace), phase infra/deployment]

# Tech tracking
tech-stack:
  added: [fastify@^5.9.0, typescript@^5.7.0, tsx@^4.19.0 (dev)]
  patterns: ["Single env-access module pattern (config/env.ts) — no scattered process.env reads", "Multi-stage Dockerfile (build stage compiles TS, runtime stage installs prod deps only + copies dist)"]

key-files:
  created:
    - apps/bot/package.json
    - apps/bot/tsconfig.json
    - apps/bot/src/server.ts
    - apps/bot/src/config/env.ts
    - apps/bot/package-lock.json
    - Dockerfile
    - docker-compose.yml
    - .dockerignore
  modified: []

key-decisions:
  - "apps/bot builds standalone (own package.json, no workspace-root dependency) so the arm64 proof has zero overlap with the scaffolding plan (01) and runs in the same wave, per the plan's interfaces note."
  - "Added curl to the Dockerfile runtime stage (Rule 1 auto-fix) — node:24's Debian base does not ship curl by default, and the docker-compose healthcheck (CMD curl .../health) would otherwise fail even on a correctly running container."
  - "Task 2 (arm64 container build/run proof) COMPLETED by orchestrator after installing colima + docker + docker-buildx (Docker 29.x removed the classic builder, so docker-buildx is mandatory; wired ~/.docker/cli-plugins/docker-buildx). Built with `docker buildx build --platform linux/arm64 --load`; container arch confirmed `arm64`; GET /health returned {\"status\":\"ok\"} HTTP 200 (verified in container logs). Success Criteria #5 satisfied for real, not faked (Pitfall 12 cleared)."

patterns-established:
  - "apps/bot service pattern: minimal Fastify app, pino logger (Fastify default), 0.0.0.0 bind, /health returns only a static status body (no env/version/DB leakage — T-02-01)."
  - "Dockerfile pattern: multi-stage (build → runtime), ENV TZ=UTC pinned explicitly, non-root USER node, prod-only deps in runtime stage."

requirements-completed: [CORE-04]  # TZ=UTC container discipline shipped AND arm64 container build/run proof executed (Success Criteria #5 satisfied).

# Metrics
duration: ~15min (Task 1 only; Task 2 blocked before execution)
completed: 2026-07-04
---

# Phase 1 Plan 2: apps/bot arm64 skeleton Summary

**Fastify /health service on apps/bot with a Node 24 + TZ=UTC + non-root Dockerfile and a healthchecked docker-compose bot service — Task 1 complete; Task 2's real arm64 container build/run proof is BLOCKED because no container runtime (Docker/Podman/Colima/Lima) is installed in this execution environment.**

## Performance

- **Duration:** ~15 min (Task 1)
- **Started:** 2026-07-04T09:42:00Z
- **Completed:** 2026-07-04T12:45:03Z (Task 1); Task 2 not started (blocked)
- **Tasks:** 2 of 2 completed
- **Files modified:** 8 created

## Accomplishments
- `apps/bot` scaffolded as a self-contained Fastify service (`fastify ^5.9.0`, TypeScript, `tsx` for dev) with zero workspace-root dependency, matching the plan's D-15 minimal-surface requirement.
- `GET /health` implemented and locally smoke-tested (via plain `node dist/server.js`, not container) — returns `{"status":"ok"}` with HTTP 200, bound to `0.0.0.0:3001`.
- Dockerfile: multi-stage `node:24` build, `ENV TZ=UTC` (CORE-04 container clock discipline), non-root `USER node`, `curl` installed in the runtime stage so the compose healthcheck actually functions.
- `docker-compose.yml`: `bot` service with a `healthcheck` block curling `/health`.
- `.dockerignore` excludes `node_modules`, `dist`, `.env`, `.git`.
- TypeScript build verified locally (`npm run build` → `tsc` succeeds, `dist/server.js` produced and runs correctly) — this is NOT the arm64 container proof, only a sanity check that the code itself compiles and runs under plain Node 24 on this arm64 host (macOS, not Linux).

## Task Commits

Each task was committed atomically:

1. **Task 1: apps/bot health server + arm64 Dockerfile + docker-compose with healthcheck** - `10dd8ff` (feat)
2. **Task 2: [BLOCKING] Verify build + start on linux/arm64 with health check** - COMPLETED (orchestrator installed colima/docker/docker-buildx; arm64 image built, container health check passed, arch confirmed arm64). No code changes required — verification only.

**Plan metadata:** (pending — this SUMMARY commit)

## Files Created/Modified
- `apps/bot/package.json` - Standalone bot package: fastify, typescript, tsx (dev)
- `apps/bot/package-lock.json` - Committed lockfile for reproducible Docker builds
- `apps/bot/tsconfig.json` - Standalone TS config (ES2022, NodeNext modules)
- `apps/bot/src/server.ts` - Minimal Fastify app, `GET /health`, binds `0.0.0.0:3001`
- `apps/bot/src/config/env.ts` - Single env-access point; reads `.env.example` var names, none required at boot
- `Dockerfile` - Multi-stage `node:24` build; `ENV TZ=UTC`; `curl` for healthcheck; non-root `USER node`
- `docker-compose.yml` - `bot` service, port mapping, `healthcheck` curling `/health`
- `.dockerignore` - Excludes `node_modules`, `dist`, `.env`, `.git`

## Decisions Made
- Kept `apps/bot`'s dependency surface to exactly `fastify` (+ typescript/tsx as dev deps) — no pg-boss, no AI SDK, no Supabase client yet, per D-15 and the plan's interfaces note (those land in their own phases once the arm64 gate has already passed).
- Committed `apps/bot/package-lock.json` despite it being generated by a local `npm install` — required for the Dockerfile's `npm install` step to produce reproducible builds; `node_modules/` and `dist/` themselves stay gitignored (already covered by the repo's root `.gitignore`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added curl to the Dockerfile runtime stage**
- **Found during:** Task 1 (Dockerfile authoring, before Task 2 verification was attempted)
- **Issue:** The plan's `docker-compose.yml` healthcheck spec (`CMD curl -fsS http://localhost:3001/health`) requires `curl` inside the container, but the `node:24` Debian-based image does not include `curl` by default. Without this fix, the container would run correctly but the compose healthcheck itself would always report `unhealthy`/error, which is indistinguishable from a real failure and would have blocked Task 2's verification even with Docker available.
- **Fix:** Added `RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*` to the runtime stage, before `WORKDIR /app`.
- **Files modified:** `Dockerfile`
- **Verification:** Grep-based Task 1 automated verify passed (`node:24`, `TZ=UTC`, `healthcheck`, `node_modules` in `.dockerignore`). Full container-level verification of this fix is itself blocked by the same Docker-unavailability issue as Task 2 — flagged for the next environment with Docker access.
- **Committed in:** `10dd8ff` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug fix, Rule 1)
**Impact on plan:** Necessary correctness fix for the healthcheck to function at all; no scope creep.

## Issues Encountered

**Task 2 was initially BLOCKED (no container runtime), then RESOLVED by the orchestrator.**

Resolution (2026-07-04): The orchestrator installed `colima`, `docker`, and `docker-buildx` via Homebrew (`brew install colima docker docker-buildx`), started colima (native arm64 VM), and wired `~/.docker/cli-plugins/docker-buildx`. Note: Docker 29.x removed the classic builder — `docker build` errors with "buildx component is missing", so `docker buildx` is mandatory. Then ran the arm64 proof: `docker buildx build --platform linux/arm64 -t turnosbot-bot:arm64 --load .` (build OK), `docker run` + `curl http://localhost:3001/health` → `{"status":"ok"}` HTTP 200 (confirmed in container logs), and `docker image inspect ... --format '{{.Architecture}}'` → `arm64`. Success Criteria #5 is now genuinely satisfied. No code changes were needed — the Dockerfile from commit `10dd8ff` built and ran correctly as authored. Original blocker details retained below for history.

---

**Original blocker (now resolved): no container runtime available in this execution environment.**

- Checked for: `docker`, `podman`, `colima`, `lima` CLI binaries (all absent via `command -v`), Docker Desktop application (not present in `/Applications`, not found via `mdfind`), and any Docker/Podman/Colima/Lima Homebrew formula (Homebrew itself is present at `/opt/homebrew/bin/brew`, but none of these are installed).
- The plan's own Task 2 action block is explicit: *"If Docker/buildx is NOT installed in the execution environment, STOP and surface a blocker (this is the Success-Criteria-#5 gate and cannot be faked by a local `pnpm build` — a green non-container build is a false positive per Pitfall 12). Do not mark the plan complete without a real arm64 container run."*
- As a partial substitute (explicitly NOT a replacement for the container proof), the following were verified locally on this arm64 host (macOS, Node 24):
  - `npm install` + `npm run build` (`tsc`) succeeds with no errors.
  - `node dist/server.js` starts, binds `0.0.0.0:PORT`, and `GET /health` returns `{"status":"ok"}` with HTTP 200.
  - These checks prove the TypeScript/Fastify code itself is correct, but per Pitfall 12 they do NOT prove the Docker image builds or runs on `linux/arm64`, and do NOT prove the Dockerfile syntax/multi-stage build/curl install/non-root user setup is actually valid — none of that has been executed even once.
- **Recommended path to unblock:** Install Docker Desktop (or Colima/Podman as a lighter alternative) on this machine, then re-run exactly the Task 2 verify command from the plan:
  ```bash
  docker buildx build --platform linux/arm64 -t turnosbot-bot:arm64 . && \
  docker run -d --name tb-health -p 3001:3001 turnosbot-bot:arm64 && \
  sleep 5 && curl -fsS http://localhost:3001/health && \
  docker image inspect turnosbot-bot:arm64 --format '{{.Architecture}}' | grep -q arm64
  docker rm -f tb-health
  ```
  This should be run against the current Dockerfile/docker-compose.yml/.dockerignore committed in `10dd8ff` — no code changes are expected to be needed, only the actual container execution.

## User Setup Required

**Docker (or an equivalent OCI container runtime) must be installed before Task 2 of this plan can be completed and before Success Criteria #5 (arm64 proof) can be considered satisfied.**

- Install Docker Desktop for Mac (supports Apple Silicon / arm64 natively) from https://www.docker.com/products/docker-desktop/, OR install Colima (`brew install colima docker` + `colima start`) as a lighter CLI-only alternative.
- After installation, verify with: `docker buildx version` (should print a version, not "command not found").
- Then re-run Task 2's verify command (see above) to complete this plan.

## Next Phase Readiness

- Task 1 deliverables (apps/bot skeleton, Dockerfile, docker-compose.yml) are complete and committed — later phases (Plan 05 augmenting apps/bot with Supabase client, and the workspace-scaffolding plan 01) can build on top of this without rework.
- **Blocker for full Success Criteria #5 completion:** the actual arm64 container build/run has not been executed even once. This MUST be re-attempted (by a human or a future agent with Docker access) before Phase 1 can be considered to have proven the ARM deployment target — do not let dependencies accumulate further (per D-15) without closing this gate.
- No other blockers for proceeding with parallel Wave 1 plans (this plan has zero file overlap with plan 01 per the plan's own design).

## Self-Check: PASSED

All created files verified present on disk (apps/bot/package.json, tsconfig.json, src/server.ts, src/config/env.ts, package-lock.json, Dockerfile, docker-compose.yml, .dockerignore, this SUMMARY.md). Task 1 commit `10dd8ff` verified present in git log.
