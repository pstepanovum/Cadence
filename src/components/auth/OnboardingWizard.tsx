// FILE: src/components/auth/OnboardingWizard.tsx
//
// First-run questions for a new cloud account, drawn like the account
// screens: one centred column on the neutral page, no card, one action. The
// goals are the phone's setup question ("What brings you to Cadence?"), one or
// more, as flat grey rows that turn green with a white tick.
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check } from "griddy-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { AUTH_INPUT_CLASS, AuthCard, AuthNotice, FieldLabel } from "@/components/auth/AuthCard";
import { LEARNING_GOALS, toggleGoal, type LearningGoal } from "@/lib/platform/goals";
import { cn } from "@/lib/utils";

/** The account screens' flat platinum field, for a native select. */
const SELECT_CLASS =
  "min-h-[52px] rounded-[14px] bg-platinum px-4 text-base font-normal text-carbon-black hover:bg-alabaster-grey focus-visible:ring-2 focus-visible:ring-hunter-green";

export function OnboardingWizard() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [goals, setGoals] = useState<LearningGoal[]>([]);
  const [cadence, setCadence] = useState("15-minutes");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (goals.length === 0) {
      setError("Choose at least one goal.");
      return;
    }
    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          onboardingCompleted: true,
          displayName: name.trim(),
          learningGoals: goals,
          practiceCadence: cadence,
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Could not save your onboarding preferences.");
      }

      router.replace("/dashboard");
      router.refresh();
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Could not save your onboarding preferences.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-8 sm:px-6">
      <AuthCard
        title="Set up your practice"
        description="You can change these any time in your profile."
      >
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void handleSubmit();
          }}
        >
          <div>
            <FieldLabel htmlFor="onboarding-name">Your name</FieldLabel>
            <Input
              id="onboarding-name"
              type="text"
              autoComplete="given-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="What should we call you?"
              className={AUTH_INPUT_CLASS}
            />
          </div>

          <fieldset>
            <legend className="block pb-2 text-sm font-medium text-hunter-green">
              What brings you to Cadence? <span className="font-normal text-slate-grey">Choose all that apply.</span>
            </legend>
            <div className="space-y-2">
              {LEARNING_GOALS.map((goal) => {
                const selected = goals.includes(goal.value);
                return (
                  <button
                    key={goal.value}
                    type="button"
                    role="checkbox"
                    aria-checked={selected}
                    onClick={() => {
                      setGoals((current) => toggleGoal(current, goal.value));
                      setError(null);
                    }}
                    className={cn(
                      "flex w-full cursor-pointer items-center gap-3 rounded-[14px] px-4 py-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hunter-green",
                      selected ? "bg-hunter-green text-bright-snow" : "bg-platinum text-carbon-black hover:bg-alabaster-grey",
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-base font-semibold">{goal.title}</span>
                      <span className={cn("block text-sm", selected ? "text-bright-snow/90" : "text-iron-grey")}>{goal.detail}</span>
                    </span>
                    <span
                      aria-hidden
                      className={cn(
                        "flex size-6 shrink-0 items-center justify-center rounded-[8px]",
                        selected ? "bg-bright-snow text-hunter-green" : "bg-alabaster-grey",
                      )}
                    >
                      {selected ? <Check size={14} color="currentColor" /> : null}
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div>
            <FieldLabel htmlFor="onboarding-pace">Pace</FieldLabel>
            <Select
              id="onboarding-pace"
              value={cadence}
              onChange={(event) => setCadence(event.target.value)}
              className={SELECT_CLASS}
            >
              <option value="5-minutes">5 minutes a day</option>
              <option value="15-minutes">15 minutes a day</option>
              <option value="30-minutes">30 minutes a day</option>
              <option value="weekend-only">A few times a week</option>
            </Select>
          </div>

          {error ? <AuthNotice tone="error">{error}</AuthNotice> : null}

          <Button className="w-full" type="submit" disabled={isSaving || goals.length === 0}>
            {isSaving ? "Saving…" : "Start practising"}
            <ArrowRight size={16} color="currentColor" />
          </Button>
        </form>
      </AuthCard>
    </div>
  );
}
