# syntax=docker/dockerfile:1

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Build-time placeholders; real values are injected at runtime.
ENV DATABASE_URL=postgres://build:build@localhost:5432/build \
    APP_SECRET=build-time-placeholder-secret \
    APP_URL=http://localhost:3000
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    DATA_DIR=/app/data
RUN addgroup -S nodejs -g 1001 && adduser -S nextjs -u 1001
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# Migrations run automatically at boot (src/instrumentation.ts).
COPY --from=builder --chown=nextjs:nodejs /app/drizzle ./drizzle
RUN mkdir -p /app/data && chown nextjs:nodejs /app/data
USER nextjs
EXPOSE 3000
VOLUME ["/app/data"]
CMD ["node", "server.js"]
