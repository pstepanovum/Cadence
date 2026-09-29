// FILE: src/app/pair/page.tsx
//
// The screen that shows the QR. Reached two ways:
//   - `pnpm serve` prints http://localhost:3000/pair?k=<admin token>
//   - the desktop app opens the same URL itself
//
// The `?k=` hand-off is traded for an httpOnly cookie and then dropped from the
// address bar, so the token is not left sitting in history or in a screenshot
// of the browser chrome.
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PairPanel } from "@/components/pair/PairPanel";
import { hasPairingAdminCookie } from "@/lib/pairing/admin";
import { getPairedDevices } from "@/lib/pairing/service";
import { getLanAddresses, getServerDisplayName, getServerPort } from "@/lib/pairing/identity";

export const metadata: Metadata = {
  title: "Connect your phone",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

interface PairPageProps {
  searchParams: Promise<{ k?: string }>;
}

export default async function PairPage({ searchParams }: PairPageProps) {
  const { k } = await searchParams;

  if (typeof k === "string" && k.length > 0) {
    // A page cannot set cookies, so the token is handed to the route handler
    // that can. It redirects straight back here without the query string.
    redirect(`/api/pair/unlock?k=${encodeURIComponent(k)}`);
  }

  const authorized = await hasPairingAdminCookie();

  if (!authorized) {
    return (
      <main className="min-h-screen bg-vanilla-cream px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-xl rounded-3xl bg-hunter-green px-6 py-8 text-bright-snow">
          <p className="eyebrow text-sm text-yellow-green">Pairing</p>
          <h1 className="mt-3 text-3xl font-semibold">
            Open this from the computer running Cadence.
          </h1>
          <p className="mt-4 text-base leading-7 text-bright-snow/80">
            This page hands out access to your computer, so it asks for the key
            that only lives on that machine. On the computer running Cadence, run:
          </p>
          <pre className="mt-4 overflow-x-auto rounded-2xl bg-black/25 px-4 py-3 text-sm">
            pnpm serve
          </pre>
          <p className="mt-4 text-base leading-7 text-bright-snow/80">
            It prints a link. Open that link, and this page will show a QR code
            for your phone.
          </p>
        </div>
      </main>
    );
  }

  const devices = await getPairedDevices();

  return (
    <main className="min-h-screen bg-vanilla-cream px-4 py-6 sm:px-6 lg:px-8">
      <PairPanel
        serverName={getServerDisplayName()}
        port={getServerPort()}
        addresses={getLanAddresses().map((entry) => entry.address)}
        initialDevices={devices}
      />
    </main>
  );
}
