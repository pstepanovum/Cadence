import type { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/ui/navbar";
import { Card } from "@/components/ui/card";
import { Footer } from "@/components/ui/footer";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Help Center",
  description:
    "Find answers about Cadence — how to practice, how phoneme scoring works, account help, and troubleshooting.",
  robots: { index: true, follow: true },
};

const helpTopics = [
  {
    eyebrow: "Getting started",
    title: "How does Cadence work?",
    body: "Pick a target word in the practice studio, record your take, and Cadence decodes your phonemes against the target. You'll see exactly which sound is off and get a cue to fix before the next recording.",
  },
  {
    eyebrow: "Practice studio",
    title: "Why do I need to record audio?",
    body: "Phoneme analysis requires an audio sample. Your recording is processed in real time to extract phonemes — it is not stored permanently on our servers.",
  },
  {
    eyebrow: "Scoring",
    title: "What does the phoneme score mean?",
    body: "The score reflects how closely your phoneme sequence matches the target word. A score above 50 means your pronunciation is in a good range. Lower scores surface the specific sounds to practice next.",
  },
  {
    eyebrow: "Modules",
    title: "How do I unlock the next module?",
    body: "Complete the exam lesson at the end of each module with a passing score. Once unlocked, the next module appears in your learning path on the dashboard.",
  },
  {
    eyebrow: "Conversation practice",
    title: "What are conversation modules?",
    body: "Conversation modules are levelled speaking scenarios from B1 to C1 — coffee chats, project updates, client calls. You respond to AI prompts and get phoneme feedback on your replies in natural context.",
  },
  {
    eyebrow: "Account",
    title: "Is Cadence really free?",
    body: "Yes. Cadence is free and open source. All core features — quick practice, conversation modules, structured modules, phoneme scoring — are available without a subscription.",
  },
  {
    eyebrow: "Troubleshooting",
    title: "The microphone isn't working. What do I do?",
    body: "Make sure your browser has permission to access the microphone. In Chrome, click the lock icon in the address bar and check that microphone access is set to Allow. Then reload the page and try again.",
  },
  {
    eyebrow: "Troubleshooting",
    title: "Assessment results are taking a long time.",
    body: "The AI engine needs to load the phoneme model on first use, which can take 30–60 seconds. After the model is warm, assessments typically return within a few seconds.",
  },
];

export default function HelpPage() {
  return (
    <main className="min-h-screen px-5 py-5 sm:px-8 lg:px-12">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
        <Navbar current="home" />

        <section>
          <Card className="bg-hunter-green text-white">
            <div className="space-y-3 px-2 py-2">
              <p className="eyebrow text-sm text-yellow-green/80">Support</p>
              <h1 className="text-4xl font-semibold leading-tight sm:text-5xl">
                Help Center
              </h1>
              <p className="max-w-2xl text-base leading-8 text-white/78">
                Answers to the most common questions about Cadence — from your
                first recording to unlocking advanced modules.
              </p>
            </div>
          </Card>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-2">
          {helpTopics.map((topic) => (
            <Card key={topic.title} className="bg-white">
              <p className="eyebrow text-sm text-sage-green">{topic.eyebrow}</p>
              <h2 className="mt-3 text-xl font-semibold text-hunter-green">
                {topic.title}
              </h2>
              <p className="mt-2 text-sm leading-7 text-iron-grey">
                {topic.body}
              </p>
            </Card>
          ))}
        </section>

        <section>
          <Card className="bg-vanilla-cream">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <p className="eyebrow text-sm text-sage-green">
                  Still stuck?
                </p>
                <h2 className="text-2xl font-semibold text-hunter-green">
                  Reach out to support.
                </h2>
                <p className="text-sm leading-7 text-iron-grey">
                  If your question isn&apos;t covered above, the support team
                  is one message away.
                </p>
              </div>
              <Link
                href="/contact"
                className={buttonVariants({ className: "shrink-0" })}
              >
                Contact Support
              </Link>
            </div>
          </Card>
        </section>

        <Footer />
      </div>
    </main>
  );
}
