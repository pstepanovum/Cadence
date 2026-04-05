// FILE: src/components/ui/footer.tsx
import Link from "next/link";
import { BrandMark } from "@/components/ui/brand-mark";
import { Card } from "@/components/ui/card";
import { PrivacyChoicesModal } from "@/components/ui/privacy-choices-modal";

const footerSections = [
  {
    title: "Practice",
    links: [
      { label: "Practice Studio", href: "/signup" },
      { label: "AI Conversation", href: "/signup" },
      { label: "Daily Modules", href: "/signup" },
      { label: "Progress Tracking", href: "/signup" },
    ],
  },
  {
    title: "Product",
    links: [
      { label: "Features", href: "/#features" },
      { label: "Pricing", href: "/#pricing" },
      { label: "FAQ", href: "/#faq" },
      { label: "Feedback", href: "/contact" },
    ],
  },
  {
    title: "Support",
    links: [
      { label: "Help Center", href: "/help" },
      { label: "Contact Support", href: "/contact" },
      { label: "Privacy Policy", href: "/privacy" },
      { label: "Terms of Service", href: "/terms" },
    ],
  },
];

const legalLinks = [
  { label: "Help Center", href: "/help" },
  { label: "Terms of Service", href: "/terms" },
  { label: "Privacy Policy", href: "/privacy" },
];

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="pb-2">
      <Card className="bg-hunter-green text-white">
        <div className="space-y-12">
          <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr_0.95fr_0.95fr]">
            <div className="space-y-4">
              <Link href="/" className="inline-flex items-center">
                <BrandMark variant="white" />
              </Link>
              <p className="max-w-sm text-sm leading-7 text-white/78">
                Cadence gives non-native English speakers a focused practice
                loop: record a word, see exactly which phoneme is off, repeat
                with a clear cue.
              </p>
              <div className="inline-flex rounded-full bg-white/10 px-4 py-2 text-sm text-white/82">
                Free forever. Open source.
              </div>
            </div>

            {footerSections.map((section) => (
              <div key={section.title} className="space-y-2">
                <h3 className="text-lg font-semibold text-white">
                  {section.title}
                </h3>
                <div className="flex flex-col gap-1">
                  {section.links.map((link) => (
                    <Link
                      key={link.label}
                      href={link.href}
                      className="inline-flex w-fit items-center text-sm text-white/78 transition-colors hover:text-white"
                    >
                      {link.label}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="pt-4 pb-4">
            <div className="flex flex-col gap-4 text-xs text-white/64 lg:flex-row lg:items-center lg:justify-between">
              <p>© {year} Cadence. All Rights Reserved.</p>

              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 lg:justify-end">
                {legalLinks.map((link) => (
                  <Link
                    key={link.label}
                    href={link.href}
                    className="text-xs transition-colors hover:text-white"
                  >
                    {link.label}
                  </Link>
                ))}
                <PrivacyChoicesModal />
              </div>
            </div>
          </div>
        </div>
      </Card>
    </footer>
  );
}
