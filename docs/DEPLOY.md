# Deploying Cadence's cloud

How the hosted Cadence at `https://cadence.pstepanov.dev` is put together and
deployed. The owner runs every command here; nothing in CI or in the repo's
other scripts deploys. The architecture is in `docs/PLATFORM.md` (sections 5,
6, 8, 9, 10, 12 and 14); this file is the runbook.

Firebase project `cadence-pstepanov`, region `us-central1`.

## What runs where

| Piece | What | Settings |
| --- | --- | --- |
| Firebase Hosting | `cadence.pstepanov.dev`: serves `public/` (packs, email logo) from the CDN, rewrites everything else to `cadence-web` | `firebase.json` |
| `cadence-web` (Cloud Run, public) | the Next.js app: pages, API, sync, MCP, OAuth, webhooks, email, jobs. Image: `Dockerfile` | min 0, max 10, concurrency 80, 1 vCPU, 1 GiB, CPU boost, 60 s, all egress through the VPC |
| `cadence-ai` (Cloud Run, private) | phoneme scorer and Whisper-small on CPU, models baked in. Image: `src/backend/ai-engine/Dockerfile.cloud` | `--no-allow-unauthenticated`, internal ingress, min 0, max 3, concurrency 4, 2 vCPU, 4 GiB, CPU boost, 60 s, no secrets, a service account with no roles |
| Vertex AI | Gemini 2.5 Flash-Lite (coach, transcription), Gemini 2.5 Flash (spoken grammar, placement) | called by `cadence-web` with its service account, no API key |
| Cloud Text-to-Speech | request-time reference audio, cached in `gs://cadence-pstepanov-tts-cache` (180-day lifecycle) | |
| Firestore | everything in `docs/PLATFORM.md` section 5; rules deny every client | `firestore.rules`, `firestore.indexes.json` |
| Cloud Scheduler | `POST /api/jobs/daily` at 17:00 UTC, `POST /api/jobs/mail` every 5 minutes, `Authorization: Bearer <JOBS_SECRET>` | |

`cadence-web` calls `cadence-ai` with a Google ID token for the `cadence-ai`
URL, fetched from the metadata server (`src/lib/server/engines/google-auth.ts`).
Only `cadence-web`'s service account holds `run.invoker` on `cadence-ai`, and
internal ingress means only traffic from the VPC reaches it, which is why
`cadence-web` uses Direct VPC egress with Cloud NAT for the internet.

Both services scale to zero. `cadence-web` loads no models and starts in about
2 s. `cadence-ai` loads its model from local disk at startup; the apps show
"Warming up" after 3 s.

## First time

```bash
# 1. APIs, Artifact Registry, service accounts, empty secrets, NAT, TTS bucket, IAM
deploy/cloudrun.sh setup

# 2. Secret values, one at a time, from your password manager, never on a command line:
#    printf '%s' "$VALUE" | gcloud secrets versions add stripe-secret-key --data-file=- --project cadence-pstepanov
#    stripe-secret-key, stripe-webhook-secret, revenuecat-webhook-secret, revenuecat-api-key,
#    brevo-api-key, quiz-token-secret, email-unsubscribe-secret, jobs-secret
#    (the last three: openssl rand -base64 48)

# 3. Firestore TTL policies (usage, webhookEvents, rateLimits, mailQueue, OAuth codes and tokens)
deploy/cloudrun.sh ttl

# 4. The newsletter double opt-in template in Brevo; note the printed id
BREVO_API_KEY=... node --import ./tests/register.mjs scripts/email/brevo-doi-template.ts
```

Then everything in "Outside dashboards" below, once.

## Each release

```bash
set -a; source deploy/web-build.env; set +a   # public Firebase web config, see web-build.env.example
export BREVO_DOI_TEMPLATE_ID=12               # from step 4 above
deploy/cloudrun.sh all                        # build, deploy-ai, deploy-web, scheduler, firebase
```

