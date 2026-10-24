import { Menu } from 'electron'
import type { UpdateMenuItem } from './updater'

export interface MenuActions {
  /** Opens the pairing screen, turning on LAN serving first if needed. */
  onConnectPhone: () => void
  /** Whether the runtime is currently reachable from the Wi-Fi. */
  isLanServing: () => boolean
  onStopSharing: () => void
  /** The "Check for Updates" item, when the updater is running. */
  update?: () => UpdateMenuItem
}

function updateItems(actions?: MenuActions): Electron.MenuItemConstructorOptions[] {
  const item = actions?.update?.()
  if (!item) return []
  return [
    { label: item.label, enabled: item.enabled, click: () => item.onClick() },
    {
      label: 'Check for Updates Automatically',
      type: 'checkbox',
      checked: item.autoCheck,
      click: () => item.onToggleAutoCheck(),
    },
  ]
}

export function buildMenu(appName: string, actions?: MenuActions): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: appName,
      submenu: [
        { label: `About ${appName}`, role: 'about' },
        ...updateItems(actions),
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { label: `Hide ${appName}`, role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { label: `Quit ${appName}`, role: 'quit' },
      ],
    },
    ...(actions
      ? ([
          {
            label: 'Phone',
            submenu: [
              {
                label: 'Connect a Phone\u2026',
                click: () => actions.onConnectPhone(),
              },
              {
                label: 'Stop Sharing With Phones',
                enabled: actions.isLanServing(),
                click: () => actions.onStopSharing(),
              },
            ],
          },
        ] as Electron.MenuItemConstructorOptions[])
      : []),
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
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
