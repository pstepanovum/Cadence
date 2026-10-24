import { app } from 'electron'
import { EventEmitter } from 'events'
import {
  INSTALL_STRATEGY,
  INSTALL_TIMEOUT_MS,
  POLL_INTERVAL_MS,
} from './setup/constants'
import { DesktopSetupSupport } from './setup/support'
import type {
  DesktopRuntimeLocation,
  DesktopSetupState,
  HealthSnapshot,
  StateListener,
} from './setup/types'

export type { DesktopRuntimeLocation } from './setup/types'

export class DesktopSetupManager {
  private readonly emitter = new EventEmitter()
  private readonly runtime = new DesktopSetupSupport()

  private installPromise: Promise<void> | null = null

  private state: DesktopSetupState = {
    phase: 'idle',
    currentStep: null,
    percent: 0,
    aiEngineReady: false,
    coachEngineReady: false,
    transcriberReady: false,
    ttsReady: false,
    modelsReady: false,
    error: null,
    logsPath: this.runtime.logFilePath,
    installStrategy: INSTALL_STRATEGY,
    isPackaged: app.isPackaged,
    runtimeDetails: null,
  }

  onState(listener: StateListener): () => void {
    this.emitter.on('state', listener)
    return () => this.emitter.off('state', listener)
  }

  async getState(): Promise<DesktopSetupState> {
    if (this.installPromise) {
      return this.state
    }

    return this.refreshState()
  }

  async refreshState(): Promise<DesktopSetupState> {
    await this.runtime.ensureDirectories()
    if (!this.runtime.hasExistingSetupArtifacts()) {
      return this.setState({
        aiEngineReady: false,
        coachEngineReady: false,
        transcriberReady: false,
        ttsReady: false,
        modelsReady: false,
        phase: 'idle',
        currentStep: 'Setup has not started yet. Click Start setup to begin.',
        percent: 0,
        error: null,
        runtimeDetails: null,
      })
    }

    const runtime = await this.runtime.inspectRuntime()
    const health = runtime.health
    const manifest = await this.runtime.readManifest()

    if (health.modelsReady) {
      const lastReadyAt = manifest?.lastReadyAt ?? new Date().toISOString()
      await this.runtime.persistManifest({
        version: 1,
        appVersion: app.getVersion(),
        lastReadyAt,
      })

      return this.setState({
        ...health,
        phase: 'ready',
        currentStep: 'Cadence is ready to open.',
        percent: 100,
        error: null,
        runtimeDetails: {
          ...runtime.details,
          lastReadyAt,
        },
      })
    }

    if (manifest?.lastReadyAt && !this.installPromise) {
      void this.install()
      return this.setState({
        ...health,
        phase: 'checking',
        currentStep: 'Reopening the local Cadence services on this Mac.',
        percent: 10,
        error: null,
        runtimeDetails: runtime.details,
      })
    }

    return this.setState({
      ...health,
      phase: 'idle',
      currentStep: manifest?.lastReadyAt
        ? 'Cadence needs a quick repair before it can open.'
        : 'Setup has not started yet. Click Start setup to begin.',
      percent: 0,
      error: null,
      runtimeDetails: runtime.details,
    })
  }

  async install(): Promise<DesktopSetupState> {
    if (!this.installPromise) {
      this.installPromise = this.runInstall().finally(() => {
        this.installPromise = null
      })
    }

    return this.state
  }

  async retry(): Promise<DesktopSetupState> {
    return this.install()
  }

  async openLogs(): Promise<void> {
    await this.runtime.openLogs()
  }

  async openLocation(location: DesktopRuntimeLocation): Promise<void> {
    await this.runtime.openLocation(location)
  }

  dispose(): void {
    this.runtime.dispose()
  }

