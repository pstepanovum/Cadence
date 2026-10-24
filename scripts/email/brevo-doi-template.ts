// FILE: scripts/email/brevo-doi-template.ts
//
// Creates (or, with --id, updates) the Brevo template used for the newsletter
// double opt-in, from our newsletter-confirm design with Brevo's
// {{ doubleoptin }} link in the button. Put the id it prints in
// BREVO_DOI_TEMPLATE_ID. The owner runs this once; it writes to Brevo.
//
//   BREVO_API_KEY=... node --import ./tests/register.mjs scripts/email/brevo-doi-template.ts [--id 12]
import { BREVO_API } from "../../src/lib/server/email/brevo.ts";
import { senders } from "../../src/lib/server/email/senders.ts";
import { renderTemplate } from "../../src/lib/server/email/templates/index.ts";

const key = process.env.BREVO_API_KEY?.trim();
if (!key) {
  console.error("Set BREVO_API_KEY in the environment.");
  process.exit(1);
}
const idIndex = process.argv.indexOf("--id");
const existing = idIndex > 0 ? Number(process.argv[idIndex + 1]) : null;

const email = renderTemplate("newsletter-confirm", {});
const { from, replyTo } = senders();
const body = {
  templateName: "Cadence newsletter confirmation (double opt-in)",
  subject: email.subject,
  sender: { name: from.name, email: from.email },
  replyTo: replyTo.email,
  htmlContent: email.html,
  isActive: true,
  tag: "optin",
};

const response = await fetch(existing ? `${BREVO_API}/smtp/templates/${existing}` : `${BREVO_API}/smtp/templates`, {
  method: existing ? "PUT" : "POST",
  headers: { "api-key": key, "content-type": "application/json", accept: "application/json" },
  body: JSON.stringify(body),
});
if (!response.ok) {
  console.error(`Brevo answered ${response.status}.`);
  process.exit(1);
}
const result = (await response.json().catch(() => ({}))) as { id?: number };
console.log(`BREVO_DOI_TEMPLATE_ID=${existing ?? result.id}`);
