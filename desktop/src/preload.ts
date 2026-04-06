import { contextBridge, ipcRenderer } from 'electron'

// Mark the document as running inside Electron before first paint.
// This lets CSS target `.electron` for desktop-only styles (e.g. custom scrollbars)
// without waiting for React hydration.
document.documentElement.classList.add('electron')

// Expose a minimal, safe API to the renderer (the Next.js app).
// Do NOT expose ipcRenderer directly — only wrap specific channels you need.
contextBridge.exposeInMainWorld('electron', {
  isElectron: true,
  platform: process.platform,
  // Add IPC wrappers here as the app grows, e.g.:
  // openFile: () => ipcRenderer.invoke('dialog:openFile'),
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

window.dispatchEvent(new Event('cadence-electron-ready'))