  private async runInstall(): Promise<void> {
    await this.runtime.ensureDirectories()
    await this.runtime.writeLog(`Starting Cadence Desktop setup (${app.getVersion()})`)

    this.setState({
      phase: 'checking',
      currentStep: 'Checking this Mac for an existing setup.',
      percent: 12,
      error: null,
    })

    const initialRuntime = await this.runtime.inspectRuntime()
    const initialHealth = initialRuntime.health
    if (initialHealth.modelsReady) {
      const lastReadyAt = new Date().toISOString()
      await this.runtime.persistManifest({
        version: 1,
        appVersion: app.getVersion(),
        lastReadyAt,
      })

      this.setState({
        ...initialHealth,
        phase: 'ready',
        currentStep: 'Cadence is already ready to open.',
        percent: 100,
        error: null,
        runtimeDetails: {
          ...initialRuntime.details,
          lastReadyAt,
        },
      })
      return
    }

    const sources = this.runtime.resolveServiceSources()
    if (!sources.aiEngineDir || !sources.coachEngineDir) {
      this.setState({
        ...initialHealth,
        phase: 'error',
        currentStep: 'The bundled AI runtime sources were not found.',
        percent: 0,
        error:
          'Cadence could not locate the packaged AI runtime sources for the speech and coach services.',
        runtimeDetails: initialRuntime.details,
      })
      return
    }

    this.setState({
      ...initialHealth,
      phase: 'installing',
      currentStep: 'Preparing your speaking tools for the first launch.',
      percent: 20,
      error: null,
    })

    let latestProgress = 20
    try {
      await this.runtime.prepareNativeRuntime({
        ...sources,
        onStatus: (step, percent) => {
          latestProgress = Math.max(latestProgress, percent)
          this.setState({
            ...initialHealth,
            phase: 'installing',
            currentStep: step,
            percent: latestProgress,
            error: null,
          })
        },
        onInstallChunk: (chunk) => {
          this.handleInstallOutput(chunk)
          void this.runtime.writeChunkToLog(chunk)
        },
      })
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Cadence could not prepare its local speech tools on this Mac.'
      await this.runtime.writeLog(message)
      this.setState({
        ...initialHealth,
        phase: 'error',
        currentStep: 'Cadence could not finish setup just yet.',
        percent: 0,
        error: message,
        runtimeDetails: initialRuntime.details,
      })
      return
    }

    this.setState({
      ...initialHealth,
      phase: 'starting-services',
      currentStep: 'Starting your speaking tools.',
      percent: 55,
      error: null,
    })

    try {
      await this.runtime.startNativeRuntime(sources)
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Cadence could not start its local speech tools on this Mac.'
      await this.runtime.writeLog(message)
      this.setState({
        ...initialHealth,
        phase: 'error',
        currentStep: 'Cadence could not finish setup just yet.',
        percent: 0,
        error: message,
        runtimeDetails: initialRuntime.details,
      })
      return
    }

    const started = await this.waitForHealthyRuntime()
    if (!started) {
      if (this.state.phase === 'error') {
        return
      }

      const stalledRuntime = await this.runtime.inspectRuntime()
      this.setState({
        ...stalledRuntime.health,
        phase: 'error',
        currentStep: 'Cadence took too long to finish getting ready.',
        percent: 0,
        error:
          'Cadence started its background setup, but the speaking tools did not finish getting ready in time. Open the details view, then try again.',
        runtimeDetails: stalledRuntime.details,
      })
      return
    }

    const finalRuntime = await this.runtime.inspectRuntime()
    const finalHealth = finalRuntime.health
    const lastReadyAt = new Date().toISOString()
    await this.runtime.persistManifest({
      version: 1,
      appVersion: app.getVersion(),
      lastReadyAt,
    })

    this.setState({
      ...finalHealth,
      phase: 'ready',
      currentStep: 'Everything is ready. Opening Cadence…',
      percent: 100,
      error: null,
      runtimeDetails: {
        ...finalRuntime.details,
        lastReadyAt,
      },
    })
  }

  private async waitForHealthyRuntime(): Promise<boolean> {
    const startedAt = Date.now()

    while (Date.now() - startedAt < INSTALL_TIMEOUT_MS) {
      const runtime = await this.runtime.inspectRuntime()
      const health = runtime.health
      if (health.modelsReady) {
        return true
      }

      if (!health.ttsReady && runtime.details.tts.loadError) {
        await this.runtime.writeLog(
          `Coach voice model is unavailable: ${runtime.details.tts.loadError}`,
        )
        this.setState({
          ...health,
          phase: 'error',
          currentStep: 'Cadence could not activate the local coach voice model.',
          percent: 0,
          error: runtime.details.tts.loadError,
          runtimeDetails: runtime.details,
        })
        return false
      }

      const runtimeFailure = await this.runtime.inspectRuntimeFailure()
      if (runtimeFailure) {
        this.setState({
          ...health,
          phase: 'error',
          currentStep: 'Cadence needs a lighter setup profile on this Mac.',
          percent: 0,
          error: runtimeFailure.message,
          runtimeDetails: runtime.details,
        })
        return false
      }

      const readyParts = this.countReadyParts(health)
      this.setState({
        ...health,
        phase: 'verifying',
        currentStep:
          'Almost there. Cadence is warming everything up for the first time.',
        percent: 60 + readyParts * 9,
        error: null,
        runtimeDetails: runtime.details,
      })

      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
    }

    await this.runtime.writeLog(
      `Timed out waiting for healthy runtime after ${INSTALL_TIMEOUT_MS}ms`,
    )
    return false
  }

  private countReadyParts(health: HealthSnapshot): number {
    return [
      health.aiEngineReady,
      health.transcriberReady,
      health.ttsReady,
      health.coachEngineReady,
    ].filter(Boolean).length
  }

  private handleInstallOutput(chunk: string): void {
    const latestLine = chunk
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .at(-1)

    if (!latestLine) {
      return
    }

    const nextPercent = Math.min(52, Math.max(this.state.percent, 20) + 1)
    this.setState({
      phase: 'installing',
      percent: nextPercent,
      currentStep: this.runtime.describeInstallLine(latestLine),
      error: null,
    })
  }

  private setState(nextState: Partial<DesktopSetupState>): DesktopSetupState {
    this.state = {
      ...this.state,
      ...nextState,
      logsPath: this.runtime.logFilePath,
      installStrategy: INSTALL_STRATEGY,
      isPackaged: app.isPackaged,
    }

    this.emitter.emit('state', this.state)
    return this.state
  }
}
