# Cadence platform

The architecture spec for Cadence as an advanced-English platform: pronunciation
(existing), grammar by CEFR level, sentence building, matching, quizzes,
flashcards with spaced repetition, coach conversations and the mouth map, on web,
desktop (Electron) and mobile (Expo) from one content model.

Every builder reads this first. When code and this file disagree, fix one of
them in the same change. Product decisions here are the owner's and final;
anything marked **Open** needs the owner.

Production: `https://cadence.pstepanov.dev`, Firebase project `cadence-pstepanov`.

---

## 1. Principles

1. **Your own Cadence first.** A paired Cadence desktop or server on the
   learner's network runs scoring, TTS, transcription and the coach locally,
   free, for everyone, Plus or not.
2. **The cloud is for Plus, and capped.** Without a reachable Cadence, AI runs
   on the Cadence cloud only with Cadence Plus, within daily quotas and behind a
   global circuit breaker.
3. **Practice never needs AI.** Lessons, quizzes, matching, sentence building,
   flashcards, the sounds library and the mouth map work offline from static
   content packs, in every mode, for free.
4. **Progress follows the account.** Signed-in progress lives in Firestore;
   free accounts get one small summary document, Plus gets everything. People
   who never sign in keep progress on the device or their paired server.
5. **Static where possible.** Content is generated offline, validated, shipped
   as versioned JSON packs and served from the CDN. Nothing per request costs
   money unless it has to.

---

## 2. Shared modules

Pure TypeScript shared by every client lives in two byte-identical copies:

| Server / web / desktop | Mobile | What |
| --- | --- | --- |
| `src/lib/platform/content-model.ts` | `mobile/src/platform/content-model.ts` | CEFR, ids, topics, grammar points, lessons, exercise kinds, packs, `validatePackContent`, `gradeExercise` |
| `src/lib/platform/engine-routing.ts` | `mobile/src/platform/engine-routing.ts` | `routeRequest`, `resolvePlus`, `dataTier`, quotas, audio limits and sniffing |
| `src/lib/platform/progress-model.ts` | `mobile/src/platform/progress-model.ts` | the summary document and `applyActivity` |
| `src/lib/platform/vocal-tract/*` | `mobile/src/platform/vocal-tract/*` | the mouth-map model (section 13) |
| `src/lib/platform/srs.ts` | `mobile/src/platform/srs.ts` | the trimmed SM-2 (`review`, `planSession`, `summarizeDeck`); `mobile/src/games/srs.ts` re-exports it |
| `src/lib/platform/daily-plan.ts` | `mobile/src/platform/daily-plan.ts` | `buildDailyPlan`: today's 10 to 15 minutes (section 7) |
| `src/lib/platform/placement.ts` | `mobile/src/platform/placement.ts` | `writtenLevel`, `writtenScore`, `writtenConfidence`, `combineLevels` (section 7) |

Rules, enforced by `tests/platform/drift.test.ts`:

- The copies match from the first `/**` to the end of the file. Only the
  header (the `// FILE:` and `// Twin:` lines) differs.
- Edit the `src/lib/platform/` copy, then run
  `node scripts/platform/sync-mobile.mjs` (`--check` fails on a stale copy).
- They import each other only as `./x.ts`. Node's test runner, Metro and Next
  all resolve that; the root `tsconfig.json` has `allowImportingTsExtensions`
  for it.
- No Node, DOM, React or React Native APIs, so they run in all three apps
  and in `node --test`.

**Open:** the web's flashcards still schedule with their own
`src/components/learn-hub/srs.ts`, and no screen calls `buildDailyPlan` yet;
both should move onto the shared modules.

---

## 3. Content model

Types are in `content-model.ts`. All content is written in our own words or
comes from openly licensed sources (section 3.5).

**CEFR level.** `A1 A2 B1 B2 C1 C2`. Every grammar point, lesson and exercise
has exactly one level.

**Ids.** `<prefix>.<slug>`, lowercase, at most 96 characters, permanent.
Prefixes: `topic`, `gp` (grammar point), `lesson`, `ex` (exercise), `card`,
`sound`, `scenario`. Progress and SRS state are keyed by id, so content is
fixed by editing in place, never by renaming. A removed id stays reserved.

| Entity | Key fields |
| --- | --- |
| Topic | `id`, `title`, `summary` |
| Grammar point | `id`, `level`, `topicId`, `title`, `summary` (one line), `explanation`, `patterns[]`, `examples[]` (at least two), `commonErrors[]` (`wrong`, `right`, `note`), `related[]` |
| Lesson | `id`, `level`, `topicId`, `title`, `goal`, `minutes` (1-30), `grammarPointIds[]`, `soundIds[]`, `exerciseIds[]` |
| Example | `text`, `note?`, `source` (`generated` or `tatoeba` with `sentenceId` and `author`), `audio?` |
| Scenario (coach) | `id`, `level`, `title`, `role` (who the coach plays), `learnerRole`, `goal`, `usefulPhrases[]`, `opening` |

### 3.1 Exercise kinds

Every exercise has `id`, `kind`, `level`, `grammarPointIds[]`, `soundIds?`,
`prompt`, `explanation?`. Kind-specific fields and how they are graded
(`gradeExercise`, with typed answers compared through `normalizeAnswer`:
NFKC, case folded, curly quotes straightened, whitespace collapsed, final
punctuation dropped; contractions are not expanded, so accepted answers list
both forms):

| Kind | Fields | Answer | Correct when |
| --- | --- | --- | --- |
| `multiple_choice` | `question`, `options[2..6]`, `answer` (index) | `choice` | index matches |
| `matching` | `pairs[2..8]` of `left`/`right` | `mapping[i]` = chosen right index | all pairs; partial score per pair |
| `gap_fill` | `text` with `___` per gap, `answers[gap][]`, `bank?` | `gaps[]` | every gap matches an accepted answer; partial score per gap |
| `sentence_building` | `answer` tokens in order (3-16), `alternatives?`, `distractors?` | `tokens[]` | equals the answer or an alternative |
| `error_correction` | `sentence`, `answers[]` | `text` | matches an accepted answer |
| `transformation` | `source`, `instruction`, `answers[]` | `text` | matches an accepted answer |
| `dictation` | `text`, `audio` | `text` | word accuracy (1 - word edit distance / length) at least 0.9; score is the accuracy |
| `minimal_pair` | `words[2]`, `soundIds[2]`, `audio[2]` | `played`, `choice` | the learner picked the word that was played |
| `flashcard` | `front`, `back`, `example?`, `audio?` | `grade` (`again`, `hard`, `good`, `easy`) | self-graded; anything but `again` counts as recalled and feeds SRS |

Grading runs on the device for every kind (no network, no cost) and on the
server only for the MCP quiz tools. Spoken answers (shadowing, the coach)
are scored by the engines, not by `gradeExercise`.

### 3.2 Validation

`validatePackContent` (ids, uniqueness, references, levels, text limits) and
`validateExercise` (each kind's own rules: answer indexes in range, one answer
list per gap, distractors not in the answer, alternatives use the same tokens,
minimal pairs actually differ) run in the content pipeline and in tests. A pack
with any problem does not build. Further pipeline checks, in
`scripts/content/validate.mjs` (content builder):

- every Tatoeba example has a `sentenceId` that exists in the downloaded
  export, and its author is credited;
- no example, explanation or exercise repeats text from a word list we may not
  use (no Oxford 3000/5000, no Cambridge lists; we never import them, and the
  pipeline does not prompt with them);
- generated text passes a second Gemini pass that answers each exercise blind;
  disagreements with the key are dropped or rewritten, never shipped.

### 3.3 Content packs

Content is static JSON: shipped inside each app, served by the web, cached by
the CDN, readable offline, and never read from Firestore.

