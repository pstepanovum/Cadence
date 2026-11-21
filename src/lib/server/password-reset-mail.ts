// FILE: src/lib/server/password-reset-mail.ts
//
// Sends what a reset request leads to (src/lib/server/password-reset.ts):
// the reset link to a password account, a "you sign in with Apple/Google"
// note to the others, nothing to an unknown address. Sent directly, never
// queued, because the link is a credential and is stored nowhere but in the
// message. A failed send is logged and tried once more.
import type { BrevoDeps } from "./email/brevo";
import { sendEmail } from "./email/brevo";
import { renderTemplate } from "./email/templates/index";
import { appOrigin } from "./env";
import { RESET_TTL_MS, resetPageUrl, type ResetPlan } from "./password-reset";

export async function sendWithOneRetry(send: () => Promise<unknown>, what: string): Promise<boolean> {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      await send();
      return true;
    } catch (error) {
      console.error(`${what} not sent (attempt ${attempt}):`, error instanceof Error ? error.message : error);
    }
  }
  return false;
}

export async function deliverResetPlan(plan: ResetPlan, deps: BrevoDeps = {}): Promise<boolean> {
  if (plan.kind === "none") return true;
  if (plan.kind === "social") {
    const email = renderTemplate("password-reset-social", { email: plan.email, providers: plan.providers });
    return sendWithOneRetry(() => sendEmail({ to: { email: plan.email }, email, tags: ["password-reset-social"] }, deps), "Social-account reset note");
  }
  const url = resetPageUrl(plan.token, appOrigin(deps.env));
  const email = renderTemplate("password-reset", { email: plan.email, resetUrl: url, expiresInMinutes: RESET_TTL_MS / 60_000 });
  return sendWithOneRetry(() => sendEmail({ to: { email: plan.email }, email, tags: ["password-reset"] }, deps), "Password reset email");
}
