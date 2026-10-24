// FILE: src/components/billing/CheckoutRedirect.tsx
//
// /checkout?plan=monthly|yearly: where sign-up sends someone who chose a plan
// first. Starts Stripe Checkout and leaves; on a problem, says so and offers
// the pricing page.
"use client";

import { useEffect, useRef, useState } from "react";
import { startCheckout, type PlanInterval } from "@/components/billing/billing-api";
import { Button } from "@/components/ui/button";

export function CheckoutRedirect({ interval }: { interval: PlanInterval }) {
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void startCheckout(interval).then((outcome) => {
      if (outcome.ok) window.location.assign(outcome.url);
      else if (outcome.reason === "already_plus") window.location.assign("/account");
      else setError(outcome.message);
    });
  }, [interval]);

  return (
    <section className="mx-auto w-full max-w-lg space-y-4 rounded-3xl bg-white px-6 py-10 text-center" aria-live="polite">
      <h1 className="font-kicker text-2xl text-hunter-green">{error ? "Checkout did not open" : "Opening secure checkout…"}</h1>
      {error ? (
        <>
          <p className="text-sm text-iron-grey">{error}</p>
          <Button href="/pricing">Back to pricing</Button>
        </>
      ) : (
        <p className="text-sm text-iron-grey">Payment is handled by Stripe. You will come back to your account afterwards.</p>
      )}
    </section>
  );
}
