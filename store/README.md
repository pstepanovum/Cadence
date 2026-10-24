# Cadence store assets

```
store/
  APP_STORE.md              listing, App Privacy, age rating, review notes, screenshot plan
  screenshot-studio/        Vite + React dashboard and the Playwright export
  screenshots/
    raw/                    simulator captures (<slug>.png, 1320 x 2868)
    iphone-6.9/             exported slides, 1320 x 2868 (rebuilt by the export)
    iphone-6.5/             exported slides, 1284 x 2778
    iap-review/plus.png     the subscription review screenshot
```

`ios.supportsTablet` is false, so there is no iPad set. App Store Connect takes
at most 10 screenshots per size; the export refuses an eleventh.

## How a slide looks

A cream or hunter-green wallpaper with two soft lime glows and the Cadence
mark drawn large and faint; a Sour Gummy kicker; a Funnel Display caption
with a lime marker under the key words (`*asterisks*` in the config); a short
subtitle; on some slides one of the illustrations the web and the app already
use, beside the frame's corner; and the real capture in a slim dark frame that
runs off the bottom edge. Colours are the app's (`src/app/globals.css`,
`mobile/src/theme/theme.ts`), mirrored in `screenshot-studio/src/theme.ts`.

A slide whose capture is missing shows a labelled placeholder. There are no
mock screens: Apple requires screenshots of the real app.

## 1. Stage the demo data and capture

Everything runs locally against the Firebase emulators and the iOS Simulator.

```bash
# The emulators and a Cadence server against them (demo- project, port 3000)
firebase emulators:start --only auth,firestore --project demo-cadence
pnpm build && pnpm start -H 0.0.0.0 -p 3000     # with the demo NEXT_PUBLIC_FIREBASE_* values and
                                               # FIREBASE_AUTH_EMULATOR_HOST / FIRESTORE_EMULATOR_HOST set

# Two demo accounts: sam@ (Plus, a 23-day streak, weak sounds, reviewed cards)
# and alex@ (free, for the paywall). Undo with cleanup-demo.mts.
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
FIREBASE_PROJECT_ID=demo-cadence node --import ./tests/register.mjs scripts/screenshots/stage-demo.mts

# The app, built with the e2e environment (mobile/.env.example), on the
# iPhone 16 Pro Max simulator (6.9", 1320 x 2868)
cd mobile && npx expo run:ios --configuration Release --device "iPhone 16 Pro Max"

# Drive the simulator through the screens: light mode, 9:41, full battery
node scripts/screenshots/capture.mjs            # --only mouth-map,flashcards to redo some
```

`capture.mjs` runs the Maestro flows in `mobile/e2e/screenshots/` and saves
each screen with `xcrun simctl io screenshot` into `store/screenshots/raw/`.
It captures `own-server` and `plus` (the paywall) with the free account during
setup, then signs in the Plus account for `streaks`, `mouth-map`,
`sounds-to-fix`, `grammar-builder`, `flashcards` and `coach`.

The `widgets` slide is captured by hand: on the simulator's Home Screen,
long-press, Edit > Add Widget, add the Cadence small and medium widgets, then
`xcrun simctl io booted screenshot store/screenshots/raw/widgets.png`.

## 2. Edit and export

```bash
cd store/screenshot-studio
npm install
npx playwright install chromium    # once
npm run dev                        # dashboard on http://localhost:5182
```

Edit kickers, captions, subtitles, grounds and illustrations, then **Save**
(writes `config/slides.config.json`). Export:

```bash
npm run export                     # both sizes and the subscription review screenshot
npm run export -- --require-raw    # the upload run: refuses a slide without its capture
npm run export -- --device iphone-6.5
npm run export -- --slide 3
```

The export copies the fonts (from the mobile app's `@expo-google-fonts`
packages), the mark and the illustrations into `screenshot-studio/public/`,
renders each slide in Chromium at its exact pixel size, rewrites every PNG as
8-bit RGB with no alpha channel (App Store Connect rejects alpha), and reads
each header back: a wrong size or a leftover alpha channel fails the run.

## 3. Which App Store Connect slot takes what

| Folder | Size | Slot |
| --- | --- | --- |
| `screenshots/iphone-6.9/01-mouth-map.png` ... | 1320 x 2868 | iPhone 6.9" Display |
| `screenshots/iphone-6.5/01-mouth-map.png` ... | 1284 x 2778 | iPhone 6.5" Display |
| `screenshots/iap-review/plus.png` | 1320 x 2868 | Review screenshot on both Plus subscriptions |

The 6.5" set frames the same 6.9" captures; nothing is cropped.

## Keeping it honest

- The final captures come from the release build signed in to the production
  demo account, after the owner approves the captions. The draft set in this
  folder comes from the e2e build against the emulators.
- The subscription review screenshot must show App Store Connect's real prices
  (sandbox store), not the offline purchase stub the draft uses.
- Prices in captions, if any, must match App Store Connect: $14.99 a month,
  $99.99 a year with a 7-day free trial.
- No other app's name, logo, screenshots or copy, and no assistant product
  named or shown.
