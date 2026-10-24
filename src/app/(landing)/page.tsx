// FILE: src/app/(landing)/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { PlanCards } from "@/components/billing/PlanCards";
import { loadArticulationTargets } from "@/components/mouth-map/load-targets";
import { LazyMouthMapDemo } from "@/components/mouth-map/LazyMouthMapDemo";
import type { DemoSound } from "@/components/mouth-map/MouthMapDemo";
import { MouthMapSvg } from "@/components/mouth-map/MouthMapSvg";
import { targetFor } from "@/components/mouth-map/targets";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FaqSection } from "@/components/ui/faq-section";
import { GITHUB_URL } from "@/components/ui/footer";
import { PageShell } from "@/components/ui/page-shell";
import { getAppSession } from "@/lib/app-session";
import { isFirebaseConfigured } from "@/lib/firebase/config";
import { NEUTRAL_PARAMS, paramsAt } from "@/lib/platform/vocal-tract/index.ts";

export const metadata: Metadata = {
  title: { absolute: "Cadence: advanced English, out loud" },
  description:
    "Pronunciation with a mouth map for every sound, grammar from A1 to C2, sentence building, flashcards and a speaking coach. Open source and free to run yourself.",
};

const FEATURES = [
  { title: "Sounds and the mouth map", body: "See where the tongue, lips and jaw go for every English sound, in American and British English, and compare look-alikes like ship and sheep.", href: "/sounds" },
  { title: "Pronunciation feedback", body: "Record a word or sentence and get each sound scored, with the weak ones linked straight to their mouth map.", href: "/dashboard" },
  { title: "Grammar by level", body: "A1 to C2, each point with patterns, real examples and the mistakes people actually make.", href: "/grammar" },
  { title: "Sentence building", body: "Put words in order, fix wrong sentences and rewrite them, so the grammar sticks in use.", href: "/practice/builder" },
  { title: "Quizzes and matching", body: "Short rounds graded on your device, with an explanation after every answer.", href: "/practice/quiz" },
  { title: "Flashcards that come back", body: "Spaced repetition brings each word back just before you would forget it.", href: "/practice/flashcards" },
  { title: "A speaking coach", body: "Practise a job interview, a meeting, small talk, travel or a presentation, and get short pointers at the end.", href: "/coach" },
  { title: "Works offline", body: "Lessons and exercises download once and work without a connection.", href: "/practice" },
];

const DEMO = [
  { id: "sound.th", label: "th in think" },
  { id: "sound.s", label: "s in sink" },
  { id: "sound.r", label: "r in right" },
  { id: "sound.l", label: "l in light" },
  { id: "sound.uw", label: "oo in food" },
];

