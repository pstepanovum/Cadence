# Contributing to Cadence

Thanks for contributing to Cadence.

## Before you start

- open an issue if the change is large, architectural, or product-facing
- keep pull requests focused
- include a short validation note with what you tested

## Local setup

Install web dependencies:

```bash
pnpm install
```

Create local env files:

```bash
cp .env.docker.example .env.local
cp .env.docker.example .env
```

Run all services with one command:

```bash
pnpm dev:all
```

This starts the Next.js web app, both Python backends (with hot-reload via uvicorn), and the Electron desktop app. Logs from all four services appear colour-coded in a single terminal. `Ctrl-C` shuts everything down cleanly.

To clear build and browser caches (models and app state preserved):

```bash
pnpm dev:all -- --cache
```

To do a full wipe including AI models, venvs, and all app data:

```bash
pnpm dev:all -- --clear
```

If you use a Python virtual environment:

```bash
PYTHON=/path/to/venv/bin/python pnpm dev:all
```

**Hot-reload behaviour:**

| You change | What happens | Desktop restarts? |
| --- | --- | --- |
| Any `src/` React / Next.js file | HMR — browser updates instantly | No |
| `src/backend/ai-engine/*.py` | uvicorn reloads the worker (~0.5 s) | No |
| `src/backend/coach-engine/*.py` | uvicorn reloads the worker (~0.5 s) | No |
| `desktop/src/*.ts` | tsc recompiles → Electron respawns | Yes (~1–2 s) |

If you only need a subset of services, you can still run them individually:

```bash
cd src/backend/ai-engine && python main.py
cd src/backend/coach-engine && python main.py
pnpm dev
```

## Validation

Before opening a PR, run:

```bash
pnpm lint
pnpm build
```

If you change Python services, also run:

```bash
python3 -m py_compile src/backend/ai-engine/main.py src/backend/coach-engine/main.py
```

## Pull request notes

Please include:

- what changed
- why it changed
- how you tested it
- screenshots or recordings when the change is UI-heavy

## Good contribution areas

- pronunciation UX
- AI coach quality
- module design
- deployment and docs
- accessibility
- performance
