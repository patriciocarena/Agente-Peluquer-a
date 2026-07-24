# syntax=docker/dockerfile:1

# TurnosBot — apps/bot image (arm64 target: Oracle Cloud VPS)

# ---- deps + build stage ----
FROM node:24 AS build

RUN corepack enable

WORKDIR /app

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/bot/package.json ./apps/bot/package.json
COPY packages/db-types/package.json ./packages/db-types/package.json
COPY packages/availability-engine/package.json ./packages/availability-engine/package.json

RUN pnpm install --frozen-lockfile --filter @turnosbot/bot...

COPY packages/db-types ./packages/db-types
COPY packages/availability-engine ./packages/availability-engine
COPY apps/bot ./apps/bot

RUN pnpm --filter @turnosbot/availability-engine run build
RUN pnpm --filter @turnosbot/bot run build

# ---- runtime stage ----
FROM node:24 AS runtime

ENV TZ=UTC
ENV NODE_ENV=production

RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/db-types ./packages/db-types
COPY --from=build /app/packages/availability-engine ./packages/availability-engine
COPY --from=build /app/apps/bot/node_modules ./apps/bot/node_modules
COPY --from=build /app/apps/bot/package.json ./apps/bot/package.json
COPY --from=build /app/apps/bot/dist ./apps/bot/dist

USER node

WORKDIR /app/apps/bot

EXPOSE 3001

CMD ["node", "dist/server.js"]