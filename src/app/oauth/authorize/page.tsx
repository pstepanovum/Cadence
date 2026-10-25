// FILE: src/app/oauth/authorize/page.tsx
//
// The connector's consent page: the authorization_endpoint in the OAuth
// metadata (src/lib/oauth/metadata.ts). The decision itself is made by
// /api/oauth/authorize, which re-validates every parameter.
import type { Metadata } from "next";
import { AuthorizeConsent } from "@/components/oauth/AuthorizeConsent";

export const metadata: Metadata = {
  title: "Connect an app",
  description: "Let an app read your Cadence progress.",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function AuthorizePage() {
  return (
    <main className="min-h-screen bg-page px-4 py-6 sm:px-6 sm:py-10">
      <div className="mx-auto w-full max-w-lg">
        <AuthorizeConsent />
      </div>
    </main>
  );
}
