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

**Cadence Cloud.** Signs in with the same Supabase project as the web app and
talks to a hosted Next.js API. Available only when `EXPO_PUBLIC_API_URL` and the
Supabase keys are set at build time.

Either way the phone never runs the Python engines itself — it calls a server
that does.

## What's included

- **First run** — three onboarding questions (name, focus, pace) written to the
  same Supabase user metadata the web app reads, so one account means one
  profile. Sign in, sign up and password reset all live under `(auth)`.
- **Home** — attempts, average score, modules complete and the day streak, plus
  a quick-practice drill over 100+ target words grouped by sound family. The
  family it opens on follows the focus chosen at onboarding.
- **Learn** — the module curriculum: theory (with narration and a "mark as
  read" that closes the session so the exam can unlock), practice rounds and
  exams. Unlimited retries per word, an attempt counter, a segmented word queue
  and a summary with the next lesson.
- **Talk** — guided conversation scenarios, turn by turn, with the coach line
  read aloud, per-turn retry and pass/unlock progression.
- **Coach** — freeform sessions in repeat-the-target or say-anything mode, with
  a retry on every reply, an end-of-session summary, and history on the device.
- **Profile** — name, focus area, daily pace, coach voice, connection status
  and sign out.

Every screen that loads something has a loading, empty, error and offline state
with a way out; the record button stays disabled with an explanation while the
scoring engine is still warming up, and unlocks by itself when it is ready.

## Checks

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # expo lint
npm test            # node --test over tests/*.test.ts
```

`npm test` is Node's own test runner — no test framework is installed. It covers
the pure logic that is easy to get quietly wrong: score display and thresholds
(`src/practice/scoring.ts`), lesson and scenario progression
(`src/practice/progression.ts`), the recorder's state machine
(`src/audio/take-machine.ts`) and error wording (`src/copy/errors.ts`). Anything
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
| Apple team | `V7H9Y9K6Z7` |
| Version / build | `expo.version` / `expo.ios.buildNumber` in `app.json` |
| Devices | iPhone only (`ios.supportsTablet: false`; on an iPad it runs in iPhone compatibility mode) |
| Orientation | Portrait |
| Deployment target | iOS 16.4 (Expo SDK 57's floor) |

You need Xcode 27 with the iOS 27 SDK, and the App Store Connect API key (`.p8`) at
`~/.config/pstepanov/AuthKey_3WFKQQ2M25.p8`. Keep the key out of the repo — `.gitignore` already
refuses `*.p8`. Every script reads its location through `ASC_KEY_PATH`, `ASC_KEY_ID` and
`ASC_ISSUER_ID`, so a key somewhere else only needs the env var:

```bash
ASC_KEY_PATH=/somewhere/else/AuthKey_XXXXXXXXXX.p8 ASC_KEY_ID=XXXXXXXXXX npm run testflight
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

The microphone is the only thing the app asks for, and `NSMicrophoneUsageDescription` in
`app.json` says why. Nothing else is declared, because nothing else is used: no camera, no photo
library, no location, no contacts, no tracking.

`expo-audio` is configured with `enableBackgroundPlayback: false`. It defaults to on and adds
`audio` to `UIBackgroundModes`, which App Review rejects when the app does not actually keep
playing while backgrounded — Cadence does not. Turn it back on the day that changes, not before.

### Before the first upload

Nothing has been registered with Apple yet: there is no App ID for `dev.pstepanov.cadence`, no
App Store Connect record, and no TestFlight build. `npm run ios:archive` passes
`-allowProvisioningUpdates`, so Xcode registers the App ID and makes the signing certificate and
profile on the first run; the App Store Connect record has to exist before `ios:upload` will be
accepted.

**`.env` has to be filled in first.** `EXPO_PUBLIC_*` values are baked into the JS bundle at
archive time, and `src/lib/config.ts` throws when they are missing — a build made without them
installs fine and then dies on the first screen. `EXPO_PUBLIC_API_URL` must point at a host the
phone can reach from anywhere, not a LAN address: a LAN IP works on your own Wi-Fi and nowhere
else, and a reviewer cannot reach it at all.

## Audio formats

iOS records 16 kHz mono WAV directly. Android records m4a/AAC — the ai-engine transcodes it with ffmpeg (`brew install ffmpeg` for non-Docker local dev; the Docker image already includes it).

## Notes

- In local mode the phone sends a device token (`Authorization: Bearer cdnc_dev_…`) issued by the paired computer; the token lives in the iOS keychain via `expo-secure-store` and the server stores only its SHA-256 digest. In cloud mode it sends a Supabase access token the same way. `getAppSession()` on the server accepts both alongside its cookie flow.
- The pairing and discovery layer is `src/pairing/`; `src/api/transport.ts` is what decides where an API call goes.
- Coach session history lives in AsyncStorage on the device, mirroring the web app's localStorage behavior.
- Reference (TTS) audio is cached under the app's cache directory, keyed by text + voice.
