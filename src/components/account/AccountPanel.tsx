// FILE: src/components/account/AccountPanel.tsx
//
// The cloud account page: Plus status and its controls, the newsletter
// switch, download my data, delete account. Plus is read from GET /api/me;
// the page never decides entitlement itself.
"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useState, type FormEvent } from "react";
import { EmailAuthProvider, reauthenticateWithCredential, signOut } from "firebase/auth";
import { PLAN_NAMES, readMe, type Me } from "@/components/account/me";
import { PlanButton, PortalButton } from "@/components/billing/PlanButton";
import { subscribeToNewsletter, unsubscribeFromNewsletter } from "@/components/newsletter/newsletter-api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cloudFetch } from "@/hooks/cloud-fetch";
import { describeAuthError } from "@/lib/firebase/auth-errors";
import { getFirebaseAuth } from "@/lib/firebase/client";

const dateFormat = (ms: number) => new Date(ms).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

export function AccountPanel({ email, checkout }: { email: string | null; checkout: string | null }) {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  useEffect(() => {
    void readMe().then(setMe);
  }, []);

  return (
    <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
      <div className="flex flex-col gap-4">
        {checkout === "success" ? (
          <p role="status" className="rounded-3xl bg-yellow-green px-5 py-4 text-sm font-semibold text-hunter-green">
            Thanks. Your payment went through; Plus turns on as soon as Stripe confirms it, usually within a minute.
          </p>
        ) : null}
        <PlusCard me={me} />
        <NewsletterCard email={email} me={me} />
      </div>
      <div className="flex flex-col gap-4">
        <DataCard />
        <DeleteCard email={email} />
      </div>
    </div>
  );
}

function PlusCard({ me }: { me: Me | null | undefined }) {
  if (me === undefined) {
    return <Card className="bg-white"><p className="text-sm text-iron-grey" role="status">Loading your plan…</p></Card>;
  }
  const plus = me?.plus ?? null;
  const active = me?.isPlus ?? false;

  if (!active) {
    return (
      <Card className="bg-hunter-green text-white">
        <p className="eyebrow text-sm text-yellow-green">Your plan</p>
        <h2 className="mt-2 text-2xl font-semibold">Free</h2>
        <p className="mt-2 text-sm leading-7 text-white/80">
          All practice is yours. Plus adds cloud AI: scoring, voices, transcription and the coach, wherever you are.
          {plus && !plus.active ? " Your earlier Plus has ended; your detailed history is kept for 90 days." : ""}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <PlanButton interval="yearly" signedIn label="Start 7-day free trial" variant="secondary" />
          <PlanButton interval="monthly" signedIn label="Monthly, $14.99" variant="ghost" />
        </div>
        <p className="mt-3 text-xs text-white/84">Running Cadence on your own computer gives the same AI for free.</p>
      </Card>
    );
  }

  const fromAppStore = plus?.source === "app_store";
  return (
    <Card className="bg-hunter-green text-white">
      <p className="eyebrow text-sm text-yellow-green">Your plan</p>
      <h2 className="mt-2 text-2xl font-semibold">
        Cadence Plus{plus?.productId && PLAN_NAMES[plus.productId] ? `, ${PLAN_NAMES[plus.productId]}` : ""}
        {me?.trial ? " (trial)" : ""}
      </h2>
      <p className="mt-2 text-sm leading-7 text-white/80">
        {plus?.expiresAt
          ? plus.willRenew
            ? `Renews on ${dateFormat(plus.expiresAt)}.`
            : `Ends on ${dateFormat(plus.expiresAt)}. It will not renew.`
          : "Active."}{" "}
        {fromAppStore ? "Bought on iPhone." : "Billed by Stripe."}
      </p>
      <div className="mt-4">
        {fromAppStore ? (
          <p className="text-sm text-white/85">Manage or cancel it on your iPhone: Settings › your name › Subscriptions.</p>
        ) : (
          <PortalButton label="Manage or cancel" />
        )}
      </div>
    </Card>
  );
}

