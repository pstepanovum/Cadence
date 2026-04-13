# Cadence

[![MIT License](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-149eca)](https://react.dev/)
[![Open Source](https://img.shields.io/badge/open%20source-yes-1f8f5f)](https://github.com/pstepanovum/Cadence)

Cadence is an open-source AI pronunciation coach built with Next.js, Supabase, and Python model services. It combines phoneme-level pronunciation feedback, guided speaking modules, structured conversation practice, and an open-topic AI coach so learners can improve spoken English in one product.

Cadence is designed for people who want more than flashcards: it gives live speech feedback, targeted repetition, theory modules, conversation drills, and a flexible AI coach that keeps the practice loop moving.

## Why Cadence

- phoneme-aware pronunciation feedback instead of vague speaking scores
- guided learning modules and open conversation in the same app
- transcript-based and target-based speaking flows
- native desktop app for macOS and Windows alongside the web experience
- modern product UI, not a research demo
- fully open source and free to run with your own infrastructure

## Core Features

- quick pronunciation drills for single words and short replies
- guided sound modules with theory, practice, and assessment
- conversation modules with turn-by-turn coach-led speaking
- open-topic AI Coach for freer spoken practice
- transcript-based and target-based response modes
- authentication, onboarding, checkout, and profile flows
- native desktop app (Electron) for macOS and Windows

## Product Structure

Cadence has three main speaking experiences:

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
- `Electron` for the macOS and Windows desktop app

## Who This Is For

- English learners who want sharper pronunciation feedback
- developers building speech-learning products
- researchers or hackers who want a real full-stack pronunciation app to extend
- founders exploring AI-native language-learning UX

## Architecture

Cadence is split into three services:

- `web`
  The Next.js application and user-facing API routes.

- `src/backend/ai-engine`
  Pronunciation scoring, reference audio generation, and transcription.

- `src/backend/coach-engine`
  Open-topic AI Coach turn generation.

The browser only talks to the Next.js app. The Next.js API routes proxy requests to the Python services.

### Local service routing

- `web` → `http://127.0.0.1:8000` (ai-engine)
- `web` → `http://127.0.0.1:8001` (coach-engine)

### Docker service routing

- `web` → `http://ai-engine:8000`
- `web` → `http://coach-engine:8001`

## Repository Layout

```text
.
├── src/
│   ├── app/
│   │   ├── (auth)/             # /login, /signup, /forgot-password, /reset-password
│   │   ├── (dashboard)/        # /dashboard, /learn, /coach, /conversation, /profile
│   │   │   ├── checkout/
│   │   │   ├── coach/
│   │   │   ├── conversation/
│   │   │   ├── dashboard/
│   │   │   ├── desktop/        # desktop app setup screen
│   │   │   ├── learn/
│   │   │   ├── onboarding/
│   │   │   └── profile/
│   │   ├── (landing)/          # /, /download, /contact, /help, /privacy, /terms
│   │   └── api/                # all API routes, including api/auth/confirm
│   ├── backend/
│   │   ├── ai-engine/          # pronunciation scoring, TTS, transcription (Python)
│   │   └── coach-engine/       # AI coach turn generation (Python)
│   ├── components/             # UI and product components
│   ├── hooks/                  # shared React hooks
│   └── lib/                    # shared web-side utilities and types
├── desktop/                    # Electron desktop app
│   ├── src/
│   │   ├── main.ts             # Electron main process
│   │   └── preload.ts          # context bridge
│   ├── assets/
│   │   ├── icon.icns           # macOS app icon
│   │   └── entitlements.mac.plist
│   └── electron-builder.yml    # DMG / installer packaging config
├── public/                     # static assets
├── supabase/                   # Supabase project files
├── Dockerfile                  # web image
└── docker-compose.yml          # full local stack
```

## Quick Start

### 1. Clone and install web dependencies

```bash
pnpm install
```

### 2. Create local environment files

```bash
cp .env.docker.example .env.local
cp .env.docker.example .env
```

Fill in the values you actually use.

If you want the shortest possible first run, use Docker. If you want the fastest product iteration loop, run the web app and both Python services locally.

## Running Cadence

### Recommended local development flow

One command starts all services — web app, both Python backends, and the desktop Electron app — with hot-reload on every layer:

```bash
pnpm dev:all
```

Open:

```text
http://localhost:3000
```

To clear build and browser caches before starting (models and app state preserved):

```bash
pnpm dev:all -- --cache
```

To reset Cadence app data and desktop runtime (venvs, setup manifests) but **keep** the large Hugging Face cache under `desktop-runtime/models`:

```bash
pnpm dev:all -- --clear
```

To wipe **everything** again, including those models (slow re-download):

```bash
pnpm dev:all -- --clear-all
```

`Ctrl-C` shuts everything down cleanly with no leftover processes.

**Hot-reload behaviour:**

| You change | What happens | Desktop restarts? |
| --- | --- | --- |
| Any `src/` React / Next.js file | HMR — browser updates instantly | No |
| `src/backend/ai-engine/*.py` | uvicorn reloads the worker (~0.5 s) | No |
| `src/backend/coach-engine/*.py` | uvicorn reloads the worker (~0.5 s) | No |
| `desktop/src/*.ts` | tsc recompiles → Electron respawns | Yes (~1–2 s) |

Each service prints prefixed, colour-coded logs in a single terminal:

```text
[web-app  ]  ✓ Ready on http://localhost:3000
[ai-engine]  INFO  Application startup complete.
[coach-eng]  INFO  Application startup complete.
[desktop  ]  Electron started
[tsc-watch]  Found 0 errors. Watching for file changes.
```

If you use a Python virtual environment, point to it with:

```bash
PYTHON=/path/to/venv/bin/python pnpm dev:all
```

#### Running services individually

If you prefer separate terminals or only need a subset of services:

```bash
# AI engine
cd src/backend/ai-engine && python main.py

# Coach engine
cd src/backend/coach-engine && python main.py

# Web app only
pnpm dev

# Desktop (requires web app already running on port 3000)
cd desktop && pnpm dev
```

### Full stack with Docker

```bash
docker compose --env-file .env.local up --build
```

Detached mode:

```bash
docker compose --env-file .env.local up --build -d
```

### Stopping the app

Normal stop:

```bash
docker compose --env-file .env.local down
```

Recommended day-to-day stop:

```bash
docker compose --env-file .env.local down --remove-orphans
```

Full reset including cached model downloads:

```bash
docker compose --env-file .env.local down --volumes --remove-orphans
```

## Desktop App (Electron)

Cadence ships a native desktop app for macOS and Windows, built with Electron. It wraps the full Next.js app in a native shell — no browser required.

### Running the desktop app in development

You need both the web dev server and Electron running simultaneously.

Terminal 1 — Web app:

```bash
pnpm dev
```

Terminal 2 — Electron:

```bash
cd desktop
pnpm install   # first time only
pnpm dev       # compiles TypeScript then launches Electron
```

### Building a distributable (DMG / EXE)

From the `desktop/` folder:

```bash
pnpm build
```

This runs `next build` (with `output: standalone`), compiles the Electron main process, then packages everything with `electron-builder`. Output lands in `desktop/packages/`.

### App icon

Place `desktop/assets/icon.icns` (1024×1024) before building for macOS. The file is already included in this repository.

### Code signing and notarization

Set the following environment variables before running `pnpm build` to sign and notarize for distribution outside the Mac App Store:

```shell
APPLE_ID=you@example.com
APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx
APPLE_TEAM_ID=XXXXXXXXXX
CSC_LINK=path/to/certificate.p12
CSC_KEY_PASSWORD=yourpassword
```

## Supabase Auth Callback

The auth confirmation callback is served at:

```text
/api/auth/confirm
```

Make sure your Supabase dashboard email templates (Confirm signup, Magic link, etc.) use this URL:

```text
https://your-domain.com/api/auth/confirm
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

- Vercel — hosts the web app
- AI host or VPS — hosts `src/backend/ai-engine` and `src/backend/coach-engine`

Then point the web app to those services:

```shell
AI_ENGINE_URL=https://ai.your-domain.com
AI_COACH_ENGINE_URL=https://coach.your-domain.com
```

### Why the AI services are separate

The pronunciation engine and the coach engine use different Python dependency stacks and model-serving needs. Keeping them separate makes deployment, warmup, and dependency management much more stable.

## GitHub-Friendly Setup

If you are opening the repo for the first time, start with:

1. [README.md](./README.md)
2. [CONTRIBUTING.md](./CONTRIBUTING.md)
3. [src/app/(landing)/page.tsx](./src/app/(landing)/page.tsx) — landing page
4. [src/app/(dashboard)/dashboard/page.tsx](./src/app/(dashboard)/dashboard/page.tsx) — main app entry
5. [src/components/coach/AiCoachPlayground.tsx](./src/components/coach/AiCoachPlayground.tsx) — AI coach UI
6. [src/backend/ai-engine/main.py](./src/backend/ai-engine/main.py) — pronunciation service
7. [desktop/src/main.ts](./desktop/src/main.ts) — Electron main process

## Open Source Notes

- Cadence is free to use and open source under the MIT license.
- The repository is meant to be a real product codebase, not a minimal starter.
- If you fork it, configure your own Supabase, Stripe, email, and model-service credentials.
- The desktop app requires the web app to be running locally in development mode.

## Contributing

Issues and pull requests are welcome. Start with [CONTRIBUTING.md](./CONTRIBUTING.md).

## Security

Please do not commit secrets, API keys, `.env` files, or provider tokens. For security issues, see [SECURITY.md](./SECURITY.md).

## Status

Cadence is actively evolving. The UI, learning flows, model stack, and desktop app are all moving quickly, so expect ongoing changes as the product matures.
