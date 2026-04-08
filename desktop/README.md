# Cadence Desktop

Electron wrapper for the Cadence Next.js app. Packages into a macOS `.dmg`.

## Prerequisites

- Node.js 20+
- pnpm

## Development

The easiest way is to run everything from the repo root:

```bash
pnpm dev:all
```

This starts the web app, both Python backends, and Electron together — with hot-reload on all layers. See the root [README](../README.md) for full details.

If you want to run only the desktop app (web app must already be on port 3000):

```bash
# from repo root — install desktop deps first time
cd desktop && pnpm install && cd ..

# start web app
pnpm dev

# start Electron (separate terminal)
cd desktop && pnpm dev
```

Electron connects to `http://localhost:3000`.

## Build a DMG

From the `desktop/` folder:

```bash
pnpm install
pnpm build          # runs next build + tsc + electron-builder
```

Output lands in `desktop/packages/`.

### What the build does

1. `next build` (root) — builds Next.js with `output: standalone`, producing `.next/standalone/server.js`
2. `tsc` (desktop) — compiles `src/main.ts` → `dist/main.js`
3. `electron-builder` — packages everything into a `.dmg`:
   - Electron shell
   - `dist/` (compiled main + preload)
   - `.next/standalone/` bundled as app resources (the Next.js server)
   - `public/` and `.next/static/` copied next to it

## App icon

Place `assets/icon.icns` (1024×1024 recommended) before building.
You can convert a PNG using `iconutil` or `electron-icon-builder`.

## Signing & Notarization

For distribution outside the App Store, set these env vars before building:

```shell
APPLE_ID=you@example.com
APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx
APPLE_TEAM_ID=XXXXXXXXXX
CSC_LINK=path/to/certificate.p12
CSC_KEY_PASSWORD=yourpassword
```
