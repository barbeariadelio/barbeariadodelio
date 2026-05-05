# Build Stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root configs and lockfile
COPY package*.json ./
COPY turbo.json ./
COPY tsconfig.base.json ./

# Copy all packages and apps
COPY packages ./packages
COPY apps ./apps
COPY server ./server

# Install dependencies
RUN npm install

# Build all systems using Turborepo
RUN npx turbo build

# Production Stage
FROM node:20-alpine

WORKDIR /app

# Copy root package.json and server package.json
COPY package*.json ./
COPY server/package*.json ./server/

# Install only production dependencies
# Note: Since it's a monorepo, we might need some workspace packages.
# For simplicity in this build, we install all and then clean up or just use the builder's node_modules
# Actually, let's copy node_modules from builder for now to ensure all workspace links work.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/server/public ./server/public
COPY --from=builder /app/apps/admin/dist ./apps/admin/dist
COPY --from=builder /app/apps/franchise/dist ./apps/franchise/dist
COPY --from=builder /app/apps/booking/dist ./apps/booking/dist

# Env variables defaults
ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

# Start the server
CMD ["node", "server/dist/app.js"]
