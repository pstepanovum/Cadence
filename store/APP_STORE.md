# Cadence on the App Store

The listing, the App Privacy answers, the age rating and the review notes for
the iOS app (`dev.pstepanov.cadence`, version 1.0.0). Paste these into App
Store Connect; nothing here is uploaded by any script. Screenshots are made by
`store/screenshot-studio` (see `store/README.md`).

## Listing

**Name:** Cadence

**Subtitle** (30 max): Advanced English, out loud

**Promotional text** (170 max):
See where your tongue goes for every English sound, fix the ones you miss, and
build grammar by level. Practice is free and works offline.

**Description:**

Cadence is an advanced-English coach for your voice and your grammar.

SOUNDS
- A mouth map for every English sound: a side view of the tongue, lips and
  jaw, and a front view of the lips, in American and British variants.
- Record a word and see each sound scored. Tap a weak one to see where your
  tongue should be, hear it, and try again.
- A personal list of sounds to fix, with drills that climb from the sound
  alone to syllables, words, minimal pairs (ship and sheep, think and sink),
  phrases and sentences.

GRAMMAR
- Lessons from A1 to C2 with clear explanations and real example sentences.
- Sentence building, matching, gap fills, error correction, dictation and
  quizzes.
- Flashcards with spaced repetition, so words come back on the day you are
  about to forget them.

SPEAKING
- Guided conversations, and an open coach for any topic: a job interview,
  ordering at a restaurant, your role at work.

YOUR DAY
- Streaks with freezes, a daily goal, badges, a daily reminder and Home
  Screen widgets.

FREE, AND YOUR OWN
Lessons, practice, flashcards, the sounds library and the mouth map are free
and work offline. Cadence is open source: connect your own Cadence server (the
desktop app or a server on your computer) and scoring, voices and the coach
run on it, at home, for free.

CADENCE PLUS
Plus adds the Cadence cloud for scoring, voices, transcription and the coach
anywhere, within a generous daily allowance, and keeps your full progress
synced across your devices.
- Cadence Plus Monthly: $14.99 a month
- Cadence Plus Yearly: $99.99 a year, with a 7-day free trial for new
  subscribers

Payment is charged to your Apple Account at confirmation of purchase. The
subscription renews automatically unless it is canceled at least 24 hours
before the end of the current period. Manage or cancel it in your Apple
Account settings. Any unused part of a free trial ends when you subscribe.

Terms of Use: https://www.apple.com/legal/internet-services/itunes/dev/stdeula/
Privacy Policy: https://cadence.pstepanov.dev/privacy

**Keywords** (100 max, 98 used):
`pronunciation,accent,english,grammar,speaking,flashcards,vocabulary,cefr,phonetics,esl,fluency,ipa`

**Support URL:** https://cadence.pstepanov.dev/support

**Marketing URL:** https://cadence.pstepanov.dev

**Privacy Policy URL:** https://cadence.pstepanov.dev/privacy

**Category:** Education (primary), Reference (secondary)

**Copyright:** 2026 Pavel Stepanov

## In-app purchases

One subscription group, **Cadence Plus**, entitlement `plus` in RevenueCat,
offering `default`.

| Reference name | Product ID | Price | Duration | Intro offer |
| --- | --- | --- | --- | --- |
| Cadence Plus Monthly | `dev.pstepanov.cadence.plus.monthly` | $14.99 | 1 month | none |
| Cadence Plus Yearly | `dev.pstepanov.cadence.plus.yearly` | $99.99 | 1 year | 7-day free trial, new subscribers |

Display name: "Cadence Plus". Description (45 max): "Cloud AI and full sync".
Review screenshot: `store/screenshots/iap-review/plus.png` (the paywall, see
the plan below), on both products.

## App Privacy

Answers for "Data Collection" in App Store Connect, matching what the app and
`cadence.pstepanov.dev` actually do (docs/PLATFORM.md sections 4, 5 and 14).
In own-server mode with no account nothing leaves the phone except to the
learner's own computer, which is not collection by the developer.

**Do you or your third-party partners collect data from this app?** Yes.

**Tracking:** No. No data is used to track people across apps or websites, no
advertising SDK, no analytics SDK, no IDFA.

| Data type | Collected | Linked to the user | Tracking | Purposes | Why |
| --- | --- | --- | --- | --- | --- |
| Contact Info > Email Address | Yes | Yes | No | App Functionality; Developer's Advertising or Marketing | Account sign-in (Firebase Authentication), account email; the newsletter only after the learner opts in (Brevo double opt-in) |
| Contact Info > Name | Yes | Yes | No | App Functionality | Optional display name on the profile |
| User Content > Audio Data | Yes | Yes | No | App Functionality | Cadence Plus only: recordings are sent to the Cadence cloud for scoring and transcription, processed in memory and never stored |
| User Content > Other User Content | Yes | Yes | No | App Functionality | Cadence Plus only: coach session summaries and transcripts, flashcards the learner adds |
| Usage Data > Product Interaction | Yes | Yes | No | App Functionality | Practice progress: the summary for every account (streak, minutes, lessons per level, 20 recent results), full history for Plus |
| Purchases > Purchase History | Yes | Yes | No | App Functionality | Which Plus plan is active and until when (App Store through RevenueCat) |
| Identifiers > User ID | Yes | Yes | No | App Functionality | The account id, also used as the RevenueCat app user id |
| Identifiers > Device ID | Yes | Yes | No | App Functionality | A random per-install id and the push token, for sync and reminders |

