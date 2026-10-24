// FILE: src/components/ui/legal-page.tsx
//
// Long-form pages (privacy, terms): a contents list and sections with anchors.
import type { ReactNode } from "react";

export interface LegalSection {
  id: string;
  title: string;
  body: ReactNode;
}

export function LegalBody({ sections }: { sections: LegalSection[] }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
      <nav aria-label="On this page" className="h-fit rounded-3xl bg-white px-5 py-5 lg:sticky lg:top-4">
        <p className="eyebrow pb-2 text-xs text-sage-text">On this page</p>
        <ol className="space-y-1 text-sm">
          {sections.map((section) => (
            <li key={section.id}>
              <a href={`#${section.id}`} className="inline-flex min-h-8 items-center text-hunter-green hover:underline">{section.title}</a>
            </li>
          ))}
        </ol>
      </nav>
      <div className="space-y-4">
        {sections.map((section) => (
          <section key={section.id} id={section.id} className="scroll-mt-4 rounded-3xl bg-white px-5 py-6 sm:px-8">
            <h2 className="font-kicker text-2xl text-hunter-green">{section.title}</h2>
            <div className="mt-3 space-y-3 text-sm leading-7 text-iron-grey [&_li]:ml-5 [&_li]:list-disc [&_strong]:text-hunter-green">{section.body}</div>
          </section>
        ))}
      </div>
    </div>
  );
}
