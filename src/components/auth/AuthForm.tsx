// FILE: src/components/auth/AuthForm.tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useEffect, useId, useState, type FormEvent } from "react";
import type { User } from "firebase/auth";
import { AUTH_INPUT_CLASS, AuthCard, AuthNotice, FieldLabel } from "@/components/auth/AuthCard";
import { PasswordChecklist } from "@/components/auth/PasswordChecklist";
import { OrDivider, ProviderButton } from "@/components/auth/ProviderButtons";
import { isPasswordAcceptable } from "@/components/auth/password-rules";
import { subscribeToNewsletter } from "@/components/newsletter/newsletter-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { safeNextPath } from "@/lib/auth/safe-next";
import { describeAuthError } from "@/lib/firebase/auth-errors";
import { startServerSession } from "@/lib/firebase/client";
import {
  WEB_PROVIDERS,
  clearPendingLink,
  completeRedirect,
  createAccountWithEmail,
  readPendingLink,
  signInWithEmail,
  signInWithProvider,
  type ProviderMethod,
} from "@/lib/firebase/providers";
import { pendingLinkMessage, type PendingLink } from "@/lib/platform/sign-in-methods";

interface AuthFormProps {
  mode: "login" | "signup";
}

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const id = useId();
  const isLogin = mode === "login";
  const intent = isLogin ? "signin" : "signup";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newsletter, setNewsletter] = useState(false);
  const [busy, setBusy] = useState<ProviderMethod | "email" | "redirect" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingLink | null>(null);

  /** The session cookie, then onward: new accounts to setup, everyone else to where they were going. */
  async function enter(user: User, isNewUser: boolean) {
    await startServerSession(user);
    setMessage(isNewUser ? "Account created." : "Signed in.");
    startTransition(() => {
      router.replace(nextPathFromLocation() ?? (isNewUser ? "/onboarding" : "/dashboard"));
      router.refresh();
    });
  }

  // A Google or Apple redirect lands back here; finish it. Also shows a link
  // that is still waiting from before the redirect.
  useEffect(() => {
    let active = true;
    setPending(readPendingLink());
    void (async () => {
      try {
        const outcome = await completeRedirect();
        if (!active || !outcome) return;
        if (outcome.status === "signed-in") await enter(outcome.user, outcome.isNewUser);
        else if (outcome.status === "link-needed") setPending(outcome.pending);
      } catch (nextError) {
        if (active) setError(describeAuthError(nextError, "Google or Apple didn't finish signing you in. Try again."));
      }
    })();
    return () => {
      active = false;
    };
    // Runs once per page load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function withProvider(method: ProviderMethod) {
    if (busy) return;
    setMessage(null);
    setError(null);
    setBusy(method);
    try {
      const outcome = await signInWithProvider(method, intent);
      if (outcome.status === "signed-in") await enter(outcome.user, outcome.isNewUser);
      else if (outcome.status === "link-needed") setPending(outcome.pending);
      // "redirecting" leaves the page; "cancelled" changes nothing.
      if (outcome.status !== "redirecting") setBusy(null);
    } catch (nextError) {
      setError(describeAuthError(nextError, "Something went wrong. Please try again."));
      setBusy(null);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setMessage(null);
    setError(null);

    if (!isLogin && !isPasswordAcceptable(password, email)) {
      setError("Choose a password that meets every rule below.");
      return;
    }

    try {
      setBusy("email");
      if (isLogin) {
        await enter(await signInWithEmail(email, password), false);
        return;
      }
      const user = await createAccountWithEmail(email, password);
      // The server sends the verify-email message on the first sign-in it
      // sees; verifying is offered, not required.
      if (newsletter) void subscribeToNewsletter(email, "signup");
      await enter(user, true);
    } catch (nextError) {
      setError(describeAuthError(nextError, "Something went wrong. Please try again."));
    } finally {
      setBusy(null);
    }
  }

  return (
    <AuthCard
      title={isLogin ? "Welcome back" : "Create your account"}
      description={isLogin ? "Sign in to keep practising." : "Free. Your streak follows you to every device."}
      footer={
        <>
          {isLogin ? "New to Cadence?" : "Already have an account?"}{" "}
          <Link href={isLogin ? "/signup" : "/login"} className="font-semibold text-hunter-green underline-offset-2 hover:underline">
            {isLogin ? "Create an account" : "Sign in"}
          </Link>
        </>
      }
    >
      {pending ? (
        <AuthNotice tone="info">
          {pendingLinkMessage(pending)}{" "}
          <button
            type="button"
            className="cursor-pointer font-semibold text-hunter-green underline underline-offset-2"
            onClick={() => {
              clearPendingLink();
              setPending(null);
            }}
          >
            Cancel
          </button>
        </AuthNotice>
      ) : null}

      <div className="space-y-2.5">
        {WEB_PROVIDERS.map((method) => (
          <ProviderButton key={method} method={method} intent={intent} disabled={busy !== null} onClick={() => void withProvider(method)} />
        ))}
      </div>

      <OrDivider />

      <form className="space-y-4" onSubmit={handleSubmit} noValidate>
        <div>
          <FieldLabel htmlFor={`${id}-email`}>Email</FieldLabel>
          <Input
            id={`${id}-email`}
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            className={AUTH_INPUT_CLASS}
          />
        </div>

        <div>
          <FieldLabel htmlFor={`${id}-password`}>Password</FieldLabel>
          <Input
            id={`${id}-password`}
            type="password"
            autoComplete={isLogin ? "current-password" : "new-password"}
            placeholder={isLogin ? "Your password" : "At least 8 characters"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            aria-describedby={isLogin ? undefined : `${id}-rules`}
            className={AUTH_INPUT_CLASS}
          />
          {!isLogin ? <PasswordChecklist id={`${id}-rules`} password={password} email={email} /> : null}
        </div>

        {!isLogin ? (
          <label className="flex cursor-pointer items-start gap-3 text-sm leading-6 text-iron-grey">
            <input
              type="checkbox"
              checked={newsletter}
              onChange={(event) => setNewsletter(event.target.checked)}
              className="mt-1 h-4 w-4 shrink-0 accent-[var(--hunter-green)]"
            />
            <span>Send me product news and offers. Unsubscribe any time.</span>
          </label>
        ) : null}

        {message ? <AuthNotice tone="success">{message}</AuthNotice> : null}
        {error ? <AuthNotice tone="error">{error}</AuthNotice> : null}

        <Button className="min-h-[52px] w-full rounded-[14px] text-base" type="submit" disabled={busy !== null}>
          {busy === "email" ? (isLogin ? "Signing in…" : "Creating account…") : isLogin ? "Sign in" : "Create account"}
        </Button>

        {isLogin ? (
          <p className="text-center">
            <Link href="/forgot-password" className="text-sm font-semibold text-hunter-green underline-offset-2 hover:underline">
              Forgot your password?
            </Link>
          </p>
        ) : null}

        {!isLogin ? (
          <p className="text-center text-xs leading-5 text-slate-grey">
            By creating an account you agree to the <Link href="/terms" className="underline">Terms</Link> and the{" "}
            <Link href="/privacy" className="underline">Privacy Policy</Link>.
          </p>
        ) : null}
      </form>
    </AuthCard>
  );
}

/** The `?next=` path the proxy sent us here with, when it is one of ours. */
function nextPathFromLocation() {
  if (typeof window === "undefined") {
    return null;
  }
  return safeNextPath(new URLSearchParams(window.location.search).get("next"));
}
