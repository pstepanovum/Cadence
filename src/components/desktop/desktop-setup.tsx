'use client'

import { startTransition, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Activity, ArrowRight, Microphone } from 'griddy-icons'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { useIsElectron } from '@/hooks/use-is-electron'
import { cn } from '@/lib/utils'

const INITIAL_STATE: DesktopSetupState = {
  phase: 'idle',
  currentStep: 'Setup has not started yet. Click Start setup to begin.',
  percent: 0,
  aiEngineReady: false,
  coachEngineReady: false,
  transcriberReady: false,
  ttsReady: false,
  modelsReady: false,
  error: null,
  logsPath: null,
  installStrategy: 'native-sidecar-beta',
  isPackaged: false,
  runtimeDetails: null,
}

function StatusPill({
  label,
  ready,
}: {
  label: string
  ready: boolean
}) {
  return (
    <div
      className={cn(
        'inline-flex w-auto self-start rounded-full px-4 py-2 text-sm font-semibold whitespace-nowrap',
        ready
          ? 'bg-yellow-green text-hunter-green'
          : 'bg-vanilla-cream text-iron-grey',
      )}
    >
      {label}
    </div>
  )
}

export function DesktopSetup() {
  const router = useRouter()
  const isElectron = useIsElectron()
  const [state, setState] = useState<DesktopSetupState>(INITIAL_STATE)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  async function waitForDesktopSetupBridge(timeoutMs = 2500) {
    if (typeof window === 'undefined') {
      return null
    }

    if (window.cadenceDesktopSetup) {
      return window.cadenceDesktopSetup
    }

    const startedAt = Date.now()
    while (Date.now() - startedAt < timeoutMs) {
      await new Promise((resolve) => window.setTimeout(resolve, 100))
      if (window.cadenceDesktopSetup) {
        return window.cadenceDesktopSetup
      }
    }

    return null
  }

  useEffect(() => {
    if (!isElectron) {
      setIsLoading(false)
      return
    }

    let active = true
    let unsubscribe = () => {}
    const loadingFallback = window.setTimeout(() => {
      if (!active) {
        return
      }

      setIsLoading(false)
      setState((current) =>
        current.phase === 'idle' || current.phase === 'checking'
          ? {
              ...current,
              phase: 'idle',
              currentStep: 'Setup has not started yet. Click Start setup to begin.',
              percent: 0,
            }
          : current,
      )
    }, 1800)

    const applyState = (nextState: DesktopSetupState | null) => {
      if (!active || !nextState) {
        return
      }

      console.info('[desktop-setup] state update', nextState)
      setLocalError(null)
      setState(nextState)

      if (nextState.phase === 'ready') {
        startTransition(() => {
          router.replace('/dashboard')
        })
      }
    }

    void waitForDesktopSetupBridge().then((desktopSetup) => {
      if (!active) {
        return
      }

      if (!desktopSetup) {
        console.warn('[desktop-setup] bridge not available after waiting')
        setLocalError(
          'Cadence Desktop is still connecting to the local setup tools. Try View details in a moment if you need the console.',
        )
        setIsLoading(false)
        return
      }

      unsubscribe = desktopSetup.onProgress((nextState) => {
        applyState(nextState)
      })

      void desktopSetup
        .getState()
        .then((nextState) => {
          applyState(nextState)
        })
        .catch((error: unknown) => {
          console.error('[desktop-setup] failed to read initial state', error)
          setLocalError(
            error instanceof Error
              ? error.message
              : 'Cadence could not read the desktop setup state.',
          )
        })
        .finally(() => {
          if (active) {
            window.clearTimeout(loadingFallback)
            setIsLoading(false)
          }
        })
    })

    return () => {
      active = false
      window.clearTimeout(loadingFallback)
      unsubscribe()
    }
  }, [isElectron, router])

  const progressWidth =
    state.percent > 0 ? `${Math.max(state.percent, 6)}%` : '0%'
  const primaryLabel =
    state.phase === 'ready'
      ? 'Open Cadence'
      : state.phase === 'error'
        ? 'Retry setup'
        : state.phase === 'idle'
          ? 'Start setup'
          : 'Setup in progress'
  const isBusy =
    state.phase === 'checking' ||
    state.phase === 'installing' ||
    state.phase === 'starting-services' ||
    state.phase === 'verifying'

  async function handlePrimaryAction() {
    console.info('[desktop-setup] primary action clicked', {
      phase: state.phase,
      isElectron,
    })

    const desktopSetup = await waitForDesktopSetupBridge()
    if (!desktopSetup) {
      setLocalError(
        'Cadence Desktop is still connecting to the local setup tools. Give it a moment, then try Start setup again.',
      )
      return
    }

    setLocalError(null)

    if (state.phase === 'ready') {
      startTransition(() => {
        router.replace('/dashboard')
      })
      return
    }

    setState((current) =>
      current.phase === 'idle' || current.phase === 'error'
        ? {
            ...current,
            phase: 'checking',
            currentStep: 'Starting setup on this Mac.',
            percent: 10,
          }
        : current,
    )
    setIsSubmitting(true)

    try {
      if (state.phase === 'error') {
        await desktopSetup.retry()
      } else {
        await desktopSetup.install()
      }
    } catch (error) {
      console.error('[desktop-setup] failed to start setup', error)
      setLocalError(
        error instanceof Error
          ? error.message
          : 'Cadence could not start setup just yet.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleOpenLogs() {
    console.info('[desktop-setup] view details clicked')
    const desktopSetup = await waitForDesktopSetupBridge()
    if (!desktopSetup) {
      if (window.electron?.openDevTools) {
        await window.electron.openDevTools()
        setLocalError(
          'Cadence opened the desktop console. The setup bridge is still connecting, so the log file is not ready yet.',
        )
        return
      }

      setLocalError(
        'Cadence Desktop is still connecting to the local setup tools. Give it a moment, then try View details again.',
      )
      return
    }

    setLocalError(null)
    try {
      await desktopSetup.openLogs()
    } catch (error) {
      console.error('[desktop-setup] failed to open details', error)
      setLocalError(
        error instanceof Error
          ? error.message
          : 'Cadence could not open the setup details.',
      )
    }
  }

  return (
    <div
      className={cn(
        'bg-vanilla-cream px-4 py-4 sm:px-6 sm:py-5 lg:px-8',
        isElectron ? 'h-[100dvh] overflow-hidden' : 'min-h-screen',
      )}
    >
      <div
        className={cn(
          'mx-auto flex w-full max-w-6xl items-center justify-center',
          isElectron ? 'h-full' : 'min-h-[calc(100vh-2.5rem)]',
        )}
      >
        <section className="grid w-full max-w-5xl gap-4 lg:grid-cols-[1.08fr_0.92fr] lg:items-stretch">
          <Card className="h-full bg-hunter-green text-bright-snow">
            <div className="flex h-full flex-col justify-between gap-5">
              <div className="space-y-5">
                <div className="inline-flex self-start items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-yellow-green">
                  <Microphone size={18} filled color="currentColor" />
                  <span className="eyebrow text-sm">Desktop Setup</span>
                </div>

                <div className="space-y-3">
                  <h1 className="text-4xl font-semibold text-bright-snow sm:text-5xl">
                    Getting Cadence ready for your first session.
                  </h1>
                  <p className="max-w-2xl text-base leading-7 text-bright-snow/80">
                    Cadence will prepare the local speaking tools this Mac needs
                    for practice, listening, and coach responses. The first
                    setup can take a few minutes once you start it.
                  </p>
                </div>

                <div className="h-[11.75rem] rounded-3xl bg-white/10 px-5 py-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="h-[4.75rem] flex-1">
                      <p className="eyebrow text-sm text-yellow-green/80">Current step</p>
                      <p className="mt-2 h-[3.5rem] overflow-hidden text-lg font-semibold leading-7 text-bright-snow">
                        {isLoading ? 'Loading installer state…' : state.currentStep}
                      </p>
                    </div>
                    <div className="flex h-12 w-16 shrink-0 items-center justify-center rounded-full bg-white/12 text-sm font-semibold text-bright-snow">
                      {state.percent}%
                    </div>
                  </div>

                  <div className="mt-5 rounded-full bg-white/12 p-2">
                    <div
                      className="h-4 rounded-full bg-yellow-green transition-[width] duration-500"
                      style={{ width: progressWidth }}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="min-h-[5.75rem]">
                  {state.phase === 'idle' ? (
                    <div className="rounded-3xl bg-white/10 px-4 py-4 text-sm leading-7 text-bright-snow/80">
                      Nothing is running yet. Click <span className="font-semibold text-bright-snow">Start setup</span> and
                      Cadence will begin preparing the local speaking tools for
                      this Mac.
                    </div>
                  ) : state.error || localError ? (
                    <div className="rounded-3xl bg-blushed-brick px-4 py-3 text-sm text-bright-snow">
                      {state.error ?? localError}
                    </div>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-3">
                  <Button
                    variant="secondary"
                    onClick={() => void handlePrimaryAction()}
                    disabled={isSubmitting || isBusy}
                  >
                    {primaryLabel}
                    <ArrowRight size={16} color="currentColor" />
                  </Button>

                  <Button
                    variant="ghost"
                    className="bg-white/12 text-bright-snow hover:bg-white/18"
                    onClick={() => void handleOpenLogs()}
                    disabled={isSubmitting}
                  >
                    View details
                  </Button>
                </div>
              </div>
            </div>
          </Card>

          <Card className="h-full bg-white">
            <div className="flex h-full flex-col gap-6">
              <div className="inline-flex w-auto self-start items-center gap-2 rounded-full bg-sage-green/15 px-4 py-2 text-sage-green">
                <Activity size={18} filled color="currentColor" />
                <span className="eyebrow text-sm">Runtime Health</span>
              </div>
              <div className="space-y-2">
                <CardTitle>What Cadence is preparing on this machine</CardTitle>
                <CardDescription>
                  The first launch can take a little while because Cadence is
                  getting its voice, listening, and coach tools ready in the
                  background.
                </CardDescription>
              </div>

              <div className="flex flex-wrap gap-3">
                <StatusPill label="Speech checks" ready={state.aiEngineReady} />
                <StatusPill label="Listening" ready={state.transcriberReady} />
                <StatusPill label="Coach voice" ready={state.ttsReady} />
                <StatusPill label="Coach replies" ready={state.coachEngineReady} />
              </div>

              <div className="mt-auto grid gap-3 sm:grid-cols-2">
                <div className="rounded-3xl bg-vanilla-cream px-5 py-5">
                  <p className="eyebrow text-sm text-sage-green">Setup style</p>
                  <p className="mt-3 text-2xl font-semibold text-hunter-green">
                    Native local setup
                  </p>
                  <p className="mt-2 text-sm leading-7 text-iron-grey">
                    Cadence includes its own local runtime in the desktop app,
                    prepares the speech tools on this Mac, and opens the app as
                    soon as everything is ready.
                  </p>
                </div>

                <div className="rounded-3xl bg-vanilla-cream px-5 py-5">
                  <p className="eyebrow text-sm text-sage-green">Ready to enter</p>
                  <p className="mt-3 text-2xl font-semibold text-hunter-green">
                    {state.modelsReady ? 'Yes' : 'Not yet'}
                  </p>
                  <p className="mt-2 text-sm leading-7 text-iron-grey">
                    Cadence opens the app as soon as the speech and coach models
                    report healthy.
                  </p>
                </div>
              </div>
            </div>
          </Card>
        </section>
      </div>
    </div>
  )
}
