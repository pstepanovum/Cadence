"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { PairedDeviceSummary } from "@/lib/pairing/protocol";

interface IssuedCode {
  uri: string;
  qrSvg: string;
  displayCode: string;
  expiresAt: number;
  addresses: string[];
}

interface PairPanelProps {
  serverName: string;
  port: number;
  addresses: string[];
  initialDevices: PairedDeviceSummary[];
}

export function PairPanel({ serverName, port, addresses, initialDevices }: PairPanelProps) {
  const [code, setCode] = useState<IssuedCode | null>(null);
  const [devices, setDevices] = useState<PairedDeviceSummary[]>(initialDevices);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [remaining, setRemaining] = useState(0);
  const codeRef = useRef<IssuedCode | null>(null);

  const refreshDevices = useCallback(async () => {
    try {
      const response = await fetch("/api/pair/devices", { cache: "no-store" });
      if (!response.ok) return;
      const body = (await response.json()) as { devices: PairedDeviceSummary[] };
      setDevices(body.devices);
    } catch {
      // A refresh failure is not worth interrupting the person over; the list
      // simply stays as it was.
    }
  }, []);

  const issueCode = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/pair/code", {
        method: "POST",
        cache: "no-store",
      });

      const body = (await response.json().catch(() => null)) as
        | (IssuedCode & { error?: string })
        | null;

      if (!response.ok || !body) {
        throw new Error(body?.error ?? "Cadence could not create a pairing code.");
      }

      setCode(body);
      codeRef.current = body;
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Cadence could not create a pairing code.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void issueCode();
  }, [issueCode]);

  // Countdown, and poll for the phone actually showing up so the list updates
  // the moment pairing succeeds.
  useEffect(() => {
    const timer = setInterval(() => {
      const current = codeRef.current;
      if (!current) return;
      setRemaining(Math.max(0, Math.ceil((current.expiresAt - Date.now()) / 1000)));
    }, 500);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      void refreshDevices();
    }, 3_000);
    return () => clearInterval(timer);
  }, [refreshDevices]);

  async function revoke(deviceId: string, name: string) {
    if (!window.confirm(`Unpair ${name}? It will stop working right away.`)) {
      return;
    }

    try {
      const response = await fetch(`/api/pair/devices/${deviceId}`, { method: "DELETE" });
      if (!response.ok) {
        throw new Error("Cadence could not unpair that device.");
      }
      await refreshDevices();
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : "Cadence could not unpair that device.",
      );
    }
  }

  const expired = code !== null && remaining <= 0;

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-4 lg:grid-cols-[1fr_1fr]">
      <section className="rounded-3xl bg-hunter-green px-6 py-8 text-bright-snow">
        <p className="eyebrow text-sm text-yellow-green">Connect your phone</p>
        <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">
          Scan this with Cadence on your phone.
        </h1>
        <p className="mt-4 text-base leading-7 text-bright-snow/80">
          Open Cadence on your phone, choose <strong>Connect to my computer</strong>,
          and point the camera here. Your phone and this computer need to be on
          the same Wi-Fi.
        </p>

        <div className="mt-6 space-y-2 rounded-3xl bg-white/10 px-4 py-4 text-sm leading-7 text-bright-snow/85">
          <p>
            This computer: <span className="font-semibold text-bright-snow">{serverName}</span>
          </p>
          <p>
            Address:{" "}
            <span className="font-semibold text-bright-snow">
              {addresses[0] ? `${addresses[0]}:${port}` : "no Wi-Fi address found"}
            </span>
          </p>
          {addresses.length > 1 ? (
            <p className="text-bright-snow/70">
              Also reachable at {addresses.slice(1).map((entry) => `${entry}:${port}`).join(", ")}
            </p>
          ) : null}
        </div>

        {addresses.length === 0 ? (
          <p className="mt-4 rounded-3xl bg-blushed-brick/25 px-4 py-3 text-sm leading-7">
            This computer has no Wi-Fi or Ethernet address right now, so a phone
            cannot reach it. Connect to a network and reload this page.
          </p>
        ) : null}
      </section>

      <section className="grid gap-4">
        <div className="rounded-3xl bg-bright-snow px-6 py-6">
          {loading ? (
            <p className="text-base text-iron-grey">Making a code…</p>
          ) : error ? (
            <div className="space-y-3">
              <p className="text-base leading-7 text-blushed-brick">{error}</p>
              <button
                type="button"
                onClick={() => void issueCode()}
                className="rounded-full bg-hunter-green px-5 py-2 text-sm font-semibold text-bright-snow">
                Try again
              </button>
            </div>
          ) : code ? (
            <div className="space-y-4">
              <div className="relative mx-auto w-fit">
                <div
                  className={expired ? "opacity-15" : undefined}
                  // The SVG is generated on this server from this server's own
                  // payload; nothing here comes from a remote source.
                  dangerouslySetInnerHTML={{ __html: code.qrSvg }}
                />
                {expired ? (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <button
                      type="button"
                      onClick={() => void issueCode()}
                      className="rounded-full bg-hunter-green px-6 py-3 text-sm font-semibold text-bright-snow">
                      Show a new code
                    </button>
                  </div>
                ) : null}
              </div>

              <div className="text-center">
                <p className="eyebrow text-xs text-slate-grey">Or type this code</p>
                <p className="mt-1 font-mono text-2xl font-semibold tracking-widest text-hunter-green">
                  {expired ? "— — — —" : code.displayCode}
                </p>
                <p className="mt-2 text-sm text-slate-grey">
                  {expired
                    ? "This code has expired."
                    : `Expires in ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`}
                </p>
              </div>

              {!expired ? (
                <button
                  type="button"
                  onClick={() => void issueCode()}
                  className="w-full rounded-full border border-alabaster-grey px-5 py-2 text-sm font-semibold text-iron-grey">
                  Show a different code
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="rounded-3xl bg-bright-snow px-6 py-6">
          <h2 className="text-lg font-semibold text-hunter-green">Paired devices</h2>

          {devices.length === 0 ? (
            <p className="mt-3 text-sm leading-7 text-slate-grey">
              No phones are paired with this computer yet.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {devices.map((device) => (
                <li
                  key={device.deviceId}
                  className="flex items-center justify-between gap-3 rounded-2xl bg-vanilla-cream px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-carbon-black">{device.name}</p>
                    <p className="text-xs text-slate-grey">
                      {device.platform}
                      {device.model ? ` · ${device.model}` : ""} · paired{" "}
                      {new Date(device.pairedAt).toLocaleDateString()}
                      {device.lastSeenAt
                        ? ` · last seen ${new Date(device.lastSeenAt).toLocaleTimeString()}`
                        : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void revoke(device.deviceId, device.name)}
                    className="shrink-0 rounded-full border border-blushed-brick px-4 py-1.5 text-xs font-semibold text-blushed-brick">
                    Unpair
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
