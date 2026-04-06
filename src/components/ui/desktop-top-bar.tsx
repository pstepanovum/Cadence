'use client'

import { createContext, useContext } from 'react'

// Consumed by ModuleProgressFrame to know it's inside the top bar
// and should render (instead of being suppressed as a page-level duplicate).
export const TopBarContext = createContext(false)
export const useInTopBar = () => useContext(TopBarContext)

/**
 * Sticky gray top stripe rendered at the top of the content area on desktop.
 * Returns null on web — pages handle their own ModuleProgress there.
 */
export function DesktopTopBar({
  children,
  enabled,
}: {
  children: React.ReactNode
  enabled: boolean
}) {
  if (!enabled) return null

  return (
    <TopBarContext.Provider value={true}>
      <div className="sticky top-0 z-10 w-full bg-hunter-green px-6 py-4 shrink-0">
        {children}
      </div>
    </TopBarContext.Provider>
  )
}
