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
    question: "What does Cadence teach?",
    answer:
      "Advanced English out loud: every sound with a mouth map, grammar from A1 to C2, sentence building, quizzes, flashcards with spaced repetition, and a speaking coach with real-life scenarios.",
  },
  {
    question: "What is free?",
    answer:
      "All lessons, exercises, flashcards and the sounds library, for everyone. AI features are free too when they run on your own Cadence at home.",
  },
  {
    question: "What does Cadence Plus add?",
    answer:
      "Cloud AI when your own Cadence is not around: pronunciation scoring, voices, transcription and the coach, plus full history synced across devices. $14.99 a month or $99.99 a year with a 7-day trial.",
  },
  {
    question: "Is it really open source?",
    answer:
      "Yes. The code is public under the MIT licence. Install the desktop app or run the server yourself, pair your phone on home Wi-Fi, and nothing leaves your network.",
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
            Questions people ask first.
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
