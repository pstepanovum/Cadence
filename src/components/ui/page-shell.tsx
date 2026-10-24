// FILE: src/components/ui/page-shell.tsx
//
// The frame of a public page: navbar, content, footer, with the 16 px phone
// gutter and the same width the landing page uses.
import type { ReactNode } from "react";
import { Footer } from "@/components/ui/footer";
import { Navbar } from "@/components/ui/navbar";

export function PageShell({ children, current }: { children: ReactNode; current?: "home" | "download" }) {
  return (
    <main className="min-h-screen px-4 py-4 sm:px-8 sm:py-5 lg:px-12">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
        <Navbar current={current} />
        {children}
        <Footer />
      </div>
    </main>
  );
}

/** A heading card at the top of a public page. */
export function PageIntro({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <section className="rounded-3xl bg-hunter-green px-6 py-8 text-white sm:px-10 sm:py-10">
      <p className="eyebrow text-sm text-yellow-green">{eyebrow}</p>
      <h1 className="mt-3 max-w-3xl text-balance text-3xl font-semibold leading-tight sm:text-5xl">{title}</h1>
      {children ? <div className="mt-4 max-w-2xl text-base leading-8 text-white/80">{children}</div> : null}
    </section>
  );
}
