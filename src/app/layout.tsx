// FILE: src/app/layout.tsx
import type { Metadata, Viewport } from "next";
import { Funnel_Display, Sour_Gummy } from "next/font/google";
import "./globals.css";
import "lenis/dist/lenis.css";
import { cookies } from "next/headers";
import { AppShell } from "@/components/ui/app-shell";
import { PackCacheRegistration } from "@/components/learn-hub/PackCacheRegistration";
import { parseThemeChoice, THEME_COOKIE } from "@/components/theme/theme";
import { getRequestRuntime } from "@/lib/runtime/request-runtime";

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
    default: "Cadence: advanced English, out loud",
  },
  description:
    "Pronunciation with a mouth map for every sound, grammar by CEFR level, sentence building, quizzes, flashcards and a speaking coach. Free and open source to run yourself; Cadence Plus adds cloud AI.",
  keywords: [
    "advanced English",
    "pronunciation practice",
    "English grammar by CEFR level",
    "spaced repetition flashcards",
    "accent training",
    "open source language learning",
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
    title: "Cadence: advanced English, out loud",
    description:
      "Pronunciation, grammar by level, flashcards and a speaking coach. Run it yourself for free, or add Cadence Plus for cloud AI.",
    url: appUrl,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Cadence: advanced English, out loud",
    description:
      "Pronunciation with a mouth map, grammar by CEFR level, flashcards and a speaking coach.",
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

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f1f3f5" },
    { media: "(prefers-color-scheme: dark)", color: "#16191c" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const runtime = await getRequestRuntime();
  const theme = parseThemeChoice((await cookies()).get(THEME_COOKIE)?.value);

  return (
    <html
      lang="en"
      className={`${funnelDisplay.variable} ${sourGummy.variable}`}
      data-theme={theme === "system" ? undefined : theme}
      suppressHydrationWarning
    >
      <body
        className={`${funnelDisplay.className} min-h-screen bg-page`}
      >
        <AppShell runtime={runtime}>{children}</AppShell>
        <PackCacheRegistration />
      </body>
    </html>
  );
}
