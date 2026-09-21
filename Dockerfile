# Multi-stage build producing a standalone Next.js server.
# Runtime image carries only the traced dependencies, not all of node_modules.

FROM node:22-alpine AS base
# Next.js' prebuilt binaries are glibc-linked; this shim lets them run on musl.
RUN apk add --no-cache libc6-compat
WORKDIR /app


FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci


FROM base AS builder
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# `next build` reads no secrets: every route that touches SESSION_SECRET or
# AUTH_USERS is server-rendered on demand, so those stay runtime-only.
RUN npm run build


FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# server.js binds to HOSTNAME:PORT. 0.0.0.0 is required for the container to be
# reachable; Railway overrides PORT at run time.
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

RUN addgroup -g 1001 -S nodejs \
  && adduser -S nextjs -u 1001

COPY --from=builder /app/public ./public
# standalone omits these two by design — they have to be placed by hand.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
