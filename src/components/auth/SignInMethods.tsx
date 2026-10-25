// FILE: src/components/auth/SignInMethods.tsx
//
// Account > Sign-in methods: the ways into this account (Apple, Google, email
// and password), adding one, removing one (never the last), and changing or
// adding the password. The phone has the same screen (Settings > Sign-in
// methods); both follow src/lib/platform/sign-in-methods.ts.
"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import type { User } from "firebase/auth";
import { AUTH_INPUT_CLASS } from "@/components/auth/AuthCard";
import { AppleLogo, GoogleG } from "@/components/auth/ProviderButtons";
import { isPasswordAcceptable } from "@/components/auth/password-rules";
import { PasswordChecklist } from "@/components/auth/PasswordChecklist";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { describeAuthError } from "@/lib/firebase/auth-errors";
import { startServerSession } from "@/lib/firebase/client";
import {
  WEB_PROVIDERS,
  addPassword,
  changePassword,
  completeRedirect,
  linkProvider,
  providerIds,
  removeMethod,
  signInWithEmail,
  signedInUser,
  type ProviderMethod,
} from "@/lib/firebase/providers";
import { canRemoveMethod, methodLabel, type SignInMethod } from "@/lib/platform/sign-in-methods";

type Note = { tone: "success" | "error"; text: string } | null;

function Icon({ method }: { method: SignInMethod }) {
  if (method === "google.com") return <GoogleG />;
  if (method === "apple.com") return <AppleLogo className="h-[18px] w-[18px] text-carbon-black" />;
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-[18px] w-[18px] text-carbon-black" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="7.5" cy="15.5" r="5.5" />
      <path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3" />
    </svg>
  );
}

export function SignInMethods() {
  const id = useId();
  const [user, setUser] = useState<User | null>(null);
  const [providers, setProviders] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<Note>(null);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");

  const refresh = async () => {
    const signedIn = await signedInUser();
    if (!signedIn) return;
    await signedIn.reload().catch(() => {});
    setUser(signedIn);
    setProviders(providerIds(signedIn));
  };

  useEffect(() => {
    void (async () => {
      // Adding Google or Apple by redirect (Safari, phones) returns here.
      try {
        const outcome = await completeRedirect();
        if (outcome?.kind === "link" && outcome.status === "signed-in") setNote({ tone: "success", text: "Sign-in method added." });
      } catch (error) {
        setNote({ tone: "error", text: describeAuthError(error, "That sign-in method couldn't be added.") });
      }
      await refresh();
    })();
  }, []);

  async function run(key: string, task: () => Promise<string | null>) {
    if (busy) return;
    setBusy(key);
    setNote(null);
    try {
      const done = await task();
      if (done) setNote({ tone: "success", text: done });
      await refresh();
    } catch (error) {
      setNote({ tone: "error", text: describeAuthError(error, "That didn't work. Try again.") });
    } finally {
      setBusy(null);
    }
  }

  const hasPassword = providers.includes("password");
  const shown: SignInMethod[] = ["apple.com", "google.com", "password"].filter(
    (method) => method === "password" || providers.includes(method) || WEB_PROVIDERS.includes(method as ProviderMethod),
  ) as SignInMethod[];

  async function savePassword(event: FormEvent) {
    event.preventDefault();
    await run("password", async () => {
      if (!isPasswordAcceptable(next, user?.email ?? "")) throw new Error("Choose a password that meets every rule below.");
      if (hasPassword) await changePassword(current, next);
      else await addPassword(next);
      // A new password signs every session out, this browser's server session
      // included. Signing in again with it gives a fresh token to trade for
      // a new session cookie.
      if (user?.email) await startServerSession(await signInWithEmail(user.email, next));
      setCurrent("");
      setNext("");
      return hasPassword ? "Password changed." : "Password added.";
    });
  }

  if (!user) return null;

  return (
    <Card className="bg-white">
      <h2 className="font-kicker text-xl text-hunter-green">Sign-in methods</h2>
      <p className="mt-1 text-sm leading-6 text-iron-grey">Ways to sign in to {user.email ?? "this account"}. Keep at least one.</p>

      <ul className="mt-4 space-y-2">
        {shown.map((method) => {
          const linked = providers.includes(method);
          const removable = linked && canRemoveMethod(providers, method);
          return (
            <li key={method} className="flex min-h-16 items-center gap-3 rounded-[14px] bg-platinum px-4 py-3" data-testid={`method-${method}`}>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] bg-alabaster-grey">
                <Icon method={method} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-carbon-black">{methodLabel(method)}</span>
                <span className="block text-xs text-slate-grey">{linked ? (removable ? "Connected" : "Connected · your only way in") : "Not added"}</span>
              </span>
              {linked && removable ? (
                <Button
                  variant="ghost"
                  className="min-h-10 rounded-[12px] bg-alabaster-grey px-4"
                  disabled={busy !== null}
                  onClick={() => {
                    if (!window.confirm(`Remove ${methodLabel(method)}? You won't be able to sign in this way any more.`)) return;
                    void run(method, async () => (await removeMethod(method), `${methodLabel(method)} removed.`));
                  }}
                >
                  {busy === method ? "Removing…" : "Remove"}
                </Button>
              ) : null}
              {!linked && method !== "password" ? (
                <Button
                  className="min-h-10 rounded-[12px] px-4"
                  disabled={busy !== null}
                  onClick={() =>
                    void run(method, async () => {
                      const result = await linkProvider(method as ProviderMethod);
                      return result === "linked" ? `${methodLabel(method)} added. You can sign in with it now.` : null;
                    })
                  }
                >
                  {busy === method ? "Adding…" : "Add"}
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>

      {user.email ? (
        <form className="mt-5 space-y-3" onSubmit={savePassword} noValidate>
          <h3 className="text-sm font-semibold text-carbon-black">{hasPassword ? "Change password" : "Add a password"}</h3>
          {hasPassword ? (
            <div>
              <label htmlFor={`${id}-current`} className="block pb-1.5 text-sm font-medium text-gunmetal">Current password</label>
              <input id={`${id}-current`} type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} className={`w-full px-4 ${AUTH_INPUT_CLASS}`} />
            </div>
          ) : null}
          <div>
            <label htmlFor={`${id}-next`} className="block pb-1.5 text-sm font-medium text-gunmetal">New password</label>
            <input id={`${id}-next`} type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} aria-describedby={`${id}-rules`} className={`w-full px-4 ${AUTH_INPUT_CLASS}`} />
            <PasswordChecklist id={`${id}-rules`} password={next} email={user.email} />
          </div>
          <Button type="submit" disabled={busy !== null || !next || (hasPassword && !current)}>
            {busy === "password" ? "Saving…" : hasPassword ? "Change password" : "Add password"}
          </Button>
        </form>
      ) : null}

      {note ? (
        <p role={note.tone === "error" ? "alert" : "status"} className={`mt-4 rounded-2xl px-4 py-3 text-sm ${note.tone === "error" ? "bg-blushed-brick text-white" : "bg-yellow-green text-hunter-green"}`}>
          {note.text}
        </p>
      ) : null}
    </Card>
  );
}