function NewsletterCard({ email, me }: { email: string | null; me: Me | null | undefined }) {
  const [override, setOn] = useState<boolean | null>(null);
  const on = override ?? (me === undefined ? null : (me?.newsletter ?? false));
  const [state, setState] = useState<"idle" | "busy" | "pending">("idle");
  const [error, setError] = useState<string | null>(null);
  const id = useId();

  async function toggle() {
    if (on === null || !email) return;
    setError(null);
    setState("busy");
    if (on) {
      const outcome = await unsubscribeFromNewsletter();
      setState("idle");
      if (outcome === "done") setOn(false);
      else if (outcome === "link") setError("To stop the newsletter, use the unsubscribe link at the bottom of any newsletter email.");
      else setError("Could not update that. Try again, or use the unsubscribe link in any email.");
      return;
    }
    const result = await subscribeToNewsletter(email, "account");
    if (result.ok) setState("pending");
    else {
      setState("idle");
      setError("Could not sign you up right now. Try again later.");
    }
  }

  return (
    <Card className="bg-white">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id={`${id}-t`} className="font-kicker text-xl text-hunter-green">Newsletter</h2>
          <p id={`${id}-d`} className="mt-1 text-sm leading-6 text-iron-grey">Product updates and occasional offers. A few emails a month at most.</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on === true}
          aria-labelledby={`${id}-t`}
          aria-describedby={`${id}-d`}
          disabled={on === null || state !== "idle" || !email}
          onClick={() => void toggle()}
          className={`relative h-8 w-14 shrink-0 cursor-pointer rounded-full transition-colors disabled:cursor-default disabled:opacity-60 ${on ? "bg-sage-green" : "bg-pale-slate"}`}
        >
          <span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-[left] on-color ${on ? "left-7" : "left-1"}`} />
        </button>
      </div>
      {state === "pending" ? <p role="status" className="mt-3 text-sm text-hunter-green">Check your email and click the link to confirm.</p> : null}
      {error ? <p role="alert" className="mt-3 text-sm text-blushed-brick">{error}</p> : null}
    </Card>
  );
}

function DataCard() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function download() {
    setBusy(true);
    setError(null);
    try {
      const response = await cloudFetch("/api/account/export");
      if (!response.ok) throw new Error();
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `cadence-data-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Could not prepare your data. Try again in a minute.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card className="bg-white">
      <h2 className="font-kicker text-xl text-hunter-green">Your data</h2>
      <p className="mt-1 text-sm leading-6 text-iron-grey">
        Download everything Cadence keeps for this account as one JSON file: profile, plan, progress and usage.
      </p>
      <Button variant="ghost" className="mt-4" onClick={() => void download()} disabled={busy}>
        {busy ? "Preparing…" : "Download my data"}
      </Button>
      {error ? <p role="alert" className="mt-2 text-sm text-blushed-brick">{error}</p> : null}
    </Card>
  );
}

function DeleteCard({ email }: { email: string | null }) {
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove(event: FormEvent) {
    event.preventDefault();
    if (!email || confirm.trim().toLowerCase() !== "delete") return;
    setBusy(true);
    setError(null);
    try {
      const auth = getFirebaseAuth();
      await auth.authStateReady();
      const user = auth.currentUser;
      if (!user) throw new Error("Sign in again, then delete.");
      // Deleting needs a recent sign-in: prove it with the password.
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(email, password));
      const token = await user.getIdToken(true);
      const response = await cloudFetch("/api/account", { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok && response.status !== 202) throw new Error("Could not delete the account. Nothing was removed; try again later.");
      await signOut(auth).catch(() => {});
      await fetch("/api/auth/session", { method: "DELETE" }).catch(() => {});
      router.replace("/?account=deleted");
      router.refresh();
    } catch (nextError) {
      setError(describeAuthError(nextError, "Could not delete the account."));
      setBusy(false);
    }
  }

  return (
    <Card className="bg-white">
      <h2 className="font-kicker text-xl text-hunter-green">Delete account</h2>
      <p className="mt-1 text-sm leading-6 text-iron-grey">
        Removes your account, progress and newsletter subscription, and ends any web subscription now. Download your
        data first if you want a copy. An iPhone subscription must also be cancelled in Settings.
      </p>
      {!open ? (
        <Button variant="danger" className="mt-4" onClick={() => setOpen(true)}>Delete my account</Button>
      ) : (
        <form className="mt-4 space-y-3" onSubmit={remove}>
          <div>
            <label htmlFor={`${id}-pw`} className="block pb-1 text-sm font-medium text-hunter-green">Password</label>
            <input id={`${id}-pw`} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required className="min-h-12 w-full rounded-full bg-vanilla-cream px-4 text-sm text-hunter-green ring-1 ring-alabaster-grey" />
          </div>
          <div>
            <label htmlFor={`${id}-c`} className="block pb-1 text-sm font-medium text-hunter-green">Type “delete” to confirm</label>
            <input id={`${id}-c`} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" required className="min-h-12 w-full rounded-full bg-vanilla-cream px-4 text-sm text-hunter-green ring-1 ring-alabaster-grey" />
          </div>
          {error ? <p role="alert" className="text-sm text-blushed-brick">{error}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="danger" disabled={busy || confirm.trim().toLowerCase() !== "delete" || !password}>
              {busy ? "Deleting…" : "Delete for good"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Keep my account</Button>
          </div>
        </form>
      )}
    </Card>
  );
}
