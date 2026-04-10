import { getRequestRuntime } from '@/lib/runtime/request-runtime'
import { ModuleProgress } from '@/components/ui/module-progress'
import { DesktopTopBar } from '@/components/ui/desktop-top-bar'
import { DesktopShell } from '@/components/ui/desktop-shell'
import { getAppSession } from '@/lib/app-session'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getAppSession()
  const runtime = await getRequestRuntime()
  const isDesktop = runtime === 'desktop'

  return (
    <DesktopShell
      enabled={isDesktop}
      userId={session.user?.id ?? null}
      topBar={(
        <DesktopTopBar enabled={isDesktop}>
          <ModuleProgress variant="dark" />
        </DesktopTopBar>
      )}
    >
      {children}
    </DesktopShell>
  )
}
