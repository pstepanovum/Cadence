// FILE: src/components/ui/pricing-section.tsx
"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import {
  Cursor,
  CursorFollow,
  CursorProvider,
} from "@/components/animate-ui/components/animate/cursor";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CurvedLoop } from "@/components/ui/curved-loop";
import { cn } from "@/lib/utils";

const pricingPlans = [
  {
    name: "Monthly",
    price: "$14.99",
    cadence: "per month",
    detail:
      "Full hosted access for learners who want every Cadence feature without a longer commitment.",
    supportingText: "7-day free trial · cancel any time",
    features: [
      "All features included",
      "Guided modules and conversation practice",
      "No charge until trial ends",
    ],
    ctaLabel: "Start free trial",
    href: "/signup",
    tone: "dark",
    badge: "7-day free trial",
  },
  {
    name: "Yearly",
    price: "$119",
    cadence: "per year",
    detail:
      "The best-value way to build a real speaking streak — every hosted feature unlocked, two months free.",
    supportingText: "$9.92/mo billed annually · coming soon",
    features: [
      "All features included",
      "2 months free vs monthly billing",
      "Best for long-term daily practice",
    ],
    ctaLabel: "Join the waitlist",
    href: "/contact",
    tone: "light",
  },
  {
    name: "Open Source",
    price: "$0",
    cadence: "run it yourself",
    detail:
      "Clone the repo, run Cadence locally on your own machine, and shape the roadmap in public.",
    supportingText: "Self-hosted and contribution-friendly",
    features: [
      "Full codebase on GitHub",
      "Inspect and customize everything",
      "Community-led development",
    ],
    ctaLabel: "View on GitHub",
    href: "https://github.com/cadence-app/cadence",
    tone: "light",
  },
];

export function PricingSection() {
  const rotationRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let animationFrameId: number;

    const handleScroll = () => {
      if (!rotationRef.current) return;

      const rect = rotationRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight;

      // Only calculate if the element is near or within the viewport
      if (rect.top < viewportHeight && rect.bottom > 0) {
        // scrollProgress goes from 0 (at bottom) to 1 (at top)
        const scrollProgress = 1 - (rect.top / viewportHeight);
        
        // Map progress to rotation: -5deg to 15deg (to make it feel like it's tilting right as you go)
        const rotation = -5 + (scrollProgress * 25);

        animationFrameId = requestAnimationFrame(() => {
          if (rotationRef.current) {
             rotationRef.current.style.transform = `rotate(${rotation}deg)`;
          }
        });
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();

    return () => {
      window.removeEventListener("scroll", handleScroll);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <section className="relative isolate overflow-visible py-2">
      <div className="pointer-events-none absolute left-1/2 top-[90%] z-0 h-[360px] w-screen -translate-x-1/2 -translate-y-1/2 overflow-visible sm:h-[420px] lg:h-[560px]">
        <CurvedLoop
          marqueeText="monthly yearly hosted access 7 day trial open source local phoneme practice conversation modules progress coaching"
          speed={1.15}
          curveAmount={-240}
          direction="right"
          interactive={false}
          className="fill-sage-green/12 text-[64px] font-semibold uppercase sm:text-[86px] lg:text-[118px]"
        />
      </div>

      <div className="relative z-10 grid gap-2.5">
        <Card className="bg-transparent p-4 backdrop-blur-0 sm:p-5 lg:px-6">
          <div className="grid gap-2.5 sm:grid-cols-[1.2fr_0.8fr] sm:items-center">
            <div className="space-y-2">
              <p className="eyebrow text-sm text-sage-green">Pricing</p>
              <h2 className="text-2xl font-semibold text-hunter-green sm:text-[2rem]">
                Start free for 7 days. $14.99/mo after — or run it yourself for nothing.
              </h2>
            </div>
            <div className="flex items-center justify-center sm:justify-end">
              <div 
                ref={rotationRef} 
                className="origin-center will-change-transform transition-transform duration-75 ease-out"
              >
                <Image
                  src="/illustration/success-1.svg"
                  alt="Success illustration"
                  width={460}
                  height={360}
                  className="h-auto w-full max-w-[220px] object-contain sm:max-w-[240px]"
                />
              </div>
            </div>
          </div>
        </Card>

        <div className="mb-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:px-20 xl:px-32 lg:items-center">
          {pricingPlans.map((plan, index) => (
            <CursorProvider key={plan.name} className="h-full">
              <Cursor
                className={
                  plan.tone === "dark" ? "bg-yellow-green" : "bg-hunter-green"
                }
              />
              <CursorFollow
                side="top"
                sideOffset={18}
                align="center"
                className={
                  plan.tone === "dark"
                    ? "bg-yellow-green text-hunter-green"
                    : "bg-hunter-green text-white"
                }
              >
                Choose {plan.name}
              </CursorFollow>
              <Card
                className={cn(
                  "flex h-full flex-col justify-between p-8 sm:p-10",
                  plan.tone === "dark"
                    ? "z-10 bg-hunter-green text-white lg:-my-4 lg:min-h-[38rem]"
                    : "bg-white text-hunter-green lg:min-h-[34rem]",
                  index === 0 ? "lg:min-h-[34rem]" : "",
                  index === 2 ? "lg:min-h-[34rem]" : "",
                )}
              >
                <div className="flex flex-1 flex-col">
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p
                        className={cn(
                          "eyebrow text-sm font-bold tracking-widest",
                          plan.tone === "dark"
                            ? "text-yellow-green/90"
                            : "text-sage-green",
                        )}
                      >
                        {plan.name}
                      </p>
                      {plan.badge ? (
                        <span
                          className={cn(
                            "rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]",
                            plan.tone === "dark"
                              ? "bg-yellow-green text-hunter-green"
                              : "bg-hunter-green text-white",
                          )}
                        >
                          {plan.badge}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-4 flex items-end gap-2.5">
                      <span className="font-kicker text-[3.5rem] leading-none font-bold">
                        {plan.price}
                      </span>
                      <span
                        className={cn(
                          "font-kicker text-base",
                          plan.tone === "dark" ? "text-white/72" : "text-iron-grey",
                        )}
                      >
                        {plan.cadence}
                      </span>
                    </div>
                    <p
                      className={cn(
                        "mt-5 text-base leading-7.5",
                        plan.tone === "dark" ? "text-white/80" : "text-iron-grey",
                      )}
                    >
                      {plan.detail}
                    </p>
                    <p
                      className={cn(
                        "mt-4 text-sm font-semibold tracking-wide",
                        plan.tone === "dark"
                          ? "text-yellow-green"
                          : "text-hunter-green",
                      )}
                    >
                      {plan.supportingText}
                    </p>
                  </div>

                  <div className="mt-8 space-y-3">
                    {plan.features.map((feature) => (
                      <div
                        key={feature}
                        className={cn(
                          "rounded-full px-6 py-3 text-sm font-semibold leading-6",
                          plan.tone === "dark"
                            ? "bg-white/12 text-white"
                            : "bg-vanilla-cream text-hunter-green",
                        )}
                      >
                        {feature}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-10">
                  <Button
                    href={plan.href}
                    className={cn(
                      "h-14 w-full rounded-full text-base font-bold",
                      plan.tone === "dark"
                        ? "bg-sage-green hover:bg-[#5d8a43]"
                        : "bg-hunter-green hover:bg-[#4a8155]",
                    )}
                  >
                    {plan.ctaLabel}
                  </Button>
                </div>
              </Card>
            </CursorProvider>
          ))}
        </div>
      </div>
    </section>
  );
}
