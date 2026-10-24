// FILE: src/components/billing/PlanCards.tsx
//
// The plans, used on /pricing and the landing page. Prices match the App
// Store and Stripe products in docs/PLATFORM.md section 4.2.
import { PlanButton } from "@/components/billing/PlanButton";
import { Button } from "@/components/ui/button";
import { GITHUB_URL } from "@/components/ui/footer";
import { cn } from "@/lib/utils";

const FREE = [
  "Every lesson, quiz, flashcard deck and sentence exercise",
  "The sounds library and mouth map",
  "Streak and lesson stats on every device",
];
const OWN = [
  "Scoring, voices, transcription and coach on your machine",
  "Pair your phone on home Wi-Fi",
  "Open source: read and change everything",
];
const PLUS = [
  "Cloud pronunciation scoring, voices and transcription",
  "The speaking coach and scenarios, anywhere",
  "Full history and spaced-repetition sync across devices",
];

function Ticks({ items, onDark }: { items: string[]; onDark?: boolean }) {
  return (
    <ul className="space-y-2 text-sm leading-6">
      {items.map((item) => (
        <li key={item} className="flex gap-2">
          <span aria-hidden="true" className={onDark ? "text-yellow-green" : "text-sage-text"}>✓</span>
          <span className={onDark ? "text-white/85" : "text-iron-grey"}>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function PlanCards({ signedIn, cloudAvailable }: { signedIn: boolean; cloudAvailable: boolean }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Plan
        title="Free"
        price="$0"
        cadence="with an account"
        blurb="All practice that does not need AI."
        features={<Ticks items={FREE} />}
        action={
          <Button href={signedIn ? "/practice" : "/signup"} variant="ghost" className="w-full">
            {signedIn ? "Start practising" : "Create a free account"}
          </Button>
        }
      />
      <Plan
        title="Your own Cadence"
        price="$0"
        cadence="free forever"
        blurb="Run Cadence on your own computer. AI runs there, unlimited."
        features={<Ticks items={OWN} />}
        action={
          <div className="flex flex-col gap-2">
            <Button href="/download" variant="ghost" className="w-full">Download for desktop</Button>
            <a href={GITHUB_URL} className="text-center text-sm font-semibold text-sage-text underline underline-offset-2">Source code</a>
          </div>
        }
      />
      <Plan
        title="Plus monthly"
        price="$14.99"
        cadence="per month"
        blurb="Cloud AI wherever you are."
        tone="dark"
        features={<Ticks items={PLUS} onDark />}
        action={cloudAvailable ? <PlanButton interval="monthly" signedIn={signedIn} label="Get Plus monthly" variant="secondary" className="w-full" /> : <Unavailable />}
      />
      <Plan
        title="Plus yearly"
        price="$99.99"
        cadence="per year"
        blurb="Save 44% over monthly. New subscribers start with a 7-day free trial."
        badge="7 days free"
        tone="dark"
        features={<Ticks items={PLUS} onDark />}
        action={cloudAvailable ? <PlanButton interval="yearly" signedIn={signedIn} label="Start free trial" variant="secondary" className="w-full" /> : <Unavailable />}
      />
    </div>
  );
}

function Unavailable() {
  return <p className="text-sm text-white/80">Plus is available on cadence.pstepanov.dev.</p>;
}

function Plan({
  title,
  price,
  cadence,
  blurb,
  badge,
  tone = "light",
  features,
  action,
}: {
  title: string;
  price: string;
  cadence: string;
  blurb: string;
  badge?: string;
  tone?: "light" | "dark";
  features: React.ReactNode;
  action: React.ReactNode;
}) {
  const dark = tone === "dark";
  return (
    <section className={cn("flex flex-col justify-between gap-5 rounded-3xl px-6 py-6", dark ? "bg-hunter-green text-white" : "bg-white")} aria-label={title}>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className={cn("font-kicker text-xl", dark ? "text-white" : "text-hunter-green")}>{title}</h3>
          {badge ? <span className="rounded-full bg-yellow-green px-3 py-1 text-xs font-semibold text-hunter-green">{badge}</span> : null}
        </div>
        <p>
          <span className={cn("text-4xl font-semibold", dark ? "text-white" : "text-hunter-green")}>{price}</span>{" "}
          <span className={cn("text-sm", dark ? "text-white/84" : "text-iron-grey")}>{cadence}</span>
        </p>
        <p className={cn("text-sm leading-6", dark ? "text-white/80" : "text-iron-grey")}>{blurb}</p>
        {features}
      </div>
      {action}
    </section>
  );
}
