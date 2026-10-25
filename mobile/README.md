# Cadence Mobile

React Native (Expo) app for Cadence — practice pronunciation on your phone.

The app runs in one of two modes, chosen on first launch.

**Connect to my computer (local).** Cadence runs on your own computer — the
desktop app or `docker compose` — and the phone talks to it over your home
Wi-Fi. You pair once by scanning a QR code; after that the phone finds the
computer again on its own. No account, no hosting bill, and recordings never
leave the house. This is the path described in
[docs/CONNECT_YOUR_PHONE.md](../docs/CONNECT_YOUR_PHONE.md); the protocol is in
[docs/PAIRING_PROTOCOL.md](../docs/PAIRING_PROTOCOL.md).

**Cadence Cloud.** Signs in with Firebase Authentication (Sign in with Apple,
Google, or email and password, the same Firebase project as the web app) and talks to a hosted Next.js API.
Available only when `EXPO_PUBLIC_API_URL` and the four `EXPO_PUBLIC_FIREBASE_*`
values are set at build time; without them the connect screen offers pairing
with your own computer only.

Either way the phone never runs the Python engines itself — it calls a server
that does.

## What's included

- **First run** — one question a screen (`src/components/onboarding/`, rules in
  `src/onboarding/flow.ts`): welcome slides, the goal, the level (all six,
  C2 first, each with approximate IELTS and TOEFL iBT equivalents, or the
  adaptive placement test), the daily goal (5, 10, 15 or 20 minutes), a
  reminder time (iOS's notification prompt appears only when reminders are
  turned on), where to practise ("Connect your own Cadence server", free, or
  Cadence cloud), an account (optional with your own server, needed for the
  cloud; the news checkbox starts unticked) and, on the cloud path only, Plus
  with "Not now". Each step is saved on the phone, so a closed app resumes
  where it stopped; it never shows twice, and Settings > Run setup again walks
  the learning questions again. Installs from before it existed skip it. Sign
  in, sign up and password reset also live under `(auth)`. Every one of these
  screens fits an iPhone SE without scrolling at the default text size; the
  e2e flow `09-auth-screens` captures them all.
- **Home** — the streak (with freezes), today's minutes against the daily goal,
  the word of the day and a quick-practice drill over 100+ target words grouped
  by sound family.
