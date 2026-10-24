// FILE: src/components/billing/PlanButton.tsx
//
// No "use client": signed out it is a plain link rendered on the server, and
// signed in only BillingAction runs in the browser.
import { BillingAction } from "@/components/billing/BillingAction";
import type { PlanInterval } from "@/components/billing/billing-api";
import { Button, buttonVariants } from "@/components/ui/button";

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
  if (!signedIn) {
    return (
      <Button href={`/signup?next=${encodeURIComponent(`/checkout?plan=${interval}`)}`} variant={variant} className={className}>
        {label}
      </Button>
    );
  }
  return (
    <BillingAction
      action={{ kind: "checkout", interval }}
      label={label}
      busyLabel="Opening checkout…"
      className={buttonVariants({ variant, className })}
    />
  );
}

export function PortalButton({ className, label = "Manage subscription" }: { className?: string; label?: string }) {
  return <BillingAction action={{ kind: "portal" }} label={label} busyLabel="Opening…" className={buttonVariants({ variant: "ghost", className })} />;
}
