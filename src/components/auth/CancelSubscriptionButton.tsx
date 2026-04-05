// FILE: src/components/auth/CancelSubscriptionButton.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

interface Props {
  isCanceling: boolean;
  cancelAt: string | null;
}

export function CancelSubscriptionButton({ isCanceling, cancelAt }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cancelAtFormatted = cancelAt
    ? new Date(cancelAt).toLocaleDateString("en-US", {
        month: "long", day: "numeric", year: "numeric",
      })
    : null;

  async function handleAction(action: "cancel" | "resume") {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const body = await res.json() as { error?: string };
        throw new Error(body.error ?? "Something went wrong");
      }
      setConfirm(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  if (isCanceling) {
    return (
      <div className="space-y-3">
        <div className="rounded-3xl bg-blushed-brick/10 px-5 py-4">
          <p className="text-sm font-semibold text-blushed-brick">
            Cancellation scheduled
          </p>
          <p className="mt-1 text-sm text-iron-grey">
            You keep full access until{" "}
            <span className="font-semibold text-hunter-green">{cancelAtFormatted}</span>.
            No further charges.
          </p>
        </div>
        {error && (
          <p className="text-sm text-blushed-brick">{error}</p>
        )}
        <Button
          variant="secondary"
          onClick={() => void handleAction("resume")}
          disabled={loading}
        >
          {loading ? "Resuming..." : "Resume subscription"}
        </Button>
      </div>
    );
  }

  if (confirm) {
    return (
      <div className="space-y-3">
        <div className="rounded-3xl bg-vanilla-cream px-5 py-4">
          <p className="text-sm font-semibold text-hunter-green">Are you sure?</p>
          <p className="mt-1 text-sm text-iron-grey">
            Your access continues until the end of the billing period. You can
            resume at any time before then.
          </p>
        </div>
        {error && (
          <p className="text-sm text-blushed-brick">{error}</p>
        )}
        <div className="flex gap-3">
          <Button
            onClick={() => void handleAction("cancel")}
            disabled={loading}
            className="bg-blushed-brick text-bright-snow hover:bg-blushed-brick/90"
          >
            {loading ? "Canceling..." : "Yes, cancel"}
          </Button>
          <Button variant="secondary" onClick={() => setConfirm(false)} disabled={loading}>
            Keep subscription
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {error && <p className="text-sm text-blushed-brick">{error}</p>}
      <button
        className="text-sm font-semibold text-iron-grey transition-colors hover:text-blushed-brick"
        onClick={() => setConfirm(true)}
      >
        Cancel subscription
      </button>
    </div>
  );
}
