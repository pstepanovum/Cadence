'use client'

import { useInTopBar } from '@/components/ui/desktop-top-bar'
import type { AppRuntime } from '@/lib/runtime/request-runtime'

interface ModuleProgressFrameProps {
  children: React.ReactNode
  runtime: AppRuntime
}

/**
 * Shell for ModuleProgress.
 *
 * Web:           white pill card with rounding and padding
 * Desktop/page:  null — DesktopTopBar in (dashboard)/layout renders it instead
 * Desktop/top bar: flat flex row, no wrapper (DesktopTopBar is the container)
 */
export function ModuleProgressFrame({
  children,
  runtime,
}: ModuleProgressFrameProps) {
  const inTopBar = useInTopBar()

  if (runtime === 'desktop') {
    // Suppress the page-level instance — the layout's DesktopTopBar owns it
    if (!inTopBar) return null

    // Inside DesktopTopBar: render bars flat, container styles come from the stripe
    return (
      <div className="flex w-full flex-col gap-4 lg:flex-row lg:items-center">
        {children}
      </div>
    )
  }

  return (
    <div className="w-full">
      <div className="mx-auto flex max-w-4xl flex-col gap-4 rounded-[2rem] bg-white px-5 py-4 sm:px-6 lg:flex-row lg:items-center">
        {children}
      </div>
    </div>
  )
}
