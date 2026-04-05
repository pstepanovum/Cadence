// FILE: src/components/ui/trusted-by-strip.tsx
import Image from "next/image";
import { Card } from "@/components/ui/card";

const trustedBrands = [
  { name: "OpenAI", domain: "openai.com", frameClassName: "w-[7.2rem] sm:w-[7.6rem]" },
  { name: "Anthropic", domain: "anthropic.com", frameClassName: "w-[7.6rem] sm:w-[8rem]" },
  { name: "Duolingo", domain: "duolingo.com", frameClassName: "w-[7.3rem] sm:w-[7.7rem]" },
  { name: "Coursera", domain: "coursera.org", frameClassName: "w-[7.5rem] sm:w-[8rem]" },
  { name: "Khan Academy", domain: "khanacademy.org", frameClassName: "w-[8rem] sm:w-[8.4rem]" },
  { name: "Grammarly", domain: "grammarly.com", frameClassName: "w-[7.1rem] sm:w-[7.5rem]" },
  { name: "Quizlet", domain: "quizlet.com", frameClassName: "w-[6.9rem] sm:w-[7.3rem]" },
  { name: "Udemy", domain: "udemy.com", frameClassName: "w-[6.7rem] sm:w-[7.1rem]" },
  { name: "Babbel", domain: "babbel.com", frameClassName: "w-[6.8rem] sm:w-[7.2rem]" },
  { name: "Pearson", domain: "pearson.com", frameClassName: "w-[7.2rem] sm:w-[7.6rem]" },
];

function buildBrandfetchLogoUrl(domain: string, clientId: string) {
  return `https://cdn.brandfetch.io/domain/${domain}/w/220/h/72/theme/dark/fallback/transparent/type/logo?c=${clientId}`;
}

export function TrustedByStrip() {
  const clientId = process.env.NEXT_PUBLIC_BRANDFETCH_CLIENT_ID;

  if (!clientId) {
    return null;
  }

  return (
    <section className="pt-5 sm:pt-7">
      <Card className="bg-vanilla-cream p-4 sm:p-5 lg:px-6 lg:py-6">
        <div className="grid gap-3">
          <div className="text-center">
            <p className="eyebrow text-sm text-sage-green">Trusted by</p>
          </div>

          <div className="relative overflow-hidden py-3 sm:py-4">
            <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-20 bg-[linear-gradient(90deg,var(--vanilla-cream)_0%,rgba(242,232,207,0)_100%)] sm:w-28 lg:w-36" />
            <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-20 bg-[linear-gradient(270deg,var(--vanilla-cream)_0%,rgba(242,232,207,0)_100%)] sm:w-28 lg:w-36" />

            <div className="overflow-hidden">
              <div className="animate-trusted-logo-scroll flex w-max items-center">
                {[0, 1].map((copyIndex) => (
                  <div
                    key={copyIndex}
                    className="flex shrink-0 items-center gap-3 pr-3 sm:gap-4 sm:pr-4 lg:gap-5 lg:pr-5"
                  >
                    {trustedBrands.map((brand) => (
                      <div
                        key={`${copyIndex}-${brand.domain}`}
                        className="flex h-14 shrink-0 items-center justify-center px-1 sm:h-16 sm:px-1.5"
                      >
                        <div
                          className={`relative h-6 ${brand.frameClassName} sm:h-7`}
                        >
                          <Image
                            src={buildBrandfetchLogoUrl(brand.domain, clientId)}
                            alt={`${brand.name} logo`}
                            fill
                            sizes="(max-width: 640px) 120px, 140px"
                            unoptimized
                            className="object-contain object-center grayscale brightness-0 opacity-[0.58] contrast-125 saturate-0"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Card>
    </section>
  );
}
