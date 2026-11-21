// FILE: src/components/account/AccountPanel.tsx
//
// The cloud account page: Plus status and its controls, Account › Email (a
// switch per email category, each on until turned off), download my data,
// delete account. Plus is read from GET /api/me;
// the page never decides entitlement itself.
"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useState, type FormEvent } from "react";
import { signOut } from "firebase/auth";
import { ConnectedApps } from "@/components/account/ConnectedApps";
import { PLAN_NAMES, readMe, type Me } from "@/components/account/me";
import { PlanButton, PortalButton } from "@/components/billing/PlanButton";
import { setAccountNewsletter } from "@/components/newsletter/newsletter-api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cloudFetch } from "@/hooks/cloud-fetch";
import { describeAuthError } from "@/lib/firebase/auth-errors";
import { SignInMethods } from "@/components/auth/SignInMethods";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { providerIds, reauthenticate } from "@/lib/firebase/providers";
import { EMAIL_PREF_KEYS, EMAIL_PREF_LABELS, readEmailPrefs, type EmailPrefKey } from "@/lib/platform/email-consent";
import { linkedMethods, methodLabel, type SignInMethod } from "@/lib/platform/sign-in-methods";

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
          <p role="status" className="rounded-[20px] bg-white px-5 py-4 text-sm font-semibold text-carbon-black">
            Thanks. Your payment went through; Plus turns on as soon as Stripe confirms it, usually within a minute.
          </p>
        ) : null}
        <PlusCard me={me} />
        <EmailCard me={me} />
      </div>
      <div className="flex flex-col gap-4">
        <SignInMethods />
        <ConnectedApps />
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
      <Card className="bg-white text-carbon-black">
        <p className="eyebrow text-sm text-slate-grey">Your plan</p>
        <h2 className="mt-2 text-2xl font-semibold">Free</h2>
        <p className="mt-2 text-sm leading-7 text-iron-grey">
          All practice is yours. Plus adds cloud AI: scoring, voices, transcription and the coach, wherever you are.
          {plus && !plus.active ? " Your earlier Plus has ended; your detailed history is kept for 90 days." : ""}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <PlanButton interval="yearly" signedIn label="Start 7-day free trial" />
          <PlanButton interval="monthly" signedIn label="Monthly, $14.99" variant="ghost" />
        </div>
        <p className="mt-3 text-xs text-iron-grey">Running Cadence on your own computer gives the same AI for free.</p>
      </Card>
    );
  }

  const fromAppStore = plus?.source === "app_store";
  const fromCode = plus?.source === "code";
  return (
    <Card className="bg-white text-carbon-black">
      <p className="eyebrow text-sm text-slate-grey">Your plan</p>
      <h2 className="mt-2 text-2xl font-semibold">
        Cadence Plus{plus?.productId && PLAN_NAMES[plus.productId] ? `, ${PLAN_NAMES[plus.productId]}` : ""}
        {me?.trial ? " (trial)" : ""}
      </h2>
      <p className="mt-2 text-sm leading-7 text-iron-grey">
        {plus?.expiresAt
          ? plus.willRenew
            ? `Renews on ${dateFormat(plus.expiresAt)}.`
            : `Ends on ${dateFormat(plus.expiresAt)}. It will not renew.`
          : "Active."}{" "}
        {fromCode ? "From a code: nothing is billed." : fromAppStore ? "Bought on iPhone." : "Billed by Stripe."}
      </p>
      <div className="mt-4">
        {fromCode ? null : fromAppStore ? (
          <p className="text-sm text-iron-grey">Manage or cancel it on your iPhone: Settings › your name › Subscriptions.</p>
        ) : (
          <PortalButton label="Manage or cancel" />
        )}
      </div>
    </Card>
  );
}

/**
 * Account › Email: one switch per category, each on unless turned off
 * (src/lib/platform/email-consent.ts). Tips and reminders are stored on the
 * account (PATCH /api/me); news and offers also update Brevo list 5
 * (POST /api/newsletter). Account and billing email cannot be turned off.
 */
