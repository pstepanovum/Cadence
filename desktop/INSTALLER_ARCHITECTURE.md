# Cadence Desktop Installer Architecture

## What the current desktop app does

Today the `desktop/` folder is an Electron wrapper around the packaged Next.js app:

- `desktop/src/main.ts`
  - creates the Electron window
  - starts the packaged standalone Next server from `resources/next-server/server.js`
  - opens `http://localhost:3000/dashboard`
- `desktop/electron-builder.yml`
  - bundles the compiled Electron code
  - bundles `.next/standalone`, `public/`, and `.next/static`
- `desktop/src/preload.ts`
  - exposes only a tiny `window.electron` object to the renderer

This means the downloadable desktop build currently contains:

- Electron
- the local Next.js standalone server
- the static web UI

It does **not** currently install or start:

- `src/ai-engine`
- `src/coach-engine`
- Python
- Torch / Transformers / OmniVoice / Whisper dependencies
- `ffmpeg`
- `espeak-ng`
- Hugging Face model weights

So the current DMG is a UI shell, not a complete local AI runtime.

## Important architectural constraint

The packaged desktop app runs on the user's machine.

That means any true server-only secret must **not** live inside the desktop bundle.

Examples already present in this repo that should stay remote:

- `FIREBASE_SERVICE_ACCOUNT` (Firebase Admin credentials)
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- email provider secrets

Routes that depend on privileged secrets should not be treated as part of the local desktop runtime. The local desktop app can still sign people in with the public Firebase config, but Stripe webhooks, Firebase Admin operations (minting session cookies, reading and writing Firestore), and other privileged operations should stay on a hosted backend.

This matters more since cloud mode moved to Firebase: Firestore is reached only through the Admin SDK, which needs service-account credentials, so a packaged desktop app without them cannot read or save cloud progress on its own. Until the cloud routes are proxied to the hosted backend (as `/api/stripe/cancel` already is), the desktop app should be used in local mode.

## Recommended target architecture

Split the product into two runtimes:

### 1. Remote backend for secrets and privileged actions

Keep these on hosted infrastructure:

- Stripe webhook handling
- Stripe subscription mutations that require secret keys
- Firebase Admin operations
- any email-sending routes with provider secrets
- any other truly server-only business logic

The desktop app should call these over HTTPS.

### 2. Local desktop runtime for speech + coaching

The local app should own:

- the Electron shell
- the packaged Next.js frontend/server layer
- the local pronunciation engine
- the local coach engine
- model downloads and warmup
- local logs and health checks

## Best production approach

Do **not** rely on `pip install` on the user's machine as the primary product flow.

For a real desktop release, the better path is:

1. Build the Python services as distributable sidecar binaries for each target platform.
2. Ship those binaries with Electron as `extraResources` or downloadable signed archives.
3. On first launch, copy/extract them into a writable runtime directory under `app.getPath("userData")`.
4. Download model weights into an app-managed cache directory.
5. Start both local services from Electron and poll their health endpoints.

This avoids forcing end users to install Python, Homebrew, Torch, or system packages themselves.

## First-launch experience

The desktop app should gain a real setup flow.

### Boot logic

When the app opens:

1. Start the local Next server as you already do.
2. Read a setup manifest from:
   - macOS: `~/Library/Application Support/Cadence/setup.json`
3. If setup is incomplete, load `/desktop/setup` instead of `/dashboard`.
4. Only route to `/dashboard` after the required local services are healthy.

### Setup page responsibilities

The setup page should show:

- runtime version
- whether local AI engine is installed
- whether local coach engine is installed
- whether model assets are downloaded
- whether warmup is complete
- current log line / progress text
- retry button
- logs button

Suggested visible steps:

1. Prepare local runtime folder
2. Install speech engine
3. Install coach engine
4. Download voice and transcription models
5. Download coach model
6. Start local services
7. Verify `/health` and `/coach-status`
8. Open Cadence

## Recommended local runtime layout

Use the app data directory, not the signed app bundle, for mutable content:

```text
~/Library/Application Support/Cadence/
├── setup.json
├── logs/
│   ├── ai-engine.log
│   └── coach-engine.log
├── runtime/
│   ├── ai-engine/
│   └── coach-engine/
└── models/
    ├── huggingface/
    └── omnivoice/
```

Store:

- extracted sidecar binaries in `runtime/`
- downloaded model weights in `models/`
- progress + version state in `setup.json`
- child-process logs in `logs/`

## IPC contract to add

Electron should expose a setup manager API through `preload.ts`.

Suggested API:

```ts
window.cadenceDesktopSetup.getState()
window.cadenceDesktopSetup.install()
window.cadenceDesktopSetup.retry()
window.cadenceDesktopSetup.openLogs()
window.cadenceDesktopSetup.onProgress(listener)
```

Suggested state shape:

```ts
type DesktopSetupState = {
  phase:
    | "idle"
    | "checking"
    | "installing"
    | "downloading-models"
    | "starting-services"
    | "verifying"
    | "ready"
    | "error";
  currentStep: string | null;
  percent: number;
  aiEngineReady: boolean;
  coachEngineReady: boolean;
  modelsReady: boolean;
  error: string | null;
  logsPath: string | null;
};
```

## Files to add or change in this repo

### Electron side

- `desktop/src/main.ts`
  - decide between `/desktop/setup` and `/dashboard`
  - manage child processes for local AI services
- `desktop/src/preload.ts`
  - expose safe setup IPC methods
- `desktop/src/setup-manager.ts`
  - install/extract runtimes
  - download model assets
  - start/stop services
  - persist setup manifest
- `desktop/electron-builder.yml`
  - bundle sidecar binaries or installer archives

### Next.js side

- `src/app/desktop/setup/page.tsx`
  - first-run installation screen
- `src/components/desktop/desktop-setup.tsx`
  - progress UI
- `src/types/electron.d.ts`
  - typed renderer API for the setup bridge

### Backend split

Move privileged routes off the local packaged desktop server:

- Stripe webhook handling
- Stripe secret-key operations
- Firebase Admin operations
- email-sending operations with provider secrets

## Delivery plan

### Phase 1: fast internal beta

Goal: validate the setup UX quickly.

- Add the setup page and setup-state IPC
- Detect whether local AI services are reachable
- For internal use only, allow a bootstrap path that can start services from a developer machine or Docker

This gets the product flow working without locking in the final packaging method.

### Phase 2: real consumer desktop release

Goal: make install zero-touch for end users.

- produce signed sidecar builds for `ai-engine` and `coach-engine`
- bundle or signed-download those sidecars per platform
- download model weights on first launch
- persist runtime state and support self-repair

## Recommendation for this repo

The safest next implementation step is:

1. add a desktop setup manager on the Electron side
2. add a `/desktop/setup` page in Next.js
3. gate desktop startup on setup state
4. move secret-dependent backend routes out of the local packaged app

That gives Cadence a clean path to a true downloadable desktop product without shipping backend secrets or making users install AI dependencies by hand.
