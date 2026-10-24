// FILE: scripts/webhooks/replay-stripe.mjs
//
// Replays the Stripe fixtures in fixtures/stripe/ against a running server,
// each signed with STRIPE_WEBHOOK_SECRET the way Stripe signs (no network to
// Stripe, nothing created anywhere). `--twice` sends each event again and
// expects `duplicate: true`.
//
//   STRIPE_WEBHOOK_SECRET=whsec_... node scripts/webhooks/replay-stripe.mjs \
//     --url http://localhost:3000/api/webhooks/stripe [--uid <firebase uid>] [--twice] [--bad-signature]
//
// The server must run with the same STRIPE_WEBHOOK_SECRET. Use a uid that
// exists in the Firestore you point the server at (the emulator is best).
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Stripe from "stripe";

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};

const url = option("--url", "http://localhost:3000/api/webhooks/stripe");
const uid = option("--uid", "replay-test-uid");
const secret = process.env.STRIPE_WEBHOOK_SECRET;
if (!secret) {
  console.error("Set STRIPE_WEBHOOK_SECRET (the same value the server uses).");
  process.exit(1);
}

const stripe = new Stripe("sk_test_unused", { apiVersion: "2026-03-25.dahlia" });
const dir = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "stripe");
let failures = 0;

async function send(name, payload, expectDuplicate) {
  const header = flag("--bad-signature") ? "t=1,v1=deadbeef" : stripe.webhooks.generateTestHeaderString({ payload, secret });
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json", "stripe-signature": header }, body: payload });
  const body = await response.json().catch(() => ({}));
  const ok = flag("--bad-signature") ? response.status === 400 : response.ok && (!expectDuplicate || body.duplicate === true);
  if (!ok) failures += 1;
  console.log(`${ok ? "ok  " : "FAIL"} ${response.status} ${name}${expectDuplicate ? " (replay)" : ""} ${JSON.stringify(body)}`);
}

for (const file of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
  const payload = readFileSync(join(dir, file), "utf8").replaceAll("__UID__", uid);
  await send(file, payload, false);
  if (flag("--twice")) await send(file, payload, true);
}
process.exit(failures ? 1 : 0);
