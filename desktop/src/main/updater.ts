import { app, autoUpdater as squirrel, BrowserWindow, dialog, ipcMain, powerMonitor, shell } from 'electron'
import { autoUpdater } from 'electron-updater'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import {
  UPDATE_CHECK_INTERVAL_MS,
  UPDATE_FIRST_CHECK_DELAY_MS,
  canSelfUpdate,
  detectInstallKind,
  isCheckDue,
  menuLabelFor,
  noticeFor,
  reduceUpdate,
  safeFeedOverride,
  type InstallKind,
  type UpdateEvent,
  type UpdateState,
} from './update-policy'

export const UPDATE_CHANNELS = {
  state: 'desktop-update:state',
  getState: 'desktop-update:get-state',
  act: 'desktop-update:act',
  dismiss: 'desktop-update:dismiss',
} as const

interface UpdatePreferences {
  autoCheck: boolean
}

export interface UpdateMenuItem {
  label: string
  enabled: boolean
  autoCheck: boolean
  onClick: () => void
  onToggleAutoCheck: () => void
}

export interface DesktopUpdater {
  menuItem: () => UpdateMenuItem
  dispose: () => void
}

function preferencesPath(): string {
  return join(app.getPath('userData'), 'update-preferences.json')
}

function readPreferences(): UpdatePreferences {
  try {
    const raw = JSON.parse(readFileSync(preferencesPath(), 'utf8')) as Partial<UpdatePreferences>
    return { autoCheck: raw.autoCheck !== false }
  } catch {
    return { autoCheck: true }
  }
}

