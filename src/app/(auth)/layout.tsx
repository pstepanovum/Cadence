// FILE: src/app/(auth)/layout.tsx
//
// Account screens: sign in, sign up, password reset, email confirmation. One
// column on phones; a short explainer beside the form on wide screens. The page
// scrolls, so a long form never clips at 375 px.
import Image from "next/image";
import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-vanilla-cream px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
      <div className="mx-auto grid w-full max-w-6xl items-center gap-6 lg:min-h-[calc(100vh-5rem)] lg:grid-cols-[1fr_1fr]">
        <section className="hidden rounded-[2.5rem] bg-hunter-green px-10 py-12 text-bright-snow lg:block">
          <p className="eyebrow text-sm text-yellow-green">Cadence account</p>
          <h2 className="mt-4 max-w-md text-[2.6rem] font-semibold leading-[1.02]">
            Your practice, on every device.
          </h2>
          <p className="mt-4 max-w-md text-base leading-8 text-bright-snow/80">
            A free account keeps your streak and lesson stats. Cadence Plus adds
            cloud AI and full history. Running Cadence yourself needs no account at all.
          </p>
          <div className="mt-8 flex justify-center rounded-[2rem] bg-white/10 p-6">
            <Image src="/illustration/progress-1.svg" alt="" width={300} height={220} className="h-auto w-full max-w-[16rem]" />
          </div>
        </section>
        <section className="flex w-full justify-center">{children}</section>
      </div>
    </main>
  );
}
