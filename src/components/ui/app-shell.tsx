'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import type { AppRuntime } from '@/lib/runtime/request-runtime'
import { SmoothScroll } from '@/components/ui/smooth-scroll'

// Pages that exist on the web but have no place in the desktop app.
const BLOCKED_ON_DESKTOP = new Set([
  '/',
  '/contact',
  '/help',
  '/terms',
  '/privacy',
  '/pricing',
  '/download',
])

export function AppShell({
  children,
  runtime,
}: {
  children: React.ReactNode
  runtime: AppRuntime
}) {
  const isElectron = runtime === 'desktop'
  const pathname = usePathname()
  const router = useRouter()

  // Redirect blocked pages if they somehow appear in Electron.
  useEffect(() => {
    if (isElectron && BLOCKED_ON_DESKTOP.has(pathname)) {
      router.replace('/dashboard')
    }
  }, [isElectron, pathname, router])

  // Electron: no Lenis — DesktopShell in the dashboard layout owns scroll.
  if (isElectron) return <>{children}</>

  // Web: Lenis smooth scroll.
  return <SmoothScroll>{children}</SmoothScroll>
}
