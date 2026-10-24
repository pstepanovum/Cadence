# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS base

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

# Pinned to the major CI uses: an unpinned corepack pulls the newest pnpm,
# whose defaults (minimumReleaseAge) can refuse the committed lockfile.
RUN corepack enable && corepack prepare pnpm@10.34.8 --activate

WORKDIR /app

FROM base AS deps

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS builder

# Public Firebase web config, inlined into the browser bundle. Server
# credentials (FIREBASE_SERVICE_ACCOUNT) are runtime env only, never build args.
ARG NEXT_PUBLIC_FIREBASE_API_KEY
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID
ARG NEXT_PUBLIC_FIREBASE_APP_ID
ARG NEXT_PUBLIC_BRANDFETCH_CLIENT_ID
ARG NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY
ARG AI_ENGINE_URL=http://ai-engine:8000
ARG AI_COACH_ENGINE_URL=http://coach-engine:8001

ENV NEXT_PUBLIC_FIREBASE_API_KEY=$NEXT_PUBLIC_FIREBASE_API_KEY
ENV NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ENV NEXT_PUBLIC_FIREBASE_PROJECT_ID=$NEXT_PUBLIC_FIREBASE_PROJECT_ID
ENV NEXT_PUBLIC_FIREBASE_APP_ID=$NEXT_PUBLIC_FIREBASE_APP_ID
ENV NEXT_PUBLIC_BRANDFETCH_CLIENT_ID=$NEXT_PUBLIC_BRANDFETCH_CLIENT_ID
ENV NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY=$NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY
ENV NEXT_TELEMETRY_DISABLED=1
ENV AI_ENGINE_URL=$AI_ENGINE_URL
ENV AI_COACH_ENGINE_URL=$AI_COACH_ENGINE_URL

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN pnpm build

# The runner starts from the plain Node image: it needs no pnpm.
FROM node:22-bookworm-slim AS runner

WORKDIR /app

# cadence-web on Cloud Run (deploy/cloudrun.sh) and your own Cadence under
# docker-compose run this same image; CADENCE_DEPLOYMENT, set at deploy time,
# says which. It loads no models, so a cold start is the Node server alone.
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy the standalone output (includes its own minimal node_modules)
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
# Copy static assets and public folder
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
