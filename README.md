# Cadence

Cadence is an open-source pronunciation training app built with Next.js, Supabase, and two Python AI services. It combines strict phoneme-level feedback with freer conversation practice, so learners can move from isolated words to guided speaking and open-topic coaching in the same product.

## What Cadence Does

- quick pronunciation drills for single words and short replies
- guided learning modules for sounds, theory, practice, and assessment
- conversation modules with turn-by-turn speaking practice
- an AI Coach playground for open-topic speaking
- transcript-based and target-based feedback flows
- account, onboarding, checkout, and profile flows

## Product Structure

Cadence currently has three main speaking experiences:

1. `Learn`
   Structured pronunciation modules with theory, practice, and assessment.

2. `Conversation`
   Guided back-and-forth speaking modules where the coach leads the topic and the learner replies turn by turn.

3. `AI Coach`
   Open-topic practice where the user can start on any situation, respond in targeted or freedom mode, and keep the thread going naturally.

## Tech Stack

- `Next.js 16` with the App Router
- `React 19`
- `Tailwind CSS 4`
- `Supabase` for auth and user data
- `Stripe` for billing flows
- `Python` model services for scoring, transcription, TTS, and coach generation

## Architecture

Cadence is split into three services:

- `web`
  The Next.js application and user-facing API routes

- `src/ai-engine`
  Pronunciation scoring, reference audio generation, and transcription

- `src/coach-engine`
  Open-topic AI Coach turn generation

The browser only talks to the Next.js app. The Next.js API routes proxy requests to the Python services.

### Local service routing

- `web` -> `http://127.0.0.1:8000`
- `web` -> `http://127.0.0.1:8001`

### Docker service routing

- `web` -> `http://ai-engine:8000`
- `web` -> `http://coach-engine:8001`

## Repository Layout

```text
.
├── src/app                 # Next.js routes
├── src/components          # UI and product components
├── src/lib                 # shared web-side utilities and types
├── src/ai-engine           # pronunciation / TTS / transcription service
├── src/coach-engine        # AI Coach service
├── public                  # static assets
├── supabase                # Supabase project files
├── Dockerfile              # web image
└── docker-compose.yml      # full local stack
```

## Quick Start

### 1. Clone and install web dependencies

```bash
pnpm install
```

### 2. Create local environment files

Start from the included template:

```bash
cp .env.docker.example .env.local
cp .env.docker.example .env
```

Fill in the values you actually use.

## Running Cadence

### Recommended local development flow

This is the best day-to-day loop on macOS:

Terminal 1:

```bash
cd src/ai-engine
python main.py
```

Terminal 2:

```bash
cd src/coach-engine
python main.py
```

Terminal 3:

```bash
pnpm dev
```

Then open:

```text
http://localhost:3000
```

### Full stack with Docker

From the repo root:

```bash
docker compose --env-file .env.local up --build
```

Detached mode:

```bash
docker compose --env-file .env.local up --build -d
```

Open:

```text
http://localhost:3000
```

## Stopping the App Cleanly

Normal stop:

```bash
docker compose --env-file .env.local down
```

Recommended day-to-day stop:

```bash
docker compose --env-file .env.local down --remove-orphans
```

Full reset, including cached model downloads:

```bash
docker compose --env-file .env.local down --volumes --remove-orphans
```

## Environment Variables

Cadence does not commit runtime secrets. Use `.env.local` for local development and configure hosted secrets through your deployment platform.

Common web-side variables:

- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_BRANDFETCH_CLIENT_ID`
- `AI_ENGINE_URL`
- `AI_COACH_ENGINE_URL`

Optional billing variables:

- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_ID`

Optional email variables:

- `BREVO_SMTP_HOST`
- `BREVO_SMTP_PORT`
- `BREVO_SMTP_USER`
- `BREVO_SMTP_PASSWORD`
- `BREVO_API_KEY`

Model-service variables:

- `COACH_LLM_MODEL_ID`
- `COACH_LLM_DEVICE`
- `HF_TOKEN`
- `CADENCE_LOG_LEVEL`

## Deployment

### Recommended production split

Deploy the Next.js app to Vercel and run the Python services on separate infrastructure.

- Vercel:
  hosts the web app
- AI host or VPS:
  hosts `src/ai-engine` and `src/coach-engine`

Then point the web app to those services with:

- `AI_ENGINE_URL=https://ai.your-domain.com`
- `AI_COACH_ENGINE_URL=https://coach.your-domain.com`

### Why the AI services are separate

The pronunciation engine and the coach engine use different Python dependency stacks and model-serving needs. Keeping them separate makes deployment, warmup, and dependency management much more stable.

## Open Source Notes

- Cadence is free to use and open source under the MIT license.
- The repository is meant to be a real product codebase, not a minimal starter.
- If you fork it, make sure you configure your own Supabase, Stripe, email, and model-service credentials.

## Contributing

Issues and pull requests are welcome. A good contribution usually includes:

- a clear bug report or product problem
- the smallest practical code change
- a short validation note explaining how it was tested

If you are changing AI or pronunciation behavior, include the exact scenario you tested so regressions are easier to spot.

## Security

Please do not commit secrets, API keys, `.env` files, or provider tokens. If you discover a security issue, contact the maintainer privately before opening a public issue.

## Status

Cadence is actively evolving. The UI, learning flows, and model stack are moving quickly, so expect ongoing changes as the product matures.
