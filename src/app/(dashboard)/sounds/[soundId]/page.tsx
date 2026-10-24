// FILE: src/app/(dashboard)/sounds/[soundId]/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AccentSwitch, parseVariant } from "@/components/mouth-map/AccentSwitch";
import { DrillLadder } from "@/components/mouth-map/DrillLadder";
import { loadArticulationTargets } from "@/components/mouth-map/load-targets";
import { MouthMap } from "@/components/mouth-map/MouthMap";
import { ipaOf, MINIMAL_PAIRS, targetFor } from "@/components/mouth-map/targets";
import { AppPage } from "@/components/ui/app-page";
import { Button } from "@/components/ui/button";
import { safeNextPath } from "@/lib/auth/safe-next";
import { soundById } from "@/lib/platform/vocal-tract/index.ts";

interface Props {
  params: Promise<{ soundId: string }>;
  searchParams: Promise<{ accent?: string; back?: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const sound = soundById(decodeURIComponent((await params).soundId));
  return sound
    ? { title: `/${ipaOf(sound, "GA")}/ as in ${sound.example}`, description: `Where the tongue, lips and jaw go for the sound in “${sound.example}”.` }
    : { title: "Sound" };
}

export default async function SoundPage({ params, searchParams }: Props) {
  const soundId = decodeURIComponent((await params).soundId);
  const query = await searchParams;
  const sound = soundById(soundId);
  if (!sound) notFound();

  const requested = parseVariant(query.accent);
  const variant = sound.ipa[requested] ? requested : requested === "GA" ? "RP" : "GA";
  const { targets, fixture } = await loadArticulationTargets();
  const target = targetFor(targets, soundId, variant);
  const back = safeNextPath(query.back);
  const pairs = MINIMAL_PAIRS.filter((pair) => pair.a === soundId || pair.b === soundId);
  const accentHref = (v: string) => `/sounds/${soundId}?accent=${v}${back ? `&back=${encodeURIComponent(back)}` : ""}`;

  return (
    <AppPage current="sounds">
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center justify-between gap-3">
        <Link href={variant === "RP" ? "/sounds?accent=RP" : "/sounds"} className="inline-flex min-h-11 items-center rounded-full bg-white px-4 text-sm font-semibold text-hunter-green">
          ← All sounds
        </Link>
        {sound.ipa.GA && sound.ipa.RP ? <AccentSwitch variant={variant} hrefFor={accentHref} /> : null}
      </nav>

      <div className="grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
        <section className="rounded-3xl bg-white px-4 py-5 sm:px-6 sm:py-6">
          <p className="eyebrow text-sm text-sage-green">{sound.kind === "consonant" ? "Consonant" : sound.kind === "vowel" ? "Vowel" : "Diphthong"}</p>
          <h1 className="mt-1 font-kicker text-4xl text-hunter-green sm:text-5xl">
            /{ipaOf(sound, variant)}/ <span className="text-2xl text-iron-grey">as in “{sound.example}”</span>
          </h1>
          {!sound.ipa[requested] ? (
            <p className="mt-2 text-sm text-iron-grey">This sound is not used in {requested === "GA" ? "American" : "British"} English; showing {variant}.</p>
          ) : null}
          <div className="mt-4">
            {target ? (
              <MouthMap sound={sound} target={target} variant={variant} />
            ) : (
              <p className="rounded-3xl bg-vanilla-cream px-4 py-6 text-sm text-iron-grey">The mouth map for this sound is on its way.</p>
            )}
          </div>
          {fixture ? (
            <p className="mt-4 text-xs leading-5 text-slate-grey">Preview shapes. They are being checked against reference drawings and may change.</p>
          ) : null}
        </section>

        <div className="flex flex-col gap-4">
          {back ? (
            <section className="rounded-3xl bg-hunter-green px-5 py-6 text-white">
              <h2 className="font-kicker text-xl">Ready to try again?</h2>
              <p className="mt-1 text-sm leading-6 text-white/80">Copy the shape, play the model, then record another take.</p>
              <Button href={back} variant="secondary" className="mt-4 w-full">
                Record again
              </Button>
            </section>
          ) : null}
          <DrillLadder soundId={soundId} />
          {pairs.length > 0 ? (
            <section className="rounded-3xl bg-white px-5 py-6">
              <h2 className="font-kicker text-xl text-hunter-green">Easy to mix up with</h2>
              <ul className="mt-3 flex flex-wrap gap-2">
                {pairs.map((pair) => (
                  <li key={pair.words.join("-")}>
                    <Link
                      href={`/sounds/compare?a=${pair.a}&b=${pair.b}&words=${pair.words.join(",")}${variant === "RP" ? "&accent=RP" : ""}`}
                      className="inline-flex min-h-11 items-center rounded-full bg-vanilla-cream px-4 text-sm font-semibold text-hunter-green hover:bg-yellow-green"
                    >
                      {pair.words[0]} / {pair.words[1]}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </div>
    </AppPage>
  );
}
