"use client";

import { useRouter } from "next/navigation";
import { startTransition, useMemo, useState } from "react";
import { ArrowRight, Cloud, Database } from "griddy-icons";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface SetupSelectionProps {
  runtime: "desktop" | "web";
  nextPath: string | null;
  currentMode: "local" | "cloud" | null;
  cloudAvailable: boolean;
  currentDisplayName: string | null;
}

export function SetupSelection({
  runtime,
  nextPath,
  currentMode,
  cloudAvailable,
  currentDisplayName,
}: SetupSelectionProps) {
  const router = useRouter();
  const [pendingMode, setPendingMode] = useState<"local" | "cloud" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const localTitle = useMemo(() => {
    return runtime === "desktop"
      ? "Use Cadence locally on this Mac"
      : "Use Cadence locally in this browser";
  }, [runtime]);

  async function handleModeSelection(mode: "local" | "cloud") {
    setPendingMode(mode);
    setError(null);

    try {
      const response = await fetch("/api/setup/mode", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mode,
          next: mode === "local" ? nextPath : undefined,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { redirectTo?: string; error?: string }
        | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? "Cadence could not save that setup choice.");
      }

      startTransition(() => {
        router.replace(payload?.redirectTo ?? (mode === "local" ? "/dashboard" : "/signup"));
        router.refresh();
      });
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Cadence could not save that setup choice.",
      );
    } finally {
      setPendingMode(null);
    }
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-2.5rem)] max-w-6xl items-center justify-center">
      <div className="grid w-full gap-4 lg:grid-cols-[0.96fr_1.04fr] xl:gap-5">
        <Card className="bg-hunter-green text-bright-snow">
          <div className="space-y-5">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-yellow-green">
              <span className="eyebrow text-sm">Setup</span>
            </div>

            <div className="space-y-3">
              <h1 className="text-3xl font-semibold text-bright-snow sm:text-4xl lg:text-5xl">
                Choose how this copy of Cadence should work.
              </h1>
              <p className="max-w-2xl text-base leading-7 text-bright-snow/78">
                Local mode keeps progress on this machine with no Supabase or billing.
                Cadence Cloud keeps the current hosted flow with sign-in, synced data,
                and Stripe-backed plans.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-3xl bg-white/10 px-4 py-4">
                <p className="eyebrow text-xs text-yellow-green/82">Open source</p>
                <p className="mt-2 text-base font-semibold text-bright-snow">
                  Local progress, local setup, no hosted account required.
                </p>
              </div>
              <div className="rounded-3xl bg-white/10 px-4 py-4">
                <p className="eyebrow text-xs text-yellow-green/82">Hosted</p>
                <p className="mt-2 text-base font-semibold text-bright-snow">
                  Sign in to keep using the paid cloud workflow.
                </p>
              </div>
            </div>

            {currentDisplayName ? (
              <div className="rounded-3xl bg-white/10 px-4 py-4 text-sm leading-7 text-bright-snow/82">
                Current workspace:{" "}
                <span className="font-semibold text-bright-snow">{currentDisplayName}</span>
                {currentMode ? ` in ${currentMode} mode.` : "."}
              </div>
            ) : null}
          </div>
        </Card>

        <div className="grid gap-4">
          <Card
            className={cn(
              "bg-white",
              currentMode === "local" ? "ring-2 ring-hunter-green" : "",
            )}
          >
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-vanilla-cream text-hunter-green">
                  <Database size={18} color="currentColor" />
                </span>
                <div className="space-y-1">
                  <p className="eyebrow text-xs text-sage-green">Local mode</p>
                  <h2 className="text-2xl font-semibold text-hunter-green">{localTitle}</h2>
                </div>
              </div>

              <p className="text-sm leading-7 text-iron-grey">
                Progress stays on this machine, and the open-source build avoids the
                hosted Supabase flow completely. This is the default path for local
                development and self-hosted use.
              </p>

              <div className="rounded-3xl bg-vanilla-cream px-4 py-4 text-sm leading-7 text-iron-grey">
                Best for contributors, local desktop use, and anyone who wants the
                app to keep its learning data on-device.
              </div>

              <Button
                onClick={() => void handleModeSelection("local")}
                disabled={pendingMode !== null}
              >
                {pendingMode === "local" ? "Saving local mode..." : "Continue locally"}
                <ArrowRight size={16} color="currentColor" />
              </Button>
            </div>
          </Card>

          <Card
            className={cn(
              "bg-white",
              currentMode === "cloud" ? "ring-2 ring-hunter-green" : "",
            )}
          >
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-vanilla-cream text-hunter-green">
                  <Cloud size={18} color="currentColor" />
                </span>
                <div className="space-y-1">
                  <p className="eyebrow text-xs text-sage-green">Cadence Cloud</p>
                  <h2 className="text-2xl font-semibold text-hunter-green">
                    Keep the hosted paid workflow
                  </h2>
                </div>
              </div>

              <p className="text-sm leading-7 text-iron-grey">
                Use the existing Supabase account flow and hosted billing path. This
                is the right option when you want synced progress, account-based
                access, and the current public deployment behaviour.
              </p>

              <div className="rounded-3xl bg-vanilla-cream px-4 py-4 text-sm leading-7 text-iron-grey">
                {cloudAvailable
                  ? "Cadence Cloud is available in this build."
                  : "Cadence Cloud is not configured in this local build yet, so the local mode path is the safe option right now."}
              </div>

              <Button
                onClick={() => void handleModeSelection("cloud")}
                disabled={pendingMode !== null || !cloudAvailable}
              >
                {pendingMode === "cloud" ? "Opening cloud setup..." : "Use Cadence Cloud"}
                <ArrowRight size={16} color="currentColor" />
              </Button>
            </div>
          </Card>

          {error ? (
            <div className="rounded-3xl bg-blushed-brick px-4 py-3 text-sm text-bright-snow">
              {error}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
