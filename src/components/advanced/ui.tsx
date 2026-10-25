// FILE: src/components/advanced/ui.tsx
//
// Small pieces the advanced pages share: the section tabs, filter chips,
// list rows and the self-rating row. Greyscale frame, hunter green only for
// what is selected or primary, no outlines.
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

const SECTIONS = [
  { href: "/today", label: "Today" },
  { href: "/phrases", label: "Phrases" },
  { href: "/slang", label: "Slang" },
  { href: "/plateau", label: "Plateau track" },
  { href: "/recordings", label: "Recordings" },
];

export function AdvancedNav() {
  const pathname = usePathname() ?? "";
  return (
    <nav aria-label="Advanced practice" className="flex gap-1 overflow-x-auto rounded-[14px] bg-platinum p-1">
      {SECTIONS.map((s) => {
        const active = pathname === s.href || pathname.startsWith(`${s.href}/`);
        return (
          <Link
            key={s.href}
            href={s.href}
            aria-current={active ? "page" : undefined}
            className={cn("shrink-0 rounded-[10px] px-4 py-2 text-sm font-semibold transition-colors", active ? "bg-white text-carbon-black" : "text-iron-grey hover:text-carbon-black")}
          >
            {s.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function PageHead({ eyebrow, title, children, actions }: { eyebrow: string; title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex flex-col gap-3 px-1 pt-2">
      <p className="eyebrow text-sm text-slate-grey">{eyebrow}</p>
      <h1 className="max-w-3xl text-balance text-3xl font-semibold text-carbon-black sm:text-4xl">{title}</h1>
      {children ? <div className="max-w-3xl text-base leading-7 text-iron-grey">{children}</div> : null}
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}

export function Chip({ selected, onClick, children, label }: { selected: boolean; onClick: () => void; children: ReactNode; label?: string }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={label}
      onClick={onClick}
      className={cn("min-h-10 shrink-0 rounded-[12px] px-4 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sage-green", selected ? "bg-hunter-green text-white" : "bg-platinum text-carbon-black hover:bg-alabaster-grey")}
    >
      {children}
    </button>
  );
}

export function Surface({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cn("rounded-[20px] bg-bright-snow p-5 sm:p-6", className)}>{children}</section>;
}

export function Tag({ children, tone = "grey" }: { children: ReactNode; tone?: "grey" | "green" | "muted" }) {
  return (
    <span className={cn("inline-flex items-center rounded-[8px] px-2 py-0.5 text-xs font-semibold", tone === "green" ? "bg-hunter-green text-white" : tone === "muted" ? "bg-alabaster-grey text-iron-grey" : "bg-platinum text-iron-grey")}>
      {children}
    </span>
  );
}

export function RowLink({ href, title, detail, meta }: { href: string; title: string; detail?: string; meta?: ReactNode }) {
  return (
    <Link href={href} className="flex items-start justify-between gap-4 rounded-[14px] px-4 py-3 transition-colors hover:bg-platinum focus-visible:outline-2 focus-visible:outline-sage-green">
      <span className="min-w-0">
        <span className="block font-semibold text-carbon-black">{title}</span>
        {detail ? <span className="mt-0.5 block text-sm leading-6 text-iron-grey">{detail}</span> : null}
      </span>
      {meta ? <span className="flex shrink-0 flex-wrap justify-end gap-1">{meta}</span> : null}
    </Link>
  );
}

export type SelfRating = "again" | "close" | "nailed";

/** After listening back: how close was it? Feeds spaced review. */
export function RateRow({ onRate, disabled }: { onRate: (rating: SelfRating) => void; disabled?: boolean }) {
  const options: { rating: SelfRating; label: string; primary?: boolean }[] = [
    { rating: "again", label: "Again" },
    { rating: "close", label: "Close" },
    { rating: "nailed", label: "Clean", primary: true },
  ];
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="How did it sound?">
      {options.map((o) => (
        <button
          key={o.rating}
          type="button"
          disabled={disabled}
          onClick={() => onRate(o.rating)}
          className={cn("min-h-11 flex-1 rounded-[14px] px-4 text-sm font-semibold disabled:opacity-50", o.primary ? "bg-hunter-green text-white hover:brightness-110" : "bg-platinum text-carbon-black hover:bg-alabaster-grey")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-[20px] bg-bright-snow px-6 py-10 text-center">
      <p className="font-semibold text-carbon-black">{title}</p>
      {children ? <div className="mx-auto mt-2 max-w-md text-sm leading-6 text-iron-grey">{children}</div> : null}
    </div>
  );
}

export function Loading({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label={label}>
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-16 animate-pulse rounded-[14px] bg-platinum" />
      ))}
    </div>
  );
}
