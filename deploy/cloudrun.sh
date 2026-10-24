#!/usr/bin/env bash
# FILE: deploy/cloudrun.sh
#
# Deploys Cadence's hosted cloud to Cloud Run in us-central1. The owner runs
# this; nothing in CI or in the repo's other scripts deploys. docs/DEPLOY.md
# walks through it.
#
#   deploy/cloudrun.sh setup        one time: APIs, service accounts, secrets (empty), NAT, bucket, IAM
#   deploy/cloudrun.sh build        build and push both images with Cloud Build
#   deploy/cloudrun.sh deploy-ai    cadence-ai: private, IAM only, scale to zero
#   deploy/cloudrun.sh deploy-web   cadence-web: public, scale to zero, secrets from Secret Manager
#   deploy/cloudrun.sh scheduler    Cloud Scheduler jobs for /api/jobs/daily and /api/jobs/mail
#   deploy/cloudrun.sh ttl          Firestore TTL policies on expireAt / expiresAt
#   deploy/cloudrun.sh firebase     Hosting rewrite, Firestore rules and indexes, Storage rules
#   deploy/cloudrun.sh all          build, deploy-ai, deploy-web, scheduler, firebase
#
# DRY_RUN=1 prints every command instead of running it.
#
# Both services run with --min-instances 0 (scale to zero) and a fixed
# --max-instances, so an attack or a bug can never scale spend without bound;
# the per-learner quotas and the global AI budget breaker sit on top.
set -euo pipefail

PROJECT="${PROJECT:-cadence-pstepanov}"
REGION="${REGION:-us-central1}"
REPO="${REPO:-cadence}"
TAG="${TAG:-$(git rev-parse --short HEAD)}"
REGISTRY="${REGION}-docker.pkg.dev/${PROJECT}/${REPO}"
WEB_IMAGE="${REGISTRY}/cadence-web:${TAG}"
AI_IMAGE="${REGISTRY}/cadence-ai:${TAG}"
WEB_SA="cadence-web@${PROJECT}.iam.gserviceaccount.com"
AI_SA="cadence-ai@${PROJECT}.iam.gserviceaccount.com"
TTS_BUCKET="${TTS_BUCKET:-${PROJECT}-tts-cache}"
ORIGIN="https://cadence.pstepanov.dev"

SECRETS=(stripe-secret-key stripe-webhook-secret revenuecat-webhook-secret revenuecat-api-key brevo-api-key quiz-token-secret email-unsubscribe-secret jobs-secret oauth-known-clients)

run() {
  if [[ "${DRY_RUN:-}" == "1" ]]; then
    printf '+ %q' "$1"; shift; printf ' %q' "$@"; printf '\n'
  else
    "$@"
  fi
}

cd "$(dirname "$0")/.."

setup() {
  run gcloud services enable run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com \
    secretmanager.googleapis.com aiplatform.googleapis.com texttospeech.googleapis.com cloudscheduler.googleapis.com \
    firestore.googleapis.com firebaseappcheck.googleapis.com compute.googleapis.com --project "$PROJECT"
  run gcloud artifacts repositories create "$REPO" --repository-format docker --location "$REGION" --project "$PROJECT" || true

  run gcloud iam service-accounts create cadence-web --display-name "Cadence web and API" --project "$PROJECT" || true
  run gcloud iam service-accounts create cadence-ai --display-name "Cadence AI engine (no permissions)" --project "$PROJECT" || true

  # cadence-web: Firestore, Vertex AI (Gemini), Auth admin (reset links, deletion), App Check verification.
  for role in roles/datastore.user roles/aiplatform.user roles/firebaseauth.admin roles/firebaseappcheck.tokenVerifier; do
    run gcloud projects add-iam-policy-binding "$PROJECT" --member "serviceAccount:${WEB_SA}" --role "$role" --condition None
  done

  # Secrets exist empty; the owner adds each value by hand, never on a command line:
  #   printf '%s' "$VALUE" | gcloud secrets versions add NAME --data-file=-
  for secret in "${SECRETS[@]}"; do
    run gcloud secrets create "$secret" --replication-policy automatic --project "$PROJECT" || true
    run gcloud secrets add-iam-policy-binding "$secret" --member "serviceAccount:${WEB_SA}" --role roles/secretmanager.secretAccessor --project "$PROJECT"
  done

  # The TTS cache: private, uniform access, objects expire after 180 days.
  run gcloud storage buckets create "gs://${TTS_BUCKET}" --location "$REGION" --uniform-bucket-level-access --public-access-prevention --project "$PROJECT" || true
  run gcloud storage buckets update "gs://${TTS_BUCKET}" --lifecycle-file deploy/tts-cache-lifecycle.json
  run gcloud storage buckets add-iam-policy-binding "gs://${TTS_BUCKET}" --member "serviceAccount:${WEB_SA}" --role roles/storage.objectAdmin

  # cadence-web sends all egress through the VPC (to reach the internal-only
  # cadence-ai), so it needs Cloud NAT for Stripe, Brevo and RevenueCat.
  run gcloud compute routers create cadence-router --network default --region "$REGION" --project "$PROJECT" || true
  run gcloud compute routers nats create cadence-nat --router cadence-router --region "$REGION" \
    --auto-allocate-nat-external-ips --nat-all-subnet-ip-ranges --project "$PROJECT" || true
  # Private Google Access lets Vertex, TTS, Firestore and Storage calls stay on Google's network.
  run gcloud compute networks subnets update default --region "$REGION" --enable-private-ip-google-access --project "$PROJECT"
}

