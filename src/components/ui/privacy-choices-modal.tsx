"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface ToggleProps {
  enabled: boolean;
  onChange?: (val: boolean) => void;
  disabled?: boolean;
}

function Toggle({ enabled, onChange, disabled = false }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      disabled={disabled}
      onClick={() => !disabled && onChange?.(!enabled)}
      className={cn(
        "relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors duration-200",
        enabled ? "bg-hunter-green" : "bg-alabaster-grey",
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
      )}
    >
      <span
        className={cn(
          "inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200",
          enabled ? "translate-x-6" : "translate-x-1",
        )}
      />
    </button>
  );
}

const privacyCategories = [
  {
    key: "essential",
    label: "Essential",
    description: "Required for the app to function. Cannot be disabled.",
    alwaysOn: true,
  },
  {
    key: "analytics",
    label: "Analytics",
    description:
      "Helps us understand how learners use Cadence so we can improve the practice flow.",
    alwaysOn: false,
  },
  {
    key: "marketing",
    label: "Marketing",
    description:
      "Used for personalised recommendations and occasional outreach about new features.",
    alwaysOn: false,
  },
];

export function PrivacyChoicesModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [prefs, setPrefs] = useState({ analytics: false, marketing: false });

  const toggle = (key: "analytics" | "marketing") =>
    setPrefs((p) => ({ ...p, [key]: !p[key] }));

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-1.5 text-xs text-white/64 transition-colors hover:text-white"
      >
        <Image
          src="/icon/privacyoptions.svg"
          alt=""
          width={24}
          height={12}
          className="h-3 w-auto object-contain"
        />
        <span>Your Privacy Choices</span>
      </button>

      {isOpen && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-carbon-black/50 backdrop-blur-sm"
            aria-hidden="true"
            onClick={() => setIsOpen(false)}
          />

          {/* Modal */}
          <div className="relative z-10 w-full max-w-md rounded-3xl bg-vanilla-cream p-8 shadow-xl">
            <div className="space-y-1">
              <p className="eyebrow text-sm text-sage-green">Privacy</p>
              <h2 className="text-2xl font-semibold text-hunter-green">
                Your Privacy Choices
              </h2>
              <p className="pt-1 text-sm leading-7 text-iron-grey">
                Choose how Cadence uses data to personalise and improve your
                experience. Essential cookies are always active.
              </p>
            </div>

            <div className="mt-6 space-y-3">
              {privacyCategories.map((cat) => (
                <div
                  key={cat.key}
                  className="flex items-start justify-between gap-4 rounded-2xl bg-white px-5 py-4"
                >
                  <div className="space-y-0.5">
                    <p className="text-sm font-semibold text-hunter-green">
                      {cat.label}
                    </p>
                    <p className="text-sm leading-6 text-iron-grey">
                      {cat.description}
                    </p>
                  </div>
                  <div className="mt-0.5 flex-shrink-0">
                    <Toggle
                      enabled={
                        cat.alwaysOn
                          ? true
                          : prefs[cat.key as "analytics" | "marketing"]
                      }
                      onChange={
                        cat.alwaysOn
                          ? undefined
                          : () => toggle(cat.key as "analytics" | "marketing")
                      }
                      disabled={cat.alwaysOn}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 flex gap-3">
              <Button onClick={() => setIsOpen(false)} className="flex-1">
                Save preferences
              </Button>
              <Button variant="ghost" onClick={() => setIsOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
