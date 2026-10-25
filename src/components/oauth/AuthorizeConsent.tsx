// FILE: src/components/oauth/AuthorizeConsent.tsx
//
// The consent screen for the MCP connector. It signs the learner in with
// Firebase if needed, asks GET /api/oauth/authorize what is being requested
// (sending the ID token as a Bearer header, never a cookie), shows where the
// code will go first, then the app's name and the permissions, and posts the
// decision as JSON. The server answers {redirect}, which the page follows.
"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { isFirebaseConfigured } from "@/lib/firebase/config";

type ScopeOption = { scope: string; description: string };

type Request = {
  client: { id: string; name: string };
  destination: string;
  loopback: boolean;
  resourceName: string;
  requestedScopes: string[];
  availableScopes: ScopeOption[];
  account: { email: string | null; name: string | null };
};

type State =
  | { kind: "loading" }
  | { kind: "sign-in" }
  | { kind: "error"; message: string }
  | { kind: "ready"; request: Request }
  | { kind: "leaving" };

const READ_SCOPE = "cadence:read";

const SCOPE_LABELS: Record<string, string> = {
  "cadence:read": "See your progress",
  "cadence:write": "Add flashcards and log practice",
};

async function idToken(): Promise<string | null> {
  const auth = getFirebaseAuth();
  await auth.authStateReady();
  return auth.currentUser ? auth.currentUser.getIdToken() : null;
}

function errorText(body: unknown, fallback: string) {
  const description = (body as { error_description?: unknown } | null)?.error_description;
  return typeof description === "string" && description ? description : fallback;
}

