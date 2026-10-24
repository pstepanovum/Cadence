// FILE: src/components/auth/AuthCard.tsx
//
// The frame every account screen shares: logo, heading, a line of context,
// then the form or the state the screen is in.
import Link from "next/link";
import type { ReactNode } from "react";
import { BrandMark } from "@/components/ui/brand-mark";

interface AuthCardProps {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}

export function AuthCard({ title, description, children, footer }: AuthCardProps) {
  return (
    <div className="w-full max-w-[30rem] space-y-6 rounded-[2rem] bg-white px-5 py-7 sm:px-8 sm:py-8">
      <div className="space-y-4">
        <Link href="/" className="inline-flex w-fit items-center" aria-label="Cadence home">
          <BrandMark />
        </Link>
        <div className="space-y-2">
          <h1 className="font-kicker text-[1.9rem] leading-tight text-hunter-green sm:text-[2.1rem]">{title}</h1>
          {description ? <p className="text-base leading-7 text-iron-grey">{description}</p> : null}
        </div>
      </div>
      {children}
      {footer ? <div className="text-sm leading-7 text-iron-grey">{footer}</div> : null}
    </div>
  );
}

export function AuthNotice({ tone, children }: { tone: "info" | "success" | "error"; children: ReactNode }) {
  const styles = {
    info: "bg-vanilla-cream text-iron-grey",
    success: "bg-yellow-green text-hunter-green",
    error: "bg-blushed-brick text-white",
  }[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded-3xl px-4 py-3 text-sm leading-6 ${styles}`}>
      {children}
    </div>
  );
}

export function FieldLabel({ htmlFor, children }: { htmlFor: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="block pb-2 text-sm font-medium text-hunter-green">
      {children}
    </label>
  );
}
