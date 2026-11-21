// FILE: src/app/(reset)/layout.tsx
//
// The password reset page, opened from Cadence's reset email: one plain white
// column (near-black in dark mode), no explainer panel, so the page reads like
// the email that led to it. Same URL as before, /reset-password.
import type { ReactNode } from "react";

export default function ResetLayout({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-white px-4 py-8 sm:py-14">
      <section className="mx-auto flex w-full max-w-[30rem] justify-center">{children}</section>
    </main>
  );
}
