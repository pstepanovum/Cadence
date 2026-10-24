// FILE: src/components/ui/brand-mark.tsx
import Image from "next/image";
import { cn } from "@/lib/utils";

interface BrandMarkProps {
  className?: string;
  /** "dark" is the dark logo for light surfaces; it switches to white in dark mode. */
  variant?: "dark" | "white";
}

export function BrandMark({ className, variant = "dark" }: BrandMarkProps) {
  if (variant === "white") {
    return (
      <div className={cn("flex h-8 items-center", className)}>
        <Image src="/logo/logo-white.svg" alt="Cadence" width={120} height={22} className="h-[32px] w-auto object-contain" priority />
      </div>
    );
  }
  return (
    <div className={cn("flex h-8 items-center", className)}>
      <Image src="/logo/logo-dark.svg" alt="Cadence" width={120} height={22} className="theme-light-only h-[32px] w-auto object-contain" priority />
      <Image src="/logo/logo-white.svg" alt="Cadence" width={120} height={22} className="theme-dark-only h-[32px] w-auto object-contain" priority />
    </div>
  );
}
