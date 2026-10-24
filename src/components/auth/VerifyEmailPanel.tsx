// FILE: src/components/auth/VerifyEmailPanel.tsx
//
// Two ways in: the link in the verification email (?mode=verifyEmail&oobCode=…),
// which is applied here, or straight after sign-up, where the page says where
// the link went and offers to send it again. Verifying is offered, not
// required; the account works either way.
"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { applyActionCode, sendEmailVerification, type User } from "firebase/auth";
import { AuthCard, AuthNotice } from "@/components/auth/AuthCard";
import { cloudFetch } from "@/hooks/cloud-fetch";
import { Button } from "@/components/ui/button";
import { describeAuthError } from "@/lib/firebase/auth-errors";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { isFirebaseConfigured } from "@/lib/firebase/config";

const RESEND_COOLDOWN_MS = 60_000;

type Stage =
  | { name: "loading" }
  | { name: "verified" }
  | { name: "failed"; message: string }
  | { name: "pending"; user: User }
  | { name: "signedOut" }
  | { name: "unavailable" };

export function VerifyEmailPanel() {
  const searchParams = useSearchParams();
  const [link] = useState(() => ({ mode: searchParams.get("mode"), code: searchParams.get("oobCode") }));
  const [checked, setStage] = useState<Stage>({ name: "loading" });
  const stage: Stage = isFirebaseConfigured ? checked : { name: "unavailable" };
  const [resentAt, setResentAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!isFirebaseConfigured) return;
    const auth = getFirebaseAuth();
    const code = link.code;

    // verifyEmail confirms the address; verifyAndChangeEmail completes an email
    // change; recoverEmail undoes one. applyActionCode handles all three.
    if (code && ["verifyEmail", "verifyAndChangeEmail", "recoverEmail"].includes(link.mode ?? "verifyEmail")) {
      window.history.replaceState(null, "", "/verify-email");
      applyActionCode(auth, code)
        .then(async () => {
          await auth.authStateReady();
          await auth.currentUser?.reload().catch(() => {});
          setStage({ name: "verified" });
        })
        .catch((error: unknown) =>
          setStage({ name: "failed", message: describeAuthError(error, "This link is no longer valid.") }),
        );
      return;
    }

    void auth.authStateReady().then(async () => {
      const user = auth.currentUser;
      if (!user) return setStage({ name: "signedOut" });
      await user.reload().catch(() => {});
      setStage(user.emailVerified ? { name: "verified" } : { name: "pending", user });
    });
  }, [link]);

  useEffect(() => {
    if (!resentAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [resentAt]);

  async function resend(user: User) {
    setNotice(null);
    try {
      // Cadence's own email (POST /api/auth/verify-email); Firebase's where
      // this server has no such route.
      const response = await cloudFetch("/api/auth/verify-email", { method: "POST" }).catch(() => null);
      if (response?.status === 429) {
        setNotice("We just sent one. Check your inbox, or try again later.");
        return;
      }
      if (!response || response.status === 404 || response.status === 405) {
        await sendEmailVerification(user, { url: `${window.location.origin}/verify-email` }).catch(() => sendEmailVerification(user));
      } else if (!response.ok) {
        throw new Error("Could not send the email. Try again in a few minutes.");
      }
      setResentAt(Date.now());
      setNow(Date.now());
      setNotice("Sent. It can take a minute to arrive; check spam too.");
    } catch (error) {
      setNotice(describeAuthError(error, "Could not send the email. Try again in a few minutes."));
    }
  }

  switch (stage.name) {
    case "loading":
      return (
        <AuthCard title="Checking your email link">
          <AuthNotice tone="info">One moment…</AuthNotice>
        </AuthCard>
      );
    case "verified":
      return (
        <AuthCard title="Email confirmed" description="Thanks. Your account is all set.">
          <Button className="w-full" href="/dashboard">
            Continue to Cadence
          </Button>
        </AuthCard>
      );
    case "failed":
      return (
        <AuthCard title="This link does not work" description={stage.message}>
          <Button className="w-full" href="/verify-email">
            Send a new link
          </Button>
        </AuthCard>
      );
    case "unavailable":
      return (
        <AuthCard title="No account needed here" description="This copy of Cadence runs without accounts, so there is no email to confirm.">
          <Button className="w-full" href="/dashboard">
            Go to practice
          </Button>
        </AuthCard>
      );
    case "signedOut":
      return (
        <AuthCard
          title="Confirm your email"
          description="Open the link in the email we sent. To get a new one, sign in first."
        >
          <Button className="w-full" href="/login?next=/verify-email">
            Sign in
          </Button>
        </AuthCard>
      );
    case "pending": {
      const wait = Math.max(0, resentAt + RESEND_COOLDOWN_MS - now);
      return (
        <AuthCard
          title="Confirm your email"
          description={
            <>
              We sent a link to <span className="font-semibold text-hunter-green">{stage.user.email}</span>. Open it to
              confirm the address. You can keep practising meanwhile.
            </>
          }
          footer={
            <Link href="/dashboard" className="font-semibold text-sage-text underline-offset-2 hover:underline">
              Skip for now
            </Link>
          }
        >
          <div className="space-y-3">
            {notice ? <AuthNotice tone="info">{notice}</AuthNotice> : null}
            <Button className="w-full" variant="ghost" disabled={wait > 0} onClick={() => void resend(stage.user)}>
              {wait > 0 ? `Send again in ${Math.ceil(wait / 1000)} s` : "Send the link again"}
            </Button>
          </div>
        </AuthCard>
      );
    }
  }
}
