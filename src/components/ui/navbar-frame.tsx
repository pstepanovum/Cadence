import { cn } from '@/lib/utils'
import type { AppRuntime } from '@/lib/runtime/request-runtime'

interface NavbarFrameProps {
  children: React.ReactNode
  variant?: 'default' | 'dark'
  runtime: AppRuntime
}

/**
 * Owns the <header> shell for the Navbar.
 *
 * Web:      rounded card — default is white, dark is hunter-green
 * Electron: hidden entirely — the DesktopSidebar takes over navigation
 */
export function NavbarFrame({
  children,
  variant = 'default',
  runtime,
}: NavbarFrameProps) {
  if (runtime === 'desktop') return null

  return (
    <header
      className={cn(
        'rounded-3xl px-5 py-4',
        variant === 'dark'
          ? 'bg-hunter-green text-bright-snow'
          : 'bg-white text-hunter-green',
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-4 md:flex-nowrap">
        {children}
      </div>
    </header>
  )
}
