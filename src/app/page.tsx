// FILE: src/app/page.tsx
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Activity, Microphone, PlayCircle } from "griddy-icons";
import { Navbar } from "@/components/ui/navbar";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Footer } from "@/components/ui/footer";
import { FaqSection } from "@/components/ui/faq-section";
import { PricingSection } from "@/components/ui/pricing-section";
import { SplitText } from "@/components/ui/split-text";
import { TrustedByStrip } from "@/components/ui/trusted-by-strip";

export const metadata: Metadata = {
  title: "AI Pronunciation Feedback That Names the Phoneme",
  description:
    "Most tools give you a score. Cadence shows you exactly which phoneme is off — then hands you back to the microphone with a clear cue. Hosted plans for learners, plus an open-source path to run locally.",
  openGraph: {
    title: "Cadence — AI Pronunciation Feedback That Names the Phoneme",
    description:
      "Most tools give you a score. Cadence shows you exactly which phoneme is off — with hosted plans for learners and an open-source local path.",
  },
};

const processCards = [
  {
    title: "Record one focused take",
    description:
      "One word, one recording. Short rounds keep the loop tight enough to run every day without mental overhead.",
    icon: Microphone,
  },
  {
    title: "See exactly which phoneme is off",
    description:
      "The engine decodes your speech into phonemes and compares them against the target — surfacing the specific sound that’s pulling your pronunciation off.",
    icon: Activity,
  },
  {
    title: "Repeat with a clear target",
    description:
      "Every result names the next thing to focus on. Feedback never ends at a score — it hands you straight back to the microphone.",
    icon: PlayCircle,
  },
];

