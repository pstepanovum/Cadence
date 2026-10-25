// FILE: src/app/(dashboard)/connect-phone/page.tsx
//
// "Connect your phone": the in-app page for pairing a phone with this
// computer. Holding the pairing key (the cookie /pair sets) shows the QR right
// here; otherwise it explains the one step that hands it over: Phone › Connect
// a Phone in the desktop app's menu, or the link `pnpm serve` prints.
import type { Metadata } from "next";
import { PairPanel } from "@/components/pair/PairPanel";
import { AppIntro, AppPage } from "@/components/ui/app-page";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { hasPairingAdminCookie } from "@/lib/pairing/admin";
import { getPairedDevices } from "@/lib/pairing/service";
import { getLanAddresses, getServerDisplayName, getServerPort } from "@/lib/pairing/identity";
import { getRequestRuntime } from "@/lib/runtime/request-runtime";

export const metadata: Metadata = {
  title: "Connect your phone",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function ConnectPhonePage() {
  const [authorized, runtime] = await Promise.all([hasPairingAdminCookie(), getRequestRuntime()]);

  if (authorized) {
    const devices = await getPairedDevices();
    return (
      <AppPage>
        <PairPanel
          serverName={getServerDisplayName()}
          port={getServerPort()}
          addresses={getLanAddresses().map((entry) => entry.address)}
          initialDevices={devices}
        />
      </AppPage>
    );
  }

  const isDesktop = runtime === "desktop";
  return (
    <AppPage>
      <AppIntro eyebrow="Connect your phone" title="Use this computer's Cadence from your phone.">
        Your phone sends recordings to this computer on your Wi-Fi, so scoring, voices and the coach are free and
        unlimited. Your progress stays here, or follows your account if you sign in.
      </AppIntro>
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="bg-white text-carbon-black">
          <h2 className="font-kicker text-2xl">{isDesktop ? "Show the QR code" : "On the computer running Cadence"}</h2>
          {isDesktop ? (
            <ol className="mt-3 space-y-2 text-base leading-7 text-iron-grey">
              <li>1. In the menu bar, choose <strong>Phone › Connect a Phone</strong>.</li>
              <li>2. The first time, Cadence asks to accept Wi-Fi connections and reopens.</li>
              <li>3. Choose it again: the QR code opens in your browser.</li>
            </ol>
          ) : (
            <>
              <p className="mt-3 text-base leading-7 text-iron-grey">
                Open the desktop app and choose Phone › Connect a Phone, or on a self-hosted server run:
              </p>
              <pre className="mt-3 overflow-x-auto rounded-2xl bg-black/25 px-4 py-3 text-sm">pnpm serve</pre>
              <p className="mt-3 text-sm text-iron-grey">It prints a link that shows the QR code.</p>
            </>
          )}
        </Card>
        <Card className="bg-white">
          <h2 className="font-kicker text-2xl text-carbon-black">On your phone</h2>
          <ol className="mt-3 space-y-2 text-base leading-7 text-iron-grey">
            <li>1. Install Cadence and open it.</li>
            <li>2. Choose <strong className="text-carbon-black">Connect your own Cadence</strong>.</li>
            <li>3. Scan the code. Both devices need the same Wi-Fi.</li>
          </ol>
          {!isDesktop ? (
            <Button href="/download" variant="ghost" className="mt-4">Get the desktop app</Button>
          ) : null}
        </Card>
      </div>
    </AppPage>
  );
}
