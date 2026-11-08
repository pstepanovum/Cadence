// FILE: src/components/account/ConnectedApps.tsx
//
// The apps the learner connected through the Cadence connector (MCP grants).
// Lists them from GET /api/account/connections and disconnects one with
// DELETE; its tokens stop working on the next call. The "New app connected"
// security email links here.
"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cloudFetch } from "@/hooks/cloud-fetch";

type Connection = { grantId: string; clientName: string; scopes: string[]; createdAtMs: number };

const dateFormat = (ms: number) => new Date(ms).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

export function ConnectedApps() {
  const [connections, setConnections] = useState<Connection[] | null | undefined>(undefined);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void cloudFetch("/api/account/connections")
      .then(async (response) => (response.ok ? ((await response.json()) as { connections?: Connection[] }).connections ?? [] : null))
      .catch(() => null)
      .then((list) => {
        if (active) setConnections(list);
      });
    return () => {
      active = false;
    };
  }, []);

  async function disconnect(grantId: string) {
    setBusy(grantId);
    setError(null);
    try {
      const response = await cloudFetch("/api/account/connections", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grantId }),
      });
      if (!response.ok && response.status !== 404) throw new Error("disconnect failed");
      setConnections((list) => list?.filter((entry) => entry.grantId !== grantId) ?? list);
    } catch {
      setError("That app couldn't be disconnected. Try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="bg-white">
      <h2 className="font-kicker text-xl text-carbon-black">Connected apps</h2>
      <p className="mt-1 text-sm leading-6 text-iron-grey">
        Apps you allowed to use your Cadence account through the Cadence connector. Disconnecting one takes effect immediately.
      </p>
      {connections === undefined ? (
        <p role="status" className="mt-4 text-sm text-iron-grey">Loading connected apps…</p>
      ) : connections === null ? (
        <p role="alert" className="mt-4 text-sm text-blushed-brick">Connected apps couldn&apos;t be loaded. Reload the page to try again.</p>
      ) : connections.length === 0 ? (
        <p className="mt-4 text-sm text-iron-grey">No apps are connected.</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {connections.map((entry) => (
            <li key={entry.grantId} className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-carbon-black">{entry.clientName}</p>
                <p className="text-sm text-iron-grey">
                  {entry.createdAtMs ? `Connected ${dateFormat(entry.createdAtMs)}` : "Connected"}
                  {entry.scopes.length ? ` · ${entry.scopes.join(", ")}` : ""}
                </p>
              </div>
              <Button variant="ghost" onClick={() => void disconnect(entry.grantId)} disabled={busy !== null}>
                {busy === entry.grantId ? "Disconnecting…" : "Disconnect"}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {error ? <p role="alert" className="mt-2 text-sm text-blushed-brick">{error}</p> : null}
    </Card>
  );
}
