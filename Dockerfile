# ── Build Stage ──
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency manifests first (layer caching)
COPY package.json package-lock.json turbo.json tsconfig.base.json ./
COPY server/package.json ./server/
COPY apps/admin/package.json ./apps/admin/
COPY apps/franchise/package.json ./apps/franchise/
COPY apps/booking/package.json ./apps/booking/
COPY packages/types/package.json ./packages/types/
COPY packages/utils/package.json ./packages/utils/
COPY packages/styles/package.json ./packages/styles/
COPY packages/ui/package.json ./packages/ui/

# Deterministic install from lockfile
RUN npm ci

# Copy source
COPY packages ./packages
COPY apps ./apps
COPY server ./server

# Build everything via Turborepo
RUN npx turbo build

# ── Production Stage ──
FROM node:20-alpine

WORKDIR /app

# Copy manifests + lockfile
COPY package.json package-lock.json ./
COPY server/package.json ./server/
COPY packages/types/package.json ./packages/types/
COPY packages/utils/package.json ./packages/utils/

# Install production-only dependencies
RUN npm ci --omit=dev

# Copy built artifacts
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/server/public ./server/public
COPY --from=builder /app/apps/admin/dist ./apps/admin/dist
COPY --from=builder /app/apps/franchise/dist ./apps/franchise/dist
COPY --from=builder /app/apps/booking/dist ./apps/booking/dist

# Copy runtime workspace packages (types/utils used by server at runtime)
COPY --from=builder /app/packages/types ./packages/types
COPY --from=builder /app/packages/utils ./packages/utils

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

CMD ["node", "server/dist/app.js"]
