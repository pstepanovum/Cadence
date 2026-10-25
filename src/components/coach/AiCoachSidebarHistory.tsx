'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import type { SavedAiCoachSession } from '@/lib/ai-coach'
import {
  AI_COACH_SESSIONS_CHANGED_EVENT,
  getAiCoachStorageKey,
  readSavedAiCoachSessions,
} from '@/lib/ai-coach-storage'
import { cn } from '@/lib/utils'

function formatTimestamp(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return 'Recently updated'
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(date)
}

export function AiCoachSidebarHistory({ userId }: { userId: string }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [sessions, setSessions] = useState<SavedAiCoachSession[]>([])
  const [isExpanded, setIsExpanded] = useState(true)

  useEffect(() => {
    function syncSessions() {
      setSessions(readSavedAiCoachSessions(userId))
    }

    function handleStorage(event: StorageEvent) {
      if (event.key && event.key !== getAiCoachStorageKey(userId)) {
        return
      }

      syncSessions()
    }

    function handleSessionsChanged(event: Event) {
      const detail = (event as CustomEvent<{ userId?: string }>).detail

      if (detail?.userId && detail.userId !== userId) {
        return
      }

      syncSessions()
    }

    syncSessions()
    window.addEventListener('storage', handleStorage)
    window.addEventListener(
      AI_COACH_SESSIONS_CHANGED_EVENT,
      handleSessionsChanged as EventListener,
    )

    return () => {
      window.removeEventListener('storage', handleStorage)
      window.removeEventListener(
        AI_COACH_SESSIONS_CHANGED_EVENT,
        handleSessionsChanged as EventListener,
      )
    }
  }, [userId])

  const resumedSessionId = searchParams.get('resume')

  return (
    <section className="mt-3">
      <button
        type="button"
        onClick={() => setIsExpanded((previous) => !previous)}
        className="flex w-full items-center justify-between gap-3 rounded-[14px] px-3 py-2 text-left transition-colors hover:bg-page"
      >
        <p className="text-base font-semibold text-carbon-black">Coach history</p>
        <div className="flex items-center gap-2">
          <span className="inline-flex min-w-8 items-center justify-center rounded-full bg-page px-2 py-1 text-sm font-semibold text-carbon-black">
            {sessions.length}
          </span>
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-page text-base font-semibold leading-none text-carbon-black">
            {isExpanded ? '−' : '+'}
          </span>
        </div>
      </button>

      {isExpanded ? (
        sessions.length > 0 ? (
          <div className="mt-2 flex flex-col gap-1">
            {sessions.map((session) => {
              const isActive =
                pathname === '/coach' && resumedSessionId === session.id

              return (
                <Link
                  key={session.id}
                  href={`/coach?resume=${session.id}`}
                  className={cn(
                    'rounded-[20px] px-3 py-2 transition-colors',
                    isActive
                      ? 'bg-page text-carbon-black'
                      : 'text-carbon-black hover:bg-page',
                  )}
                >
                  <p className="truncate text-base font-semibold">{session.topic}</p>
                  <p className="text-sm text-iron-grey">
                    {session.turns.length} turns · {formatTimestamp(session.updatedAt)}
                  </p>
                </Link>
              )
            })}
          </div>
        ) : (
          <p className="mt-2 px-3 text-base text-iron-grey">
            No saved conversations yet.
          </p>
        )
      ) : null}
    </section>
  )
}
