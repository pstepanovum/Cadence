// FILE: src/app/download/page.tsx
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "griddy-icons";
import { Navbar } from "@/components/ui/navbar";
import { Footer } from "@/components/ui/footer";
import { SplitText } from "@/components/ui/split-text";

export const metadata: Metadata = {
  title: "Download",
  description:
    "Download the Cadence desktop app for macOS and Windows. Native app with offline support and full AI pronunciation coaching.",
};

const RELEASES = "https://github.com/pstepanovum/Cadence/releases/latest";

/** Set once the iPhone app is live; until then the card says it is on its way. */
const APP_STORE_URL = process.env.NEXT_PUBLIC_APP_STORE_URL?.trim() || "";

const platforms = [
  {
    key: "mac",
    name: "macOS",
    icon: "/icon/apple.svg",
    requirement: "macOS 12 Monterey or later",
    architectures: ["Apple Silicon (M1 – M4)", "Intel x64"],
    href: `${RELEASES}/download/Cadence-mac-universal.dmg`,
    buttonLabel: "Download for Mac",
    fileHint: ".dmg · Universal binary",
  },
  {
    key: "windows",
    name: "Windows",
    icon: "/icon/windows.svg",
    requirement: "Windows 10 or later",
    architectures: ["x64"],
    href: `${RELEASES}/download/Cadence-win-setup.exe`,
    buttonLabel: "Download for Windows",
    fileHint: ".exe · 64-bit installer",
  },
];

export default async function DownloadPage() {
  return (
    <main className="min-h-screen px-4 py-4 sm:px-5 sm:py-5 flex flex-col">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
        <Navbar current="download" variant="dark" />

        {/* ── Hero ── */}
        <section className="flex flex-col items-center gap-4 py-10 text-center">
          <p className="eyebrow text-sm text-sage-text">Desktop app</p>
          <SplitText
            text="Take Cadence with you"
            tag="h1"
            delay={30}
            duration={760}
            className="max-w-xl text-4xl sm:text-5xl pb-3"
            textAlign="center"
          />
          <p className="max-w-md text-sm leading-7 text-iron-grey">
            The full pronunciation coaching experience — offline-ready, native
            feel, no browser required.
          </p>
        </section>

        {/* ── Platform cards ── */}
        <section className="grid gap-4 sm:grid-cols-2 max-w-3xl mx-auto w-full">
          {platforms.map((p) => (
            <div
              key={p.key}
              className="flex flex-col rounded-3xl bg-hunter-green p-8 text-bright-snow"
            >
              {/* Icon + name */}
              <div className="flex items-center gap-4 mb-6">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10">
                  <Image
                    src={p.icon}
                    alt={`${p.name} logo`}
                    width={32}
                    height={32}
                    className="h-8 w-8 object-contain"
                  />
                </div>
                <h2 className="font-kicker text-2xl">{p.name}</h2>
              </div>

              {/* Requirements */}
              <div className="flex flex-col gap-2 mb-8 flex-1">
                <p className="text-sm text-bright-snow/84">{p.requirement}</p>
                <div className="flex flex-wrap gap-2 mt-1">
                  {p.architectures.map((arch) => (
                    <span
                      key={arch}
                      className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-bright-snow/90"
                    >
                      {arch}
                    </span>
                  ))}
                </div>
              </div>

              {/* Download button */}
              <div className="flex flex-col gap-2">
                <Link
                  href={p.href}
                  className="inline-flex items-center justify-center rounded-full bg-yellow-green px-6 py-3 text-sm font-semibold text-hunter-green transition-colors hover:bg-[#b5d567]"
                >
                  {p.buttonLabel}
                </Link>
                <p className="text-center text-xs text-bright-snow/84">
                  {p.fileHint}
                </p>
              </div>
            </div>
          ))}
        </section>

        {/* ── iPhone ── */}
        <section className="mx-auto flex w-full max-w-3xl flex-col gap-4 rounded-3xl bg-platinum p-8 sm:flex-row sm:items-center">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white">
            <Image src="/icon/apple.svg" alt="" width={28} height={28} className="h-7 w-7 object-contain" />
          </div>
          <div className="flex-1">
            <h2 className="font-kicker text-2xl text-hunter-green">iPhone</h2>
            <p className="mt-1 text-sm leading-6 text-iron-grey">
              Practice anywhere, synced with your account, or paired with Cadence on your computer over Wi-Fi. iOS 16.4 or later.
            </p>
          </div>
          {APP_STORE_URL ? (
            <Link href={APP_STORE_URL} className="inline-flex min-h-12 items-center justify-center rounded-full bg-hunter-green px-6 text-sm font-semibold text-white hover:brightness-110">
              App Store
            </Link>
          ) : (
            <span className="inline-flex min-h-12 items-center justify-center rounded-full bg-white px-6 text-sm font-semibold text-iron-grey">Coming to the App Store</span>
          )}
        </section>

        {/* ── Open source note ── */}
        <section className="flex flex-col items-center gap-3 py-6 text-center">
          <p className="text-sm text-iron-grey">
            Cadence is open source.{" "}
            <Link
              href="https://github.com/pstepanovum/Cadence"
              className="font-semibold text-hunter-green underline underline-offset-4 hover:text-sage-text"
              target="_blank"
              rel="noopener noreferrer"
            >
              View on GitHub
            </Link>{" "}
            to build from source or contribute.
          </p>
          <Link
            href={RELEASES}
            className="inline-flex items-center gap-1 text-xs text-iron-grey/70 hover:text-iron-grey transition-colors"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="All releases and changelogs"
          >
            <ArrowUpRight size={14} color="currentColor" />
          </Link>
        </section>

        <Footer />
      </div>
    </main>
  );
}
