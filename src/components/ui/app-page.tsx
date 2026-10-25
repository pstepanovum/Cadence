// FILE: src/components/ui/app-page.tsx
//
// The frame of an in-app page (practice, sounds, account): navbar on the web,
// nothing extra on desktop where the sidebar navigates.
import type { ReactNode } from "react";
import { Navbar, type NavKey } from "@/components/ui/navbar";

export function AppPage({ children, current }: { children: ReactNode; current?: NavKey }) {
  return (
    <main className="flex min-h-screen flex-col items-center px-4 pt-4 pb-10 sm:px-5 sm:pt-5 sm:pb-12 lg:px-6 lg:pt-6 lg:pb-14">
      <div className="mx-auto flex w-full min-w-0 max-w-[1400px] flex-col gap-4">
        <Navbar current={current} />
        {children}
      </div>
    </main>
  );
}

export function AppIntro({ eyebrow, title, children, actions }: { eyebrow: string; title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <section className="rounded-[20px] bg-white px-5 py-6 sm:px-8 sm:py-8">
      <p className="eyebrow text-sm text-slate-grey">{eyebrow}</p>
      <h1 className="mt-2 max-w-3xl text-balance text-3xl font-semibold text-carbon-black sm:text-4xl">{title}</h1>
      {children ? <div className="mt-3 max-w-3xl text-base leading-7 text-iron-grey">{children}</div> : null}
      {actions ? <div className="mt-5 flex flex-wrap gap-2">{actions}</div> : null}
    </section>
  );
}
