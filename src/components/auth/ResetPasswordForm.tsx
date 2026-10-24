// FILE: src/components/auth/ResetPasswordForm.tsx
//
// Reached from the reset email with ?oobCode=… (and Firebase's ?mode=; a
// verifyEmail link that lands here is passed on to /verify-email, because a
// Firebase project has one action URL for every kind of link).
//
// Changing the password makes Firebase revoke every refresh token of the
// account, so every other device is signed out: the apps at their next token
// refresh, the web because session cookies are verified with the revocation
// check. The page then tells the server (POST /api/auth/password-changed, which
// queues the "password changed" email once it sees the new password in
// Firebase) and signs this device in with the new password.
"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useState, type FormEvent } from "react";
import { confirmPasswordReset, signInWithEmailAndPassword, verifyPasswordResetCode } from "firebase/auth";
import { AuthCard, AuthNotice, FieldLabel } from "@/components/auth/AuthCard";
import { PasswordChecklist } from "@/components/auth/PasswordChecklist";
import { isPasswordAcceptable } from "@/components/auth/password-rules";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cloudFetch } from "@/hooks/cloud-fetch";
import { describeAuthError } from "@/lib/firebase/auth-errors";
import { getFirebaseAuth, startServerSession } from "@/lib/firebase/client";

type Stage =
  | { name: "checking" }
  | { name: "invalid"; message: string }
  | { name: "ready"; email: string; code: string }
  | { name: "done"; signedIn: boolean };

async function tellServerAndSignIn(email: string, password: string): Promise<boolean> {
  await cloudFetch("/api/auth/password-changed", { method: "POST", auth: false, appCheck: false, json: { email } }).catch(() => null);
  try {
    const { user } = await signInWithEmailAndPassword(getFirebaseAuth(), email, password);
    await startServerSession(user);
    return true;
  } catch {
    return false;
  }
}

export function ResetPasswordForm() {
  const router = useRouter();
  const id = useId();
  const searchParams = useSearchParams();
  // Captured once: the code is removed from the address bar right after.
  const [link] = useState(() => ({ mode: searchParams.get("mode"), code: searchParams.get("oobCode"), query: searchParams.toString() }));
  const [checked, setStage] = useState<Stage>({ name: "checking" });
  const stage: Stage = link.code ? checked : { name: "invalid", message: "This page needs the link from your reset email." };
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (link.mode === "verifyEmail" || link.mode === "verifyAndChangeEmail" || link.mode === "recoverEmail") {
      router.replace(`/verify-email?${link.query}`);
      return;
    }
    const code = link.code;
    if (!code) return;
    // Keep the one-time code out of the address bar and history from here on.
    window.history.replaceState(null, "", "/reset-password");
    verifyPasswordResetCode(getFirebaseAuth(), code)
      .then((email) => setStage({ name: "ready", email, code }))
      .catch((verifyError: unknown) =>
        setStage({ name: "invalid", message: describeAuthError(verifyError, "This reset link is no longer valid.") }),
      );
  }, [router, link]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (stage.name !== "ready") return;
    setError(null);
    if (!isPasswordAcceptable(password, stage.email)) {
      setError("Choose a password that meets every rule below.");
      return;
    }
    if (password !== confirm) {
      setError("The two passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      await confirmPasswordReset(getFirebaseAuth(), stage.code, password);
    } catch (resetError) {
      setSubmitting(false);
      setError(describeAuthError(resetError, "Could not change your password. Request a new link."));
      return;
    }
    const signedIn = await tellServerAndSignIn(stage.email, password);
    setSubmitting(false);
    setPassword("");
    setConfirm("");
    setStage({ name: "done", signedIn });
  }

  if (stage.name === "done") {
    return (
      <AuthCard title="Password changed" description="Every other device that was signed in has been signed out.">
        <div className="space-y-3">
          <AuthNotice tone="success">Your new password works from now on.</AuthNotice>
          {stage.signedIn ? (
            <Button className="w-full" onClick={() => { router.replace("/dashboard"); router.refresh(); }}>
              Continue to Cadence
            </Button>
          ) : (
            <Button className="w-full" href="/login">
              Sign in
            </Button>
          )}
        </div>
      </AuthCard>
    );
  }

  if (stage.name === "invalid") {
    return (
      <AuthCard title="This link does not work" description={stage.message}>
        <Button className="w-full" href="/forgot-password">
          Get a new link
        </Button>
      </AuthCard>
    );
  }

  const email = stage.name === "ready" ? stage.email : "";

  return (
    <AuthCard
      title="Choose a new password"
      description={email ? <>For <span className="font-semibold text-hunter-green">{email}</span>.</> : "Checking your link…"}
      footer={
        <>
          Link expired?{" "}
          <Link href="/forgot-password" className="font-semibold text-sage-text underline-offset-2 hover:underline">
            Get a new one
          </Link>
        </>
      }
    >
      <form className="space-y-4" onSubmit={handleSubmit} noValidate>
        {/* Lets password managers save the new password against the right account. */}
        <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
        <div>
          <FieldLabel htmlFor={`${id}-password`}>New password</FieldLabel>
          <Input
            id={`${id}-password`}
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            aria-describedby={`${id}-rules`}
            disabled={stage.name !== "ready"}
            className="ring-1 ring-alabaster-grey"
          />
          <PasswordChecklist id={`${id}-rules`} password={password} email={email} />
        </div>
        <div>
          <FieldLabel htmlFor={`${id}-confirm`}>Repeat it</FieldLabel>
          <Input
            id={`${id}-confirm`}
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            required
            disabled={stage.name !== "ready"}
            className="ring-1 ring-alabaster-grey"
          />
        </div>

        {stage.name === "checking" ? <AuthNotice tone="info">Checking your link…</AuthNotice> : null}
        {error ? <AuthNotice tone="error">{error}</AuthNotice> : null}

        <Button className="w-full" type="submit" disabled={submitting || stage.name !== "ready"}>
          {submitting ? "Changing password…" : "Change password"}
        </Button>
      </form>
    </AuthCard>
  );
}
