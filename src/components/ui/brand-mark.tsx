// FILE: src/components/ui/brand-mark.tsx
import { cn } from "@/lib/utils";

interface BrandMarkProps {
  className?: string;
  /** "dark" is the dark logo for light surfaces; it switches to white in dark mode. */
  variant?: "dark" | "white";
}

/**
 * A plain <img>: next/image serves SVGs unoptimised anyway, and importing it
 * would ship its client component on every page that shows the logo.
 */
function Logo({ src, className }: { src: string; className: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- see above
  return <img src={src} alt="Cadence" width={120} height={22} className={className} fetchPriority="high" decoding="async" />;
}

export function BrandMark({ className, variant = "dark" }: BrandMarkProps) {
  if (variant === "white") {
    return (
      <div className={cn("flex h-8 items-center", className)}>
        <Logo src="/logo/logo-white.svg" className="h-[32px] w-auto object-contain" />
      </div>
    );
  }
  return (
    <div className={cn("flex h-8 items-center", className)}>
      <Logo src="/logo/logo-dark.svg" className="theme-light-only h-[32px] w-auto object-contain" />
      <Logo src="/logo/logo-white.svg" className="theme-dark-only h-[32px] w-auto object-contain" />
    </div>
  );
}