- **Learn** — the module curriculum: theory (with narration and a "mark as
  read" that closes the session so the exam can unlock), practice rounds and
  exams. Unlimited retries per word, an attempt counter, a segmented word queue
  and a summary with the next lesson.
- **Talk** — guided conversation scenarios, turn by turn, with the coach line
  read aloud, per-turn retry and pass/unlock progression.
- **Coach** — freeform sessions in repeat-the-target or say-anything mode, with
  a retry on every reply, an end-of-session summary, and history on the device.
- **Play** — five word games with progress kept on the phone (AsyncStorage,
  per account): **Flashcards** (spaced repetition over four hand-written decks of
  forty words each, with definitions, examples and IPA), **Meaning Match**
  (four-choice definition quiz with a combo bonus), **Spelling Bee** (hear the
  word in the coach voice, type it; three lives, letter hints, meaning hint),
  **Word Scramble** (tap letter tiles into order with the definition as the
  clue) and **Sound Match** (hear one word of a minimal pair, pick which it
  was, across twelve contrasts such as R/L, V/W and the two TH sounds). The
  decks are `src/data/vocabulary.ts` and `src/data/minimal-pairs.ts`; the pure
  rules (scheduler, scoring, question builders, text helpers) are under
  `src/games/` and unit tested. Games that play audio need the server; the
  rest work offline.
- **Learn** (the tab's hub) — pick a CEFR level, then a quiz, matching, the
  grammar builder (sentence building), sentence practice (rewrite, gap fill,
  dictation) or flashcards with spaced repetition; grammar lessons with an
  intro and graded exercises; the grammar reference with search; the sounds
  library; and the pronunciation modules. Everything here is graded on the
  phone (`gradeExercise` in `src/platform/content-model.ts`) and works offline.
- **Mouth map** — `src/components/mouth-map/`: the side view and front lip view
  of every English sound from the shared VocalTract port
  (`src/platform/vocal-tract/`), animated by interpolating the model's
  parameters, with highlighted articulators, a pulsing voice box for voiced
  sounds, an airflow arrow, overlays the model cannot draw itself, and a
  compare view for minimal pairs. Every pronunciation result links to it, and
  each sound has a drill ladder (sound, syllable, word, minimal pair, phrase,
  sentence; three takes in a row at 80 pass a step) and spaced review of fixed
  sounds (`src/practice/sound-coach.ts`).
- **Profile** — name, focus and pace for cloud accounts, and links to streak
  and badges and to Settings.
- **Settings** (`src/app/settings/index.tsx`) — reminders (daily, streak check,
  flashcards due, weekly summary, quiet hours), daily goal, level (overall and
  per skill, with Retake placement), sounds, haptics,
  coach voice, offline packs, the connected server, the account (product news,
  plan, restore purchases, sign out, delete account), run setup again, and the
  app version.
- **Streaks and badges** (`src/engagement/`, `src/app/badges.tsx`) — the
  streak counts local days; every 7 days in a row earns a freeze (two at most)
  that covers a missed day. Badges: first lesson, 7, 30 and 100-day streaks,
  each CEFR level completed, 100 and 1000 flashcards, a perfect quiz, a first
  conversation, and mastering each grammar topic. They are computed from the
  learner's state, so a free account sees them from this phone and a Plus
  account from its synced detail; a new one gets a short unlock moment with a
  buzz and the completion sound. The stats card shares as an image.
- **Reminders** (`src/notifications/`) — local notifications planned for the
  week as data (`plan.ts`, tested) and re-planned whenever the app opens or
  practice changes, so today's reminder disappears once the goal is met. Every
  notification opens its screen. Signed in, the phone registers an Expo push
  token with the account (`PUT /api/devices`, free or Plus) when the build has
  `EXPO_PUBLIC_EAS_PROJECT_ID`.
- **Widgets** (`targets/widget`, `@bacons/apple-targets`) — a small streak and
  goal ring, a medium word of the day that opens it to practise, and Lock Screen
  circular (streak) and inline (goal) widgets. The app writes a snapshot into
  the App Group `group.dev.pstepanov.cadence` (`src/lib/widget/`) and reloads
  the widgets; they move to the next day by themselves at midnight.

Every screen that loads something has a loading, empty, error and offline state
with a way out; the record button stays disabled with an explanation while the
scoring engine is still warming up, and unlocks by itself when it is ready.

## Content packs

Lessons, exercises and flashcards come from content packs
(`docs/PLATFORM.md`, section 3.3). `sounds` and `core-a1` to `core-b2` ship in
the app as `.cpack` assets, read from disk the first time a level is opened;
C1, C2 and newer versions are downloaded from Settings > Offline content packs
into the documents directory and checked against the manifest's SHA-256 sums.
The mouth-map targets come from `content/articulation/*.json` and live in the
JS bundle.

```bash
npm run content:sync    # copy public/packs and content/articulation into the app
npm run content:check   # fail if the copies are stale
```

Until the content pipeline has built `public/packs`, the small samples in
`src/content/fixtures/` stand in, and the Learn tab says so.

## AI, accounts and Plus

- **Where AI runs.** `src/engine/useEngineRoute.ts` runs the shared
  `routeRequest` before every AI action: a reachable paired Cadence server
  first (free, for everyone), then the cloud with Cadence Plus within today's
  quota, otherwise an offer (`src/components/AiOffer.tsx`). A phone signed in
  to the cloud can also pair its own server at home (Profile > Connect your own
  Cadence server): AI then runs at home while progress follows the account.
  AI calls go to `requireAiTransport()`, everything else to the account
  transport. In own-server mode there is no cloud, so nothing offers Plus.
- **Progress.** `src/learning/` keeps practice on the phone per learner (the
  uid, or `device` with no account). Signed in, a free account syncs only the
  summary (`POST /api/sync/summary`); Plus also uploads its detail once and then
  pushes and pulls changes (`src/learning/sync.ts`). Flashcards added through
  the MCP connector arrive from `GET /api/sync/inbox`.
- **Plus** is bought in the app through RevenueCat (`src/lib/billing/`,
  entitlement `plus`, offering `default`). After sign-in the app calls
  `Purchases.logIn(uid)` and `logOut` on sign-out. Without
  `EXPO_PUBLIC_REVENUECAT_IOS_KEY` the paywall says purchases are unavailable;
  `EXPO_PUBLIC_PURCHASES_STUB=1` is an offline stub for simulator flows. Plus
  itself comes from the server (`GET /api/me`).
- **App Check.** Cloud AI, sync and newsletter calls carry
  `X-Firebase-AppCheck`, from App Attest through the local module in
  `modules/cadence-app-attest` (iOS devices), or from a debug token in
  development (`EXPO_PUBLIC_APPCHECK_DEBUG_TOKEN`, ignored in release builds).
  The App Attest provider must be registered for the iOS app in the Firebase
  console with `EXPO_PUBLIC_FIREBASE_IOS_APP_ID` set.
- **Update notices.** On launch the app reads `GET /api/version`
  (`docs/RELEASING.md`): a banner below `ios.latest`, a blocking screen only
  below `ios.minimumBuild`, nothing without an App Store URL.
- **Dark mode** follows the system. Colour tokens in `src/theme/theme.ts` are
  live; style sheets built with `themed()` rebuild after a switch.

## Checks

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # expo lint
npm test            # node --test over tests/*.test.ts
npm run content:check
```

`npm test` is Node's own test runner — no test framework is installed. It covers
the pure logic that is easy to get quietly wrong: score display and thresholds
(`src/practice/scoring.ts`), lesson and scenario progression
(`src/practice/progression.ts`), onboarding steps and placement scoring
(`src/onboarding/`), streaks, freezes, badges and the daily goal
(`src/engagement/`), the reminder plan (`src/notifications/plan.ts`), the
widget snapshot (`src/lib/widget/snapshot.ts`), the recorder's state machine
(`src/audio/take-machine.ts`), error wording (`src/copy/errors.ts`,
`src/copy/auth-errors.ts`) and reading the cloud profile (`src/lib/profile.ts`). Anything
that needs a device is verified by running the app, not by a test.

## Development

```bash
cd mobile
npm install
npx expo start         # scan the QR code with Expo Go
```

`mobile/.env` is optional: fill it in only if you want the hosted Cadence Cloud
option to appear as well.

To develop against a server on your own machine, start one at the repo root and
pair with it:

```bash
pnpm serve             # prints a QR; scan it from the app's Connect screen
```

Your phone must be on the same Wi-Fi as your machine.

## iOS builds

Everything App Store Connect needs lives in `app.json` and the four `ios:*` scripts. The identity:

| | |
|---|---|
| Bundle identifier | `dev.pstepanov.cadence` |
| Apple team | `APPLE_TEAM_ID` in `.env.release` |
| Version / build | `expo.version` / `expo.ios.buildNumber` in `app.json` |
| Devices | iPhone only (`ios.supportsTablet: false`; on an iPad it runs in iPhone compatibility mode) |
| Orientation | Portrait |
| Deployment target | iOS 16.4 (Expo SDK 57's floor); the widget extension iOS 17 |
| Widget extension | `dev.pstepanov.cadence.widget` (`targets/widget`) |
| App Group | `group.dev.pstepanov.cadence`, on both App IDs |
| Capabilities | App Groups (app and widget), Push Notifications (app) |

You need Xcode 27 with the iOS 27 SDK and an App Store Connect API key (`.p8`). Keep the key out
of the repo — `.gitignore` already refuses `*.p8`. The archive and upload scripts
(`scripts/ios-release.mjs`) read the team and the key from the environment or from
`.env.release`, which is ignored:

```bash
cp .env.release.example .env.release   # APPLE_TEAM_ID, ASC_KEY_PATH, ASC_KEY_ID, ASC_ISSUER_ID
```

```bash
npm run ios:bump      # +1 on ios.buildNumber in app.json
npm run ios:archive   # expo prebuild -p ios --clean, then xcodebuild -> build/Cadence.xcarchive
npm run ios:upload    # xcodebuild -exportArchive with ExportOptions.plist -> App Store Connect
npm run testflight    # the three above, in order
```

`build/` and the generated `ios/` are both ignored: `ios/` is rebuilt from `app.json` by every
archive, so never edit it by hand — a change there is gone on the next run. Put it in `app.json`
or a config plugin instead.

Before the first archive with the widget, enable the App Group
`group.dev.pstepanov.cadence` on both App IDs (`dev.pstepanov.cadence` and
`dev.pstepanov.cadence.widget`) and Push Notifications on the app's, in the
developer portal; automatic signing then creates matching profiles.

To run the real native app on a simulator rather than in Expo Go:

```bash
npx expo prebuild -p ios --clean
npx expo run:ios --device "iPhone 17"
```

### The iOS 27 scene lifecycle

iOS 27 traps at launch in any app built against its SDK that still puts its window up from the
app delegate instead of a scene. The fix is `expo@~57.0.26` together with `expo-build-properties`
and `ios.enableSceneSupport: true` in `app.json`'s plugins, which makes prebuild write a
`UIApplicationSceneManifest` into the generated `Info.plist`. After any prebuild, check it:

```bash
/usr/libexec/PlistBuddy -c "Print :UIApplicationSceneManifest" ios/Cadence/Info.plist
```

It must name `EXExpoAppSceneDelegate`. If the key is missing, stop — that build launches into a
crash on anything running iOS 27.

### Icon and splash

`assets/images/ios-icon.png` is the App Store icon: the Cadence mark from
`assets/svg/icon-green-white.svg` (the sage `#6A994E` cut, the one drawn for light backgrounds)
centred at 66% width on the brand cream `#f2e8cf`, 1024×1024, flattened to RGB. The flattening
matters: App Store Connect rejects an icon that carries an alpha channel. Android and the web keep
`assets/images/icon.png`, the yellow-green mark on transparent, and the splash is that same mark
on cream.

### Permissions

The app asks for three things, and `app.json` says why for each: the microphone
(`NSMicrophoneUsageDescription`), the camera for scanning the pairing QR (the `expo-camera`
plugin's `cameraPermission`), and the local network for reaching your computer
(`NSLocalNetworkUsageDescription`). Nothing else is declared, because nothing else is used: no
photo library, no location, no contacts, no tracking.

`expo-audio` is configured with `enableBackgroundPlayback: false`. It defaults to on and adds
`audio` to `UIBackgroundModes`, which App Review rejects when the app does not actually keep
playing while backgrounded — Cadence does not. Turn it back on the day that changes, not before.

### Before the first upload

Nothing has been registered with Apple yet: there is no App ID for `dev.pstepanov.cadence`, no
App Store Connect record, and no TestFlight build. `npm run ios:archive` passes
`-allowProvisioningUpdates`, so Xcode registers the App ID and makes the signing certificate and
profile on the first run; the App Store Connect record has to exist before `ios:upload` will be
accepted.

**Decide on `.env` first.** `EXPO_PUBLIC_*` values are baked into the JS bundle at archive time.
A build made without them cannot sign anyone up: the app hides Cadence Cloud. `npm run ios:archive`
therefore refuses to archive unless all five values from `.env.example` are set (export them, or
keep them in `.env`), and checks that the archived bundle carries the Firebase project. For a
deliberate pairing-only build, set `CADENCE_LOCAL_ONLY_BUILD=1`.
`EXPO_PUBLIC_API_URL` must then point at a host the phone can reach from anywhere, not a LAN
address: a LAN IP works on your own Wi-Fi and nowhere else, and a reviewer cannot reach it at all.

## End-to-end flows and store captures

`e2e/run.sh` runs the Maestro flows (its header lists what must be running);
`node scripts/screenshots/capture.mjs` at the repo root drives the flows in
`e2e/screenshots/` for the store captures (`store/README.md`). Both need a
Release build made with the e2e environment from `.env.example`.

`EXPO_PUBLIC_*` values are inlined when Metro transforms a file, and Metro's
cache (`$TMPDIR/metro-cache`) can keep an older build's values. When the API
URL or the emulator address changes, delete that folder before building, then
check the bundle: `strings <app>/main.jsbundle | grep 127.0.0.1`.

## Audio formats

iOS records 16 kHz mono WAV directly. Android records m4a/AAC — the ai-engine transcodes it with ffmpeg (`brew install ffmpeg` for non-Docker local dev; the Docker image already includes it).

## Notes

- In local mode the phone sends a device token (`Authorization: Bearer cdnc_dev_…`) issued by the paired computer; the token lives in the iOS keychain via `expo-secure-store` and the server stores only its SHA-256 digest. In cloud mode it sends a Firebase ID token the same way (`await user.getIdToken()`; the SDK refreshes it, and a 401 is retried once with a forced refresh before the app signs out). `getAppSession()` on the server accepts both alongside its cookie flow.
- The pairing and discovery layer is `src/pairing/`; `src/api/transport.ts` is what decides where an API call goes.
- Coach session history lives in AsyncStorage on the device, mirroring the web app's localStorage behavior.
- Reference (TTS) audio is cached under the app's cache directory, keyed by text + voice.
