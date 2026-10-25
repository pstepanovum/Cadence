// FILE: src/app/(landing)/pricing/page.tsx
import type { Metadata } from "next";
import { PlanCards } from "@/components/billing/PlanCards";
import { Card } from "@/components/ui/card";
import { PageIntro, PageShell } from "@/components/ui/page-shell";
import { getAppSession } from "@/lib/app-session";
import { isFirebaseConfigured } from "@/lib/firebase/config";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Practice is free. Run Cadence yourself for free AI. Cadence Plus adds cloud AI for $14.99 a month or $99.99 a year.",
};

const QUESTIONS = [
  {
    q: "What needs Plus?",
    a: "Only AI running on Cadence's servers: pronunciation scoring, voices, transcription and the coach when your own Cadence is not reachable. Lessons, quizzes, flashcards and the mouth map are free.",
  },
  {
    q: "Is there a limit on Plus?",
    a: "Each day includes 30 minutes of scored audio, 20,000 characters of voice and 120 coach turns. That covers several hours of real practice. Your own Cadence has no limit.",
  },
  {
    q: "How do I cancel?",
    a: "On the web, from your account page; on iPhone, in Settings › Apple ID › Subscriptions. Plus stays on until the end of the period you paid for.",
  },
  {
    q: "What happens to my data if Plus ends?",
    a: "Your streak and lesson stats stay. Detailed history stops syncing and is kept for 90 days, so renewing within that time loses nothing; after that it is deleted.",
  },
];

export default async function PricingPage() {
  const session = await getAppSession();
  const signedIn = session.mode === "cloud" && Boolean(session.user);

  return (
    <PageShell>
      <PageIntro eyebrow="Pricing" title="Practice is free. Cloud AI is Plus.">
        Every lesson, exercise and sound works without paying. Plus runs the AI parts on our servers,
        or run Cadence yourself and get them free.
      </PageIntro>
      <PlanCards signedIn={signedIn} cloudAvailable={isFirebaseConfigured} />
      <Card className="bg-white">
        <h2 className="font-kicker text-2xl text-carbon-black">Questions</h2>
        <dl className="mt-4 grid gap-5 md:grid-cols-2">
          {QUESTIONS.map((item) => (
            <div key={item.q}>
              <dt className="font-semibold text-carbon-black">{item.q}</dt>
              <dd className="mt-1 text-sm leading-7 text-iron-grey">{item.a}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </PageShell>
  );
}
