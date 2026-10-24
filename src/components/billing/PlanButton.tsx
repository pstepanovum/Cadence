// FILE: src/components/billing/PlanButton.tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { openPortal, startCheckout, type PlanInterval } from "@/components/billing/billing-api";
import { Button } from "@/components/ui/button";

export function PlanButton({
  interval,
  signedIn,
  label,
  variant = "primary",
  className,
}: {
  interval: PlanInterval;
  signedIn: boolean;
  label: string;
  variant?: "primary" | "secondary" | "ghost";
  className?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!signedIn) {
    return (
      <Button href={`/signup?next=${encodeURIComponent(`/checkout?plan=${interval}`)}`} variant={variant} className={className}>
        {label}
      </Button>
    );
  }

  async function go() {
    setBusy(true);
    setError(null);
    const outcome = await startCheckout(interval);
    if (outcome.ok) {
      window.location.assign(outcome.url);
      return;
    }
    setBusy(false);
    if (outcome.reason === "already_plus") router.push("/account");
    else if (outcome.reason === "sign_in") router.push(`/login?next=${encodeURIComponent("/pricing")}`);
    else setError(outcome.message);
  }

  return (
    <div className="space-y-2">
      <Button onClick={() => void go()} disabled={busy} variant={variant} className={className}>
        {busy ? "Opening checkout…" : label}
      </Button>
      {error ? <p role="alert" className="text-sm text-blushed-brick">{error}</p> : null}
    </div>
  );
}

export function PortalButton({ className, label = "Manage subscription" }: { className?: string; label?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function go() {
    setBusy(true);
    setError(null);
    const outcome = await openPortal();
    if (outcome.ok) {
      window.location.assign(outcome.url);
      return;
    }
    setBusy(false);
    setError(outcome.message);
  }
  return (
    <div className="space-y-2">
      <Button variant="ghost" onClick={() => void go()} disabled={busy} className={className}>
        {busy ? "Opening…" : label}
      </Button>
      {error ? <p role="alert" className="text-sm text-blushed-brick">{error}</p> : null}
    </div>
  );
}
