// FILE: src/components/ui/brand-mark.tsx
import Image from "next/image";
import { cn } from "@/lib/utils";

interface BrandMarkProps {
  className?: string;
  variant?: "dark" | "white";
}

export function BrandMark({ className, variant = "dark" }: BrandMarkProps) {
  return (
    <div className={cn("flex h-8 items-center", className)}>
      <Image
        src={variant === "white" ? "/logo/logo-white.svg" : "/logo/logo-dark.svg"}
        alt="Cadence logo"
        width={120}
        height={22}
        className="h-[32px] w-auto object-contain"
        priority
      />
    </div>
  );
}
