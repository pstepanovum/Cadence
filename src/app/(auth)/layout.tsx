// FILE: src/app/(auth)/layout.tsx
import Image from "next/image";
import type { ReactNode } from "react";
import { SplitText } from "@/components/ui/split-text";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen overflow-hidden px-4 py-4 sm:h-screen sm:px-5 sm:py-5">
      <div className="mx-auto h-full max-w-7xl">
        <div className="grid h-full gap-3 lg:grid-cols-[1.08fr_0.92fr] lg:gap-3">
          <section className="rounded-[2rem] bg-hunter-green p-5 text-bright-snow sm:p-6 lg:p-8">
            <div className="flex h-full flex-col justify-between gap-6">
              <div className="max-w-lg space-y-5">
                <SplitText
                  text="Keep your pronunciation practice moving."
                  tag="h1"
                  delay={30}
                  duration={760}
                  className="max-w-md text-4xl font-semibold leading-tight sm:text-[3.2rem]"
                />
                <p className="max-w-md text-sm leading-7 text-bright-snow/78 sm:text-base">
                  Log in, recover access, and return to the next speaking round without losing progress.
                </p>
              </div>

              <div className="rounded-[2rem] bg-vanilla-cream p-4 text-hunter-green sm:p-5">
                <div className="grid gap-3 md:grid-cols-[0.92fr_1.08fr] md:items-center">
                  <div className="space-y-2">
                    <p className="eyebrow text-sm text-sage-green">
                      Practice flow
                    </p>
                    <h2 className="text-[1.7rem] font-semibold">
                      One account for progress, streaks, and saved takes.
                    </h2>
                    <p className="text-sm leading-7 text-iron-grey">
                      Return to your studio and pick up exactly where the last speaking round ended.
                    </p>
                  </div>
                  <div className="flex items-center justify-center">
                    <Image
                      src="/illustration/progress-1.svg"
                      alt="Learner illustration"
                      width={280}
                      height={220}
                      className="h-auto w-full max-w-[14rem] object-contain sm:max-w-[15rem]"
                    />
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="flex h-full items-center justify-center py-1 lg:py-3">
            {children}
          </section>
        </div>
      </div>
    </main>
  );
}
