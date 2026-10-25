// FILE: src/components/redeem/RedeemPanel.tsx
//
// Redeem a friend code, on the website only: the iPhone app never shows or
// takes codes. The grant is kept on the server as one more Plus source, so it
// reaches the app and the desktop on its own once they refresh the account.
//
// A code from a share link is looked up first (GET, which redeems nothing) so
// the page can say what it gives before anyone presses the button. Signing in
// is required: the grant belongs to an account, not to the code.
"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { Button } from "@/components/ui/button";
import { cloudFetch } from "@/hooks/cloud-fetch";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { isFirebaseConfigured } from "@/lib/firebase/config";

const MAX_CODE_LENGTH = 40;

type Account = { email: string | null } | null | undefined;
type Done = { duration: string | null; expiresAt: number | null };

const dateFormat = (ms: number) => new Date(ms).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

async function readBody(response: Response) {
  return (await response.json().catch(() => ({}))) as { duration?: string; expiresAt?: number | null; error?: string; message?: string };
}

function refusal(body: Awaited<ReturnType<typeof readBody>>): string {
  if (body.error === "rate_limited") return "Too many tries. Try again in an hour.";
  if (body.error === "login_required") return "Sign in again to redeem a code.";
  return body.message ?? "That didn't work. Try again in a moment.";
}

export function RedeemPanel({ initialCode }: { initialCode: string }) {
  const id = useId();
  const initial = initialCode.slice(0, MAX_CODE_LENGTH);
  const [account, setAccount] = useState<Account>(undefined);
  const [code, setCode] = useState(initial);
  const [offer, setOffer] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setAccount(null);
      return;
    }
    return onAuthStateChanged(getFirebaseAuth(), (user) => setAccount(user ? { email: user.email } : null));
  }, []);

  // One lookup for the code in the link, once signed in. A typed code is not
  // looked up: pressing Redeem says the same, and every call is one of the
  // hourly tries.
  useEffect(() => {
    if (!account || !initial || done) return;
    let live = true;
    void (async () => {
      try {
        const response = await cloudFetch(`/api/codes/redeem?code=${encodeURIComponent(initial)}`, { appCheck: false });
        const body = await readBody(response);
        if (!live) return;
        if (response.ok && body.duration) setOffer(body.duration);
        else if (!response.ok) setMessage(refusal(body));
      } catch {
        // No lookup is no loss: Redeem still reports the outcome.
      }
    })();
    return () => {
      live = false;
    };
  }, [account, initial, done]);

  async function redeem(event: FormEvent) {
    event.preventDefault();
    const trimmed = code.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await cloudFetch("/api/codes/redeem", { method: "POST", json: { code: trimmed }, appCheck: false });
      const body = await readBody(response);
      if (response.ok) setDone({ duration: body.duration ?? null, expiresAt: typeof body.expiresAt === "number" ? body.expiresAt : null });
      else setMessage(refusal(body));
    } catch {
      setMessage("You seem to be offline. Try again when you're connected.");
    } finally {
      setBusy(false);
    }
  }

  if (!isFirebaseConfigured) {
    return (
      <div className="rounded-3xl bg-white px-6 py-6">
        <p className="text-sm leading-7 text-iron-grey">Codes are redeemed on cadence.pstepanov.dev/redeem, signed in to your Cadence account.</p>
      </div>
    );
  }

  if (account === undefined) return <div className="h-40 rounded-3xl bg-white" aria-busy="true" />;

  if (done) {
    return (
      <div role="status" className="rounded-3xl bg-hunter-green px-6 py-6 text-white">
        <p className="eyebrow text-sm text-yellow-green">Plus is on</p>
        <p className="mt-2 text-2xl font-semibold">
          {done.expiresAt ? `Cadence Plus${done.duration ? ` for ${done.duration}` : ""}, until ${dateFormat(done.expiresAt)}.` : "Cadence Plus is on."}
        </p>
        <p className="mt-2 text-sm leading-7 text-white/85">
          It ends by itself; nothing renews and nothing is charged. Sign in as {account?.email ?? "this account"} on any device to use it.
        </p>
        <Button href="/dashboard" variant="secondary" className="mt-4">Start practising</Button>
      </div>
    );
  }

  if (!account) {
    const next = initial ? `/redeem?code=${encodeURIComponent(initial)}` : "/redeem";
    return (
      <div className="rounded-3xl bg-white px-6 py-6">
        <p className="text-sm leading-7 text-iron-grey">Sign in first. The code turns Plus on for the account you sign in with.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button href={`/login?next=${encodeURIComponent(next)}`}>Sign in</Button>
          <Button href={`/signup?next=${encodeURIComponent(next)}`} variant="ghost">Create an account</Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={redeem} className="space-y-4 rounded-3xl bg-white px-6 py-6" noValidate>
      {offer ? (
        <div className="rounded-2xl bg-hunter-green px-5 py-4 text-white">
          <p className="eyebrow text-xs text-yellow-green">This code gives</p>
          <p className="mt-1 text-xl font-semibold">Cadence Plus for {offer}</p>
          <p className="mt-1 text-xs text-white/85">Free, with no card. It ends by itself.</p>
        </div>
      ) : null}
      <div>
        <label htmlFor={`${id}-code`} className="block pb-1 text-sm font-semibold text-hunter-green">Code</label>
        <input
          id={`${id}-code`}
          value={code}
          onChange={(event) => {
            setCode(event.target.value.slice(0, MAX_CODE_LENGTH));
            setMessage(null);
          }}
          placeholder="CADENCE-XXXX-XXXX"
          autoCapitalize="characters"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          className="min-h-12 w-full rounded-2xl bg-platinum px-4 py-3 font-mono text-sm uppercase text-carbon-black placeholder:text-slate-grey"
        />
      </div>
      <Button type="submit" disabled={busy || !code.trim()} className="w-full sm:w-auto">
        {busy ? "Redeeming…" : offer ? `Turn on Plus for ${offer}` : "Redeem"}
      </Button>
      <p className={message ? "text-sm text-blushed-brick" : "text-xs text-slate-grey"} role={message ? "alert" : undefined}>
        {message ?? `Signed in as ${account.email ?? "your account"}.`}
      </p>
    </form>
  );
}