const moduleCards = [
  {
    title: "Guided modules",
    description:
      "A structured sequence that moves from foundational sounds into harder phoneme patterns — one clear win at a time.",
  },
  {
    title: "B1–C1 conversation practice",
    description:
      "Ten leveled speaking scenarios — from coffee chat introductions to client check-in calls — so phoneme work lands in real dialogue, not isolated drills.",
  },
  {
    title: "Daily reminders",
    description:
      "Short nudges that bring learners back before the practice streak breaks — not a notification flood, just the right tap at the right moment.",
  },
  {
    title: "Progress and levels",
    description:
      "Visible milestones, level-ups, and per-sound mastery so the improvement is something learners can actually see.",
  },
  {
    title: "Streak system",
    description:
      "A lightweight consistency layer that rewards repeated practice without turning the app into noise.",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen px-5 py-5 sm:px-8 lg:px-12">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
        <Navbar current="home" />

        <section className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
          <Card className="bg-hunter-green p-0 text-white">
            <div className="flex h-full flex-col justify-between gap-6 px-6 py-6 sm:px-8 sm:py-8">
              <div className="space-y-4">
                <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-yellow-green">
                  <Activity size={18} filled color="currentColor" />
                  <span className="eyebrow text-sm">Phoneme feedback · Hosted plans · Open source local</span>
                </div>
                <div className="space-y-3">
                  <SplitText
                    text="Most tools give you a score. Cadence gives you the phoneme."
                    tag="h1"
                    delay={22}
                    duration={760}
                    className="max-w-3xl text-4xl font-semibold leading-tight sm:text-5xl"
                  />
                  <p className="max-w-2xl text-base leading-8 text-white/78 sm:text-lg">
                    Say one word. The AI decodes your phonemes, spots the
                    mismatch against the target, and hands you a clear cue to
                    fix before the next take. No vague scores. No generic
                    transcripts. Just the exact sound that needs work.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <Link
                  href="/dashboard"
                  className={buttonVariants({
                    className: "bg-sage-green text-white hover:bg-[#7aa65f]",
                  })}
                >
                  Try the practice studio
                </Link>
                <Link
                  href="/signup"
                  className={buttonVariants({ variant: "secondary" })}
                >
                  Create an account
                </Link>
              </div>
            </div>
          </Card>

          <Card className="relative overflow-visible bg-white p-0">
            <div className="flex h-full flex-col gap-4 px-6 py-6 sm:px-8 sm:py-8">
              <div className="space-y-2">
                <p className="eyebrow text-sm text-sage-green">
                  Practice studio
                </p>
                <h2 className="font-kicker text-2xl font-semibold text-hunter-green">
                  Record, compare, and see the gap — all in one view.
                </h2>
              </div>

              <div className="flex flex-1 items-center justify-center">
                <Image
                  src="/illustration/communication-1.svg"
                  alt="People communicating"
                  width={520}
                  height={380}
                  className="h-auto w-full max-w-md translate-y-12 object-contain sm:translate-y-14"
                  priority
                />
              </div>
            </div>
          </Card>
        </section>

        <TrustedByStrip />

        <section id="features" className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
          <Card className="bg-white">
            <div className="grid gap-4">
              {processCards.map(({ title, description, icon: Icon }) => (
                <div
                  key={title}
                  className="rounded-3xl bg-bright-snow px-4 py-4"
                >
                  <div className="flex items-start gap-4">
                    <div className="mt-0.5 text-sage-green">
                      <Icon size={24} filled color="currentColor" />
                    </div>
                    <div className="space-y-2">
                      <CardTitle className="font-kicker text-xl">{title}</CardTitle>
                      <CardDescription>{description}</CardDescription>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2">
            <Card className="bg-vanilla-cream sm:col-span-2">
              <div className="grid gap-4 md:grid-cols-[0.9fr_1.1fr] md:items-center">
                <div className="flex items-center justify-center">
                  <Image
                    src="/illustration/progress-1.svg"
                    alt="Progress illustration"
                    width={420}
                    height={280}
                    className="h-auto w-full max-w-xs object-contain"
                  />
                </div>
                <div className="space-y-3">
                  <p className="eyebrow text-sm text-sage-green">
                    Built for consistency
                  </p>
                  <h2 className="text-3xl font-semibold text-hunter-green">
                    Five minutes a day beats one long session a week.
                  </h2>
                  <p className="text-base leading-8 text-iron-grey">
                    Cadence is built around a loop short enough to close before
                    your coffee gets cold: record, see the phoneme gap, get the
                    cue, go again. That tightness is the product.
                  </p>
                </div>
              </div>
            </Card>

            <Card className="bg-hunter-green text-white">
              <p className="eyebrow text-sm text-yellow-green/80">
                Not another transcript
              </p>
              <p className="mt-4 text-2xl font-semibold">
                A score doesn&apos;t tell you which phoneme to fix. Cadence does.
              </p>
              <p className="mt-3 text-sm leading-7 text-white/78">
                Voice apps transcribe what you said. Duolingo logs your streak.
                Neither tells you which specific sound is pulling your accent
                off. That gap is exactly what Cadence fills.
              </p>
            </Card>

            <Card className="bg-white">
              <p className="eyebrow text-sm text-sage-green">
                Who it&apos;s for
              </p>
              <p className="mt-4 text-2xl font-semibold text-hunter-green">
                Non-native speakers who want precision, not just encouragement.
              </p>
              <p className="mt-3 text-sm leading-7 text-iron-grey">
                Solo learners building a daily habit. Professionals preparing
                for clearer workplace communication. Tutors who want a
                structured phoneme drill alongside their sessions.
              </p>
            </Card>
          </div>
        </section>

        <section id="pricing">
          <PricingSection />
        </section>

        <section id="roadmap" className="grid gap-4 lg:grid-cols-[1fr_1fr]">
          <Card className="bg-hunter-green text-white">
            <div className="space-y-4">
              <p className="eyebrow text-sm text-yellow-green/80">
                What&apos;s being built
              </p>
              <h2 className="max-w-2xl text-3xl font-semibold leading-tight">
                Phoneme practice is the foundation. The platform goes further.
              </h2>
              <p className="max-w-2xl text-sm leading-8 text-white/78">
                Cadence is growing into a full pronunciation curriculum: guided
                modules from B1 to C1, AI conversation practice in real-world
                scenarios, daily streaks, progress checkpoints, and dedicated
                flows for students, tutors, and organizations.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {moduleCards.map((module) => (
                  <div
                    key={module.title}
                    className={`rounded-3xl bg-white/10 px-4 py-4 ${
                      module.title === "Streak system" ? "sm:col-span-2" : ""
                    }`}
                  >
                    <h3 className="text-lg font-semibold">{module.title}</h3>
                    <p className="mt-2 text-sm leading-7 text-white/76">
                      {module.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          <Card className="bg-white p-0">
            <div className="flex h-full flex-col gap-4 px-6 py-6">
              <div className="space-y-2">
                <p className="eyebrow text-sm text-sage-green">
                  Hosted + open source
                </p>
                <h2 className="text-2xl font-semibold text-hunter-green">
                  Subscribe for hosted access, or run Cadence locally.
                </h2>
                <p className="text-sm leading-7 text-iron-grey">
                  Choose the hosted plan if you want the full product
                  experience with a 7-day trial, or take the open-source route
                  to run Cadence locally and contribute in public. The roadmap
                  stays transparent even as the hosted product grows.
                </p>
              </div>

              <div className="flex flex-1 items-center justify-center">
                <Image
                  src="/illustration/following-your-dreams-1.svg"
                  alt="Growth illustration"
                  width={430}
                  height={340}
                  className="h-auto w-full max-w-sm object-contain"
                />
              </div>
            </div>
          </Card>
        </section>

        <section id="faq">
          <FaqSection />
        </section>

        <Footer />
      </div>
    </main>
  );
}
