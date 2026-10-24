import { BrowserWindow, shell } from 'electron'

interface WindowSize {
  width: number
  height: number
  minWidth: number
  minHeight: number
}

interface FixedWindowSize {
  width: number
  height: number
}

interface CreateCadenceWindowOptions {
  appName: string
  appOrigin: string
  isDev: boolean
  iconPath: string
  preloadPath: string
  defaultWindowSize: WindowSize
  authWindowSize: FixedWindowSize
  setupWindowSize: FixedWindowSize
  authPaths: Set<string>
  setupPaths: Set<string>
  blockedPaths: Set<string>
  desktopUserAgentSuffix: string
  resolveDesktopHomePath: () => Promise<string>
  onStartBundledServer: () => Promise<void>
  debugLog: (message: string, detail?: unknown) => void
  onClosed: () => void
}

export async function createCadenceWindow({
  appName,
  appOrigin,
  isDev,
  iconPath,
  preloadPath,
  defaultWindowSize,
  authWindowSize,
  setupWindowSize,
  authPaths,
  setupPaths,
  blockedPaths,
  desktopUserAgentSuffix,
  resolveDesktopHomePath,
  onStartBundledServer,
  debugLog,
  onClosed,
}: CreateCadenceWindowOptions): Promise<BrowserWindow> {
  const mainWindow = new BrowserWindow({
    width: defaultWindowSize.width,
    height: defaultWindowSize.height,
    minWidth: defaultWindowSize.minWidth,
    minHeight: defaultWindowSize.minHeight,
    title: appName,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: '#f2e8cf',
    icon: iconPath,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      zoomFactor: 1.0,
    },
  })

  const applyFixedWindowSize = (size: FixedWindowSize) => {
    mainWindow.setResizable(false)
    mainWindow.setMaximizable(false)
    mainWindow.setFullScreenable(false)
    mainWindow.setMinimumSize(size.width, size.height)
    mainWindow.setMaximumSize(size.width, size.height)
    mainWindow.setSize(size.width, size.height, true)
    mainWindow.center()
  }

  const applyWindowModeForPath = (pathname: string) => {
    if (mainWindow.isDestroyed()) {
      return
    }

    if (authPaths.has(pathname)) {
      applyFixedWindowSize(authWindowSize)
      return
    }

    if (setupPaths.has(pathname)) {
      applyFixedWindowSize(setupWindowSize)
      return
    }

    mainWindow.setResizable(true)
    mainWindow.setMaximizable(true)
    mainWindow.setFullScreenable(true)
    mainWindow.setMinimumSize(
      defaultWindowSize.minWidth,
      defaultWindowSize.minHeight,
    )
    mainWindow.setMaximumSize(10000, 10000)

    const [currentWidth, currentHeight] = mainWindow.getSize()
    if (
      currentWidth < defaultWindowSize.minWidth ||
      currentHeight < defaultWindowSize.minHeight ||
      currentWidth === authWindowSize.width ||
      currentHeight === authWindowSize.height ||
      currentWidth === setupWindowSize.width ||
      currentHeight === setupWindowSize.height
    ) {
      mainWindow.setSize(defaultWindowSize.width, defaultWindowSize.height, true)
      mainWindow.center()
    }
  }

  const navigateToDesktopHome = async () => {
    const nextPath = await resolveDesktopHomePath()
    const nextUrl = `${appOrigin}${nextPath}`
    if (mainWindow.webContents.getURL() !== nextUrl) {
      await mainWindow.loadURL(nextUrl)
    }
  }

  const showStartupScreen = async ({
    title,
    description,
    detail,
  }: {
    title: string
    description: string
    detail?: string | null
  }) => {
    const detailMarkup = detail
      ? `<pre>${detail}</pre>`
      : `<div class="health">
          <div class="pulse"></div>
          <div>
            <strong>Local startup check</strong>
            <p>Cadence is opening its private desktop interface on this Mac.</p>
          </div>
        </div>`

    const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      :root {
        color-scheme: light;
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif;
      }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: linear-gradient(180deg, #f2e8cf 0%, #ece1c3 100%);
        color: #23402c;
      }
      main {
        width: min(560px, calc(100vw - 40px));
        border-radius: 28px;
        background: rgba(255, 250, 240, 0.92);
        padding: 28px;
        box-shadow: 0 24px 60px rgba(35, 64, 44, 0.12);
      }
      h1 {
        margin: 0;
        font-size: 28px;
        line-height: 1.15;
      }
      p {
        margin: 14px 0 0;
        line-height: 1.65;
        color: #51645a;
      }
      .health {
        margin: 18px 0 0;
        padding: 14px 16px;
        display: flex;
        align-items: center;
        gap: 14px;
        border-radius: 18px;
        background: #f5ebd2;
        color: #23402c;
      }
      .health strong {
        display: block;
        font-size: 13px;
      }
      .health p {
        margin: 4px 0 0;
        font-size: 13px;
        line-height: 1.5;
        color: #51645a;
      }
      .pulse {
        width: 14px;
        height: 14px;
        border-radius: 999px;
        background: #a7c957;
        box-shadow: 0 0 0 rgba(167, 201, 87, 0.45);
        animation: pulse 1.8s infinite;
        flex: 0 0 auto;
      }
      pre {
        margin: 18px 0 0;
        padding: 14px 16px;
        overflow: auto;
        white-space: pre-wrap;
        border-radius: 18px;
        background: #f5ebd2;
        color: #23402c;
        font-size: 13px;
        line-height: 1.5;
      }
      @keyframes pulse {
        0% { box-shadow: 0 0 0 0 rgba(167, 201, 87, 0.45); }
        70% { box-shadow: 0 0 0 12px rgba(167, 201, 87, 0); }
        100% { box-shadow: 0 0 0 0 rgba(167, 201, 87, 0); }
      }
    </style>
  </head>
  <body>
    <main>
      <h1>${title}</h1>
      <p>${description}</p>
      ${detailMarkup}
    </main>
  </body>
</html>`

    await mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
  }

  if (!isDev) {
    await showStartupScreen({
      title: `Opening ${appName}`,
      description:
        'Cadence is running a quick health check and opening its local desktop interface.',
    })

    try {
      await onStartBundledServer()
    } catch (error) {
      console.error('[desktop] failed to start bundled server', error)
      const detail =
        error instanceof Error ? error.message : 'Unknown startup error'
      await showStartupScreen({
        title: `${appName} could not start its desktop interface.`,
        description:
          'The packaged app opened, but its local desktop interface did not finish starting.',
        detail,
      })
      return mainWindow
    }
  }

  const baseUserAgent = mainWindow.webContents.getUserAgent()
  const desktopUserAgent = `${baseUserAgent} ${desktopUserAgentSuffix}`
  mainWindow.webContents.setUserAgent(desktopUserAgent)
  debugLog('desktop user agent attached', desktopUserAgent)

  mainWindow.webContents.setVisualZoomLevelLimits(1, 1)
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.setZoomFactor(1)
    mainWindow.webContents.setZoomLevel(0)
  })

  mainWindow.webContents.on('before-input-event', (event, input) => {
    const modifierPressed = input.meta || input.control
    const zoomKey =
      input.key === '+' ||
      input.key === '-' ||
      input.key === '=' ||
      input.key === '0'

    if (modifierPressed && zoomKey) {
      event.preventDefault()
    }
  })

  const initialPath = await resolveDesktopHomePath()
  const initialUrl = `${appOrigin}${initialPath}`
  debugLog('loading desktop window URL', initialUrl)
  void mainWindow.loadURL(initialUrl)
  applyWindowModeForPath(initialPath)

  mainWindow.webContents.on('will-navigate', (event, targetUrl) => {
    const { pathname } = new URL(targetUrl)
    if (blockedPaths.has(pathname)) {
      event.preventDefault()
      void navigateToDesktopHome()
    }
  })

  mainWindow.webContents.on('did-navigate', (_event, targetUrl) => {
    const { pathname } = new URL(targetUrl)
    if (blockedPaths.has(pathname)) {
      void navigateToDesktopHome()
      return
    }

    applyWindowModeForPath(pathname)
  })

  mainWindow.webContents.on('did-navigate-in-page', (_event, targetUrl) => {
    const { pathname } = new URL(targetUrl)
    if (blockedPaths.has(pathname)) {
      void navigateToDesktopHome()
      return
    }

    applyWindowModeForPath(pathname)
  })

  mainWindow.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
    if (!targetUrl.startsWith(appOrigin)) {
      void shell.openExternal(targetUrl)
    }

    return { action: 'deny' }
  })

  mainWindow.on('closed', onClosed)

  return mainWindow
}
