import { app, BrowserWindow, dialog, shell, type UtilityProcess } from 'electron'
import { networkInterfaces, hostname } from 'node:os'
import { join } from 'path'
import { DesktopSetupManager } from './setup-manager'
import {
  APP_NAME,
  APP_ORIGIN,
  AUTH_PATHS,
  AUTH_WINDOW_SIZE,
  BLOCKED_PATHS,
  DEFAULT_WINDOW_SIZE,
  DESKTOP_USER_AGENT_SUFFIX,
  PORT,
  SETUP_PATHS,
  SETUP_WINDOW_SIZE,
  isDev,
  resourcesPath,
} from './main/constants'
import { buildMenu } from './main/menu'
import { startNextServer } from './main/next-server'
import { createCadenceWindow } from './main/browser-window'
import { registerSetupIpc } from './main/setup-ipc'
import {
  buildPairingUrl,
  findLanAddress,
  readPairingPreferences,
  resolvePairingPaths,
  writePairingPreferences,
} from './main/pairing'

const ICON_PATH = join(__dirname, '../assets/icon.icns')
const PRELOAD_PATH = join(__dirname, 'preload.js')

let mainWindow: BrowserWindow | null = null
let nextServer: UtilityProcess | null = null
let setupManager: DesktopSetupManager | null = null
let disposeSetupIpc: (() => void) | null = null

app.setName(APP_NAME)

function debugLog(message: string, detail?: unknown): void {
  if (!isDev) {
    return
  }

  if (typeof detail === 'undefined') {
    console.log(`[desktop] ${message}`)
    return
  }

  console.log(`[desktop] ${message}`, detail)
}

async function getDesktopHomePath(): Promise<string> {
  try {
    const setupState = setupManager ? await setupManager.getState() : null
    if (setupState && setupState.phase !== 'ready') {
      return '/desktop/setup'
    }
  } catch {
    // Fall back to the authenticated app shell if setup state can't be read.
  }

  return '/dashboard'
}

async function bootWindow(): Promise<void> {
  mainWindow = await createCadenceWindow({
    appName: APP_NAME,
    appOrigin: APP_ORIGIN,
    isDev,
    iconPath: ICON_PATH,
    preloadPath: PRELOAD_PATH,
    defaultWindowSize: DEFAULT_WINDOW_SIZE,
    authWindowSize: AUTH_WINDOW_SIZE,
    setupWindowSize: SETUP_WINDOW_SIZE,
    authPaths: AUTH_PATHS,
    setupPaths: SETUP_PATHS,
    blockedPaths: BLOCKED_PATHS,
    desktopUserAgentSuffix: DESKTOP_USER_AGENT_SUFFIX,
    resolveDesktopHomePath: getDesktopHomePath,
    onStartBundledServer: async () => {
      if (nextServer) {
        return
      }

      const paths = resolvePairingPaths(app.getPath('userData'))
      const preferences = readPairingPreferences(paths)

      nextServer = await startNextServer({
        appOrigin: APP_ORIGIN,
        port: PORT,
        resourcesPath,
        pairing: {
          lanServing: preferences.lanServing,
          dataDir: paths.dataDir,
          adminToken: preferences.adminToken,
          lanHost: findLanAddress(networkInterfaces()),
          serverName: hostname().replace(/\.local$/i, '').replace(/-/g, ' '),
        },
      })
      nextServer.on('exit', () => {
        nextServer = null
      })
    },
    debugLog,
    onClosed: () => {
      mainWindow = null
    },
  })
}

function pairingPreferences() {
  const paths = resolvePairingPaths(app.getPath('userData'))
  return { paths, preferences: readPairingPreferences(paths) }
}

/**
 * Turning phone pairing on binds the runtime to the LAN, which only takes
 * effect when the runtime starts. Rather than tearing the server down under a
 * running session, the app writes the choice and asks to be reopened — once,
 * the first time. After that this just opens the pairing screen.
 */
async function connectPhone(): Promise<void> {
  const { paths, preferences } = pairingPreferences()

  if (!preferences.lanServing) {
    const { response } = await dialog.showMessageBox({
      type: 'question',
      buttons: ['Turn On and Reopen', 'Cancel'],
      defaultId: 0,
      cancelId: 1,
      message: 'Let your phone connect to this computer?',
      detail:
        'Cadence will accept connections from devices on the same Wi-Fi network. ' +
        'Only phones you pair by scanning a code can use it, and you can unpair ' +
        'them at any time. Cadence needs to reopen for this to take effect.',
    })

    if (response !== 0) {
      return
    }

    writePairingPreferences(paths, { ...preferences, lanServing: true })
    app.relaunch()
    app.quit()
    return
  }

  await shell.openExternal(buildPairingUrl(APP_ORIGIN, preferences.adminToken))
}

async function stopSharing(): Promise<void> {
  const { paths, preferences } = pairingPreferences()

  if (!preferences.lanServing) {
    return
  }

  writePairingPreferences(paths, { ...preferences, lanServing: false })

  const { response } = await dialog.showMessageBox({
    type: 'info',
    buttons: ['Reopen Now', 'Later'],
    defaultId: 0,
    message: 'Phones can no longer connect.',
    detail: 'Cadence will stop accepting Wi-Fi connections the next time it opens.',
  })

  if (response === 0) {
    app.relaunch()
    app.quit()
  }
}

app.whenReady().then(async () => {
  buildMenu(APP_NAME, {
    onConnectPhone: () => {
      void connectPhone()
    },
    isLanServing: () => pairingPreferences().preferences.lanServing,
    onStopSharing: () => {
      void stopSharing()
    },
  })

  setupManager = new DesktopSetupManager()
  disposeSetupIpc = registerSetupIpc({
    setupManager,
    getMainWindow: () => mainWindow,
  })

  await bootWindow()
})

app.on('window-all-closed', () => {
  nextServer?.kill()
  nextServer = null

  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void bootWindow()
  }
})

app.on('before-quit', () => {
  disposeSetupIpc?.()
  disposeSetupIpc = null
  setupManager?.dispose()
  nextServer?.kill()
  nextServer = null
})