build() {
  # Public Firebase web config is inlined at build time; it is not secret.
  : "${NEXT_PUBLIC_FIREBASE_API_KEY:?Set the NEXT_PUBLIC_FIREBASE_* values (deploy/web-build.env.example)}"
  run gcloud builds submit . --project "$PROJECT" --config deploy/cloudbuild.web.yaml \
    --substitutions "_IMAGE=${WEB_IMAGE},_FIREBASE_API_KEY=${NEXT_PUBLIC_FIREBASE_API_KEY},_FIREBASE_AUTH_DOMAIN=${NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN},_FIREBASE_PROJECT_ID=${NEXT_PUBLIC_FIREBASE_PROJECT_ID},_FIREBASE_APP_ID=${NEXT_PUBLIC_FIREBASE_APP_ID},_RECAPTCHA_SITE_KEY=${NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY:-}"
  run gcloud builds submit src/backend --project "$PROJECT" --config deploy/cloudbuild.ai.yaml --substitutions "_IMAGE=${AI_IMAGE}"
}

deploy_ai() {
  # Private: no unauthenticated calls, internal ingress only, no secrets, a
  # service account with no roles. Only cadence-web may invoke it.
  run gcloud run deploy cadence-ai --project "$PROJECT" --region "$REGION" --image "$AI_IMAGE" \
    --no-allow-unauthenticated --ingress internal \
    --service-account "$AI_SA" \
    --min-instances 0 --max-instances 3 --concurrency 4 \
    --cpu 2 --memory 4Gi --cpu-boost --timeout 60 \
    --port 8080 --execution-environment gen2
  run gcloud run services add-iam-policy-binding cadence-ai --project "$PROJECT" --region "$REGION" \
    --member "serviceAccount:${WEB_SA}" --role roles/run.invoker
  if [[ "${DRY_RUN:-}" != "1" ]]; then
    echo "cadence-ai URL: $(gcloud run services describe cadence-ai --project "$PROJECT" --region "$REGION" --format 'value(status.url)')"
  fi
}