`DRY_RUN=1 deploy/cloudrun.sh all` prints the commands without running them.
`deploy/cadence-web.env.example` lists every setting `cadence-web` gets.

## Exact URLs

| What | URL |
| --- | --- |
| Stripe webhook | `https://cadence.pstepanov.dev/api/webhooks/stripe` |
| RevenueCat webhook | `https://cadence.pstepanov.dev/api/webhooks/revenuecat` |
| MCP connector | `https://cadence.pstepanov.dev/api/mcp` |
| Protected resource metadata | `https://cadence.pstepanov.dev/.well-known/oauth-protected-resource/api/mcp` |
| Authorization server metadata | `https://cadence.pstepanov.dev/.well-known/oauth-authorization-server` |
| Consent page (web app) | `https://cadence.pstepanov.dev/oauth/authorize` |
| Password reset action page (web app) | `https://cadence.pstepanov.dev/reset-password?mode=resetPassword&oobCode=...` |
| Email verification action page (web app) | `https://cadence.pstepanov.dev/verify-email?mode=verifyEmail&oobCode=...` |
| Newsletter confirmed (Brevo redirect, then the page) | `/api/newsletter/confirmed?token=...` then `/newsletter/confirmed` |
| One-click unsubscribe | `https://cadence.pstepanov.dev/api/email/unsubscribe?token=...` |

## Outside dashboards (owner, once)

**Stripe** (shared account):
- Products: Cadence Plus with `metadata.app = cadence`; prices with lookup keys
  `cadence_plus_monthly` ($14.99/month) and `cadence_plus_yearly` ($99.99/year).
  The 7-day yearly trial is set per Checkout session, once per customer.
- Webhook endpoint `https://cadence.pstepanov.dev/api/webhooks/stripe` with events
  `checkout.session.completed`, `customer.subscription.created`,
  `customer.subscription.updated`, `customer.subscription.deleted`,
  `invoice.payment_failed`, `invoice.paid`, `charge.refunded`. Its signing
  secret goes in `stripe-webhook-secret`. Remove the old
  `/api/stripe/webhook` endpoint; that route no longer exists.
- Customer Portal: already configured; return URL `https://cadence.pstepanov.dev/account`.

**RevenueCat**: webhook URL `https://cadence.pstepanov.dev/api/webhooks/revenuecat`,
Authorization header value `Bearer <revenuecat-webhook-secret>`, all event
types, sandbox included (App Review must be able to unlock Plus). A v1 secret
API key goes in `revenuecat-api-key` (TRANSFER re-reads subscribers; account
deletion calls `DELETE /v1/subscribers/{uid}`).

**Firebase Auth emails**: every account email comes from Cadence's own
templates through Brevo, so Firebase's built-in emails must never reach
anyone:
- The server generates the one-time codes with the Admin SDK
  (`generatePasswordResetLink`, `generateEmailVerificationLink`,
  `generateVerifyAndChangeEmailLink`) and puts them on Cadence's own pages, so
  no Firebase template is used for reset, verification or email change.
- Clients must not call `sendPasswordResetEmail`, `sendEmailVerification` or
  `verifyBeforeUpdateEmail`; they call `POST /api/auth/password-reset`,
  `POST /api/auth/verify-email` and `POST /api/account/email`.
- Firebase sends its own emails only when a client SDK asks it to (the three
  calls above). As a backstop, in the Firebase console open Authentication >
  Templates and, for each template, "Customize action URL" to
  `https://cadence.pstepanov.dev/reset-password` (the Identity Toolkit setting
  `notification.sendEmail.callbackUri`, also settable with
  `PATCH https://identitytoolkit.googleapis.com/admin/v2/projects/cadence-pstepanov/config?updateMask=notification.sendEmail.callbackUri`),
  so a stray built-in email still lands on Cadence's page rather than
  Firebase's default handler.
- Authorized domains: `cadence.pstepanov.dev` only (plus `localhost` for development).

