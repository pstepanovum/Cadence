// FILE: src/lib/pairing/identity.ts
//
// What the computer calls itself and where a phone can reach it.
import "server-only";

import { hostname, networkInterfaces, userInfo } from "node:os";

export interface LanAddress {
  address: string;
  /** Interface name, e.g. "en0". Shown on the pairing screen when several exist. */
  interfaceName: string;
  /** Wi-Fi and Ethernet rank above virtual adapters like docker0 or utun. */
  rank: number;
}

const DEPRIORITIZED_INTERFACE = /^(docker|br-|veth|utun|awdl|llw|bridge|vboxnet|vmnet|tap|tun)/i;
const PRIORITIZED_INTERFACE = /^(en|eth|wl|wlan|wlp|enp)/i;

/**
 * Every IPv4 address a phone on the same Wi-Fi could plausibly dial, best
 * first. Loopback is excluded: a phone cannot reach it, and offering it would
 * produce a QR that silently never works.
 *
 * Inside docker the container sees only its bridge address, which is not
 * reachable from a phone. CADENCE_LAN_HOST lets the host tell the container its
 * real address; scripts/serve.mjs sets it.
 */
export function getLanAddresses(): LanAddress[] {
  const override = process.env.CADENCE_LAN_HOST?.trim();
  if (override) {
    return [{ address: override, interfaceName: "configured", rank: 0 }];
  }

  const found: LanAddress[] = [];
  const interfaces = networkInterfaces();

  for (const [interfaceName, entries] of Object.entries(interfaces)) {
    for (const entry of entries ?? []) {
      // Node >= 18 reports family as the number 4; older shapes used "IPv4".
      const isIpv4 = entry.family === "IPv4" || (entry.family as unknown as number) === 4;
      if (!isIpv4 || entry.internal) {
        continue;
      }

      // Link-local (169.254.x.x) means DHCP failed; it is never the right answer.
      if (entry.address.startsWith("169.254.")) {
        continue;
      }

      found.push({
        address: entry.address,
        interfaceName,
        rank: DEPRIORITIZED_INTERFACE.test(interfaceName)
          ? 2
          : PRIORITIZED_INTERFACE.test(interfaceName)
            ? 0
            : 1,
      });
    }
  }

  return found.sort((left, right) => left.rank - right.rank);
}

export function getPrimaryLanAddress(): string | null {
  return getLanAddresses()[0]?.address ?? null;
}

/**
 * The `.local` name the OS already advertises over Bonjour. macOS and most
 * Linux desktops publish this with no code from us, and iOS resolves it
 * natively — which is how the phone finds the computer again after the IP
 * changes, without shipping an mDNS library.
 */
export function getMdnsHostname(): string | null {
  const override = process.env.CADENCE_MDNS_HOST?.trim();
  if (override) {
    return override;
  }

  const raw = hostname().trim();
  if (!raw) {
    return null;
  }

  // Inside a container the hostname is a random hex id with no mDNS record
  // behind it. Offering it would waste a probe on every reconnect.
  if (process.env.CADENCE_IN_CONTAINER === "1") {
    return null;
  }

  return raw.endsWith(".local") ? raw : `${raw}.local`;
}

/** A label a person recognizes on the phone: "Pavel's MacBook Pro". */
export function getServerDisplayName(): string {
  const override = process.env.CADENCE_SERVER_NAME?.trim();
  if (override) {
    return override;
  }

  const raw = hostname().replace(/\.local$/i, "").trim();
  if (raw && process.env.CADENCE_IN_CONTAINER !== "1") {
    // "Pavels-MacBook-Pro" reads better as "Pavels MacBook Pro".
    return raw.replace(/-/g, " ");
  }

  try {
    const user = userInfo().username;
    return user ? `${user}'s computer` : "Cadence server";
  } catch {
    return "Cadence server";
  }
}

export function getServerPort(): number {
  const candidates = [
    process.env.CADENCE_PUBLIC_PORT,
    process.env.PORT,
    process.env.CADENCE_DESKTOP_PORT,
  ];

  for (const candidate of candidates) {
    const parsed = Number(candidate);
    if (Number.isInteger(parsed) && parsed > 0 && parsed <= 65535) {
      return parsed;
    }
  }

  return 3000;
}

export function getAppVersion(): string {
  return process.env.CADENCE_APP_VERSION?.trim() || "0.1.0";
}
