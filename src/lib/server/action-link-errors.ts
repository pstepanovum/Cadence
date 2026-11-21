// FILE: src/lib/server/action-link-errors.ts
//
// Whether an error from generatePasswordResetLink means "no account with this
// address". Usually that is auth/user-not-found or auth/email-not-found, but
// with email enumeration protection on, the Admin SDK throws an internal
// assertion instead ("INTERNAL ASSERT FAILED: Unable to create the email
// action link") for an unknown address. Both answer the same as a real reset,
// so the route never says which addresses have accounts. Pure.
export function isNoAccountForLinkError(error: unknown): boolean {
  const code = typeof (error as { code?: unknown })?.code === "string" ? (error as { code: string }).code : "";
  if (/user-not-found|email-not-found|invalid-email/.test(code)) return true;
  const message = error instanceof Error ? error.message : typeof (error as { message?: unknown })?.message === "string" ? String((error as { message: string }).message) : "";
  return /Unable to create the email action link/i.test(message);
}
