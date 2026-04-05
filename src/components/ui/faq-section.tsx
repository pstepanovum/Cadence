// FILE: src/components/ui/faq-section.tsx
"use client";

import { useState } from "react";
import {
  Cursor,
  CursorFollow,
  CursorProvider,
} from "@/components/animate-ui/components/animate/cursor";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const faqItems = [
  {
    question: "What exactly does Cadence score?",
    answer:
      "Cadence focuses on word-level pronunciation quality by decoding phonemes and comparing them with the target word you asked the learner to say.",
  },
  {
    question: "Does it work for short daily practice?",
    answer:
      "Yes. The product is built around short, repeatable rounds so learners can improve one sound at a time instead of sitting through long drills.",
  },
  {
    question: "Is there a trial or a local open-source option?",
    answer:
      "Yes. The monthly and yearly hosted plans both start with a 7-day free trial, and the codebase stays available for anyone who wants to run Cadence locally.",
  },
  {
    question: "Why use phoneme feedback instead of a plain transcript?",
    answer:
      "A transcript can hide accent issues that are still understandable. Phoneme comparison is better for showing where a sound is close, but still not correct.",
  },
];

export function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section className="grid gap-3 lg:grid-cols-[0.82fr_1.18fr] lg:items-stretch">
      <Card className="h-full bg-white">
        <div className="flex h-full flex-col space-y-2">
          <p className="eyebrow text-sm text-sage-green">FAQ</p>
          <h2 className="max-w-md text-3xl font-semibold text-hunter-green">
            Questions people ask before they commit to daily practice.
          </h2>
        </div>
      </Card>

      <div className="grid gap-3">
        {faqItems.map((item, index) => {
          const isOpen = openIndex === index;

          return (
            <CursorProvider key={item.question} className="w-full">
              <Cursor className="bg-hunter-green" />
              <CursorFollow
                side="top"
                sideOffset={18}
                align="center"
                className="bg-hunter-green text-white"
              >
                {isOpen ? "Close answer" : "Open answer"}
              </CursorFollow>
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => setOpenIndex(isOpen ? null : index)}
                className={cn(
                  "w-full cursor-pointer rounded-3xl p-0 text-left",
                  "focus-visible:outline-none focus-visible:ring-0",
                )}
              >
                <Card
                  className={cn(
                    "flex flex-col gap-4 p-5 sm:p-6",
                    isOpen
                      ? "bg-hunter-green text-white"
                      : "bg-white text-hunter-green",
                  )}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div
                        className={cn(
                          "eyebrow inline-flex rounded-full px-3 py-1.5 text-xs",
                          isOpen
                            ? "bg-white/10 text-yellow-green"
                            : "bg-vanilla-cream text-sage-green",
                        )}
                      >
                        0{index + 1}
                      </div>

                      <h3
                        className={cn(
                          "text-lg font-semibold sm:text-xl",
                          isOpen ? "text-white" : "text-hunter-green",
                        )}
                      >
                        {item.question}
                      </h3>
                    </div>

                    <div
                      className={cn(
                        "rounded-full px-3 py-1.5 text-sm whitespace-nowrap",
                        isOpen
                          ? "bg-white/10 text-white/84"
                          : "bg-bright-snow text-iron-grey",
                      )}
                    >
                      {isOpen ? "Close" : "Open"}
                    </div>
                  </div>

                  {isOpen ? (
                    <p className="max-w-3xl pr-2 text-sm leading-7 text-white/78">
                      {item.answer}
                    </p>
                  ) : null}
                </Card>
              </button>
            </CursorProvider>
          );
        })}
      </div>
    </section>
  );
}
