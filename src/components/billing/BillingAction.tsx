// FILE: src/components/billing/BillingAction.tsx
//
// The clickable part of PlanButton and PortalButton: opens Stripe Checkout or
// the Customer Portal. The button's classes come from the caller, so this
// island does not need the class-merging helper on the client.
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { PlanInterval } from "@/components/billing/billing-api";

export function BillingAction({
  action,
  label,
  busyLabel,
  className,
}: {
  action: { kind: "checkout"; interval: PlanInterval } | { kind: "portal" };
  label: string;
  busyLabel: string;
  className: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setBusy(true);
    setError(null);
    const { openPortal, startCheckout } = await import("@/components/billing/billing-api");
    const outcome = action.kind === "checkout" ? await startCheckout(action.interval) : await openPortal();
    if (outcome.ok) {
      window.location.assign(outcome.url);
      return;
    }
    setBusy(false);
    if (action.kind === "checkout" && outcome.reason === "already_plus") router.push("/account");
    else if (action.kind === "checkout" && outcome.reason === "sign_in") router.push(`/login?next=${encodeURIComponent("/pricing")}`);
    else setError(outcome.message);
  }

  return (
    <div className="space-y-2">
      <button type="button" onClick={() => void go()} disabled={busy} className={className}>
        {busy ? busyLabel : label}
      </button>
      {error ? <p role="alert" className="text-sm text-blushed-brick">{error}</p> : null}
    </div>
  );
}
