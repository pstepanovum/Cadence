// FILE: src/components/auth/ResetPasswordForm.tsx
//
// Reached from Cadence's own reset email with ?token=… (src/lib/server/password-reset.ts;
// Firebase's reset links are not used). The token is taken out of the address
// bar at once, then checked (POST /api/auth/password-reset/check): a working
// link shows the masked address and the new-password form; an expired, used or
// unknown one says so and offers a new link. Saving (POST
// /api/auth/password-reset/confirm) sets the password and revokes every
// session, so every signed-in device is signed out, and the server sends
// "Your password was changed".
//
// A Firebase verify-email link that lands here is passed on to /verify-email,
// because a Firebase project has one action URL for every kind of link.
"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useState, type FormEvent } from "react";
import { AUTH_INPUT_CLASS, AuthCard, AuthNotice, FieldLabel } from "@/components/auth/AuthCard";
import { PasswordChecklist } from "@/components/auth/PasswordChecklist";
import { isPasswordAcceptable } from "@/components/auth/password-rules";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cloudFetch, readErrorCode } from "@/hooks/cloud-fetch";

type DeadLink = "expired" | "used" | "invalid";

type Stage = { name: "checking" } | { name: "ready"; email: string; token: string } | { name: DeadLink } | { name: "done" };

const DEAD_LINK: Record<DeadLink, { title: string; body: string }> = {
  expired: { title: "This link has expired", body: "Reset links work for 60 minutes. Ask for a new one and use it within the hour." },
  used: { title: "This link was already used", body: "Each reset link works once, and asking for a new link turns the older ones off. Ask for a new one if you still need it." },
  invalid: { title: "This link doesn't work", body: "It may have been cut short by your email app, or it came from an older email. Ask for a new one." },
};

async function checkToken(token: string): Promise<Stage> {
  try {
    const response = await cloudFetch("/api/auth/password-reset/check", { method: "POST", auth: false, appCheck: false, json: { token } });
    if (!response.ok) return { name: "invalid" };
    const body = (await response.json()) as { state?: string; email?: string };
    if (body.state === "valid" && typeof body.email === "string") return { name: "ready", email: body.email, token };
    return { name: body.state === "expired" || body.state === "used" ? body.state : "invalid" };
  } catch {
    return { name: "invalid" };
  }
}

export function ResetPasswordForm() {
  const router = useRouter();
  const id = useId();
  const searchParams = useSearchParams();
  // Captured once: the token is removed from the address bar right after.
  const [link] = useState(() => ({ mode: searchParams.get("mode"), token: searchParams.get("token"), query: searchParams.toString() }));
  const [checked, setStage] = useState<Stage>({ name: "checking" });
  const stage: Stage = link.token ? checked : { name: "invalid" };
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (link.mode === "verifyEmail" || link.mode === "verifyAndChangeEmail" || link.mode === "recoverEmail") {
      router.replace(`/verify-email?${link.query}`);
      return;
    }
    const token = link.token;
    if (!token) return;
    // Keep the token out of the address bar, history and referrers from here on.
    window.history.replaceState(null, "", "/reset-password");
    void checkToken(token).then(setStage);
  }, [router, link]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (stage.name !== "ready") return;
    setError(null);
    if (!isPasswordAcceptable(password)) {
      setError("Choose a password that meets every rule below.");
      return;
    }
    if (password !== confirm) {
      setError("The two passwords don't match.");
      return;
    }
    setSubmitting(true);
    try {
      const response = await cloudFetch("/api/auth/password-reset/confirm", { method: "POST", auth: false, appCheck: false, json: { token: stage.token, password } });
      if (response.ok) {
        setPassword("");
        setConfirm("");
        setStage({ name: "done" });
        return;
      }
      const { code, message } = await readErrorCode(response);
      if (code === "expired" || code === "used" || code === "invalid") setStage({ name: code });
      else setError(message ?? "Could not change your password. Try again.");
    } catch {
      setError("Could not reach Cadence. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (stage.name === "done") {
    return (
      <AuthCard title="Password changed" description="Your new password works from now on. Every device that was signed in has been signed out.">
        <div className="space-y-3" data-testid="reset-done">
          <Button className="w-full rounded-full" href="/login">
            Sign in
          </Button>
          <a className={buttonVariants({ variant: "secondary", size: "default", className: "w-full rounded-full" })} href="cadence://">
            Open the Cadence app
          </a>
        </div>
      </AuthCard>
    );
  }

  if (stage.name === "expired" || stage.name === "used" || stage.name === "invalid") {
    const copy = DEAD_LINK[stage.name];
    return (
      <AuthCard title={copy.title} description={copy.body}>
        <div data-testid={`reset-${stage.name}`}>
          <Button className="w-full rounded-full" href="/forgot-password">
            Get a new link
          </Button>
        </div>
      </AuthCard>
    );
  }

  const email = stage.name === "ready" ? stage.email : "";

  return (
    <AuthCard
      title="Choose a new password"
      description={email ? <>For <span className="font-semibold text-carbon-black">{email}</span>.</> : "Checking your link…"}
      footer={
        <>
          Link not working?{" "}
          <Link href="/forgot-password" className="font-semibold text-hunter-green underline-offset-2 hover:underline">
            Get a new one
          </Link>
        </>
      }
    >
      <form className="space-y-4" onSubmit={handleSubmit} noValidate>
        <div>
          <FieldLabel htmlFor={`${id}-password`}>New password</FieldLabel>
          <div className="relative">
            <Input
              id={`${id}-password`}
              type={show ? "text" : "password"}
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              aria-describedby={`${id}-rules`}
              disabled={stage.name !== "ready"}
              className={`${AUTH_INPUT_CLASS} rounded-full bg-white pr-20`}
            />
            <button
              type="button"
              onClick={() => setShow((value) => !value)}
              aria-pressed={show}
              aria-label={show ? "Hide passwords" : "Show passwords"}
              disabled={stage.name !== "ready"}
              className="absolute inset-y-0 right-2 my-auto h-9 cursor-pointer rounded-full px-3 text-sm font-semibold text-hunter-green hover:bg-bright-snow disabled:cursor-default disabled:opacity-50"
            >
              {show ? "Hide" : "Show"}
            </button>
          </div>
          <PasswordChecklist id={`${id}-rules`} password={password} email="" />
        </div>
        <div>
          <FieldLabel htmlFor={`${id}-confirm`}>Repeat it</FieldLabel>
          <Input
            id={`${id}-confirm`}
            type={show ? "text" : "password"}
            autoComplete="new-password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            required
            disabled={stage.name !== "ready"}
            className={`${AUTH_INPUT_CLASS} rounded-full bg-white`}
          />
        </div>

        {stage.name === "checking" ? <AuthNotice tone="info">Checking your link…</AuthNotice> : null}
        {error ? <AuthNotice tone="error">{error}</AuthNotice> : null}

        <Button className="w-full rounded-full" type="submit" disabled={submitting || stage.name !== "ready"}>
          {submitting ? "Changing password…" : "Change password"}
        </Button>
      </form>
    </AuthCard>
  );
}
