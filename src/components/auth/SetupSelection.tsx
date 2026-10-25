// FILE: src/components/auth/SetupSelection.tsx
//
// Local or cloud: two flat rows that turn primary green when chosen, and one
// Continue button, on the same neutral column as the account screens.
"use client";

import { useRouter } from "next/navigation";
import { startTransition, useMemo, useState } from "react";
import { ArrowRight, Check, Cloud, Database } from "griddy-icons";
import { Button } from "@/components/ui/button";
import { AuthCard, AuthNotice } from "@/components/auth/AuthCard";
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
  const [chosen, setChosen] = useState<"local" | "cloud">(
    currentMode === "cloud" && cloudAvailable ? "cloud" : "local",
  );

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

  const options = [
    {
      mode: "local" as const,
      icon: Database,
      title: localTitle,
      body: "Progress stays on this device. No account, no billing.",
    },
    ...(cloudAvailable
      ? [
          {
            mode: "cloud" as const,
            icon: Cloud,
            title: "Use Cadence Cloud",
            body: "Sign in to sync progress across devices.",
          },
        ]
      : []),
  ];

  return (
    <div className="flex min-h-[calc(100dvh-2.5rem)] flex-col items-center justify-center">
      <AuthCard
        title="Choose your setup"
        description={
          currentDisplayName
            ? `Signed in as ${currentDisplayName}${currentMode ? ` in ${currentMode} mode` : ""}.`
            : "You can change this later."
        }
      >
        <div role="radiogroup" aria-label="Setup" className="space-y-2.5">
          {options.map((option) => {
            const selected = chosen === option.mode;
            const Icon = option.icon;
            return (
              <button
                key={option.mode}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setChosen(option.mode)}
                disabled={pendingMode !== null}
                className={cn(
                  "flex w-full cursor-pointer items-center gap-3.5 rounded-[20px] px-4 py-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hunter-green disabled:cursor-not-allowed",
                  selected ? "bg-hunter-green text-bright-snow" : "bg-platinum text-carbon-black hover:bg-alabaster-grey",
                )}
              >
                <Icon size={20} color="currentColor" className="shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-semibold">{option.title}</span>
                  <span className={cn("mt-0.5 block text-sm leading-6", selected ? "text-bright-snow/90" : "text-iron-grey")}>
                    {option.body}
                  </span>
                </span>
                {selected ? <Check size={20} color="currentColor" className="shrink-0" /> : null}
              </button>
            );
          })}
        </div>

        {error ? <AuthNotice tone="error">{error}</AuthNotice> : null}

        <Button
          className="min-h-[52px] w-full rounded-[14px] text-base"
          onClick={() => void handleModeSelection(chosen)}
          disabled={pendingMode !== null}
        >
          {pendingMode ? "Saving…" : "Continue"}
          <ArrowRight size={16} color="currentColor" />
        </Button>
      </AuthCard>
    </div>
  );
}