```
public/packs/index.json                                   PackIndex, short cache (5 min)
public/packs/<packId>/v<version>/manifest.json             PackManifest
public/packs/<packId>/v<version>/content.json              PackContent
public/packs/<packId>/v<version>/audio/<sha256-16>.m4a     pre-generated audio
```

- Packs: `sounds` (articulation targets, minimal pairs, sounds library audio),
  `core-a1` … `core-c2` (topics, grammar points, lessons, exercises,
  flashcards, scenarios for that level).
- `manifest.json` lists every file with its SHA-256 and size. `version` is an
  integer that only goes up; any changed file means a new version directory.
  Versioned paths are immutable (`Cache-Control: public, max-age=31536000,
  immutable`).
- `format` (`PACK_FORMAT_VERSION`) is the container; `contentModel`
  (`CONTENT_MODEL_VERSION`) is the schema. `canReadPack` skips any pack the app
  does not understand rather than half-reading it; `packsToUpdate` picks the
  ones with a newer version.
- Mobile bundles `sounds`, `core-a1` … `core-b2` in the binary and downloads
  `core-c1`, `core-c2` and newer versions on demand into the documents
  directory (the "offline content packs" setting lists them with sizes and a
  remove button). Desktop bundles all packs in the standalone build. The web
  fetches `index.json` and caches packs with a service worker.
- Audio (lesson sentences, flashcards, minimal pairs, sound models) is
  generated once at build time with Google Cloud Text-to-Speech and named by
  the hash of `voice|rate|text`, so a rebuild reuses it.

Size budgets are in section 16.

### 3.4 Content pipeline

`scripts/content/` (content builder), run by hand, never at request time:

1. `generate.mjs` drafts grammar points, lessons and exercises per level with
   Gemini (`GEMINI_API_KEY` read from `~/.config/pstepanov/gemini.env`, never
   printed), in our own words, against a fixed outline of grammar points per
   level.
2. `tatoeba.mjs` pulls English sentences from the Tatoeba export (CC BY 2.0
   FR), keeps id and author, and attaches them as examples where a grammar
   point matches.
3. `validate.mjs` runs section 3.2. `build.mjs` writes the pack, hashes files,
   bumps the version only when something changed.
4. `audio.mjs` synthesizes missing audio (owner runs it; it costs money).

### 3.5 Sources and credit

Our own generated text, Tatoeba sentences (CC BY 2.0 FR, credited per
sentence in `CREDITS.md` and in the pack), and the articulation sources in
section 13. No copyrighted word lists. Every source is added to `CREDITS.md`
in the change that brings it in.

---

## 4. Accounts, data tiers and entitlement

### 4.1 Tiers

`dataTier(signedIn, plus)` in `engine-routing.ts`:

| Who | Tier | Cloud keeps | Device or paired server keeps |
| --- | --- | --- | --- |
| Not signed in | `none` | nothing | everything (as today) |
| Signed in, free | `summary` | one summary document | SRS state, attempts, mastery, coach history |
| Signed in, Plus | `full` | everything, synced across devices | a cache |

- **Upgrade.** When Plus first becomes active on a device, the app uploads its
  local detail once (`POST /api/sync/import`, idempotent per install id), then
  syncs normally.
- **Lapse.** The summary keeps updating. Detailed sync stops; detailed cloud
  data is kept `LAPSED_RETENTION_DAYS` (90) and then deleted by the daily job
  (section 12). Renewing within 90 days resumes sync with nothing lost. The
  privacy policy says this in those words.
- Transcripts are stored only as part of Plus progress (coach summaries,
  spoken-grammar feedback), never for free accounts, never by default for
  scoring.

### 4.2 Entitlement

- Plus products: `dev.pstepanov.cadence.plus.monthly` ($14.99/month) and
  `dev.pstepanov.cadence.plus.yearly` ($99.99/year, 7-day trial). iOS through
  RevenueCat (`react-native-purchases`, entitlement `plus`, offering
  `default`); web through Stripe Checkout and the Customer Portal (prices by
  lookup key `cadence_plus_monthly` / `cadence_plus_yearly`; the yearly session
  sets `subscription_data.trial_period_days = 7` only for a customer who never
  had a trial; product `metadata.app = cadence`; portal return URL `/account`).
- The truth is server-side: each verified webhook writes its own source at
  `users/{uid}.plusSources.<stripe|app_store>` (a `PlusRecord`:
  `{active, source, productId, expiresAt, willRenew, updatedAt}`) and, in the
  same transaction, `users/{uid}.plus = resolvePlus(plusSources, now)`. Plus
  if either source is active and its period has not ended.
- Clients never write entitlement. They read `plus` from `GET /api/me` and,
  on iOS, use RevenueCat's customer info only to update the UI immediately
  after a purchase; the server stays authoritative.
- After sign-in the iOS app calls `Purchases.logIn(uid)` (and `logOut` on
  sign-out), so `app_user_id` is the Firebase uid.
- Connecting your own Cadence is free forever and open source. In the iOS app
  it is "Connect your own Cadence server", never presented as a way around
  paying. No promo or friend codes anywhere in the native apps.

---

## 5. Firestore data model

All access is through the Admin SDK on the server; `firestore.rules` denies
every client (section 14). Documents are sized so a session costs a handful of
reads.

| Path | Who | Contents | Reads |
| --- | --- | --- | --- |
| `users/{uid}` | all | profile (existing fields), `plus`, `plusSources`, `stripeCustomerId`, `rcAppUserId`, `detailPurgeAt?` | 1 per session |
| `users/{uid}/progress/summary` | all signed in | `ProgressSummary` (`progress-model.ts`): streak, minutes, lessons per level, placement level, last active, 20 most recent results; under 8 KB | 1 per session |
| `users/{uid}/inbox/flashcards` | all signed in | cards added through MCP, waiting for a device (at most 200; deleted once delivered) | 1 per open, usually missing |
| `users/{uid}/srs/{packId}` | Plus | `cards: {cardId: CardState & {updatedAt}}`, one document per pack (about 70 bytes a card, well under 1 MiB) | 1 per pack in use |
| `users/{uid}/mastery/sounds` | Plus | `{soundId: {attempts, ema, best, lastAt, history: [{day, score}] (30 days)}}` | 1 when needed |
| `users/{uid}/mastery/grammar` | Plus | `{gpId: {attempts, correct, ema, lastAt}}` | 1 when needed |
| `users/{uid}/attempts/{YYYY-MM-DD}` | Plus | `items: Attempt[]` appended with `arrayUnion` (overflow to `{day}-2` past 500) | history views only |
| `users/{uid}/coachSessions/{id}` | Plus | scenario, started/ended, turn count, running summary, transcript | history views only |
| `users/{uid}/devices/{installId}` | all signed in | platform, `push` (`{token, timeZone, updatedAt}`, the Expo push token, any tier); with Plus also `lastSyncAt`, `importedAt` | on sync and app open |
| `usage/{uid}/days/{YYYY-MM-DD}` | cloud AI users | `DailyUsage` counters, `expireAt` (+35 days, TTL) | 1 per AI request (in the quota transaction) |
| `system/aiBudget/days/{YYYY-MM-DD}` | server | global estimated spend and request counts, `tripped` | cached 30 s per instance |
| `webhookEvents/{source}:{eventId}` | server | type, uid, received at, `expireAt` (+30 days, TTL) | 1 per webhook |
| `mailQueue/{key}` | server | template, recipient uid, data, status; `key` makes it exactly-once | written by events |
| `oauthClients`, `oauthCodes`, `oauthTokens`, `oauthGrants` | MCP | as the portfolio's `lib/oauth`; tokens as SHA-256 digests | per MCP call |
| `rateLimits/{key}` | server | fixed-window counters with `expireAt` (TTL) | per limited call |
| `deletions/{uid}` | server | account deletion steps done, retried by the daily job; no address once finished | on deletion |