/** What the page should show next: the request, a sign-in form, an error, or nothing while it leaves. */
async function describeRequest(): Promise<State> {
  const token = await idToken().catch(() => null);
  if (!token) return { kind: "sign-in" };
  const response = await fetch(`/api/oauth/authorize${window.location.search}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  }).catch(() => null);
  if (!response) return { kind: "error", message: "Cadence can't be reached. Check your connection and try again." };
  const body = (await response.json().catch(() => null)) as (Request & { redirect?: string }) | null;
  if (body?.redirect) {
    window.location.assign(body.redirect);
    return { kind: "leaving" };
  }
  if (response.status === 401) return { kind: "sign-in" };
  if (!response.ok || !body) return { kind: "error", message: errorText(body, "This request can't be approved.") };
  return { kind: "ready", request: body };
}

export function AuthorizeConsent() {
  const [state, setState] = useState<State>(() =>
    isFirebaseConfigured ? { kind: "loading" } : { kind: "error", message: "Connecting apps needs a Cadence account, and this server has none set up." },
  );
  const [granted, setGranted] = useState<string[]>([READ_SCOPE]);
  const [submitting, setSubmitting] = useState(false);

  const apply = useCallback((next: State) => {
    if (next.kind === "ready") setGranted(Array.from(new Set([READ_SCOPE, ...next.request.requestedScopes])));
    setState(next);
  }, []);

  useEffect(() => {
    if (isFirebaseConfigured) void describeRequest().then(apply);
  }, [apply]);

  async function decide(decision: "allow" | "deny") {
    setSubmitting(true);
    const token = await idToken().catch(() => null);
    if (!token) {
      setSubmitting(false);
      setState({ kind: "sign-in" });
      return;
    }
    const params = Object.fromEntries(new URLSearchParams(window.location.search));
    const response = await fetch("/api/oauth/authorize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...params, decision, scope: granted.join(" "), id_token: token }),
    }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as { redirect?: string } | null;
    if (body?.redirect) {
      setState({ kind: "leaving" });
      window.location.assign(body.redirect);
      return;
    }
    setSubmitting(false);
    setState({ kind: "error", message: errorText(body, "That didn't go through. Try again from the app.") });
  }

  return (
    <section className="rounded-[28px] bg-white p-6 shadow-[0_18px_40px_rgba(19,49,40,0.08)] sm:p-8" aria-live="polite">
      <p className="eyebrow text-xs text-slate-grey">Cadence connector</p>
      {state.kind === "loading" || state.kind === "leaving" ? (
        <p className="mt-4 text-sm text-iron-grey">{state.kind === "leaving" ? "Sending you back to the app…" : "Loading…"}</p>
      ) : null}
      {state.kind === "error" ? (
        <>
          <h1 className="mt-3 text-2xl font-semibold text-carbon-black">Can&apos;t connect</h1>
          <p className="mt-3 text-sm leading-6 text-iron-grey" role="alert">
            {state.message}
          </p>
        </>
      ) : null}
      {state.kind === "sign-in" ? (
        <SignIn
          onSignedIn={() => {
            setState({ kind: "loading" });
            void describeRequest().then(apply);
          }}
        />
      ) : null}
      {state.kind === "ready" ? (
        <Consent
          request={state.request}
          granted={granted}
          submitting={submitting}
          onToggle={(scope) =>
            setGranted((current) => (current.includes(scope) ? current.filter((item) => item !== scope) : [...current, scope]))
          }
          onDecide={decide}
        />
      ) : null}
    </section>
  );
}

function Consent({
  request,
  granted,
  submitting,
  onToggle,
  onDecide,
}: {
  request: Request;
  granted: string[];
  submitting: boolean;
  onToggle: (scope: string) => void;
  onDecide: (decision: "allow" | "deny") => void;
}) {
  return (
    <>
      <h1 className="mt-3 text-2xl font-semibold text-carbon-black">Connect an app to Cadence?</h1>
      <div className="mt-5 rounded-[20px] bg-page px-4 py-4" data-testid="oauth-destination">
        <p className="text-xs font-semibold uppercase tracking-wide text-iron-grey">Access goes to</p>
        <p className="mt-1 break-all text-lg font-semibold text-carbon-black">{request.destination}</p>
        <p className="mt-1 text-xs leading-5 text-iron-grey">
          {request.loopback
            ? "An app on this computer."
            : "Only approve if you started this from an app you trust on that site."}
        </p>
      </div>
      <p className="mt-5 text-sm leading-6 text-iron-grey">
        <span className="font-semibold text-carbon-black">{request.client.name}</span> wants to use your Cadence account
        {request.account.email ? (
          <>
            {" "}
            (<span className="break-all">{request.account.email}</span>)
          </>
        ) : null}
        .
      </p>
      <fieldset className="mt-5 space-y-3">
        <legend className="text-sm font-semibold text-carbon-black">It may</legend>
        {request.availableScopes.map((option) => {
          const fixed = option.scope === READ_SCOPE;
          const id = `scope-${option.scope.replace(/[^a-z]/g, "-")}`;
          return (
            <label key={option.scope} htmlFor={id} className="flex cursor-pointer items-start gap-3 rounded-[20px] bg-page px-4 py-3">
              <input
                id={id}
                type="checkbox"
                className="mt-1 h-4 w-4 shrink-0 accent-[var(--sage-green)]"
                checked={granted.includes(option.scope)}
                disabled={fixed || submitting}
                onChange={() => onToggle(option.scope)}
              />
              <span>
                <span className="block text-sm font-semibold text-carbon-black">{SCOPE_LABELS[option.scope] ?? option.scope}</span>
                <span className="block text-xs leading-5 text-iron-grey">{option.description}</span>
              </span>
            </label>
          );
        })}
      </fieldset>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row-reverse">
        <Button className="w-full sm:flex-1" onClick={() => onDecide("allow")} disabled={submitting}>
          Allow
        </Button>
        <Button className="w-full sm:flex-1" variant="ghost" onClick={() => onDecide("deny")} disabled={submitting}>
          Deny
        </Button>
      </div>
      <p className="mt-4 text-xs leading-5 text-slate-grey">You can disconnect it any time from your account page.</p>
    </>
  );
}

function SignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signInWithEmailAndPassword(getFirebaseAuth(), email.trim(), password);
      onSignedIn();
    } catch {
      setError("That email and password don't match a Cadence account.");
      setBusy(false);
    }
  }

  return (
    <>
      <h1 className="mt-3 text-2xl font-semibold text-carbon-black">Sign in to continue</h1>
      <p className="mt-2 text-sm leading-6 text-iron-grey">An app wants to connect to your Cadence account.</p>
      <form className="mt-5 space-y-4" onSubmit={submit} noValidate>
        <label className="block text-sm font-semibold text-carbon-black" htmlFor="oauth-email">
          Email
        </label>
        <Input id="oauth-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="" required />
        <label className="block text-sm font-semibold text-carbon-black" htmlFor="oauth-password">
          Password
        </label>
        <Input id="oauth-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="" required />
        {error ? (
          <p className="text-sm text-blushed-brick" role="alert">
            {error}
          </p>
        ) : null}
        <Button className="w-full" type="submit" disabled={busy || !email || !password}>
          {busy ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </>
  );
}
