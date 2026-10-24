// FILE: src/components/ui/faq-section.tsx
//
// The landing FAQ as native <details> sharing one name, so one answer opens at
// a time with no JavaScript; `group-open:` restyles the open card.
import { Card } from "@/components/ui/card";

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
  return (
    <section className="grid gap-3 lg:grid-cols-[0.82fr_1.18fr] lg:items-stretch">
      <Card className="h-full bg-white">
        <div className="flex h-full flex-col space-y-2">
          <p className="eyebrow text-sm text-sage-text">FAQ</p>
          <h2 className="max-w-md text-3xl font-semibold text-hunter-green">Questions people ask first.</h2>
        </div>
      </Card>

      <div className="grid gap-3">
        {faqItems.map((item, index) => (
          <details
            key={item.question}
            name="faq"
            className="group rounded-3xl bg-white p-5 text-hunter-green open:bg-hunter-green open:text-white sm:p-6"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sage-green [&::-webkit-details-marker]:hidden">
              <span className="flex items-center gap-4">
                <span className="eyebrow inline-flex rounded-full bg-vanilla-cream px-3 py-1.5 text-xs text-sage-text group-open:bg-white/10 group-open:text-yellow-green">
                  0{index + 1}
                </span>
                <span className="text-lg font-semibold text-hunter-green group-open:text-white sm:text-xl">{item.question}</span>
              </span>
              <span aria-hidden="true" className="whitespace-nowrap rounded-full bg-bright-snow px-3 py-1.5 text-sm text-iron-grey group-open:bg-white/10 group-open:text-white/84">
                <span className="group-open:hidden">Open</span>
                <span className="hidden group-open:inline">Close</span>
              </span>
            </summary>
            <p className="mt-4 max-w-3xl pr-2 text-sm leading-7 text-white/84">{item.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
