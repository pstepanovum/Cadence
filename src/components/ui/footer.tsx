// FILE: src/components/ui/footer.tsx
import Link from "next/link";
import { BrandMark } from "@/components/ui/brand-mark";
import { Card } from "@/components/ui/card";
import { NewsletterForm } from "@/components/newsletter/NewsletterForm";
import { PrivacyChoicesModal } from "@/components/ui/privacy-choices-modal";

export const GITHUB_URL = "https://github.com/pstepanovum/Cadence";

const footerSections = [
  {
    title: "Practice",
    links: [
      { label: "Sounds and mouth map", href: "/sounds" },
      { label: "Grammar by level", href: "/grammar" },
      { label: "Practice hub", href: "/practice" },
      { label: "Pronunciation modules", href: "/learn" },
    ],
  },
  {
    title: "Product",
    links: [
      { label: "Pricing", href: "/pricing" },
      { label: "Download", href: "/download" },
      { label: "Connect an AI app", href: "/connector" },
      { label: "Redeem a code", href: "/redeem" },
      { label: "Run it yourself", href: GITHUB_URL },
    ],
  },
  {
    title: "Support",
    links: [
      { label: "Support", href: "/support" },
      { label: "Contact", href: "/contact" },
      { label: "Newsletter", href: "/newsletter" },
      { label: "Privacy Policy", href: "/privacy" },
      { label: "Terms of Service", href: "/terms" },
      { label: "Credits and licences", href: "/credits" },
    ],
  },
];

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="pb-2">
      <Card className="bg-hunter-green text-white">
        <div className="space-y-10">
          <div className="grid gap-8 lg:grid-cols-[1.3fr_0.9fr_0.9fr_0.9fr]">
            <div className="space-y-5">
              <Link href="/" className="inline-flex items-center" aria-label="Cadence home">
                <BrandMark variant="white" />
              </Link>
              <p className="max-w-sm text-sm leading-7 text-white/84">
                Advanced English, out loud: pronunciation, grammar, flashcards
                and a speaking coach. Open source and free to run yourself.
              </p>
              <NewsletterForm source="footer" tone="onDark" className="max-w-md" />
            </div>

            {footerSections.map((section) => (
              <nav key={section.title} aria-label={section.title} className="space-y-2">
                <h2 className="text-lg font-semibold text-white">{section.title}</h2>
                <ul className="flex flex-col gap-1">
                  {section.links.map((link) => (
                    <li key={link.label}>
                      <Link
                        href={link.href}
                        className="inline-flex min-h-8 w-fit items-center text-sm text-white/84 transition-colors hover:text-white"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>

          <div className="flex flex-col gap-3 pb-2 text-xs text-white/84 lg:flex-row lg:items-center lg:justify-between">
            <p>© {year} Cadence. Open source under the MIT licence.</p>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <Link href="/support" className="hover:text-white">Support</Link>
              <Link href="/privacy" className="hover:text-white">Privacy</Link>
              <Link href="/terms" className="hover:text-white">Terms</Link>
              <Link href="/credits" className="hover:text-white">Credits</Link>
              <PrivacyChoicesModal />
            </div>
          </div>
        </div>
      </Card>
    </footer>
  );
}