Not collected: Health and Fitness, Financial Info (payments go through Apple),
Location, Sensitive Info, Contacts, Browsing History, Search History,
Diagnostics (no crash or performance SDK), Photos or Videos, Gameplay Content,
Customer Support, Other Data.

Retention, for the privacy policy and the review: Plus detail is deleted 90
days after Plus lapses; deleting the account in the app removes the Firestore
data, the newsletter contact and the RevenueCat subscriber, after offering a
JSON export.

## Age rating

Answers for the age rating questionnaire. Expected result: 4+.

| Question | Answer |
| --- | --- |
| Parental controls | No |
| Age assurance | No |
| Unrestricted web access | No (links open only Cadence's own pages and Apple's terms) |
| User-generated content shared with other users | No |
| Messaging and chat with other people | No (the coach is software, not a person) |
| Advertising | No |
| Cartoon or fantasy violence | None |
| Realistic violence | None |
| Prolonged graphic or sadistic violence | None |
| Profanity or crude humor | None |
| Mature or suggestive themes | None |
| Horror or fear themes | None |
| Medical or treatment information | None |
| Health or wellness topics | None |
| Alcohol, tobacco or drug use or references | None |
| Simulated gambling | None |
| Sexual content or nudity | None |
| Graphic sexual content and nudity | None |
| Contests | None |
| Gambling | No |
| Loot boxes | No |

## Review notes

Paste into App Review Information > Notes. Fill in the demo account first.

> Cadence teaches advanced English: pronunciation with a mouth map for every
> sound, grammar lessons by CEFR level, flashcards and a speaking coach.
>
> Demo account (Cadence Plus not active, so the paywall can be tested):
> email: `<demo account email, to fill in>`
> password: `<demo account password, to fill in>`
>
> 1. Start: the setup asks a few questions (goal, level, daily goal,
> reminders; "Skip" or "Not now" is fine), then "Where should Cadence run?".
> Choose "Cadence cloud", then sign in with the demo account. Lessons,
> quizzes, matching, sentence building, flashcards, the sounds library and
> the mouth map are free and work offline. The Learn tab lists the sounds
> under each level's lessons; a sound page shows the mouth map, and the
> compare view shows minimal pairs such as ship / sheep.
>
> 2. Cadence Plus: the last setup step is the paywall, or later Profile and
> settings > Settings > Plan: Free > See Cadence Plus. It offers Monthly
> ($14.99) and Yearly ($99.99 with a 7-day free trial). Purchase with a
> sandbox account; the app then scores recordings and runs the coach in the
> Cadence cloud. Restore purchases is on the paywall and on the Account
> screen. The account can be deleted in the app (Account > Delete account),
> after an offer to download the data first.
>
> 3. Own server (optional, cannot be reached from App Review's network):
> "Connect your own Cadence server" pairs the app with Cadence running on the
> learner's own computer, which is free and open source
> (github.com/pstepanovum/Cadence), by scanning a QR code on the same Wi-Fi.
> Nothing is sold or unlocked by it and it never shows the paywall. The local
> network and camera permissions are used only for this.
>
> The microphone is used only while the learner holds a record button.

## Screenshot plan

Made by `store/screenshot-studio` from captures of the shipping build on the
iPhone 16 Pro Max simulator (1320 x 2868), light mode, status bar at 9:41.
`ios.supportsTablet` is false, so there is no iPad set.

| Slot | Size | Folder |
| --- | --- | --- |
| iPhone 6.9" Display | 1320 x 2868 | `store/screenshots/iphone-6.9/` |
| iPhone 6.5" Display | 1284 x 2778 | `store/screenshots/iphone-6.5/` |
| Subscription review screenshot | 1320 x 2868 | `store/screenshots/iap-review/plus.png` |

Slides, in order (captions are in `store/screenshot-studio/config/slides.config.json`):

| # | Slug | Caption | Capture shows |
| --- | --- | --- | --- |
| 1 | `mouth-map` | See where every sound is made | A sound page: the side view with the tongue highlighted, the front lip view |
| 2 | `sounds-to-fix` | Fix the sounds you miss | A pronunciation result with weak sounds, or the sounds-to-fix list |
| 3 | `grammar-builder` | Build sentences, level by level | A sentence-building exercise mid-answer |
| 4 | `flashcards` | Words come back on time | A flashcard with its answer and the four grades |
| 5 | `coach` | Talk it through with a coach | The Coach tab mid-conversation |
| 6 | `own-server` | Free on your own Cadence | The "Connect your own Cadence server" screen |
| 7 | `widgets` | Your streak on the Home Screen | The Home Screen with the small and medium widgets |
| 8 | `streaks` | Keep the streak going | Home: the streak and today's goal |

**Subscription review screenshot.** The paywall (`plus` capture): both plans
with their store prices, the trial line for Yearly, Restore purchases, and the
Terms and Privacy links. It is captured with the sandbox store on the
simulator (StoreKit configuration or a sandbox account), so the prices shown
are App Store Connect's real ones; the offline purchase stub
(`EXPO_PUBLIC_PURCHASES_STUB=1`) is only for layout drafts and must not be
the uploaded image.

**Draft vs final.** The first set in `store/screenshots/` is a draft made
from the e2e build with demo data from `scripts/screenshots/stage-demo.mjs`
against the emulators. The final set is captured after the owner approves the
captions, from the release build signed in to the production demo account.
