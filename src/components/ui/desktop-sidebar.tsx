'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Settings } from 'griddy-icons'
import { AiCoachSidebarHistory } from '@/components/coach/AiCoachSidebarHistory'
import { BrandMark } from '@/components/ui/brand-mark'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import { cn } from '@/lib/utils'

const navItems = [
  { href: '/dashboard',    label: 'Home'         },
  { href: '/practice',     label: 'Practice'     },
  { href: '/sounds',       label: 'Sounds'       },
  { href: '/learn',        label: 'Modules'      },
  { href: '/conversation', label: 'Conversation' },
  { href: '/coach',        label: 'Coach'        },
]

const exploreItems = [
  { href: '/grammar', label: 'Grammar' },
  { href: '/connect-phone', label: 'Connect your phone' },
  { href: '/just-speak', label: 'Just Speak' },
  { href: '/dictionary', label: 'Dictionary' },
  { href: '/bookmarks', label: 'Bookmarks' },
]

export function DesktopSidebar({ userId }: { userId?: string | null }) {
  const pathname = usePathname()

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + '/')

  return (
    <aside className="flex h-screen w-80 shrink-0 flex-col overflow-hidden bg-white text-hunter-green">

      {/* ── Traffic-light zone ── */}
      <div className="h-[52px] shrink-0 w-full px-3 pt-2">
        <div
          className="h-full w-full rounded-[18px]"
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        />
      </div>

      {/* ── Logo ── */}
      <div className="px-5 pb-5">
        <BrandMark />
      </div>

      {/* ── Nav items ── */}
      <div className="flex min-h-0 flex-1 flex-col px-5">
        <nav aria-label="Main" className="flex flex-col gap-0.5">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center rounded-full px-4 py-2.5 text-base font-semibold transition-colors',
                isActive(item.href)
                  ? 'bg-yellow-green text-hunter-green'
                  : 'text-hunter-green hover:bg-vanilla-cream',
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="mt-5 space-y-2">
          <p className="px-4 text-xs font-semibold tracking-[0.16em] text-sage-green/80 uppercase">
            Explore
          </p>
          <nav aria-label="Explore" className="flex flex-col gap-0.5">
            {exploreItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center justify-between gap-2 rounded-full px-4 py-2.5 text-base font-semibold transition-colors',
                  isActive(item.href)
                    ? 'bg-yellow-green text-hunter-green'
                    : 'text-hunter-green hover:bg-vanilla-cream',
                )}
              >
                <span>{item.label}</span>

              </Link>
            ))}
          </nav>
        </div>

        <div className="mt-3 min-h-0 flex-1 overflow-y-auto overflow-x-hidden pb-5">
          {userId ? <AiCoachSidebarHistory userId={userId} /> : null}
        </div>
      </div>

      {/* ── Settings ── */}
      <div className="flex items-center gap-2 px-5 pb-5">
        <Link
          href="/account"
          className={cn(
            'flex items-center gap-2.5 rounded-full px-4 py-2.5 text-base font-semibold transition-colors',
            'flex-1',
            isActive('/account') || isActive('/profile')
              ? 'bg-yellow-green text-hunter-green'
              : 'text-hunter-green hover:bg-vanilla-cream',
          )}
        >
          <Settings size={16} color="currentColor" aria-hidden="true" />
          Settings
        </Link>
        <ThemeToggle />
      </div>
    </aside>
  )
}
