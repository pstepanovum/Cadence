// FILE: src/components/auth/AuthCard.tsx
//
// The frame every account screen shares, drawn like the mobile app's: the logo
// centred above one white card holding the heading, a line of context and the
// form, and the footer line under the card.
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
    <div className="w-full max-w-[26rem] space-y-5">
      <Link href="/" className="mx-auto flex w-fit items-center py-2" aria-label="Cadence home">
        <BrandMark />
      </Link>
      <div className="space-y-5 rounded-[20px] border border-alabaster-grey bg-white px-5 py-7 shadow-[0_1px_2px_rgba(33,37,41,0.04),0_8px_24px_rgba(33,37,41,0.06)] sm:px-7">
        <div className="space-y-1.5">
          <h1 className="text-[1.6rem] font-semibold leading-tight tracking-[-0.01em] text-carbon-black">{title}</h1>
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
    info: "bg-bright-snow text-iron-grey ring-1 ring-alabaster-grey",
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
