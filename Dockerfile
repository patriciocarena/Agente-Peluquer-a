# syntax=docker/dockerfile:1

# TurnosBot — apps/bot image (arm64 target: Oracle Cloud VPS)
#
# Workspace-aware build. apps/bot depends on @turnosbot/db-types via the pnpm
# `workspace:*` protocol, which a standalone `npm install` cannot resolve
# (npm error EUNSUPPORTEDPROTOCOL / Unsupported URL Type "workspace:"). So the
# image builds THROUGH the pnpm monorepo instead of copying apps/bot in
# isolation. db-types is a TYPES-ONLY dependency (imported via `import type` in
# apps/bot/src/db/client.ts), so it is erased at compile time and never loaded
# at runtime — only fastify + @supabase/supabase-js are actually required to run.

# ---- deps + build stage ----
FROM node:24 AS build

# pnpm via corepack — version is pinned by the root package.json "packageManager"
# field (pnpm@9.15.0), so this resolves deterministically.
RUN corepack enable

WORKDIR /app

# Copy workspace manifests first for better layer caching (deps only re-install
# when a package.json / lockfile changes, not on every source edit).
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/bot/package.json ./apps/bot/package.json
COPY packages/db-types/package.json ./packages/db-types/package.json

# Install only @turnosbot/bot and its workspace dependency graph (the trailing
# `...` includes db-types). --frozen-lockfile fails loudly if the lockfile drifts.
RUN pnpm install --frozen-lockfile --filter @turnosbot/bot...

# Sources needed to typecheck + build the bot (db-types is consumed as source).
COPY packages/db-types ./packages/db-types
COPY apps/bot ./apps/bot

RUN pnpm --filter @turnosbot/bot run build

# ---- runtime stage ----
FROM node:24 AS runtime

# CORE-04 / Pitfall 4: pin the container clock to UTC. All internal timestamp
# handling must be UTC-only; AR (America/Argentina/*) presentation conversion
# happens in consuming phases — never hardcode a -3 offset.
ENV TZ=UTC
ENV NODE_ENV=production

# curl is required for the docker-compose healthcheck (CMD curl .../health).
# node:24's Debian base does not ship curl by default.
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Preserve pnpm's workspace node_modules layout so its relative symlinks resolve
# at runtime: apps/bot/node_modules/* point into ../../node_modules/.pnpm/*.
# packages/db-types is copied only so the (never-loaded) workspace symlink is not
# dangling — nothing requires it at runtime.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/db-types ./packages/db-types
COPY --from=build /app/apps/bot/node_modules ./apps/bot/node_modules
COPY --from=build /app/apps/bot/package.json ./apps/bot/package.json
COPY --from=build /app/apps/bot/dist ./apps/bot/dist

# T-02-02 (Elevation of Privilege): run as non-root.
# node:24 base image ships an unprivileged "node" user out of the box.
USER node

WORKDIR /app/apps/bot

EXPOSE 3001

CMD ["node", "dist/server.js"]
