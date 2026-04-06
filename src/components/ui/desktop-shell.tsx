import { DesktopSidebar } from '@/components/ui/desktop-sidebar'

/**
 * Wraps the (dashboard) route group.
 *
 * Electron: renders the full sidebar + scrollable content layout.
 * Web:      renders children as-is (no-op passthrough).
 */
export function DesktopShell({
  children,
  enabled,
}: {
  children: React.ReactNode
  enabled: boolean
}) {
  if (!enabled) return <>{children}</>

  return (
    <div className="flex h-screen overflow-hidden bg-vanilla-cream">
      <DesktopSidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        {children}
      </div>
    </div>
  )
}