deploy_web() {
  local ai_url="${CADENCE_AI_URL:-}"
  if [[ -z "$ai_url" && "${DRY_RUN:-}" != "1" ]]; then
    ai_url="$(gcloud run services describe cadence-ai --project "$PROJECT" --region "$REGION" --format 'value(status.url)')"
  fi
  local secrets="STRIPE_SECRET_KEY=stripe-secret-key:latest,STRIPE_WEBHOOK_SECRET=stripe-webhook-secret:latest,REVENUECAT_WEBHOOK_SECRET=revenuecat-webhook-secret:latest,REVENUECAT_API_KEY=revenuecat-api-key:latest,BREVO_API_KEY=brevo-api-key:latest,QUIZ_TOKEN_SECRET=quiz-token-secret:latest,EMAIL_UNSUBSCRIBE_SECRET=email-unsubscribe-secret:latest,JOBS_SECRET=jobs-secret:latest,OAUTH_KNOWN_CLIENTS=oauth-known-clients:latest"
  local env="CADENCE_DEPLOYMENT=cloud,CADENCE_PUBLIC_ORIGIN=${ORIGIN},OAUTH_ISSUER=${ORIGIN},FIREBASE_PROJECT_ID=${PROJECT},APP_CHECK_ENFORCE=${APP_CHECK_ENFORCE:-1},AI_DAILY_BUDGET_USD=${AI_DAILY_BUDGET_USD:-25},CADENCE_AI_URL=${ai_url},ENGINE_SCORER=cloud-run,ENGINE_TRANSCRIBER=${ENGINE_TRANSCRIBER:-gemini},ENGINE_TTS=google-tts,ENGINE_COACH=gemini,ENGINE_GRAMMAR=gemini,GEMINI_BACKEND=vertex,VERTEX_REGION=${REGION},TTS_CACHE_BUCKET=${TTS_BUCKET},BREVO_DOI_TEMPLATE_ID=${BREVO_DOI_TEMPLATE_ID:-},ENGINE_AUTH=google-id-token,TRUSTED_PROXY_HOPS=${TRUSTED_PROXY_HOPS:-2}"

  # Public, scale to zero, at most 10 instances of 80 requests each. All
  # egress through the VPC so the internal-only cadence-ai is reachable.
  run gcloud run deploy cadence-web --project "$PROJECT" --region "$REGION" --image "$WEB_IMAGE" \
    --allow-unauthenticated \
    --service-account "$WEB_SA" \
    --min-instances 0 --max-instances 10 --concurrency 80 \
    --cpu 1 --memory 1Gi --cpu-boost --timeout 60 \
    --port 3000 --execution-environment gen2 \
    --network default --subnet default --vpc-egress all-traffic \
    --set-env-vars "$env" \
    --set-secrets "$secrets"
}

scheduler() {
  local web_url jobs_secret
  web_url="${CADENCE_WEB_URL:-$ORIGIN}"
  if [[ "${DRY_RUN:-}" == "1" ]]; then
    jobs_secret='$(gcloud secrets versions access latest --secret jobs-secret)'
  else
    jobs_secret="$(gcloud secrets versions access latest --secret jobs-secret --project "$PROJECT")"
  fi
  for job in "cadence-daily|0 17 * * *|/api/jobs/daily|300s" "cadence-mail|*/5 * * * *|/api/jobs/mail|120s"; do
    IFS='|' read -r name schedule path deadline <<<"$job"
    run gcloud scheduler jobs create http "$name" --project "$PROJECT" --location "$REGION" \
      --schedule "$schedule" --time-zone "Etc/UTC" --uri "${web_url}${path}" --http-method POST \
      --headers "Authorization=Bearer ${jobs_secret}" --attempt-deadline "$deadline" \
      || run gcloud scheduler jobs update http "$name" --project "$PROJECT" --location "$REGION" \
        --schedule "$schedule" --uri "${web_url}${path}" --update-headers "Authorization=Bearer ${jobs_secret}" --attempt-deadline "$deadline"
  done
}

ttl() {
  # Documents carry their own expiry; these policies let Firestore delete them.
  for group in days webhookEvents rateLimits mailQueue; do
    run gcloud firestore fields ttls update expireAt --collection-group "$group" --enable-ttl --project "$PROJECT"
  done
  for group in oauthTokens oauthCodes; do
    run gcloud firestore fields ttls update expiresAt --collection-group "$group" --enable-ttl --project "$PROJECT"
  done
}

firebase_deploy() {
  run firebase deploy --project "$PROJECT" --only hosting,firestore:rules,firestore:indexes,storage
}

case "${1:-}" in
  setup) setup ;;
  build) build ;;
  deploy-ai) deploy_ai ;;
  deploy-web) deploy_web ;;
  scheduler) scheduler ;;
  ttl) ttl ;;
  firebase) firebase_deploy ;;
  all) build; deploy_ai; deploy_web; scheduler; firebase_deploy ;;
  *) sed -n '2,24p' "$0"; exit 1 ;;
esac
