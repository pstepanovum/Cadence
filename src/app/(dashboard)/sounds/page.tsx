// FILE: src/app/(dashboard)/sounds/page.tsx
//
// The sounds library: every English sound, each with its mouth map. Free for
// everyone in every mode; nothing here calls an AI engine.
import type { Metadata } from "next";
import Link from "next/link";
import { AccentSwitch, parseVariant } from "@/components/mouth-map/AccentSwitch";
import { SoundsToFix } from "@/components/mouth-map/SoundsToFix";
import { ipaOf, MINIMAL_PAIRS, soundsIn } from "@/components/mouth-map/targets";
import { AppIntro, AppPage } from "@/components/ui/app-page";
import { soundById, type SoundKind } from "@/lib/platform/vocal-tract/index.ts";

export const metadata: Metadata = {
  title: "Sounds",
  description: "Every English sound with a mouth map: where the tongue, lips and jaw go, in American and British English.",
};

const GROUPS: { kind: SoundKind; title: string }[] = [
  { kind: "consonant", title: "Consonants" },
  { kind: "vowel", title: "Vowels" },
  { kind: "diphthong", title: "Diphthongs" },
];

export default async function SoundsPage({ searchParams }: { searchParams: Promise<{ accent?: string }> }) {
  const variant = parseVariant((await searchParams).accent);
  const sounds = soundsIn(variant);
  const suffix = variant === "RP" ? "?accent=RP" : "";

  return (
    <AppPage current="sounds">
      <AppIntro
        eyebrow="Sounds"
        title="See where every sound is made."
        actions={<AccentSwitch variant={variant} hrefFor={(v) => (v === "RP" ? "/sounds?accent=RP" : "/sounds")} />}
      >
        Pick a sound to see the tongue, lips and jaw, hear it, and compare it with the sound it is
        easy to mix up.
      </AppIntro>

      <SoundsToFix variant={variant} />

      {GROUPS.map((group) => (
        <section key={group.kind} aria-labelledby={`group-${group.kind}`} className="rounded-3xl bg-white px-5 py-6 sm:px-8">
          <h2 id={`group-${group.kind}`} className="font-kicker text-2xl text-hunter-green">
            {group.title}
          </h2>
          <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            {sounds
              .filter((sound) => sound.kind === group.kind)
              .map((sound) => (
                <li key={sound.id}>
                  <Link
                    href={`/sounds/${sound.id}${suffix}`}
                    className="flex min-h-20 flex-col justify-center rounded-3xl bg-vanilla-cream px-4 py-3 transition-colors hover:bg-yellow-green"
                    aria-label={`/${ipaOf(sound, variant)}/ as in ${sound.example}`}
                  >
                    <span className="font-kicker text-2xl text-hunter-green">/{ipaOf(sound, variant)}/</span>
                    <span className="text-sm text-iron-grey">{sound.example}</span>
                  </Link>
                </li>
              ))}
          </ul>
        </section>
      ))}

      <section aria-labelledby="pairs" className="rounded-3xl bg-white px-5 py-6 sm:px-8">
        <h2 id="pairs" className="font-kicker text-2xl text-hunter-green">Compare two sounds</h2>
        <p className="mt-2 text-sm leading-7 text-iron-grey">Pairs of words that differ by one sound.</p>
        <ul className="mt-4 flex flex-wrap gap-2">
          {MINIMAL_PAIRS.filter((pair) => soundById(pair.a)?.ipa[variant] && soundById(pair.b)?.ipa[variant]).map((pair) => (
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
    </AppPage>
  );
}