function writePreferences(preferences: UpdatePreferences): void {
  const path = preferencesPath()
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(preferences, null, 2)}\n`, 'utf8')
}

/**
 * Checks on launch and every six hours, downloads in the background, and only
 * installs when the person restarts from the notice or the menu, or quits the
 * app. MSI installs cannot update themselves, so they get a download link.
 */
export function startDesktopUpdater(options: { onMenuChange: () => void }): DesktopUpdater {
  const feedOverride = safeFeedOverride(process.env.CADENCE_UPDATE_FEED_URL)
  const kind: InstallKind = feedOverride && !app.isPackaged
    ? (process.platform === 'win32' ? 'nsis' : 'mac')
    : detectInstallKind({
        platform: process.platform,
        isPackaged: app.isPackaged,
        execPath: process.execPath,
        productName: app.getName(),
        exists: existsSync,
      })
  const active = kind !== 'unsupported'

  let state: UpdateState = { status: 'idle' }
  let preferences = readPreferences()
  let lastCheckAt: number | null = null
  let dismissedVersion: string | null = null
  let lastMenuLabel = ''
  let interval: NodeJS.Timeout | null = null
  let firstCheck: NodeJS.Timeout | null = null

  const broadcast = () => {
    const notice = noticeFor(state)
    const version = 'version' in state ? state.version : null
    const payload = notice && version !== dismissedVersion ? notice : null
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(UPDATE_CHANNELS.state, payload)
    }
    const label = menuLabelFor(state)
    if (label !== lastMenuLabel) {
      lastMenuLabel = label
      options.onMenuChange()
    }
  }

  const dispatch = (event: UpdateEvent) => {
    const before = state
    state = reduceUpdate(state, event)
    if (state !== before) broadcast()
  }

  const check = async (manual: boolean) => {
    if (!active || state.status === 'checking') return
    lastCheckAt = Date.now()
    dispatch({ type: 'check', manual })
    try {
      await autoUpdater.checkForUpdates()
    } catch (error) {
      dispatch({ type: 'failed', message: error instanceof Error ? error.message : String(error) })
    }
    if (!manual) return

    if (state.status === 'up-to-date') {
      void dialog.showMessageBox({
        type: 'info',
        message: 'Cadence is up to date.',
        detail: `Version ${app.getVersion()} is the latest.`,
      })
    } else if (state.status === 'error') {
      void dialog.showMessageBox({
        type: 'warning',
        message: 'Could not check for updates.',
        detail: 'Check your internet connection and try again.',
      })
    }
  }

  const act = () => {
    if (state.status === 'ready') {
      autoUpdater.quitAndInstall(true, true)
    } else if (state.status === 'available') {
      void shell.openExternal(state.url)
    } else {
      void check(true)
    }
  }

  if (active) {
    autoUpdater.autoDownload = canSelfUpdate(kind)
    autoUpdater.autoInstallOnAppQuit = canSelfUpdate(kind)
    autoUpdater.allowPrerelease = false
    autoUpdater.logger = null
    if (feedOverride) {
      autoUpdater.forceDevUpdateConfig = !app.isPackaged
      autoUpdater.setFeedURL({ provider: 'generic', url: feedOverride })
    } else {
      autoUpdater.setFeedURL({ provider: 'github', owner: 'pstepanovum', repo: 'Cadence', releaseType: 'release' })
    }

    autoUpdater.on('update-available', (info) => dispatch({ type: 'found', version: info.version, kind }))
    autoUpdater.on('update-not-available', () => dispatch({ type: 'none' }))
    autoUpdater.on('download-progress', (progress) => dispatch({ type: 'progress', percent: progress.percent }))
    // On macOS electron-updater reports the download before Squirrel.Mac has
    // fetched and verified it, and quitting in that gap installs nothing. So
    // "Update ready" waits for Squirrel too: once it shows, restarting or
    // quitting always installs. An unsigned build never gets there.
    const waitForSquirrel = process.platform === 'darwin' && canSelfUpdate(kind)
    let squirrelReady = false
    let downloadedVersion: string | null = null
    if (waitForSquirrel) {
      squirrel.on('update-downloaded', () => {
        squirrelReady = true
        if (downloadedVersion) dispatch({ type: 'downloaded', version: downloadedVersion })
      })
    }
    autoUpdater.on('update-downloaded', (info) => {
      downloadedVersion = info.version
      if (!waitForSquirrel || squirrelReady) dispatch({ type: 'downloaded', version: info.version })
    })
    autoUpdater.on('error', (error) => dispatch({ type: 'failed', message: error.message }))

    if (preferences.autoCheck) {
      firstCheck = setTimeout(() => void check(false), UPDATE_FIRST_CHECK_DELAY_MS)
    }
    interval = setInterval(() => {
      if (preferences.autoCheck) void check(false)
    }, UPDATE_CHECK_INTERVAL_MS)
    powerMonitor.on('resume', () => {
      if (preferences.autoCheck && isCheckDue(lastCheckAt, Date.now())) void check(false)
    })
  }

  ipcMain.handle(UPDATE_CHANNELS.getState, () => {
    const notice = noticeFor(state)
    const version = 'version' in state ? state.version : null
    return notice && version !== dismissedVersion ? notice : null
  })
  ipcMain.handle(UPDATE_CHANNELS.act, () => act())
  ipcMain.handle(UPDATE_CHANNELS.dismiss, () => {
    dismissedVersion = 'version' in state ? state.version : null
    broadcast()
  })

  return {
    menuItem: () => ({
      label: active ? menuLabelFor(state) : 'Check for Updates…',
      enabled: active && state.status !== 'checking' && state.status !== 'downloading',
      autoCheck: preferences.autoCheck,
      onClick: act,
      onToggleAutoCheck: () => {
        preferences = { autoCheck: !preferences.autoCheck }
        writePreferences(preferences)
        if (preferences.autoCheck && isCheckDue(lastCheckAt, Date.now())) void check(false)
        options.onMenuChange()
      },
    }),
    dispose: () => {
      if (firstCheck) clearTimeout(firstCheck)
      if (interval) clearInterval(interval)
      ipcMain.removeHandler(UPDATE_CHANNELS.getState)
      ipcMain.removeHandler(UPDATE_CHANNELS.act)
      ipcMain.removeHandler(UPDATE_CHANNELS.dismiss)
    },
  }
}
