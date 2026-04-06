import { app, BrowserWindow, Menu, ipcMain, shell } from 'electron'
import { join } from 'path'
import { spawn, ChildProcess } from 'child_process'
import * as http from 'http'
import { DesktopSetupManager } from './setup-manager'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const isDev       = !app.isPackaged
const PORT        = 3000
const APP_NAME    = 'Cadence'
const DEV_SERVER_ORIGIN = process.env.CADENCE_DEV_SERVER_URL ?? `http://localhost:${PORT}`
const APP_ORIGIN = isDev ? DEV_SERVER_ORIGIN : `http://localhost:${PORT}`
const ICON_PATH   = join(__dirname, '../assets/icon.icns')   // dev; packaging uses electron-builder.yml
const DEFAULT_WINDOW_SIZE = { width: 1280, height: 800, minWidth: 960, minHeight: 640 }
const AUTH_WINDOW_SIZE = { width: 1160, height: 760 }
const DESKTOP_USER_AGENT_TOKEN = 'CadenceDesktop'
const DESKTOP_USER_AGENT_SUFFIX = `${DESKTOP_USER_AGENT_TOKEN}/${app.getVersion()}`
const AUTH_PATHS = new Set([
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
])

// process.resourcesPath is injected by Electron at runtime
const resourcesPath = (process as NodeJS.Process & { resourcesPath: string }).resourcesPath

// Pages that exist on the web but have no place in the desktop app
const BLOCKED_PATHS = new Set([
  '/',
  '/contact',
  '/help',
  '/terms',
  '/privacy',
  '/pricing',
  '/download',
])

let mainWindow: BrowserWindow | null = null
let nextServer:  ChildProcess | null = null
let setupManager: DesktopSetupManager | null = null

// ---------------------------------------------------------------------------
// Branding — set before the app is ready so the dock / menu bar use the
// correct name immediately (important on macOS)
// ---------------------------------------------------------------------------

app.setName(APP_NAME)

// ---------------------------------------------------------------------------
// macOS application menu
// Replaces the default "Electron" menu with a proper "Cadence" one.
// The View menu is intentionally omitted so zoom keyboard shortcuts
// (Cmd +/-/0) are never registered.
// ---------------------------------------------------------------------------

function buildMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: APP_NAME,
      submenu: [
        { label: `About ${APP_NAME}`, role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { label: `Hide ${APP_NAME}`, role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { label: `Quit ${APP_NAME}`, role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'pasteAndMatchStyle' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'close' },
        { type: 'separator' },
        { role: 'front' },
      ],
    },
    // NOTE: No 'View' menu — removing it strips out the default
    // Cmd+= / Cmd+- / Cmd+0 zoom shortcuts from the menu bar.
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

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

async function navigateToDesktopHome(): Promise<void> {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return
  }

  const nextPath = await getDesktopHomePath()
  const nextUrl = `${APP_ORIGIN}${nextPath}`
  if (mainWindow.webContents.getURL() !== nextUrl) {
    await mainWindow.loadURL(nextUrl)
  }
}

// ---------------------------------------------------------------------------
// Server management
// ---------------------------------------------------------------------------

function waitForServer(retries = 40): Promise<void> {
  return new Promise((resolve, reject) => {
    const attempt = (remaining: number) => {
      const req = http.get(APP_ORIGIN, (res) => {
        if (res.statusCode && res.statusCode < 500) {
          resolve()
        } else {
          retry(remaining)
        }
      })
      req.on('error', () => retry(remaining))
      req.end()
    }

    const retry = (remaining: number) => {
      if (remaining <= 0) {
        reject(new Error('Next.js server failed to start within the timeout.'))
        return
      }
      setTimeout(() => attempt(remaining - 1), 500)
    }

    attempt(retries)
  })
}

function startNextServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    const serverScript = join(resourcesPath, 'next-server', 'server.js')

    nextServer = spawn('node', [serverScript], {
      env: {
        ...process.env,
        PORT: String(PORT),
        NODE_ENV: 'production',
        NEXT_SHARP_PATH: join(resourcesPath, 'next-server', 'node_modules', 'sharp'),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    nextServer.stdout?.on('data', (d) => {
      const msg = d.toString()
      console.log('[next]', msg)
      if (msg.includes('Ready') || msg.includes('started server')) resolve()
    })

    nextServer.stderr?.on('data', (d) => console.error('[next:err]', d.toString()))
    nextServer.on('error', reject)
    nextServer.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        reject(new Error(`Next.js process exited with code ${code}`))
      }
    })

    waitForServer().then(resolve).catch(reject)
  })
}

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------