**Brevo**: senders `hello@cadence.pstepanov.dev` (from) and
`support@cadence.pstepanov.dev` (reply-to) verified, domain authenticated
(SPF, DKIM, DMARC). Lists: 4 "Cadence users" (account email only, every
account), 5 "Cadence newsletter" (double opt-in only). Contact attributes
`PLAN`, `PLATFORM`, `CEFR_LEVEL`. Set `CADENCE_POSTAL_ADDRESS` before any
marketing email goes out (it prints the postal line marketing email needs).

**App Check**: register the iOS app with App Attest, the web app with
reCAPTCHA Enterprise (site key in `NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY`),
and debug tokens for development and the iOS simulator. Enforcement is in the
server (`APP_CHECK_ENFORCE=1`); only set it to `0` on a staging service.

**Budgets**: a Cloud Billing budget alert on the project. The server's own
breaker trips at `AI_DAILY_BUDGET_USD` (default 25) of estimated AI spend a day.

## Rate limits and quotas

| Limit | Value | Where |
| --- | --- | --- |
| MCP tool calls, free | 30 an hour, 200 a day | `LIMITS` in `src/lib/server/rate-limit.ts` |
| MCP tool calls, Plus | 120 an hour, 2,000 a day | |
| Auth endpoints per IP | 20 an hour | sessions, reset, password-changed, failed sign-ins |
| Password reset, email change, verification per address | 5 an hour | |
| Newsletter | 10 an hour per IP, 3 a day per address | |
| OAuth | registration 20 an hour per IP, token 60 a minute per IP | |
| Sync | 60 a minute per account | |
| Cloud AI per Plus account per day | 30 min audio, 20,000 TTS characters, 120 coach turns | `PLUS_DAILY_LIMITS` |
| Uploads | 30 s and 2 MB, container sniffed | `AUDIO_MAX_*` |

## Testing locally

```bash
# Unit tests (no network)
pnpm test

# Server tests against the emulators (the Firestore emulator needs JDK 21+)
JAVA_HOME=/opt/homebrew/opt/openjdk@21 firebase emulators:exec --only auth,firestore --project demo-cadence \
  "node --test --test-concurrency=1 --import ./tests/register.mjs 'tests/server/**/*.test.ts'"

# Security rules
firebase emulators:exec --only firestore,storage --project demo-cadence "node --test tests/rules/firestore.test.ts"

# Webhooks against a running server (offline: fixtures signed locally)
STRIPE_WEBHOOK_SECRET=whsec_test node scripts/webhooks/replay-stripe.mjs --url http://localhost:3000/api/webhooks/stripe --twice
REVENUECAT_WEBHOOK_SECRET=test node scripts/webhooks/replay-revenuecat.mjs --url http://localhost:3000/api/webhooks/revenuecat --twice
# Against Stripe test mode instead (creates test objects):
stripe listen --forward-to localhost:3000/api/webhooks/stripe
stripe trigger checkout.session.completed

# Email: previews (build/email-previews/index.html), lint, and a test send
node --import ./tests/register.mjs scripts/email/preview.ts
node --import ./tests/register.mjs scripts/email/lint.ts
BREVO_API_KEY=... node --import ./tests/register.mjs scripts/email/send-test.ts you@example.com all
```

Run the server against the emulators with `FIREBASE_PROJECT_ID=demo-cadence`,
`FIRESTORE_EMULATOR_HOST=127.0.0.1:8080`, `FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099`,
`EMAIL_DRY_RUN=1` and the test secrets above.

## Images

```bash
docker build -t cadence-web .                                                    # at most 400 MB
docker build -f src/backend/ai-engine/Dockerfile.cloud -t cadence-ai src/backend  # at most 2.5 GB
```

Your own Cadence uses `docker-compose.yml` (the same web image with
`CADENCE_DEPLOYMENT=self-hosted`, and `src/backend/ai-engine/Dockerfile`,
which downloads models on first use instead of baking them in).