`users/{uid}` also holds `emailPrefs` (`reminders`, `newsletter`; reminders are
off until the learner turns them on with `PATCH /api/me`), `security` (last
sign-in email, `tokensValidAfter`, hashed device labels, for the sign-in
notices) and, while the web pages still read it, the older `billing` map,
which the Stripe webhook keeps current.

Notes:

- `usage/{uid}/{day}` from the brief is stored as `usage/{uid}/days/{day}`,
  because Firestore paths alternate collection and document.
- The existing pronunciation collections (`moduleProgress`, `lessonSessions`,
  `lessonAttempts`, `conversationProgress`) become Plus detail. A free account
  writes only the summary; its module progress stays on the device. **Open:**
  the routes that write them (`/api/attempts`, `/api/sessions`, `/api/progress`,
  `/api/conversation-progress`) still write for every cloud account, because
  the web pages read module unlocks from them through `src/lib/learn-data.ts`.
  Gating them needs those reads moved to the device first; the daily job
  already purges them with the rest of the Plus detail after a lapse.
- TTL policies on `expireAt` for `usage`, `webhookEvents`, `rateLimits` and
  `mailQueue`, and on `expiresAt` for `oauthCodes` and `oauthTokens`, are set by
  the owner with `deploy/cloudrun.sh ttl` (docs/DEPLOY.md).

### 5.1 Sync API

All under App Check (section 14) and the Firebase ID token.

| Route | Tier | Does |
| --- | --- | --- |
| `GET /api/me` | all | profile, `plus`, data tier, today's quota left (`src/lib/server/me.ts`; usage and the breaker are read only for Plus on the hosted cloud) |
| `POST /api/sync/summary` | summary, full | `{activities: Activity[]}` (at most 50) applied with `applyActivity` in one transaction, with the per-minute rate limit kept on the same document (`syncSummary`); returns the summary |
| `GET /api/sync/inbox` | all | pending MCP flashcards; `DELETE` acknowledges them |
| `POST /api/sync/push` | full | `{installId, srs?, attempts?, mastery?, coach?}`; cards merge last-writer-wins by `updatedAt`; rate limited on the device document (a new install also against the account) |
| `GET /api/sync/pull?since=` | full | changes since a cursor |
| `POST /api/sync/import` | full | the one-time upload on upgrade |

Session cost targets: free 2 reads and 1 write; Plus at most 10 reads and 5
writes. A session is one open (`GET /api/me`) and one synced round, plus the
detail push and pull for Plus; the inbox check is its own read per open.
`tests/server/emulator/session-cost.test.ts` counts them: free 2 reads and
1 write; Plus 13 reads (14 when the breaker cache is cold) and 5 writes.
**Open:** the Plus pull costs 5 reads on its own (the user document and one
query per detail collection, each billed at least one read). Returning the
pull with the push, or skipping it when a `detailChangedAt` on the summary
says nothing changed elsewhere, brings Plus under 10; both need the app.

Other server routes (code in `src/lib/server/`): `PATCH /api/me`
`{reminders}`; `POST /api/auth/password-reset` `{email}`,
`/api/auth/verify-email`, `/api/auth/password-changed` `{email}`,
`/api/auth/sign-in-failed` `{email}` (the sign-in forms report failures; ten
in an hour sends one `suspicious-activity` a day); `GET /api/account/export`,
`DELETE /api/account`, `POST /api/account/email` `{newEmail}`,
`GET`/`DELETE /api/account/connections` (MCP grants); `POST /api/newsletter`
`{email, consent}` or `{subscribed}`; `GET`/`POST /api/email/unsubscribe`;
`POST /api/ai/grammar-feedback`, `POST /api/ai/placement`. `PUT /api/devices`
`{installId, expoPushToken, platform, timeZone}` and `DELETE /api/devices?installId=`
keep a phone's push token (free and Plus); `POST /api/jobs/push` (job secret,
`{uids, title, body, url}`) is the stub future campaigns send through
(`src/lib/server/push.ts`). The daily purge clears `devices` after a Plus lapse;
the app registers its token again on the next open. Errors are
`{error, message}` with a code the apps switch on.

---

## 6. Engine routing

