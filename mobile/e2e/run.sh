#!/bin/zsh
# Runs the Maestro flows on one iOS Simulator (docs/PLATFORM.md, section 16).
#
#   e2e/run.sh <simulator udid> <name> [light|dark]
#
# Needs, already running: a Cadence server on this Mac (pnpm serve, or
# `next dev` with the Auth and Firestore emulators for the cloud flows) and an
# app build made with the e2e environment (mobile/.env.example: the demo
# Firebase project, EXPO_PUBLIC_FIREBASE_AUTH_EMULATOR and
# EXPO_PUBLIC_PURCHASES_STUB=1). Environment:
#
#   CADENCE_URL         the server as this Mac reaches it (http://127.0.0.1:3000)
#   CADENCE_ADDRESS     the server as the phone types it (192.168.1.42:3000)
#   CADENCE_ADMIN_TOKEN its pairing admin token (pairing.json in the data folder)
#   SERVER_STOP / SERVER_START   optional shell commands; with both set the
#                       offline flow runs with the server stopped
#
# Screenshots land in build/screenshots/<name>-<theme>/ (not committed).
set -u
UDID=$1
NAME=$2
THEME=${3:-light}
HERE=${0:A:h}
OUT=$HERE/../build/screenshots/$NAME-$THEME
mkdir -p "$OUT"

xcrun simctl ui "$UDID" appearance "$THEME"

code() {
  curl -s -X POST -H "x-cadence-admin-token: $CADENCE_ADMIN_TOKEN" "$CADENCE_URL/api/pair/code" |
    python3 -c 'import json,sys; d=json.load(sys.stdin); print(d["displayCode"] if sys.argv[1] == "code" else d["uri"])' "$1"
}

run() {
  local flow=$1; shift
  echo "== $flow ($NAME, $THEME)"
  maestro --device "$UDID" test --test-output-dir "$OUT/$flow" "$@" "$HERE/$flow.yaml" && echo "PASS $flow" || echo "FAIL $flow"
}

STAMP=$(date +%s)
EMAIL="e2e-$NAME-$THEME-$STAMP@example.com"
PASSWORD="practise-$STAMP"

# The pairing token and the Firebase session live in the keychain, which an
# app reinstall or Maestro's clearState does not always empty on a simulator.
xcrun simctl keychain "$UDID" reset
run 01-own-server-onboarding -e ADDRESS="$CADENCE_ADDRESS" -e CODE="$(code code)"
run 02-practice
run 03-mouth-map
run 04-pair-link -e PAIR_URI="$(code uri)"
if [[ -n ${SERVER_STOP:-} && -n ${SERVER_START:-} ]]; then
  eval "$SERVER_STOP"
  run 05-offline
  eval "$SERVER_START"
fi
xcrun simctl keychain "$UDID" reset
run 06-cloud-onboarding -e EMAIL="$EMAIL" -e PASSWORD="$PASSWORD"
run 07-paywall
run 08-account -e PASSWORD="$PASSWORD"
# Every sign-in and setup screen, then Apple and Google through the
# emulator's fake tokens, starting from the sign-in screen flow 09 ends on.
xcrun simctl keychain "$UDID" reset
run 09-auth-screens -e EMAIL="auth-$EMAIL" -e PASSWORD="$PASSWORD"
run 10-apple-google -e APPLE_EMAIL="apple-$EMAIL" -e PASSWORD="$PASSWORD"
run 11-advanced