function EmailCard({ me }: { me: Me | null | undefined }) {
  const [override, setOverride] = useState<Partial<Record<EmailPrefKey, boolean>>>({});
  const [busy, setBusy] = useState<EmailPrefKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loaded = me === undefined ? null : (me?.emailPrefs ?? readEmailPrefs(undefined));
  // Getting-started tips stop by themselves once Plus is on, so Plus accounts don't see that switch.
  const keys = EMAIL_PREF_KEYS.filter((key) => key !== "lifecycle" || !me?.isPlus);

  async function toggle(key: EmailPrefKey) {
    if (!loaded) return;
    const next = !(override[key] ?? loaded[key]);
    setError(null);
    setBusy(key);
    const ok =
      key === "newsletter"
        ? await setAccountNewsletter(next)
        : await cloudFetch("/api/me", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [key]: next }) })
            .then((response) => response.ok)
            .catch(() => false);
    setBusy(null);
    if (ok) setOverride((current) => ({ ...current, [key]: next }));
    else setError("Could not update that. Try again, or use the unsubscribe link in any email.");
  }

  return (
    <Card className="bg-white" id="email">
      <h2 className="font-kicker text-xl text-carbon-black">Email</h2>
      <p className="mt-1 text-sm leading-6 text-iron-grey">Account, security and billing email always arrives. Everything else is up to you.</p>
      <ul className="mt-4 flex flex-col gap-4">
        {keys.map((key) => (
          <EmailSwitch key={key} prefKey={key} on={loaded ? (override[key] ?? loaded[key]) : null} busy={busy !== null} onToggle={() => void toggle(key)} />
        ))}
      </ul>
      {error ? <p role="alert" className="mt-3 text-sm text-blushed-brick">{error}</p> : null}
    </Card>
  );
}

function EmailSwitch({ prefKey, on, busy, onToggle }: { prefKey: EmailPrefKey; on: boolean | null; busy: boolean; onToggle: () => void }) {
  const id = useId();
  const label = EMAIL_PREF_LABELS[prefKey];
  return (
    <li className="flex items-start justify-between gap-4">
      <div>
        <h3 id={`${id}-t`} className="font-semibold text-carbon-black">{label.title}</h3>
        <p id={`${id}-d`} className="mt-0.5 text-sm leading-6 text-iron-grey">{label.detail}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on === true}
        aria-labelledby={`${id}-t`}
        aria-describedby={`${id}-d`}
        disabled={on === null || busy}
        onClick={onToggle}
        className={`relative h-8 w-14 shrink-0 cursor-pointer rounded-full transition-colors disabled:cursor-default disabled:opacity-60 ${on ? "bg-sage-green" : "bg-pale-slate"}`}
      >
        <span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-[left] on-color ${on ? "left-7" : "left-1"}`} />
      </button>
    </li>
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
      <h2 className="font-kicker text-xl text-carbon-black">Your data</h2>
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
  // Deleting needs a recent sign-in: the password when the account has one,
  // otherwise Google or Apple again.
  const [confirmWith, setConfirmWith] = useState<SignInMethod>("password");
  useEffect(() => {
    const auth = getFirebaseAuth();
    void auth.authStateReady().then(() => {
      const methods = auth.currentUser ? linkedMethods(providerIds(auth.currentUser)) : [];
      setConfirmWith(methods.includes("password") ? "password" : (methods[0] ?? "password"));
    });
  }, []);

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
      if (!(await reauthenticate(confirmWith, password))) {
        setBusy(false);
        return;
      }
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
      <h2 className="font-kicker text-xl text-carbon-black">Delete account</h2>
      <p className="mt-1 text-sm leading-6 text-iron-grey">
        Removes your account, progress and newsletter subscription, and ends any web subscription now. Download your
        data first if you want a copy. An iPhone subscription must also be cancelled in Settings.
      </p>
      {!open ? (
        <Button variant="danger" className="mt-4" onClick={() => setOpen(true)}>Delete my account</Button>
      ) : (
        <form className="mt-4 space-y-3" onSubmit={remove}>
          {confirmWith === "password" ? (
            <div>
              <label htmlFor={`${id}-pw`} className="block pb-1 text-sm font-medium text-carbon-black">Password</label>
              <input id={`${id}-pw`} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required className="min-h-12 w-full rounded-[14px] bg-page px-4 text-sm text-carbon-black" />
            </div>
          ) : (
            <p className="text-sm text-iron-grey">You&apos;ll confirm with {methodLabel(confirmWith)} first.</p>
          )}
          <div>
            <label htmlFor={`${id}-c`} className="block pb-1 text-sm font-medium text-carbon-black">Type “delete” to confirm</label>
            <input id={`${id}-c`} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" required className="min-h-12 w-full rounded-[14px] bg-page px-4 text-sm text-carbon-black" />
          </div>
          {error ? <p role="alert" className="text-sm text-blushed-brick">{error}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="danger" disabled={busy || confirm.trim().toLowerCase() !== "delete" || (confirmWith === "password" && !password)}>
              {busy ? "Deleting…" : "Delete for good"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Keep my account</Button>
          </div>
        </form>
      )}
    </Card>
  );
}
