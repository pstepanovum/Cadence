import { contextBridge, ipcRenderer } from 'electron'

function markElectronDocument() {
  if (document.documentElement) {
    document.documentElement.classList.add('electron')
    return
  }

  window.addEventListener(
    'DOMContentLoaded',
    () => {
      document.documentElement?.classList.add('electron')
    },
    { once: true },
  )
}

// Expose a minimal, safe API to the renderer (the Next.js app).
// Do NOT expose ipcRenderer directly — only wrap specific channels you need.
contextBridge.exposeInMainWorld('electron', {
  isElectron: true,
  platform: process.platform,
  openDevTools: () => ipcRenderer.invoke('desktop:open-devtools'),
})

contextBridge.exposeInMainWorld('cadenceDesktopSetup', {
  getState: () => ipcRenderer.invoke('desktop-setup:get-state'),
  getRuntimeDetails: () => ipcRenderer.invoke('desktop-setup:get-runtime-details'),
  install: () => ipcRenderer.invoke('desktop-setup:install'),
  retry: () => ipcRenderer.invoke('desktop-setup:retry'),
  openLogs: () => ipcRenderer.invoke('desktop-setup:open-logs'),
  openLocation: (location: string) =>
    ipcRenderer.invoke('desktop-setup:open-location', location),
  onProgress: (listener: (state: unknown) => void) => {
    const wrapped = (_event: unknown, state: unknown) => listener(state)
    ipcRenderer.on('desktop-setup:state', wrapped)
    return () => ipcRenderer.removeListener('desktop-setup:state', wrapped)
  },
})

interface UpdateNotice {
  text: string
  action: 'restart' | 'download'
  actionLabel: string
}

const NOTICE_ID = 'cadence-update-notice'

/**
 * A small, dismissible card in the corner. It never blocks the page and never
 * restarts on its own; the person chooses when.
 */
function renderUpdateNotice(notice: UpdateNotice | null) {
  document.getElementById(NOTICE_ID)?.remove()
  if (!notice || !document.body) return

  const dark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const card = document.createElement('div')
  card.id = NOTICE_ID
  card.setAttribute('role', 'status')
  card.setAttribute('aria-live', 'polite')
  card.style.cssText = [
    'position:fixed', 'right:16px', 'bottom:16px', 'z-index:2147483647',
    'display:flex', 'align-items:center', 'gap:12px', 'padding:10px 12px 10px 16px',
    'border-radius:14px', 'font:500 14px/1.3 system-ui,-apple-system,sans-serif',
    'box-shadow:0 6px 24px rgba(33,37,41,0.18)', 'max-width:360px',
    dark ? 'background:#343a40;color:#f8f9fa' : 'background:#f8f9fa;color:#212529',
    dark ? 'border:1px solid #495057' : 'border:1px solid #dee2e6',
  ].join(';')

  const text = document.createElement('span')
  text.textContent = notice.text

  const action = document.createElement('button')
  action.type = 'button'
  action.textContent = notice.actionLabel
  action.style.cssText =
    'border:0;border-radius:10px;padding:6px 12px;font:600 13px system-ui,sans-serif;' +
    'cursor:pointer;background:#386641;color:#f8f9fa;min-height:32px'
  action.addEventListener('click', () => void ipcRenderer.invoke('desktop-update:act'))

  const close = document.createElement('button')
  close.type = 'button'
  close.textContent = '\u00d7'
  close.setAttribute('aria-label', 'Later')
  close.style.cssText =
    'border:0;background:transparent;color:inherit;font:400 20px/1 system-ui,sans-serif;' +
    'cursor:pointer;min-width:32px;min-height:32px;opacity:0.7'
  close.addEventListener('click', () => void ipcRenderer.invoke('desktop-update:dismiss'))

  card.append(text, action, close)
  document.body.appendChild(card)
}

ipcRenderer.on('desktop-update:state', (_event, notice: UpdateNotice | null) => {
  renderUpdateNotice(notice)
})

window.addEventListener('DOMContentLoaded', () => {
  void ipcRenderer
    .invoke('desktop-update:get-state')
    .then((notice: UpdateNotice | null) => renderUpdateNotice(notice))
    .catch(() => undefined)
})

markElectronDocument()
window.dispatchEvent(new Event('cadence-electron-ready'))
