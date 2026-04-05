// FILE: src/app/layout.tsx
import type { Metadata } from "next";
import { Funnel_Display, Sour_Gummy } from "next/font/google";
import "./globals.css";
import "lenis/dist/lenis.css";
import { SmoothScroll } from "@/components/ui/smooth-scroll";

const funnelDisplay = Funnel_Display({
  weight: ["300", "400", "500", "600", "700", "800"],
  display: "swap",
  subsets: ["latin"],
  variable: "--font-funnel-display",
});

const sourGummy = Sour_Gummy({
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
  subsets: ["latin"],
  variable: "--font-sour-gummy",
});

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  applicationName: "Cadence",
  title: {
    template: "%s | Cadence",
    default: "Cadence — AI Accent Training for Non-Native English Speakers",
  },
  description:
    "Cadence gives non-native English speakers a focused practice loop: record one word, decode the phoneme mismatch, then repeat with a clearer cue. AI-powered accent training that actually sticks.",
  keywords: [
    "accent training",
    "pronunciation practice",
    "English pronunciation",
    "phoneme feedback",
    "AI language learning",
    "accent clarity",
    "non-native English speakers",
    "pronunciation app",
  ],
  authors: [{ name: "Cadence" }],
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
  openGraph: {
    type: "website",
    siteName: "Cadence",
    title: "Cadence — AI Accent Training for Non-Native English Speakers",
    description:
      "A focused practice loop: record one word, decode the phoneme mismatch, repeat with a clearer cue. AI-powered pronunciation training that sticks.",
    url: appUrl,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Cadence — AI Accent Training",
    description:
      "Record. Decode the phoneme mismatch. Repeat with a clearer cue. AI pronunciation training for non-native English speakers.",
  },
  icons: {
    icon: [
      { url: "/favicon/favicon.ico", sizes: "any" },
      { url: "/favicon/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon/favicon-96x96.png", sizes: "96x96", type: "image/png" },
    ],
    apple: [{ url: "/favicon/apple-touch-icon.png" }],
    shortcut: [{ url: "/favicon/favicon.ico" }],
  },
  manifest: "/favicon/site.webmanifest",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${funnelDisplay.variable} ${sourGummy.variable}`}>
      <body
        className={`${funnelDisplay.className} min-h-screen bg-vanilla-cream`}
      >
        <SmoothScroll>{children}</SmoothScroll>
      </body>
    </html>
  );
}
