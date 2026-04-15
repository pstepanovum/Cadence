# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS base

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable

WORKDIR /app

FROM base AS deps

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS builder

ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_BRANDFETCH_CLIENT_ID
ARG AI_ENGINE_URL=http://ai-engine:8000
ARG AI_COACH_ENGINE_URL=http://coach-engine:8001

ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_BRANDFETCH_CLIENT_ID=$NEXT_PUBLIC_BRANDFETCH_CLIENT_ID
ENV AI_ENGINE_URL=$AI_ENGINE_URL
ENV AI_COACH_ENGINE_URL=$AI_COACH_ENGINE_URL

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN pnpm build

FROM base AS runner

ENV NODE_ENV=production
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
