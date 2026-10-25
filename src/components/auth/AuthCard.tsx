// FILE: src/components/auth/AuthCard.tsx
//
// The frame every account screen shares, drawn like the mobile app's: one
// centred column on the neutral page, with no card around it. The logo, the
// heading and one line of context, then the form, then the "switch screen"
// line at the foot.
import Link from "next/link";
import type { ReactNode } from "react";
import { BrandMark } from "@/components/ui/brand-mark";

interface AuthCardProps {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}

/** Flat platinum fields with a hunter focus ring, as on the phone. */
export const AUTH_INPUT_CLASS =
  "min-h-[52px] rounded-[14px] bg-platinum text-base text-carbon-black placeholder:text-slate-grey focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hunter-green";

export function AuthCard({ title, description, children, footer }: AuthCardProps) {
  return (
    <div className="w-full max-w-[24rem] space-y-8">
      <Link href="/" className="mx-auto flex w-fit items-center py-1" aria-label="Cadence home">
        <BrandMark />
      </Link>
      <div className="space-y-6">
        <div className="space-y-1.5 text-center">
          <h1 className="font-kicker text-[1.75rem] leading-tight text-hunter-green">{title}</h1>
          {description ? <p className="text-[0.95rem] leading-6 text-slate-grey">{description}</p> : null}
        </div>
        {children}
      </div>
      {footer ? <div className="text-center text-[0.95rem] leading-7 text-slate-grey">{footer}</div> : null}
    </div>
  );
}

export function AuthNotice({ tone, children }: { tone: "info" | "success" | "error"; children: ReactNode }) {
  const styles = {
    info: "bg-platinum text-iron-grey",
    success: "bg-yellow-green text-hunter-green",
    error: "bg-blushed-brick text-white",
  }[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded-2xl px-4 py-3 text-sm leading-6 ${styles}`}>
      {children}
    </div>
  );
}

export function FieldLabel({ htmlFor, children }: { htmlFor: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="block pb-1.5 text-sm font-medium text-gunmetal">
      {children}
    </label>
  );
}
