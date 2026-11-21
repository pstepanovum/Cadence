// FILE: src/components/auth/ForgotPasswordForm.tsx
//
// Always answers the same way, whether or not the address has an account, so
// the page cannot be used to find out who uses Cadence. The server route
// (POST /api/auth/password-reset) is rate limited per IP and per address and
// sends Cadence's own link to /reset-password through Brevo (never a Firebase
// reset email). The browser adds a short cooldown of its own so a double
// click sends one email.
"use client";

import Link from "next/link";
import { useEffect, useId, useState, type FormEvent } from "react";
import { AUTH_INPUT_CLASS, AuthCard, AuthNotice, FieldLabel } from "@/components/auth/AuthCard";
import { looksLikeEmail } from "@/components/newsletter/newsletter-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cloudFetch } from "@/hooks/cloud-fetch";

const COOLDOWN_MS = 60_000;
const COOLDOWN_KEY = "cadence.reset-requested-at";

export const RESET_SENT_MESSAGE =
  "If an account exists for that address, we sent a link to reset the password. It expires in an hour.";

function cooldownLeft(): number {
  try {
    const at = Number(window.sessionStorage.getItem(COOLDOWN_KEY) ?? 0);
    return Math.max(0, at + COOLDOWN_MS - Date.now());
  } catch {
    return 0;
  }
}

async function requestReset(email: string): Promise<"sent" | "rate_limited"> {
  const response = await cloudFetch("/api/auth/password-reset", {
    method: "POST",
    appCheck: "limited",
    auth: false,
    json: { email },
  }).catch(() => null);

  // Any other answer, even a failure, reads as sent: the page never says whether an address has an account.
  return response?.status === 429 ? "rate_limited" : "sent";
}

export function ForgotPasswordForm() {
  const id = useId();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const [wait, setWait] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setWait(cooldownLeft()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!looksLikeEmail(email)) {
      setError("Enter a valid email address.");
      return;
    }
    if (cooldownLeft() > 0) return;

    setState("sending");
    const outcome = await requestReset(email.trim()).catch(() => "sent" as const);
    if (outcome === "rate_limited") {
      setState("idle");
      setError("Too many requests. Wait a few minutes and try again.");
      return;
    }
    try {
      window.sessionStorage.setItem(COOLDOWN_KEY, String(Date.now()));
    } catch {}
    setWait(COOLDOWN_MS);
    setState("sent");
  }

  return (
    <AuthCard
      title="Reset your password"
      description="Enter the email you signed up with. We will send a link to choose a new password."
      footer={
        <>
          Remembered it?{" "}
          <Link href="/login" className="font-semibold text-hunter-green underline-offset-2 hover:underline">
            Sign in
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
            aria-invalid={error ? true : undefined}
            className={`${AUTH_INPUT_CLASS} rounded-full bg-white`}
          />
        </div>

        {state === "sent" ? <AuthNotice tone="success">{RESET_SENT_MESSAGE}</AuthNotice> : null}
        {error ? <AuthNotice tone="error">{error}</AuthNotice> : null}

        <Button className="w-full rounded-full" type="submit" disabled={state === "sending" || wait > 0}>
          {state === "sending"
            ? "Sending…"
            : wait > 0
              ? `Send again in ${Math.ceil(wait / 1000)} s`
              : state === "sent"
                ? "Send again"
                : "Send reset link"}
        </Button>
      </form>
    </AuthCard>
  );
}
