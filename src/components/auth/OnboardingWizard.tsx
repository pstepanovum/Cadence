// FILE: src/components/auth/OnboardingWizard.tsx
//
// First-run questions for a new cloud account, drawn like the account
// screens: one centred column on the neutral page, no card, one action.
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "griddy-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { AUTH_INPUT_CLASS, AuthCard, AuthNotice, FieldLabel } from "@/components/auth/AuthCard";

/** The account screens' flat platinum field, for a native select. */
const SELECT_CLASS =
  "min-h-[52px] rounded-[14px] bg-platinum px-4 text-base font-normal text-carbon-black hover:bg-alabaster-grey focus-visible:ring-2 focus-visible:ring-hunter-green";

export function OnboardingWizard() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [focus, setFocus] = useState("conversations");
  const [cadence, setCadence] = useState("15-minutes");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          onboardingCompleted: true,
          displayName: name.trim(),
          practiceFocus: focus,
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

          <div>
            <FieldLabel htmlFor="onboarding-focus">Focus</FieldLabel>
            <Select
              id="onboarding-focus"
              value={focus}
              onChange={(event) => setFocus(event.target.value)}
              className={SELECT_CLASS}
            >
              <option value="conversations">Conversation confidence</option>
              <option value="vowels">Short and long vowel control</option>
              <option value="work">Clearer speaking at work</option>
              <option value="daily">Daily speaking fluency</option>
            </Select>
          </div>

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

          <Button className="w-full" type="submit" disabled={isSaving}>
            {isSaving ? "Saving…" : "Start practising"}
            <ArrowRight size={16} color="currentColor" />
          </Button>
        </form>
      </AuthCard>
    </div>
  );
}
