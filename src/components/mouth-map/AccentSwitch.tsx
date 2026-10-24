// FILE: src/components/mouth-map/AccentSwitch.tsx
import Link from "next/link";
import type { Variant } from "@/components/mouth-map/targets";
import { cn } from "@/lib/utils";

const NAMES: Record<Variant, string> = { GA: "American (GA)", RP: "British (RP)" };

export function AccentSwitch({ variant, hrefFor }: { variant: Variant; hrefFor: (variant: Variant) => string }) {
  return (
    <nav aria-label="Accent" className="inline-flex rounded-full bg-vanilla-cream p-1">
      {(["GA", "RP"] as const).map((option) => (
        <Link
          key={option}
          href={hrefFor(option)}
          aria-current={option === variant ? "true" : undefined}
          className={cn(
            "inline-flex min-h-10 items-center rounded-full px-4 text-sm font-semibold",
            option === variant ? "bg-hunter-green text-white" : "text-hunter-green",
          )}
        >
          {NAMES[option]}
        </Link>
      ))}
    </nav>
  );
}

export function parseVariant(value: unknown): Variant {
  return value === "RP" ? "RP" : "GA";
}
