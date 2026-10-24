// Pure rules for desktop updates: how the app was installed, when to check,
// and what the notice says. No Electron imports, so tests/desktop/ can load it
// directly.

export type InstallKind = 'mac' | 'nsis' | 'msi' | 'unsupported'

/** Check on launch, then every six hours. */
export const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000
/** Wait a little after launch so the check never competes with startup. */
export const UPDATE_FIRST_CHECK_DELAY_MS = 15 * 1000

export const RELEASES_URL = 'https://github.com/pstepanovum/Cadence/releases'

/**
 * NSIS installs put "Uninstall <productName>.exe" next to the executable; an
 * MSI install does not. MSI cannot update itself, so it only gets a link.
 */
export function detectInstallKind(input: {
  platform: string
  isPackaged: boolean
  execPath: string
  productName: string
  exists: (path: string) => boolean
}): InstallKind {
  if (!input.isPackaged) return 'unsupported'
  if (input.platform === 'darwin') return 'mac'
  if (input.platform !== 'win32') return 'unsupported'

  const separator = input.execPath.includes('\\') ? '\\' : '/'
  const dir = input.execPath.slice(0, input.execPath.lastIndexOf(separator))
  return input.exists(`${dir}${separator}Uninstall ${input.productName}.exe`) ? 'nsis' : 'msi'
}

/** MSI and unsupported installs never download; they only learn the version. */
export function canSelfUpdate(kind: InstallKind): boolean {
  return kind === 'mac' || kind === 'nsis'
}

export function releasePageUrl(version: string): string {
  return /^\d+\.\d+\.\d+$/.test(version)
    ? `${RELEASES_URL}/tag/desktop-v${version}`
    : `${RELEASES_URL}/latest`
}

/**
 * A feed override exists only so a fake local feed can be tested. It is
 * honoured for loopback addresses only, so it cannot point a real install at
 * someone else's server.
 */
export function safeFeedOverride(raw: string | undefined): string | null {
  if (!raw) return null
  try {
    const url = new URL(raw)
    const loopback = url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '[::1]'
    return url.protocol === 'http:' && loopback ? url.toString() : null
  } catch {
    return null
  }
}

export type UpdateState =
  | { status: 'idle' }
  | { status: 'checking'; manual: boolean }
  | { status: 'downloading'; version: string; percent: number }
  | { status: 'ready'; version: string }
  | { status: 'available'; version: string; url: string }
  | { status: 'up-to-date'; manual: boolean }
  | { status: 'error'; manual: boolean; message: string }

export type UpdateEvent =
  | { type: 'check'; manual: boolean }
  | { type: 'found'; version: string; kind: InstallKind }
  | { type: 'none' }
  | { type: 'progress'; percent: number }
  | { type: 'downloaded'; version: string }
  | { type: 'failed'; message: string }

/**
 * A downloaded update stays "ready" until the app restarts: later checks do not
 * hide it, and nothing installs it until the person chooses to restart or
 * quits the app.
 */
export function reduceUpdate(state: UpdateState, event: UpdateEvent): UpdateState {
  if (state.status === 'ready') return state

  const manual = state.status === 'checking' ? state.manual : false
  switch (event.type) {
    case 'check':
      if (state.status === 'downloading') return state
      return { status: 'checking', manual: event.manual }
    case 'found':
      return canSelfUpdate(event.kind)
        ? { status: 'downloading', version: event.version, percent: 0 }
        : { status: 'available', version: event.version, url: releasePageUrl(event.version) }
    case 'none':
      return { status: 'up-to-date', manual }
    case 'progress':
      return state.status === 'downloading'
        ? { ...state, percent: Math.max(0, Math.min(100, Math.round(event.percent))) }
        : state
    case 'downloaded':
      return { status: 'ready', version: event.version }
    case 'failed':
      return { status: 'error', manual, message: event.message }
  }
}

export interface UpdateNotice {
  text: string
  action: 'restart' | 'download'
  actionLabel: string
}

/** The small in-window notice, or null when there is nothing to say. */
export function noticeFor(state: UpdateState): UpdateNotice | null {
  if (state.status === 'ready') {
    return { text: 'Update ready. Restart to install.', action: 'restart', actionLabel: 'Restart' }
  }
  if (state.status === 'available') {
    return {
      text: `Cadence ${state.version} is available.`,
      action: 'download',
      actionLabel: 'Download',
    }
  }
  return null
}

/** The menu item's label for the current state. */
export function menuLabelFor(state: UpdateState): string {
  switch (state.status) {
    case 'checking':
      return 'Checking for Updates…'
    case 'downloading':
      return `Downloading Update (${state.percent}%)`
    case 'ready':
      return 'Restart to Install Update'
    case 'available':
      return `Download Cadence ${state.version}…`
    default:
      return 'Check for Updates…'
  }
}

/** After sleep or a long suspend, a check is due once the interval has passed. */
export function isCheckDue(lastCheckAt: number | null, now: number): boolean {
  return lastCheckAt === null || now - lastCheckAt >= UPDATE_CHECK_INTERVAL_MS
}
