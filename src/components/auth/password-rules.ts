// FILE: src/components/auth/password-rules.ts
//
// The rules a new password must meet, at sign-up and on /reset-password. Pure,
// so tests/web/password-rules.test.ts covers it. Firebase itself only insists
// on six characters; these are Cadence's own, checked before Firebase is called.

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export interface PasswordRule {
  id: "length" | "letter" | "digitOrSymbol" | "notEmail";
  label: string;
  met: boolean;
}

export function checkPassword(password: string, email = ""): PasswordRule[] {
  const local = email.trim().toLowerCase().split("@")[0] ?? "";
  const lower = password.toLowerCase();
  return [
    {
      id: "length",
      label: `${PASSWORD_MIN_LENGTH} to ${PASSWORD_MAX_LENGTH} characters`,
      met: password.length >= PASSWORD_MIN_LENGTH && password.length <= PASSWORD_MAX_LENGTH,
    },
    { id: "letter", label: "At least one letter", met: /\p{L}/u.test(password) },
    { id: "digitOrSymbol", label: "At least one number or symbol", met: /[^\p{L}\s]/u.test(password) },
    {
      id: "notEmail",
      label: "Not your email address",
      met: password.length === 0 || local.length < 3 || !lower.includes(local),
    },
  ];
}

export function isPasswordAcceptable(password: string, email = ""): boolean {
  return checkPassword(password, email).every((rule) => rule.met);
}
