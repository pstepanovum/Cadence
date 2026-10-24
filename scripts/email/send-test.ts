// FILE: scripts/email/send-test.ts
//
// Sends templates, rendered from their fixtures, through Brevo to one address,
// each subject prefixed "[TEST] ". For reviewing the real thing in Gmail,
// Apple Mail and Outlook after checking build/email-previews.
//
//   BREVO_API_KEY=... node --import ./tests/register.mjs scripts/email/send-test.ts you@example.com [template|all]
//
// Needs BREVO_API_KEY in the environment (never pass it on the command line,
// never commit it). EMAIL_DRY_RUN=1 renders and logs without sending.
import { sendEmail } from "../../src/lib/server/email/brevo.ts";
import { isEmailAddress } from "../../src/lib/server/email/senders.ts";
import { TEMPLATE_IDS, TEMPLATES, isTemplateId, renderFixture } from "../../src/lib/server/email/templates/index.ts";

const [to, which = "all"] = process.argv.slice(2);
if (!isEmailAddress(to)) {
  console.error("Usage: send-test.ts <to> [template|all]");
  process.exit(1);
}
if (which !== "all" && !isTemplateId(which)) {
  console.error(`Unknown template ${which}. One of: ${TEMPLATE_IDS.join(", ")}`);
  process.exit(1);
}

const ids = which === "all" ? TEMPLATE_IDS : [which];
let failed = 0;
for (const id of ids) {
  const email = renderFixture(id as (typeof TEMPLATE_IDS)[number]);
  const fixture = TEMPLATES[id as (typeof TEMPLATE_IDS)[number]].fixture as { unsubscribeUrl?: string };
  try {
    const result = await sendEmail({ to: { email: to }, email, subjectPrefix: "[TEST] ", tags: ["test", id], unsubscribeUrl: fixture.unsubscribeUrl });
    console.log(`${id}: ${result.dryRun ? "dry run" : `sent ${result.messageId ?? ""}`}`);
  } catch (error) {
    failed += 1;
    console.error(`${id}: ${error instanceof Error ? error.message : error}`);
  }
  // Brevo's transactional API allows bursts, but there is no hurry.
  await new Promise((resolve) => setTimeout(resolve, 400));
}
process.exit(failed ? 1 : 0);