`routeRequest` in `engine-routing.ts` decides where each AI request runs. The
phone and web call it before every AI action; the server enforces the same
rules again (it never trusts the client's decision).

```
if paired Cadence is reachable and reports the capability   -> local
note = paired ? (reachable ? missing capability : unreachable) : none
if this build has no cloud API                               -> blocked cloud_unavailable  [own server]
if not signed in                                             -> blocked needs_sign_in     [own server, sign in]
if not Plus                                                  -> blocked needs_plus        [own server, Plus]
if the global circuit breaker is open                        -> blocked cloud_paused      [own server, retry later]
if today's quota for this capability is used up              -> blocked daily_limit       [own server]
otherwise                                                    -> cloud (with note)
```

`[own server]` is `connect_own_server`, or `reconnect_own_server` when one is
already paired. Capabilities: `score`, `tts`, `transcribe`, `coach`,
`grammar_feedback`, `placement`. Non-AI practice never routes.

Copy (short, ours): daily limit is "Daily limit reached. Connect your own
Cadence for unlimited practice." Needs Plus offers both choices side by side.

**Two transports on the phone.** Today `mobile/src/api/transport.ts` picks one
place for every call. It becomes two: the *AI transport* (paired server or
cloud, per `routeRequest`) and the *account transport* (the cloud API when
signed in, the paired server otherwise). A phone can be paired at home and
signed in at once: AI runs at home, progress follows the account.

### 6.1 Engine interface (server)

`src/lib/server/engines/` defines one interface per capability and
picks a provider by environment variable, so a provider is swapped by config:

| Interface | Providers | Env (default in cloud / own server) |
| --- | --- | --- |
| `SpeechScorer.score(audio, target)` | `local` (ai-engine), `cloud-run` (cadence-ai) | `ENGINE_SCORER` = `cloud-run` / `local` |
| `Transcriber.transcribe(audio)` | `local` (Whisper), `gemini`, `whisper-cpu` (cadence-ai) | `ENGINE_TRANSCRIBER` = by benchmark / `local` |
| `Synthesizer.speak(text, voice)` | `local` (OmniVoice), `google-tts` (+ GCS cache) | `ENGINE_TTS` = `google-tts` / `local` |
| `CoachModel.turn(session, input)` | `local` (Qwen), `gemini` | `ENGINE_COACH` = `gemini` / `local` |
| `GrammarAnalyzer.check(transcript, candidates)` | `local` (Qwen), `gemini` | `ENGINE_GRAMMAR` = `gemini` / `local` |

The local engines (Whisper, OmniVoice, Qwen) are unchanged for own-server mode.

### 6.2 Cloud cost architecture

No GPU anywhere in the cloud.

- **Coach turns:** Gemini 2.5 Flash-Lite through Vertex AI (service account,
  no key in the environment). Fixed system prompt per scenario, cached
  (implicit caching, explicit cache when the prompt exceeds the minimum);
  history trimmed to the last 12 turns plus a running summary; at most about
  250 output tokens.
- **Spoken grammar feedback and placement analysis:** Gemini 2.5 Flash, same
  guards, JSON output validated against a schema.
- **Transcription:** Gemini audio input or Whisper-small on CPU, whichever
  wins `scripts/bench/transcribe.mjs` (accuracy first, then latency and cost)
  on an openly licensed English test set. Results go in the table below.
- **Pronunciation scoring:** the existing phoneme model on Cloud Run CPU
  (`cadence-ai`, section 12), model baked into the image.
- **TTS:** Google Cloud Text-to-Speech (one Neural2 or Chirp voice per accent),
  results cached in Cloud Storage by `sha256(voice|rate|text)`. Lesson and
  flashcard audio is pre-generated in the packs, so request-time TTS is rare.
- **Explanations and examples** are generated offline (section 3.4), never per
  request.

**Transcription benchmark.** Not run yet. Owner runs
`node scripts/bench/transcribe.mjs` (it calls a paid API) and records:

| Engine | Clips | WER | p50 latency | p95 latency | Cost per audio minute |
| --- | --- | --- | --- | --- | --- |
| Gemini 2.5 Flash-Lite (audio) | pending | | | | |
| Whisper-small, cadence-ai CPU | pending | | | | |

### 6.3 Quotas and the circuit breaker

- Per user per day, Plus (`PLUS_DAILY_LIMITS`): 30 minutes of audio
  (scoring, transcription, analysis), 20,000 TTS characters, 120 coach turns
  (coach, spoken grammar, placement). Free accounts get no cloud AI.
- The server charges `usageCost(capability, request)` against
  `usage/{uid}/days/{day}` in a transaction before calling the provider and
  refuses with `429 {error: "daily_limit"}` when `checkQuota` says no.
- Global: each instance adds its estimated cost to `system/aiBudget/days/{day}`;
  when the day's total passes `AI_DAILY_BUDGET_USD` it sets `tripped` and every
  cloud AI route answers `503 {error: "cloud_paused"}` until midnight UTC.

---

## 7. AI features

All five run through routing (local engines or cloud), so free users with their
own Cadence get them too.

- **Placement test.** About 20 mixed items (multiple choice and gap fill)
  climbing a staircase from A2 to C1, plus one 30-second spoken answer to a
  prompt. Written score gives a level band; the spoken sample (transcribed and
  analysed for range and accuracy) moves it by at most one level. Without AI it
  returns the written estimate and says so. Output `{level, confidence,
  strengths[], focus[]}`; stored as `placementLevel` in the summary.
- **Adaptive daily plan.** `daily-plan.ts` (shared, pure): from due flashcards,
  the weakest sounds (mastery EMA times frequency weight) and the weakest
  grammar points, pick 10-15 minutes: due cards first (at most 5 minutes), then
  one or two sounds, one grammar item, then shadowing or a coach scenario if AI
  is available. Same function on the device (free, local data) and with synced
  data (Plus).
- **Spoken grammar feedback.** After transcription, the analyzer gets the
  transcript and a candidate list of grammar point ids for the learner's level,
  and returns `{issues: [{quote, corrected, grammarPointId, note}]}`. The server
  drops any id not in the packs and any issue whose quote is not in the
  transcript. The app links each issue to its grammar point.
- **Shadowing.** A model sentence with TTS reference audio (pre-generated);
  the learner records over it; scoring compares phonemes and, where the engine
  supports it, stress and pitch contour, shown as a simple arrow line over the
  words.
- **Coach scenarios.** Job interview, small talk, meeting, travel, presentation,
  as `scenario.*` records with role cards (who the coach plays, the learner's
  goal, useful phrases). The coach stays in role and ends with three short
  pointers.

---

## 8. MCP connector

`https://cadence.pstepanov.dev/api/mcp`, modelled on the portfolio
(`lib/oauth`, `app/api/mcp`, `lib/mcp`) and Heft.

- Streamable HTTP, stateless, JSON responses (Cloud Run has no instance
  affinity; nothing lives in memory between requests). `GET` and `DELETE`
  answer 405 after authentication.
- OAuth 2.1: the app is its own authorization server. Dynamic client
  registration is open; no token is minted without the learner signing in to
  Cadence on the consent screen (`/oauth/authorize`, a web page backed by
  `GET`/`POST /api/oauth/authorize`: GET describes the request with the
  learner's ID token as Bearer; POST takes `{...params, decision, scope,
  id_token}` as JSON and answers `{redirect}`). PKCE S256 required.
  Tokens are opaque, stored as SHA-256 digests, audience-bound to
  `https://cadence.pstepanov.dev/api/mcp`, refresh tokens rotate with reuse
  detection, grants end after 180 days. Known product names must redirect to
  their own domains (the portfolio's `client-identity.ts` rules).
- Discovery: `/.well-known/oauth-protected-resource/api/mcp` and
  `/.well-known/oauth-authorization-server` (rewrites, as in the portfolio).
  An unauthenticated call gets `401` with
  `WWW-Authenticate: Bearer resource_metadata="https://cadence.pstepanov.dev/.well-known/oauth-protected-resource/api/mcp"`.
- Scopes: `cadence:read` (always), `cadence:write` (adds and logs). Plus is
  checked per call from `users/{uid}.plus`, not from the scope; a Plus tool
  called by a free account returns a tool error "This needs Cadence Plus".
- Rate limits per uid (fixed windows in `rateLimits`): free 30 calls per hour
  and 200 per day, Plus 120 per hour and 2,000 per day. Over the limit:
  JSON-RPC error with `retryAfterSeconds`.

| Tool | Tier | Input | Output |
| --- | --- | --- | --- |
| `get_progress_overview` | free | `{}` | `{plan, streak: {current, best}, totalMinutes, lessonsCompleted: {A1..C2}, placementLevel, lastActiveAt, recent: RecentResult[]}` |
| `get_streak` | free | `{}` | `{current, best, lastDay, activeToday}` |
| `lookup_grammar` | free | `{query (1-100 chars), level?}` | `{matches: [{id, title, level, summary, patterns, examples (3), commonErrors (2), url}]}` from the packs |
| `add_flashcards` | free, write | `{cards: [{front, back, example?}] (1-20)}` | `{queued, note}`; free: inbox, delivered on the next app open; Plus: straight into SRS |
| `start_quiz` | free | `{grammarPointId?, topic?, level?, count (3-10)}` | `{quizId, questions: [{n, kind, prompt, question?, options?, left?, text?, tokens?}]}` (`left` and `options` are matching's two columns) without answers; `quizId` is an HMAC-signed token of the exercise ids and expiry (stateless) |
| `grade_quiz` | free | `{quizId, answers: [{n, answer: ExerciseAnswer}]}` | `{score, results: [{n, correct, expected, explanation, grammarPointId}]}`; adds a `quiz` result to the summary |
| `log_practice` | free, write | `{kind, minutes (1-180), refId?, score?}` | the updated summary |
| `get_weak_areas` | Plus | `{limit? (1-20)}` | `{sounds: [{soundId, ipa, score, attempts, trend}], grammar: [{grammarPointId, title, accuracy, attempts}]}` |
| `get_due_flashcards` | Plus | `{limit? (1-50)}` | `{dueToday, overdue, cards: [{cardId, front, back, due, interval}]}` across devices |
| `get_practice_history` | Plus | `{from?, to?, kind?, limit (1-100), cursor?}` | `{items: Attempt[], nextCursor}` |
| `get_quiz_history` | Plus | `{limit (1-50), cursor?}` | `{quizzes: [{at, score, grammarPointIds}], nextCursor}` |

**Open:** the brief lists the free tools as overview, streak, grammar lookup
and add flashcards. `start_quiz`, `grade_quiz` and `log_practice` are free here
because they touch only content and the summary; the owner may move them to
Plus.

---

## 9. Billing webhooks

Both endpoints read the raw body, verify before parsing anything else, and are
idempotent: the first step is `create()` of `webhookEvents/{source}:{eventId}`
in the same transaction as the state change; an existing document means a
replay, answered `200 {duplicate: true}` with no change. Each one writes
`plusSources.<source>` and recomputes `plus` with `resolvePlus` in that
transaction. Emails go to `mailQueue/{source}:{eventId}:{template}`, so each
event queues each email at most once.

### 9.1 Stripe

`POST https://cadence.pstepanov.dev/api/webhooks/stripe`

- Verify with `stripe.webhooks.constructEvent(rawBody, stripe-signature,
  STRIPE_WEBHOOK_SECRET)`; failure is `400`.
- The Stripe account is shared: ignore (with `200`) anything whose product
  lacks `metadata.app = cadence`.
- The uid comes from Checkout `client_reference_id` and
  `subscription.metadata.firebase_uid` (both set at session creation).
- Events arrive out of order, so the handler re-reads the subscription from
  Stripe; when it cannot (no key, as in the replay harness, or a deleted
  object) it uses the event's copy dated by the event, and an older copy never
  overwrites a newer one (`eventAt` on each source's record).
- Code: `src/lib/server/billing/stripe-webhook.ts` (handler),
  `stripe-map.ts` (pure mapping), `checkout.ts` (`POST /api/billing/checkout`
  `{interval}` and `POST /api/billing/portal`, both answering `{url}`).

| Event | Effect | Email |
| --- | --- | --- |
| `checkout.session.completed` | store `stripeCustomerId`; write the subscription's record | `plus-welcome` (or `trial-started`) |
| `customer.subscription.created` | write record | none (welcome comes from checkout) |
| `customer.subscription.updated` | write record (`active` for `active`, `trialing`, `past_due`; `expiresAt` = current period end; `willRenew` = not `cancel_at_period_end`; `productId` from the price lookup key) | `plus-canceled` when `willRenew` turns false |
| `customer.subscription.deleted` | `active: false` | `plus-ended` |
| `customer.subscription.updated` (product changed) | as above | `plan-changed` |
| `invoice.payment_failed` | no state change (Stripe moves the status) | `billing-issue` (link to the Customer Portal through `/account`) |
| `invoice.paid` (amount above zero) | none | `payment-receipt` with Stripe's hosted invoice link |
| `charge.refunded` | none (a refund that ends Plus arrives as `customer.subscription.deleted`) | `refund-issued` |

The old `src/app/api/stripe/webhook` route is gone; the owner points the
Stripe endpoint at the new URL (docs/DEPLOY.md lists the events). The handler
still keeps the older `users/{uid}.billing` map current for pages that read it.

### 9.2 RevenueCat

`POST https://cadence.pstepanov.dev/api/webhooks/revenuecat`

- `Authorization: Bearer <REVENUECAT_WEBHOOK_SECRET>`, compared in constant
  time; anything else is `401`.
- Only events whose `entitlement_ids` include `plus` change state. An
  `app_user_id` that is not a Firebase uid (an anonymous `$RCAnonymousID`) is
  logged and answered `200`; the app must call `Purchases.logIn(uid)`.
- Sandbox events (TestFlight, App Review) are accepted and marked
  `sandbox: true`; App Review must be able to unlock Plus.

| Event | Effect | Email |
| --- | --- | --- |
| `INITIAL_PURCHASE` | active, `expiresAt` = `expiration_at_ms`, `willRenew` true | `plus-welcome` or `trial-started` (`period_type` `TRIAL`) |
| `RENEWAL` | active, new `expiresAt` | none |
| `CANCELLATION` | `willRenew` false; stays active until `expiresAt` (a refund, `cancel_reason` `CUSTOMER_SUPPORT`, ends it now) | `plus-canceled`, or `refund-issued` for a refund |
| `UNCANCELLATION` | `willRenew` true | none |
| `EXPIRATION` | `active` false | `plus-ended` (none while Stripe still keeps Plus on) |
| `BILLING_ISSUE` | stays active until the grace period ends | `billing-issue` |
| `PRODUCT_CHANGE` | `productId` = `new_product_id` when present | `plan-changed` |
| `TRANSFER` | re-read both uids from `GET /v1/subscribers/{uid}` and rewrite their `app_store` records | none |
| `SUBSCRIPTION_PAUSED` | `willRenew` false, active until `expiresAt` | none |
| `TEST` | recorded, no change | none |

### 9.3 Local harness

`scripts/webhooks/` (server builder), offline by default:

- `node scripts/webhooks/replay-stripe.mjs --url http://localhost:3000/api/webhooks/stripe [--twice]`
  signs the JSON fixtures in `scripts/webhooks/fixtures/stripe/` with
  `STRIPE_WEBHOOK_SECRET` (`stripe.webhooks.generateTestHeaderString`, no
  network) and posts them; `--twice` checks idempotency.
- `node scripts/webhooks/replay-revenuecat.mjs --url http://localhost:3000/api/webhooks/revenuecat [--event BILLING_ISSUE] [--twice]`
  posts RevenueCat sample payloads from `fixtures/revenuecat/` with the bearer
  secret.
- Against Stripe test mode (owner only; it creates test objects):
  `stripe listen --forward-to localhost:3000/api/webhooks/stripe`, then
  `stripe trigger checkout.session.completed`,
  `stripe trigger customer.subscription.updated`,
  `stripe trigger invoice.payment_failed`.

---

## 10. Email

Email through Brevo from `Cadence <hello@cadence.pstepanov.dev>`, replies to
`support@cadence.pstepanov.dev`. Everything event-driven is queued at
`mailQueue/{key}` (often in the transaction that caused it), delivered by the
route's `after()` hook and retried by the five-minute job; the key makes each
message exactly-once. Password reset and verification links are credentials,
so those two are sent directly and never stored.

Code in `src/lib/server/email/`: `layout.ts` (frame and pieces),
`templates/` (pure functions with typed props, and a fixture each in
`templates/index.ts`), `brevo.ts` (send, contacts, double opt-in),
`queue.ts`, `unsubscribe.ts`, `senders.ts`.

Templates: account (`welcome`, `verify-email`, `password-reset`,
`password-changed`, `email-changed` to the old and the new address,
`new-sign-in`, `deletion-scheduled`, `account-deleted`, `data-export-ready`),
billing (`plus-welcome`, `trial-started`, `trial-ending` for web trials only,
`payment-receipt`, `billing-issue`, `plus-canceled`, `plus-ended`,
`plan-changed`, `refund-issued`), security (`mcp-authorized`, `device-paired`,
`suspicious-activity`) and opt-in (`streak-at-risk`, `weekly-summary`,
`badge-earned`, `inactive-nudge`, `newsletter-confirm`, `newsletter-welcome`).

Design: tables, at most 560 px, the hosted 2x logo PNG with alt text, one
accent (hunter green, yellow-green in dark mode), Funnel Display through one
Google Fonts link with a system stack behind it, and a single `<style>` block
for the dark palette and phone padding; every other style is inline, so
Gmail (which drops both) still gets the light design. Every email has a
plain-text part; only opt-in mail has an unsubscribe link (and
`List-Unsubscribe` one-click headers).

Firebase's own emails are never used: the server generates the one-time
codes with the Admin SDK and puts them on `/reset-password` and
`/verify-email`; docs/DEPLOY.md has the console setting.

Newsletter: list 5, Brevo double opt-in only (`POST /api/newsletter`); list 4
holds every account for account email and is never used for marketing.
`BREVO_API_URL` points every Brevo call at a local stub for end-to-end tests;
only a loopback `http` address is accepted.

---

## 11. Account deletion and export

`/account` offers **Download my data** (`GET /api/account/export`, JSON of the
user document and every subcollection, the summary and usage) before **Delete
account**. Deletion (`DELETE /api/account`, recent sign-in required), each step
idempotent and retried by the daily job if it fails:

1. RevenueCat `DELETE /v1/subscribers/{uid}`.
2. Stripe: cancel any live subscription now, clear `metadata.firebase_uid`
   and drop our link to the customer; the customer and invoices stay (tax).
3. Brevo: delete the contact.
4. Firestore: `recursiveDelete(users/{uid})`, `usage/{uid}`, the uid's OAuth
   grants and tokens, its rate-limit keys.
5. Firebase Auth `deleteUser`. Queue `account-deleted` to the address first.

---

## 12. Cloud Run topology

Region `us-central1`. `deploy/cloudrun.sh` deploys and docs/DEPLOY.md is
the runbook; the owner runs them, nothing else does.

```
cadence.pstepanov.dev ── Firebase Hosting (CDN)
   ├── /packs/**, /_next/static/**   static, immutable
   └── everything else  ──rewrite──▶ cadence-web  (Cloud Run, public)
                                        │  Google ID token, Direct VPC egress
                                        ▼
                                     cadence-ai   (Cloud Run, internal ingress, IAM only)
cadence-web ──▶ Vertex AI (Gemini), Cloud TTS (+ GCS cache), Firestore, Brevo, Stripe, RevenueCat
Cloud Scheduler ──▶ cadence-web /api/jobs/daily (17:00 UTC), /api/jobs/mail (every 5 min)
```

| Service | Image | Settings |
| --- | --- | --- |
| `cadence-web` | Next.js standalone (`Dockerfile`): web, API, sync, MCP, webhooks | `--allow-unauthenticated --min-instances 0 --max-instances 10 --concurrency 80 --cpu 1 --memory 1Gi --cpu-boost --timeout 60`; service account `cadence-web` with Firestore user, `run.invoker` on `cadence-ai`, Vertex AI user, TTS, the TTS cache bucket, and its own secrets only |
| `cadence-ai` | `src/backend/ai-engine/Dockerfile.cloud` (CPU PyTorch, phoneme model at its pinned safetensors revision and Whisper-small baked in, PyTorch weights only, offline at runtime; `--build-arg ASR_MODEL=` leaves Whisper out) | `--no-allow-unauthenticated --ingress internal --min-instances 0 --max-instances 3 --concurrency 4 --cpu 2 --memory 4Gi --cpu-boost --timeout 60`; no secrets; private until launch |
| jobs | routes on `cadence-web`, called by Cloud Scheduler with `Authorization: Bearer <JOBS_SECRET>` | daily: purge lapsed detail after 90 days, retry deletions, drop uncollected inboxes after 90 days, `trial-ending`, opt-in reminders; every 5 minutes: deliver queued mail |

- **Service to service.** `cadence-web` fetches a Google ID token for the
  `cadence-ai` URL from the metadata server and sends it as a Bearer token.
  Internal ingress only admits traffic from the VPC, so `cadence-web` uses
  Direct VPC egress (`--network default --subnet default --vpc-egress
  all-traffic`) with Cloud NAT for its internet calls.
- **Cold starts.** Both scale to zero. `cadence-web` starts in under 1 s
  locally (1 vCPU); it never loads models. `cadence-ai` answers in under 2 s
  and has both models loaded from local disk in about 3.5 s locally (2 vCPU); the apps show "Warming up" after 3 s. **Open:** the engine's
  `/health` answers 200 while still warming, so Cloud Run's default TCP
  startup probe is used; a `/healthz` that answers 503 until the scorer is
  loaded (ai-engine owner) would let a startup probe hold requests back.
  `cadence-web`'s `/api/health` is `{ok, service}` there; on your own
  Cadence it adds `engines: {ai, coach}` (`reachable`, `ready`), probing each
  engine's `/health` with a 1.5 s timeout. The status probes `GET
  /api/assess` and `GET /api/ai-coach` answer 200 with `ready: false` when
  an engine is down, so polling never logs an error.
- **Secrets** (Secret Manager, mounted as env): `STRIPE_SECRET_KEY`,
  `STRIPE_WEBHOOK_SECRET`, `REVENUECAT_WEBHOOK_SECRET`, `REVENUECAT_API_KEY`,
  `BREVO_API_KEY`, `QUIZ_TOKEN_SECRET`, `EMAIL_UNSUBSCRIBE_SECRET`,
  `JOBS_SECRET`. Settings in `deploy/cadence-web.env.example`.
  The repo never holds a secret.

---

## 13. Mouth map (articulation visuals)

The speech equivalent of Heft's muscle map: a side view of the mouth for every
English phoneme, a front view of the lips, highlighted articulators, animation
between sounds and a compare view. Free for everyone in every mode (static
content, no AI).

### 13.1 Model

`src/lib/platform/vocal-tract/` (and the mobile twin) is a TypeScript port of
the VocalTract LaTeX package by Dimitrios Ververidis (Ververidis, Schneider and
Koehler, "The vocal tract LaTeX package", *The PracTeX Journal* 2012/1),
built on Maeda's articulatory model. Credits and licence in `NOTICE` and
`CREDITS.md`.

| File | Contents |
| --- | --- |
| `maeda.ts` | the loading table, `computeVocalTract(params)` for the 28 movable points and the glottis |
| `geometry.ts` | static anatomy, `buildShape(state)` with fills (`head`, `laryngealWall`, `lowerTract`, `palate`, `tongue`, `upperTeeth`, `lowerTeeth`) and layers (`lips`, `teeth`, `alveolarRidge`, `hardPalate`, `velum`, `tongueTip`, `tongueBlade`, `tongueBody`, `tongueRoot`, `jaw`, `glottis`, `pharynx`, `nasalCavity`, `face`); `placeAnchor`; `frontLips`; `HEAD_VIEW_BOX` |
| `svg-path.ts` | `createViewport`, `subpathToSvg`: the same path strings for SVG and react-native-svg |
| `animate.ts` | `lerpParams`, `easeInOut`, `paramsAt` (diphthong trajectories), `glottisPulse` |
| `fit.ts` | `fitParams(targets)`: box-constrained least squares (every point is linear in the parameters) for the content pipeline |
| `codebook.ts` | the package's 26 German demo vectors, the test reference |
| `articulation.ts` | `ENGLISH_SOUNDS` (24 consonants, GA and RP vowels and diphthongs, ARPAbet ids), `ArticulationTarget`, `validateArticulationTarget` |

Parameters: `jaw`, `tonguePosition`, `tongueShape`, `tongueApex`,
`lipAperture`, `lipProtrusion`, `larynxHeight` (Maeda's seven) plus the
package's `glottalAperture`, `glottalFrequency` (voiced when above -1) and
`velum`. Each runs from -3 to 3.

Animation is parameter interpolation: compute the shape for interpolated
parameters each frame and redraw (a Reanimated shared value drives `t` on the
phone; at about 40 points this is well within a 60 fps frame budget).

### 13.2 English targets

`content/articulation/*.json` (content builder): `{format: 1, targets:
ArticulationTarget[]}` covering every `ENGLISH_SOUNDS` entry, GA and RP
where they differ, diphthongs and affricates as trajectories.

- Fit with `fitParams` to the CC0 "IPA … Sagittal Section.svg" drawings by
  Richard Wright and Dan McCloy on Wikimedia Commons (CC0 confirmed per file
  through the Commons API; URLs listed in `CREDITS.md`), traced into the
  package's coordinates; and to published Maeda-parameter values where they
  exist (cited in `source.references`).
- What the model cannot show (tongue-tip contact, lateral airflow, lip rounding
  from the front, the bunched or retroflex r) is an overlay (`OverlayId`).
- Anything hand-tuned is `source.method: "hand-tuned"`, `needsReview: true`,
  and listed in the content builder's report.
- Not used: Seeing Speech or STAR material (CC BY-NC-ND, no adaptation).

### 13.3 Component and learning logic

- One component per platform: web SVG (`src/components/mouth-map/`), mobile
  react-native-svg plus Reanimated (`mobile/src/components/mouth-map/`). Soft
  fills and clear outlines in the Cadence palette, light and dark. Highlights
  active layers like Heft's muscle map, pulses the glottis for voiced sounds,
  shows an airflow arrow from `placeAnchor`, a front lip view, and a compare
  view for minimal pairs (ship/sheep, light/right, think/sink). Every layer has
  an accessibility label.
- Every pronunciation result links to it: tap a weak sound, see where the
  tongue goes, play the model sound, record again.
- Sound-by-sound diagnosis from the phoneme scores builds a personal
  "sounds to fix" list ordered by `error rate × frequency in English` (phoneme
  frequency from our own count over the Tatoeba English sentences with an
  openly licensed pronouncing dictionary, credited when added).
- Drills climb isolated sound, syllable, word, minimal pair, phrase, sentence;
  a step is passed at three takes in a row at 80 or above. Then shadowing,
  stress and intonation drills, and spaced review of fixed sounds at 1, 3, 7
  and 21 days. Progress per sound over time comes from `mastery/sounds` (Plus)
  or the device.
- Our own words and design throughout. No other product's name, logo, copy,
  lessons, videos, coach persona or screenshots; the website makes factual
  comparisons only, if any.

---

## 14. Security

- **App Check** on every cloud AI, sync and newsletter route: App Attest on iOS
  (`@react-native-firebase/app-check` in the dev-client build; Expo Go uses the
  debug provider), reCAPTCHA Enterprise on the web, the debug provider in
  development. The server verifies `X-Firebase-AppCheck` with the Admin SDK,
  with replay protection on sign-up and newsletter. MCP uses OAuth instead.
- **Rules.** `firestore.rules` and `storage.rules` deny every client; only the
  Admin SDK on the server reads or writes.
- **Web headers** (`next.config.ts`): a CSP with nonces for scripts,
  `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`,
  `frame-ancestors 'none'` (and `X-Frame-Options: DENY`),
  `Referrer-Policy: strict-origin-when-cross-origin`,
  `X-Content-Type-Options: nosniff`, a minimal `Permissions-Policy`
  (microphone on self only).
- **Auth endpoints** (`/api/auth/*`, password reset, sign-up) are rate limited
  per IP and per account (`rateLimits`).
- **Audio:** at most `AUDIO_MAX_SECONDS` (30) and `AUDIO_MAX_BYTES` (2 MB);
  the container is sniffed (`sniffAudio`), not taken from the declared type;
  processed in memory and never stored by default.
- **Coach prompt injection:** fixed system prompt per scenario; learner text is
  passed as quoted data in its own message, never spliced into instructions;
  the model has no tools; output capped (about 250 tokens) and stripped of
  links and markup; spoken grammar output must validate against its schema.
- **Service to service:** `cadence-ai` accepts only Google ID tokens for
  `cadence-web`'s service account, from the VPC.
- **CI** (`.github/workflows/ci.yml`): typecheck, lint, tests, build for web
  and mobile; `pnpm audit --prod --audit-level high`, `npm audit --omit=dev
  --audit-level=high` in `mobile/` and `desktop/`, `pip-audit -r
  src/backend/ai-engine/requirements.txt -r src/backend/coach-engine/requirements.txt`;
  secret scanning with gitleaks; `.github/dependabot.yml` for npm (root,
  `mobile`, `desktop`), pip (both engines), GitHub Actions and Docker.

---

## 15. Missing basics

Dark mode on web and mobile (tokens already mirror `globals.css`); offline
content packs (section 3.3); accessibility labels on every control, image and
mouth-map layer; a progress share card (an image rendered from the stats
screen, no personal data beyond streak and totals); empty states that name the
next step ("No cards due. Start today's plan").

---

### 15.1 Web pages and the routes they call

The web UI (`src/app`, `src/components`, `src/hooks`) calls the server only
through `cloudFetch` (`src/hooks/cloud-fetch.ts`), which adds the App Check
token (`X-Firebase-AppCheck`, limited-use for sign-up flows and the newsletter)
and, when signed in, the Firebase ID token.

| Page | Calls |
| --- | --- |
| `/forgot-password` | `POST /api/auth/password-reset {email}`; same answer whether or not the account exists; 60 s browser cooldown; Firebase's own email if the route is missing |
| `/reset-password` | Firebase `confirmPasswordReset` (revokes every session), then `POST /api/auth/password-changed {email}`, then signs this device in; passes `verifyEmail`, `verifyAndChangeEmail` and `recoverEmail` links on to `/verify-email` |
| `/verify-email` | `applyActionCode` for the link; resend is `POST /api/auth/verify-email` |
| `/newsletter`, footer, sign-up box, `/account` switch | `POST /api/newsletter {email, source, consent: true, platform}` (Brevo double opt-in, list 5); Brevo's confirmation lands on `/api/newsletter/confirmed`, which redirects to `/newsletter/confirmed`; the account switch turns it off with `DELETE /api/newsletter` (**Open**: not built yet; the page points to the unsubscribe link meanwhile) |
| `/pricing`, `/checkout?plan=`, `/account` | `POST /api/billing/checkout {interval}` and `POST /api/billing/portal`, both `{url}`; Plus status from `GET /api/me` |
| `/account` | `GET /api/account/export`; `DELETE /api/account` after re-entering the password |
| `/practice/*`, `/grammar/*` | packs from `/packs` (built-in starter pack per level until they exist); each round is `POST /api/sync/summary {activities}` when signed in |
| AI calls (assess, transcribe, coach, voices) | `{ai: true}`: a refusal (`needs_plus`, `daily_limit`, …) opens one banner offering "Connect your own Cadence" and Plus |

`/sounds`, `/sounds/<soundId>` and `/sounds/compare` read
`content/articulation/*.json` on the server (falling back to
`src/components/mouth-map/fixture-targets.json`); every pronunciation result
links each sound to its page with a "Record again" link back, and records the
scores on the device for "sounds to fix" (`src/components/mouth-map/sound-practice.ts`).
`/connect-phone` shows the pairing QR when the browser holds the pairing key,
otherwise the steps. `/connector` explains adding the MCP connector. Dark mode
follows the system or the `cadence_theme` cookie; `public/sw.js` keeps packs
offline.

## 16. Test matrix

Run from the repo root unless a row says otherwise. "Exists" rows run today;
the rest are added by the stage that builds the feature, with exactly these
commands.

### Shared

| What | Command | Pass |
| --- | --- | --- |
| Drift between the twins | `pnpm test` (`tests/platform/drift.test.ts`) and `node scripts/platform/sync-mobile.mjs --check` | identical bodies, same file set (exists) |
| Content model, validators, grading | `pnpm test` (`tests/platform/content-model.test.ts`) | all pass (exists) |
| Engine routing, entitlement, quotas, audio sniffing | `pnpm test` (`tests/platform/engine-routing.test.ts`) | all pass (exists) |
| Summary and streaks | `pnpm test` (`tests/platform/progress-model.test.ts`) | all pass (exists) |
| Vocal-tract port | `pnpm test` (`tests/platform/vocal-tract.test.ts`); refresh the reference with `node scripts/vocal-tract/make-reference.mjs` (needs TeX Live) | every point of all 26 demo phonemes within 1e-4 of the package (exists) |
| SRS scheduling | `pnpm test` (`tests/platform/srs.test.ts`, moved from `mobile/tests/srs.test.ts`) | all pass |
| Daily plan, placement scoring | `pnpm test` (`tests/platform/daily-plan.test.ts`, `placement.test.ts`) | plan fits 10-15 minutes; deterministic for fixed input |
| Content packs | `node scripts/content/validate.mjs` | zero problems across every pack |
| Articulation targets | `node scripts/content/validate-articulation.mjs` | every `ENGLISH_SOUNDS` entry has a valid target per variant; `needsReview` list printed |

### Email

| What | Command | Pass |
| --- | --- | --- |
| Templates render | `pnpm test` (`tests/email/render.test.ts`) | every template renders from its fixture (`src/lib/server/email/templates/index.ts`) with an HTML and a plain-text part, no unreplaced placeholders, unsubscribe only on opt-in mail |
| HTML lint | `node --import ./tests/register.mjs scripts/email/lint.ts` | one `<style>` in `<head>` and the font `<link>` only, inline styles everywhere else, every `<img>` with `alt` on https, 560 px frame, under 100 KB |
| Previews | `node --import ./tests/register.mjs scripts/email/preview.ts` | `build/email-previews/index.html`, light and dark |
| Forgot password end to end | `firebase emulators:exec --only auth,firestore --project demo-cadence "pnpm test:e2e -- tests/e2e/reset-password.spec.ts"` | request sends a link; `/reset-password` accepts it; new password signs in; old one fails; one `password-changed` in `mailQueue` |
| Billing emails exactly once | in the server run below (`tests/server/emulator/webhooks.test.ts`) | each Stripe and RevenueCat event queues its template once; a replay queues nothing |

### Server

| What | Command | Pass |
| --- | --- | --- |
| Route tests | `firebase emulators:exec --only auth,firestore --project demo-cadence "node --test --test-concurrency=1 --import ./tests/register.mjs 'tests/server/**/*.test.ts'"` (JDK 21+) | sync routes respect tiers and App Check; quotas return 429; circuit breaker returns 503 |
| Webhooks | same run (`tests/server/emulator/webhooks.test.ts`), plus `node scripts/webhooks/replay-stripe.mjs --twice` and `node scripts/webhooks/replay-revenuecat.mjs --twice` against `pnpm dev` | bad signature or bearer is 400/401; every listed event maps per section 9; replays are `duplicate: true` with no change; `plus` correct with two sources |
| MCP | same run (`tests/server/emulator/mcp.test.ts`) | no token: 401 with `WWW-Authenticate` and `resource_metadata`; wrong audience: 401; GET and DELETE: 405 after auth; read-only scope cannot call write tools; free account gets the Plus error on Plus tools; every tool's output matches section 8; the 31st call in an hour on free is rate limited |
| Firestore rules | `firebase emulators:exec --only firestore --project demo-cadence "node --test tests/rules/firestore.test.ts"` (`@firebase/rules-unit-testing`) | every read and write from an unauthenticated and an authenticated client is denied, on every collection in section 5 |
| Python engines | `python3 -m py_compile src/backend/ai-engine/main.py src/backend/coach-engine/main.py` and `cd src/backend/ai-engine && python3 -m pytest` (`pip install -r requirements.test.txt` once) | compile; size, duration and MIME limits refuse bad audio (`audio_limits.py`, the same rules as `engines/audio.ts`) |

### Web

| What | Command | Pass |
| --- | --- | --- |
| Typecheck, lint, unit | `pnpm typecheck && pnpm lint && pnpm test` | clean (exists) |
| Production build | `pnpm build` | succeeds (exists) |
| Smoke flows | `pnpm exec playwright install chromium` once, then `firebase emulators:exec --only auth,firestore --project demo-cadence "pnpm test:e2e"` (JDK 21+; `playwright.config.ts` builds with demo Firebase values and starts `pnpm start` on port 3310; Stripe Checkout is stubbed by route interception, Brevo by `tests/e2e/support/brevo-stub.mjs` through `BREVO_API_URL`; `E2E_REUSE_BUILD=1` skips the build) | landing; sign up and in; a lesson; a quiz; flashcards; checkout redirects to the stubbed URL; local mode with no account; mouth map animates; the newsletter sends one Brevo double opt-in request for list 5 and never adds to list 5 directly; all at widths 375, 768 and 1280 with no horizontal scroll and no console errors; screenshots in `build/test-screenshots/web/<width>/` |
| Accessibility | in the same run, `@axe-core/playwright` on every visited page | no serious or critical violations |
| Lighthouse | `pnpm exec lhci autorun` after `pnpm build` (`lighthouserc.json`: landing and dashboard, Lighthouse's default mobile settings, median of 3; the local-mode cookie is sent on both so the dashboard opens; reports in `build/lighthouse/`) | performance at least 85, accessibility at least 95, best practices at least 95 |
| Bundle budget | `node scripts/budgets/web.mjs` after `pnpm build` | within the budgets below |

### Desktop

| What | Command | Pass |
| --- | --- | --- |
| Build | `cd desktop && pnpm build:mac` | DMG produced in `desktop/packages/` (exists) |
| Launch smoke | `node desktop/scripts/smoke.mjs` (Playwright `_electron`, the packaged app on a throwaway profile); `--dmg desktop/packages/Cadence-X.Y.Z-arm64.dmg` installs it from the DMG first, into a temporary folder | window opens; local mode reaches the dashboard without an account; `/pair` renders a QR; `/api/health` reports both engines ready within the setup timeout; a lesson works with every non-loopback request blocked |

### Release

| What | Command | Pass |
| --- | --- | --- |
| Version rules, bump plans, manifest | `pnpm test` (`tests/release/`) and `node scripts/release/bump.mjs <product> <kind> --dry-run` for each command in docs/RELEASING.md | all pass; each plan writes the documented files and tag; an empty changelog section is refused |
| Workflow lint | `actionlint .github/workflows/*.yml` (`brew install actionlint shellcheck`) | no findings |
| Updater, fake feed | `cd desktop && pnpm test:update-feed` | update found, downloaded and verified |
| Updater, install | `CADENCE_TEST_SIGN_IDENTITY="Apple Development: …" node desktop/scripts/test-update-install.mjs` after `pnpm build:mac` (Squirrel installs only signed updates; any local development identity works, nothing leaves the machine) | 99.0.0 offered, downloaded, "Update ready" with Restart, applied on quit, and the restarted app reports 99.0.0 |
| `/api/version` | `curl -s http://127.0.0.1:3310/api/version` during the web run | equals `release/manifest.json` |

### Mobile

Run in `mobile/`. Simulators: "iPhone SE (3rd generation)" and
"iPhone 16 Pro Max". Never a physical iPhone.

| What | Command | Pass |
| --- | --- | --- |
| Typecheck, unit | `npx tsc --noEmit && npm test` | clean (exists) |
| Simulator builds | `npx expo run:ios --device "iPhone SE (3rd generation)"` and `npx expo run:ios --device "iPhone 16 Pro Max"` | build, install, launch, no red box |
| Flows | Maestro (`brew install maestro`), `maestro test e2e/` | connect own server with no paywall shown; cloud sign-in; a lesson; a quiz; flashcards; matching; sentence building; paywall with RevenueCat in sandbox or the offline stub (`EXPO_PUBLIC_PURCHASES_STUB=1`); airplane mode keeps practice working and shows the AI offer instead of an error; mouth map compare view |
| Screenshots | each flow ends with `takeScreenshot`; `maestro test e2e/ --format junit` writes them to `e2e/screenshots/<device>/` | every screen captured on both devices, light and dark |
| Dynamic Type | `xcrun simctl ui booted content_size accessibility-extra-extra-extra-large`, then the flows again | no clipped or overlapping text, every action reachable, no crash |
| Crash check | `xcrun simctl spawn booted log show --last 10m --predicate 'process == "Cadence"' \| grep -i -E "fatal\|exception"` after the flows | nothing |

### Optimization budgets

| What | How | Budget |
| --- | --- | --- |
| Web first-load JS per route | `node scripts/budgets/web.mjs` (gzip level 9 of each route's first-load chunks in `.next/diagnostics/route-bundle-stats.json`; the mouth map chunks are those holding the vocal-tract model) | landing at most 150 KB gzip; app routes at most 250 KB; mouth map chunk at most 25 KB |
| Mobile JS bundle | `npx expo export --platform ios` then size of the Hermes bundle | at most 8 MB |
| Mobile cold start | launch to first interactive screen on the SE simulator, median of 5 (`xcrun simctl launch` timestamps against the app's first-render log line) | at most 2.5 s |
| Bundled packs | sum of bundled `public/packs` | at most 30 MB in the iOS app |
| Content pack | `content.json` per level | at most 1.5 MB raw, 300 KB gzip |
| `cadence-web` image | `docker build -t cadence-web . && docker image inspect cadence-web --format '{{.Size}}'` | at most 400 MB; cold start to first byte at most 3 s locally (`docker run` to first `200` on `/api/health`) |
| `cadence-ai` image | same for `src/backend/ai-engine/Dockerfile.cloud` (context `src/backend`), started with `--cpus 2 --memory 4g` | at most 2.5 GB; ready at most 20 s on 2 vCPU |
| Firestore per session | emulator counts in the server route tests (`tests/server/emulator/session-cost.test.ts`) | free at most 2 reads and 1 write; Plus at most 10 reads and 5 writes |

`scripts/budgets/*.mjs` enforce these numbers; change them here and in the
script together.
