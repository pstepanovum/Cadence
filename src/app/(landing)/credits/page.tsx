// FILE: src/app/(landing)/credits/page.tsx
//
// Credits and licences, the public face of CREDITS.md and NOTICE. Every new
// third-party source is added there and here in the same change.
import type { Metadata } from "next";
import { GITHUB_URL } from "@/components/ui/footer";
import { LegalBody, type LegalSection } from "@/components/ui/legal-page";
import { PageIntro, PageShell } from "@/components/ui/page-shell";

export const metadata: Metadata = {
  title: "Credits and licences",
  description: "The open work Cadence builds on, and the licences it is used under.",
};

const link = (href: string, label: string) => (
  <a href={href} className="underline" target="_blank" rel="noopener noreferrer">{label}</a>
);

const sections: LegalSection[] = [
  {
    id: "cadence",
    title: "Cadence",
    body: (
      <p>Cadence is open source under the MIT licence. The code, this list in full ({link(`${GITHUB_URL}/blob/main/CREDITS.md`, "CREDITS.md")}) and the attribution notices ({link(`${GITHUB_URL}/blob/main/NOTICE`, "NOTICE")}) are on {link(GITHUB_URL, "GitHub")}.</p>
    ),
  },
  {
    id: "mouth-map",
    title: "Mouth map",
    body: (
      <>
        <p>The side view of the mouth is a TypeScript port of the {link("https://ctan.org/pkg/vocaltract", "VocalTract LaTeX package")} by Dimitrios Ververidis (D. Ververidis, D. Schneider and J. Koehler, “The vocal tract LaTeX package”, <em>The PracTeX Journal</em>, 2012), under the Apache License 2.0 and the LaTeX Project Public License. It is cropped, regrouped into layers and checked point by point against the original.</p>
        <p>Its articulatory model is S. Maeda’s (“Compensatory articulation during speech”, in <em>Speech Production and Speech Modelling</em>, Kluwer, 1990).</p>
        <p>The English targets are fitted to the sagittal-section drawings by Richard Wright and Dan McCloy on Wikimedia Commons, released under {link("https://creativecommons.org/publicdomain/zero/1.0/", "CC0 1.0")}. Only traced points are kept; no drawing is redistributed.</p>
      </>
    ),
  },
  {
    id: "sentences",
    title: "Example sentences",
    body: (
      <p>Many example and dictation sentences come from {link("https://tatoeba.org", "Tatoeba")}, under {link("https://creativecommons.org/licenses/by/2.0/fr/", "CC BY 2.0 FR")}, written by contributors who list English as a native language. Each keeps its Tatoeba id and author, and the text is unchanged.</p>
    ),
  },
  {
    id: "lessons",
    title: "Lessons and vocabulary",
    body: (
      <p>Grammar explanations, exercises, quizzes and flashcard definitions are Cadence’s own, generated from our own outline for the CEFR levels A1 to C2 and checked by a second, blind review. Flashcard words are chosen by frequency in the Tatoeba sentences; no published word list is used.</p>
    ),
  },
  {
    id: "software",
    title: "Software",
    body: (
      <p>Cadence is built with Next.js, React, Tailwind CSS, Electron, Expo and React Native, Firebase, FastAPI, PyTorch and Hugging Face Transformers, each under its own open-source licence. The full dependency list and licences ship with the source.</p>
    ),
  },
];

export default function CreditsPage() {
  return (
    <PageShell>
      <PageIntro eyebrow="Credits" title="The work Cadence builds on.">
        Thanks to the researchers and contributors whose open work makes Cadence possible.
      </PageIntro>
      <LegalBody sections={sections} />
    </PageShell>
  );
}
