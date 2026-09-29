// FILE: desktop/src/main/pairing.ts
//
// Phone pairing, from the desktop app's side.
//
// Two things have to be true before a phone can reach this app:
//   1. the bundled Next.js runtime has to listen on the LAN, not just loopback
//   2. the person has to be able to open the pairing screen
//
// Point 1 is off by default. Binding 0.0.0.0 puts the whole app on the Wi-Fi,
// and that should be a thing the person chose, not a thing that happened to
// them. The choice is remembered in the app's own data folder and takes effect
// on the next launch, which keeps the runtime lifecycle simple and honest.
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export interface PairingPreferences {
  /** Whether the runtime binds 0.0.0.0 so a phone on the same Wi-Fi can reach it. */
  lanServing: boolean
  /** Guards the pairing screen. Generated once, kept in the app's data folder. */
  adminToken: string
}

export interface PairingPaths {
  /** Where the Next.js server keeps pairing state and paired-device progress. */
  dataDir: string
  preferencesFile: string
}

export function resolvePairingPaths(userDataPath: string): PairingPaths {
  const dataDir = join(userDataPath, 'cadence-data')
  return { dataDir, preferencesFile: join(dataDir, 'desktop-pairing.json') }
}

export function readPairingPreferences(paths: PairingPaths): PairingPreferences {
  try {
    const raw = JSON.parse(readFileSync(paths.preferencesFile, 'utf8')) as Partial<PairingPreferences>
    if (typeof raw.adminToken === 'string' && raw.adminToken.length > 0) {
      return { lanServing: raw.lanServing === true, adminToken: raw.adminToken }
    }
  } catch {
    // Missing or unreadable: fall through and create a fresh set.
  }

  const created: PairingPreferences = {
    lanServing: false,
    adminToken: randomBytes(24).toString('base64url'),
  }
  writePairingPreferences(paths, created)
  return created
}

export function writePairingPreferences(
  paths: PairingPaths,
  preferences: PairingPreferences,
): void {
  if (!existsSync(paths.dataDir)) {
    mkdirSync(paths.dataDir, { recursive: true })
  }
  writeFileSync(paths.preferencesFile, `${JSON.stringify(preferences, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  })
}

/**
 * The address a phone would dial, ranked the same way the server ranks it:
 * real adapters first, never loopback, never a 169.254 link-local.
 */
export function findLanAddress(
  interfaces: Record<string, Array<{ family: string | number; internal: boolean; address: string }> | undefined>,
): string | null {
  const deprioritized = /^(docker|br-|veth|utun|awdl|llw|bridge|vboxnet|vmnet|tap|tun)/i
  const prioritized = /^(en|eth|wl|wlan|wlp|enp)/i
  const found: Array<{ address: string; rank: number }> = []

  for (const [name, entries] of Object.entries(interfaces)) {
    for (const entry of entries ?? []) {
      const isIpv4 = entry.family === 'IPv4' || entry.family === 4
      if (!isIpv4 || entry.internal || entry.address.startsWith('169.254.')) {
        continue
      }
      found.push({
        address: entry.address,
        rank: deprioritized.test(name) ? 2 : prioritized.test(name) ? 0 : 1,
      })
    }
  }

  found.sort((left, right) => left.rank - right.rank)
  return found[0]?.address ?? null
}

/** The URL that unlocks the pairing screen for this install. */
export function buildPairingUrl(appOrigin: string, adminToken: string): string {
  return `${appOrigin}/pair?k=${encodeURIComponent(adminToken)}`
}
