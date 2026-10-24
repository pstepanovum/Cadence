// FILE: scripts/webhooks/replay-revenuecat.mjs
//
// Replays RevenueCat sample events from fixtures/revenuecat/ against a running
// server with `Authorization: Bearer $REVENUECAT_WEBHOOK_SECRET`. Offline:
// nothing is sent to RevenueCat. `--event BILLING_ISSUE` sends one type;
// `--twice` checks idempotency; `--bad-secret` checks the 401.
//
//   REVENUECAT_WEBHOOK_SECRET=... node scripts/webhooks/replay-revenuecat.mjs \
//     --url http://localhost:3000/api/webhooks/revenuecat [--uid <firebase uid>] [--event TYPE] [--twice]
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};

const url = option("--url", "http://localhost:3000/api/webhooks/revenuecat");
const uid = option("--uid", "replayTestUid0000000000001");
const only = option("--event", null);
const secret = process.env.REVENUECAT_WEBHOOK_SECRET;
if (!secret) {
  console.error("Set REVENUECAT_WEBHOOK_SECRET (the same value the server uses).");
  process.exit(1);
}

const dir = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "revenuecat");
let failures = 0;

async function send(name, payload, expectDuplicate) {
  const bearer = flag("--bad-secret") ? "wrong" : secret;
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${bearer}` }, body: payload });
  const body = await response.json().catch(() => ({}));
  const ok = flag("--bad-secret") ? response.status === 401 : response.ok && (!expectDuplicate || body.duplicate === true);
  if (!ok) failures += 1;
  console.log(`${ok ? "ok  " : "FAIL"} ${response.status} ${name}${expectDuplicate ? " (replay)" : ""} ${JSON.stringify(body)}`);
}

for (const file of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
  if (only && !file.includes(only)) continue;
  const payload = readFileSync(join(dir, file), "utf8").replaceAll("__UID__", uid);
  await send(file, payload, false);
  if (flag("--twice")) await send(file, payload, true);
}
process.exit(failures ? 1 : 0);