function applyWindowModeForPath(pathname: string): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return
  }

  const isAuthRoute = AUTH_PATHS.has(pathname)

  if (isAuthRoute) {
    mainWindow.setResizable(false)
    mainWindow.setMaximizable(false)
    mainWindow.setFullScreenable(false)
    mainWindow.setMinimumSize(AUTH_WINDOW_SIZE.width, AUTH_WINDOW_SIZE.height)
    mainWindow.setMaximumSize(AUTH_WINDOW_SIZE.width, AUTH_WINDOW_SIZE.height)
    mainWindow.setSize(AUTH_WINDOW_SIZE.width, AUTH_WINDOW_SIZE.height, true)
    mainWindow.center()
    return
  }

  mainWindow.setResizable(true)
  mainWindow.setMaximizable(true)
  mainWindow.setFullScreenable(true)
  mainWindow.setMinimumSize(
    DEFAULT_WINDOW_SIZE.minWidth,
    DEFAULT_WINDOW_SIZE.minHeight,
  )
  mainWindow.setMaximumSize(10000, 10000)

  const [currentWidth, currentHeight] = mainWindow.getSize()
  if (
    currentWidth < DEFAULT_WINDOW_SIZE.minWidth ||
    currentHeight < DEFAULT_WINDOW_SIZE.minHeight ||
    currentWidth === AUTH_WINDOW_SIZE.width ||
    currentHeight === AUTH_WINDOW_SIZE.height
  ) {
    mainWindow.setSize(DEFAULT_WINDOW_SIZE.width, DEFAULT_WINDOW_SIZE.height, true)
    mainWindow.center()
  }
}

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: DEFAULT_WINDOW_SIZE.width,
    height: DEFAULT_WINDOW_SIZE.height,
    minWidth: DEFAULT_WINDOW_SIZE.minWidth,
    minHeight: DEFAULT_WINDOW_SIZE.minHeight,
    title: APP_NAME,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: '#f2e8cf',   // vanilla-cream — prevents white flash
    icon: ICON_PATH,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Lock zoom to 1 — user cannot change it via preferences either
      zoomFactor: 1.0,
    },
  })

  if (!isDev) {
    await startNextServer()
  }

  const baseUserAgent = mainWindow.webContents.getUserAgent()
  const desktopUserAgent = `${baseUserAgent} ${DESKTOP_USER_AGENT_SUFFIX}`
  mainWindow.webContents.setUserAgent(desktopUserAgent)
  debugLog('desktop user agent attached', desktopUserAgent)

  // ── Disable zoom completely ──────────────────────────────────────────────

  // 1. Clamp visual (pinch-to-zoom) range to exactly 1×
  mainWindow.webContents.setVisualZoomLevelLimits(1, 1)

  // 2. Reset any zoom that may have been restored from a previous session
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow?.webContents.setZoomFactor(1)
    mainWindow?.webContents.setZoomLevel(0)
  })

  // 3. Intercept keyboard shortcuts: Cmd/Ctrl + (= + -  0)
  //    These still fire even when the View menu is absent.
  mainWindow.webContents.on('before-input-event', (event, input) => {
    const mod = input.meta || input.control
    const zoomKey = input.key === '+' || input.key === '-' ||
                    input.key === '=' || input.key === '0'
    if (mod && zoomKey) {
      event.preventDefault()
    }
  })

  // ── Navigation guards ────────────────────────────────────────────────────

  const initialPath = await getDesktopHomePath()
  const initialUrl = `${APP_ORIGIN}${initialPath}`

  debugLog('loading desktop window URL', initialUrl)
  mainWindow.loadURL(initialUrl)
  applyWindowModeForPath(initialPath)

  mainWindow.webContents.on('will-navigate', (event, targetUrl) => {
    const { pathname } = new URL(targetUrl)
    if (BLOCKED_PATHS.has(pathname)) {
      event.preventDefault()
      void navigateToDesktopHome()
      return
    }
  })

  mainWindow.webContents.on('did-navigate', (_event, targetUrl) => {
    const { pathname } = new URL(targetUrl)
    if (BLOCKED_PATHS.has(pathname)) {
      void navigateToDesktopHome()
      return
    }
    applyWindowModeForPath(pathname)
  })

  mainWindow.webContents.on('did-navigate-in-page', (_event, targetUrl) => {
    const { pathname } = new URL(targetUrl)
    if (BLOCKED_PATHS.has(pathname)) {
      void navigateToDesktopHome()
      return
    }
    applyWindowModeForPath(pathname)
  })

  // Open external links in the system browser
  mainWindow.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
    if (!targetUrl.startsWith(APP_ORIGIN)) {
      shell.openExternal(targetUrl)
    }
    return { action: 'deny' }
  })

  mainWindow.on('closed', () => { mainWindow = null })
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

app.whenReady().then(() => {
  // Set menu immediately — before anything that could throw
  buildMenu()

  setupManager = new DesktopSetupManager()

  setupManager.onState((state) => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return
    }

    mainWindow.webContents.send('desktop-setup:state', state)
  })

  ipcMain.handle('desktop-setup:get-state', async () => {
    return setupManager?.getState() ?? null
  })

  ipcMain.handle('desktop-setup:get-runtime-details', async () => {
    const state = await (setupManager?.getState() ?? null)
    return state?.runtimeDetails ?? null
  })

  ipcMain.handle('desktop-setup:install', async () => {
    return setupManager?.install() ?? null
  })

  ipcMain.handle('desktop-setup:retry', async () => {
    return setupManager?.retry() ?? null
  })

  ipcMain.handle('desktop-setup:open-logs', async () => {
    await setupManager?.openLogs()
    return null
  })

  ipcMain.handle('desktop-setup:open-location', async (_event, location: string) => {
    await setupManager?.openLocation(location as never)
    return null
  })

  createWindow()
})

app.on('window-all-closed', () => {
  nextServer?.kill()
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

app.on('before-quit', () => {
  nextServer?.kill()
})