export default async function Home({ searchParams }: { searchParams: Promise<{ account?: string }> }) {
  const [session, { targets }, query] = await Promise.all([getAppSession(), loadArticulationTargets(), searchParams]);
  const signedIn = session.mode === "cloud" && Boolean(session.user);
  const demo = DEMO.flatMap((d) => {
    const target = targetFor(targets, d.id, "GA");
    return target ? [{ label: d.label, target } satisfies DemoSound] : [];
  });

  return (
    <PageShell current="home">
      {query.account === "deleted" ? (
        <p role="status" className="rounded-3xl bg-yellow-green px-5 py-4 text-sm font-semibold text-hunter-green">
          Your account has been deleted. Thanks for practising with Cadence.
        </p>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="flex flex-col justify-between gap-8 bg-hunter-green px-6 py-8 text-white sm:px-10 sm:py-10">
          <div className="space-y-4">
            <p className="eyebrow text-sm text-yellow-green">Open source · Free to run yourself</p>
            <h1 className="max-w-2xl text-balance text-4xl font-semibold leading-tight sm:text-6xl">Advanced English, out loud.</h1>
            <p className="max-w-xl text-base leading-8 text-white/80 sm:text-lg">
              See how every sound is made, learn grammar level by level, build sentences, keep words with
              flashcards and talk it through with a coach. All in one place, on the web, desktop and phone.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" href="/practice">Start practising free</Button>
            <Button href={signedIn ? "/dashboard" : "/signup"} className="bg-white/10 text-white">
              {signedIn ? "Go to your dashboard" : "Create an account"}
            </Button>
          </div>
        </Card>
        <Card className="bg-white">
          <p className="eyebrow text-sm text-sage-text">The mouth map</p>
          <h2 className="mt-1 font-kicker text-2xl text-hunter-green">Where your tongue should be, for every sound.</h2>
          <div className="mt-4">{demo.length > 1 ? <LazyMouthMapDemo sounds={demo} still={<DemoStill sounds={demo} />} /> : null}</div>
          <Link href="/sounds" className="mt-3 inline-block text-sm font-semibold text-sage-text underline underline-offset-2">
            Open the sounds library
          </Link>
        </Card>
      </section>

      <section aria-labelledby="features" className="space-y-4">
        <h2 id="features" className="sr-only">What is in Cadence</h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((feature) => (
            <li key={feature.title}>
              <Link href={feature.href} className="flex h-full flex-col rounded-3xl bg-white px-5 py-5 transition-colors hover:bg-yellow-green">
                <span className="font-kicker text-xl text-hunter-green">{feature.title}</span>
                <span className="mt-2 text-sm leading-6 text-iron-grey">{feature.body}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="grid gap-4 lg:grid-cols-2" aria-labelledby="ai">
        <Card className="bg-white">
          <p className="eyebrow text-sm text-sage-text">Your own Cadence</p>
          <h2 id="ai" className="mt-1 text-2xl font-semibold text-hunter-green sm:text-3xl">Run the AI at home, free and unlimited.</h2>
          <p className="mt-3 text-sm leading-7 text-iron-grey">
            Install Cadence on your computer and it does the scoring, voices, transcription and coaching itself.
            Scan a QR code and your phone uses it on the same Wi-Fi. The code is open source under the MIT licence;
            your recordings never leave your network.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button href="/download">Download for desktop</Button>
            <Button href={GITHUB_URL} variant="ghost">Source code</Button>
          </div>
        </Card>
        <Card className="bg-vanilla-cream">
          <p className="eyebrow text-sm text-sage-text">Cadence Plus</p>
          <h2 className="mt-1 text-2xl font-semibold text-hunter-green sm:text-3xl">Or let the cloud do it, anywhere.</h2>
          <p className="mt-3 text-sm leading-7 text-iron-grey">
            When your computer is not around, Plus runs the same AI on Cadence servers and keeps your full history in
            sync. Practice without AI stays free either way.
          </p>
          <div className="mt-4">
            <Button href="/pricing" variant="secondary">See plans</Button>
          </div>
        </Card>
      </section>

      <section id="pricing" aria-label="Plans">
        <PlanCards signedIn={signedIn} cloudAvailable={isFirebaseConfigured} />
      </section>

      <section id="faq">
        <FaqSection />
      </section>
    </PageShell>
  );
}

/** The demo's first sound, drawn on the server until the animated demo loads. */
function DemoStill({ sounds }: { sounds: DemoSound[] }) {
  const first = sounds[0].target;
  const params = first.trajectory?.length ? paramsAt(first.trajectory, 1) : (first.params ?? NEUTRAL_PARAMS);
  return (
    <div className="space-y-3">
      <MouthMapSvg
        params={params}
        highlight={first.highlight}
        overlays={first.overlays}
        anchor={first.anchor}
        airflow={first.airflow}
        pulse={0}
        title={`Mouth map: ${sounds[0].label}`}
        description={`A side view of the mouth in the shape for ${sounds[0].label}.`}
      />
      <div aria-hidden="true" className="flex flex-wrap justify-center gap-2">
        {sounds.map((sound, i) => (
          <span
            key={sound.label}
            className={`inline-flex min-h-10 items-center rounded-full px-4 text-sm font-semibold ${i === 0 ? "bg-hunter-green text-white" : "bg-vanilla-cream text-hunter-green"}`}
          >
            {sound.label}
          </span>
        ))}
      </div>
    </div>
  );
}
