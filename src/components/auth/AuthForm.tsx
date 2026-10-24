// FILE: src/components/auth/AuthForm.tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useId, useState, type FormEvent } from "react";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth";
import { AuthCard, AuthNotice, FieldLabel } from "@/components/auth/AuthCard";
import { PasswordChecklist } from "@/components/auth/PasswordChecklist";
import { isPasswordAcceptable } from "@/components/auth/password-rules";
import { subscribeToNewsletter } from "@/components/newsletter/newsletter-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { safeNextPath } from "@/lib/auth/safe-next";
import { describeAuthError } from "@/lib/firebase/auth-errors";
import { getFirebaseAuth, startServerSession } from "@/lib/firebase/client";

interface AuthFormProps {
  mode: "login" | "signup";
}

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const id = useId();
  const isLogin = mode === "login";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newsletter, setNewsletter] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);

    if (!isLogin && !isPasswordAcceptable(password, email)) {
      setError("Choose a password that meets every rule below.");
      return;
    }

    try {
      setIsSubmitting(true);
      const auth = getFirebaseAuth();

      if (isLogin) {
        const { user } = await signInWithEmailAndPassword(auth, email, password);
        await startServerSession(user);
        setMessage("Signed in.");
        startTransition(() => {
          router.replace(nextPathFromLocation() ?? "/dashboard");
          router.refresh();
        });
        return;
      }

      const { user } = await createUserWithEmailAndPassword(auth, email, password);
      await startServerSession(user);
      // The server sends the verify-email message on the first sign-in it
      // sees; verifying is offered, not required.
      if (newsletter) void subscribeToNewsletter(email, "signup");

      setMessage("Account created.");
      startTransition(() => {
        router.replace(nextPathFromLocation() ?? "/onboarding");
        router.refresh();
      });
    } catch (nextError) {
      setError(describeAuthError(nextError, "Something went wrong. Please try again."));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthCard
      title={isLogin ? "Welcome back" : "Create your account"}
      description={
        isLogin
          ? "Sign in to keep training your pronunciation."
          : "Free. Your streak and lesson stats follow you to every device."
      }
      footer={
        <>
          {isLogin ? "New to Cadence?" : "Already have an account?"}{" "}
          <Link href={isLogin ? "/signup" : "/login"} className="font-semibold text-hunter-green underline-offset-2 hover:underline">
            {isLogin ? "Create an account" : "Sign in"}
          </Link>
        </>
      }
    >
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
            className="min-h-[52px] rounded-[14px] bg-bright-snow text-base text-carbon-black ring-1 ring-alabaster-grey focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hunter-green"
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
            className="min-h-[52px] rounded-[14px] bg-bright-snow text-base text-carbon-black ring-1 ring-alabaster-grey focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hunter-green"
          />
          {!isLogin ? <PasswordChecklist id={`${id}-rules`} password={password} email={email} /> : null}
        </div>

        {!isLogin ? (
          <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-bright-snow px-4 py-3 text-sm leading-6 text-iron-grey ring-1 ring-alabaster-grey">
            <input
              type="checkbox"
              checked={newsletter}
              onChange={(event) => setNewsletter(event.target.checked)}
              className="mt-1 h-4 w-4 shrink-0 accent-[var(--sage-green)]"
            />
            <span>
              Email me product updates and occasional offers. Unsubscribe any time.
            </span>
          </label>
        ) : null}

        {message ? <AuthNotice tone="success">{message}</AuthNotice> : null}
        {error ? <AuthNotice tone="error">{error}</AuthNotice> : null}

        <Button className="min-h-[52px] w-full rounded-[14px] text-base" type="submit" disabled={isSubmitting}>
          {isSubmitting ? (isLogin ? "Signing in…" : "Creating account…") : isLogin ? "Sign in" : "Create account"}
        </Button>

        {isLogin ? (
          <p className="text-center">
            <Link href="/forgot-password" className="text-sm font-semibold text-hunter-green underline-offset-2 hover:underline">
              Forgot your password?
            </Link>
          </p>
        ) : null}

        {!isLogin ? (
          <p className="text-xs leading-5 text-slate-grey">
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
