import { app, shell } from 'electron'
import { spawn } from 'child_process'
import { appendFile, mkdir, readFile, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import { cpus } from 'os'
import { join } from 'path'
import {
  AI_ENGINE_URL,
  COACH_ENGINE_URL,
  COMMAND_ENV,
  COMPOSE_PROJECT_NAME,
  DEFAULT_DESKTOP_COACH_MODEL_ID,
  DEFAULT_DESKTOP_SPEECH_MODEL_ID,
  DEFAULT_DESKTOP_TRANSCRIBER_MODEL_ID,
  DEFAULT_DESKTOP_TTS_INSTRUCT,
  DEFAULT_DESKTOP_TTS_LANGUAGE,
  DEFAULT_DESKTOP_TTS_MODEL_ID,
  DESKTOP_WEB_APP_URL,
  HEALTH_CHECK_TIMEOUT_MS,
  INSTALL_STRATEGY,
} from './constants'
import type {
  AiEngineHealthPayload,
  CoachEngineHealthPayload,
  CommandResult,
  ComposeCommand,
  DesktopRuntimeDetails,
  DesktopRuntimeLocation,
  HealthSnapshot,
  RunCommandOptions,
  RuntimeFailureSnapshot,
  SetupManifest,
} from './types'

export class DesktopSetupSupport {
  readonly setupRoot = join(app.getPath('userData'), 'desktop-runtime')
  readonly logsDir = join(this.setupRoot, 'logs')
  readonly runtimeDir = join(this.setupRoot, 'runtime')
  readonly modelsDir = join(this.setupRoot, 'models')
  readonly setupFilePath = join(this.setupRoot, 'setup.json')
  readonly logFilePath = join(this.logsDir, 'desktop-setup.log')
  readonly composeFilePath = join(this.runtimeDir, 'docker-compose.ai.yml')

  getHostCpuCount(): number {
    return Math.max(1, cpus().length || 1)
  }

  hasExistingSetupArtifacts(): boolean {
    return existsSync(this.setupFilePath) || existsSync(this.composeFilePath)
  }

  async openLogs(): Promise<void> {
    await this.ensureDirectories()

    try {
      const compose = await this.detectComposeCommand()
      if (compose && existsSync(this.composeFilePath)) {
        const result = await this.runCommand(
          compose.command,
          [
            ...compose.argsPrefix,
            '-p',
            COMPOSE_PROJECT_NAME,
            '-f',
            this.composeFilePath,
            'logs',
            '--no-color',
          ],
          { allowFailure: true },
        )

        if (result.stdout || result.stderr) {
          await this.writeLog('----- docker compose logs -----')
          if (result.stdout) {
            await this.writeLog(result.stdout.trim())
          }
          if (result.stderr) {
            await this.writeLog(result.stderr.trim())
          }
        }
      }
    } catch {
      // Fall back to opening the existing log file.
    }

    await shell.openPath(this.logFilePath)
  }

  async openLocation(location: DesktopRuntimeLocation): Promise<void> {
    await this.ensureDirectories()

    const targets: Record<DesktopRuntimeLocation, string> = {
      setupRoot: this.setupRoot,
      runtimeDir: this.runtimeDir,
      modelsDir: this.modelsDir,
      huggingFaceDir: join(this.modelsDir, 'huggingface'),
      logsPath: this.logFilePath,
      composeFilePath: this.composeFilePath,
    }

    const target = targets[location]
    if (location === 'logsPath') {
      await shell.openPath(target)
      return
    }

    if (location === 'composeFilePath') {
      if (existsSync(target)) {
        shell.showItemInFolder(target)
        return
      }

      await shell.openPath(this.runtimeDir)
      return
    }

    await shell.openPath(target)
  }

  async inspectRuntime(): Promise<{
    health: HealthSnapshot
    details: DesktopRuntimeDetails
  }> {
    const manifest = await this.readManifest()
    const [aiPayload, coachPayload] = await Promise.all([
      this.fetchJson<AiEngineHealthPayload>(AI_ENGINE_URL),
      this.fetchJson<CoachEngineHealthPayload>(COACH_ENGINE_URL),
    ])

    const aiEngineReady = aiPayload?.modelReady === true
    const coachEngineReady = coachPayload?.ready === true
    const transcriberReady = aiPayload?.transcriberReady === true
    const ttsReady = aiPayload?.ttsReady === true

    const health = {
      aiEngineReady,
      coachEngineReady,
      transcriberReady,
      ttsReady,
      modelsReady:
        aiEngineReady && coachEngineReady && transcriberReady && ttsReady,
    }

    return {
      health,
      details: this.createRuntimeDetails({
        manifest,
        health,
        aiPayload,
        coachPayload,
      }),
    }
  }

  async inspectRuntimeFailure(): Promise<RuntimeFailureSnapshot | null> {
    const compose = await this.detectComposeCommand()
    if (!compose || !existsSync(this.composeFilePath)) {
      return null
    }

    const stateResult = await this.runCommand(
      compose.command,
      [
        ...compose.argsPrefix,
        '-p',
        COMPOSE_PROJECT_NAME,
        '-f',
        this.composeFilePath,
        'ps',
        '-a',
        '--format',
        'json',
      ],
      { allowFailure: true },
    )

    if (stateResult.exitCode !== 0 || !stateResult.stdout.trim()) {
      return null
    }

    const lines = stateResult.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)

    for (const line of lines) {
      try {
        const payload = JSON.parse(line) as {
          Service?: string
          State?: string
          ExitCode?: number
        }

        if (
          payload.Service === 'coach-engine' &&
          payload.State === 'exited' &&
          payload.ExitCode === 137
        ) {
          await this.writeLog(
            'Coach runtime exited with code 137. This usually means the local model ran out of memory while loading.',
          )
          return {
            type: 'coach-oom',
            message:
              'Cadence ran out of memory while loading the conversation coach. I have switched the desktop beta to a lighter coach profile. Please click Retry setup once more.',
          }
        }
      } catch {
        // Ignore lines that are not JSON.
      }
    }

    return null
  }

  resolveServiceSources(): { aiEngineDir: string; coachEngineDir: string } {
    if (app.isPackaged) {
      const resourcesPath = (process as NodeJS.Process & {
        resourcesPath: string
      }).resourcesPath

      return {
        aiEngineDir: join(resourcesPath, 'desktop-runtime', 'ai-engine'),
        coachEngineDir: join(resourcesPath, 'desktop-runtime', 'coach-engine'),
      }
    }

    const repoRootCandidates = [
      join(__dirname, '..', '..', '..'),
      join(process.cwd(), '..'),
      process.cwd(),
    ]
    const repoRoot =
      repoRootCandidates.find((candidate) =>
        existsSync(join(candidate, 'src', 'backend', 'ai-engine')),
      ) ?? repoRootCandidates[0]

    return {
      aiEngineDir: join(repoRoot, 'src', 'backend', 'ai-engine'),
      coachEngineDir: join(repoRoot, 'src', 'backend', 'coach-engine'),
    }
  }

  async detectComposeCommand(): Promise<ComposeCommand | null> {
    const dockerCompose = await this.runCommand('docker', ['compose', 'version'], {
      allowFailure: true,
    })
    if (
      dockerCompose.exitCode === 0 &&
      dockerCompose.stdout.includes('Docker Compose')
    ) {
      return { command: 'docker', argsPrefix: ['compose'] }
    }

    const legacyCompose = await this.runCommand('docker-compose', ['version'], {
      allowFailure: true,
    })
    if (
      legacyCompose.exitCode === 0 &&
      (legacyCompose.stdout.toLowerCase().includes('docker-compose') ||
        legacyCompose.stdout.toLowerCase().includes('docker compose'))
    ) {
      return { command: 'docker-compose', argsPrefix: [] }
    }

    return null
  }

  async runCommand(
    command: string,
    args: string[],
    options: RunCommandOptions = {},
  ): Promise<CommandResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        env: COMMAND_ENV,
        cwd: this.runtimeDir,
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      let stdout = ''
      let stderr = ''

      child.stdout?.on('data', (chunk) => {
        const text = chunk.toString()
        stdout += text
        options.onStdoutChunk?.(text)
      })

      child.stderr?.on('data', (chunk) => {
        const text = chunk.toString()
        stderr += text
        options.onStderrChunk?.(text)
      })

      child.on('error', (error) => {
        if (options.allowFailure) {
          resolve({
            stdout,
            stderr: `${stderr}${error.message}`.trim(),
            exitCode: null,
          })
          return
        }

        reject(error)
      })

      child.on('exit', (code) => {
        if (code === 0 || options.allowFailure) {
          resolve({ stdout, stderr, exitCode: code })
          return
        }

        reject(
          new Error(
            `Command failed (${command} ${args.join(' ')}) with exit code ${code}`,
          ),
        )
      })
    })
  }

  describeInstallLine(line: string): string {
    const normalized = line.toLowerCase()

    if (
      normalized.includes('load build definition') ||
      normalized.includes('load metadata') ||
      normalized.includes('resolve image config') ||
      normalized.includes('pulling fs layer') ||
      normalized.includes('downloading')
    ) {
      return 'Downloading the pieces Cadence needs for the first launch.'
    }

    if (
      normalized.includes('apt-get') ||
      normalized.includes('ffmpeg') ||
      normalized.includes('espeak') ||
      normalized.includes('libsndfile')
    ) {
      return 'Installing audio support for listening and voice playback.'
    }

    if (
      normalized.includes('pip install') ||
      normalized.includes('collecting') ||
      normalized.includes('installing collected packages') ||
      normalized.includes('requirements.txt')
    ) {
      return 'Installing the speaking and coaching tools.'
    }

    if (
      normalized.includes('exporting to image') ||
      normalized.includes('naming to') ||
      normalized.includes('writing image')
    ) {
      return 'Finishing the setup in the background.'
    }

    if (
      normalized.includes('started') ||
      normalized.includes('running') ||
      normalized.includes('created') ||
      normalized.includes('healthy')
    ) {
      return 'Starting your speaking tools.'
    }

    return 'Preparing your speaking tools for the first launch.'
  }

  async writeChunkToLog(chunk: string): Promise<void> {
    const lines = chunk
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)

    for (const line of lines) {
      await this.writeLog(line)
    }
  }

  async writeComposeFile(
    aiEngineDir: string,
    coachEngineDir: string,
  ): Promise<void> {
    const huggingFaceDir = join(this.modelsDir, 'huggingface')
    await mkdir(huggingFaceDir, { recursive: true })

    const quote = (value: string) => JSON.stringify(value)
    const hostCpuCount = String(this.getHostCpuCount())

    const composeYaml = `services:
  ai-engine:
    build:
      context: ${quote(aiEngineDir)}
      dockerfile: "Dockerfile"
    environment:
      AI_ENGINE_HOST: "0.0.0.0"
      AI_ENGINE_PORT: "8000"
      HF_HOME: "/models/huggingface"
      TRANSFORMERS_CACHE: "/models/huggingface"
      CADENCE_LOG_LEVEL: "INFO"
      CADENCE_CPU_THREADS: ${quote(hostCpuCount)}
      OMP_NUM_THREADS: ${quote(hostCpuCount)}
      OMP_THREAD_LIMIT: ${quote(hostCpuCount)}
      OPENBLAS_NUM_THREADS: ${quote(hostCpuCount)}
      MKL_NUM_THREADS: ${quote(hostCpuCount)}
      VECLIB_MAXIMUM_THREADS: ${quote(hostCpuCount)}
      NUMEXPR_NUM_THREADS: ${quote(hostCpuCount)}
      HF_TOKEN: ${quote(process.env.HF_TOKEN ?? '')}
    ports:
      - "127.0.0.1:8000:8000"
    volumes:
      - ${quote(`${huggingFaceDir}:/models/huggingface`)}

  coach-engine:
    build:
      context: ${quote(coachEngineDir)}
      dockerfile: "Dockerfile"
    environment:
      COACH_ENGINE_HOST: "0.0.0.0"
      COACH_ENGINE_PORT: "8001"
      COACH_LLM_MODEL_ID: ${JSON.stringify(DEFAULT_DESKTOP_COACH_MODEL_ID)}
      COACH_LLM_DEVICE: "cpu"
      HF_HOME: "/models/huggingface"
      TRANSFORMERS_CACHE: "/models/huggingface"
      CADENCE_LOG_LEVEL: "INFO"
      CADENCE_CPU_THREADS: ${quote(hostCpuCount)}
      OMP_NUM_THREADS: ${quote(hostCpuCount)}
      OMP_THREAD_LIMIT: ${quote(hostCpuCount)}
      OPENBLAS_NUM_THREADS: ${quote(hostCpuCount)}
      MKL_NUM_THREADS: ${quote(hostCpuCount)}
      VECLIB_MAXIMUM_THREADS: ${quote(hostCpuCount)}
      NUMEXPR_NUM_THREADS: ${quote(hostCpuCount)}
      HF_TOKEN: ${quote(process.env.HF_TOKEN ?? '')}
    ports:
      - "127.0.0.1:8001:8001"
    volumes:
      - ${quote(`${huggingFaceDir}:/models/huggingface`)}
`

    await writeFile(this.composeFilePath, composeYaml, 'utf8')
  }

  async ensureDirectories(): Promise<void> {
    await mkdir(this.logsDir, { recursive: true })
    await mkdir(this.runtimeDir, { recursive: true })
    await mkdir(this.modelsDir, { recursive: true })
    await mkdir(join(this.modelsDir, 'huggingface'), { recursive: true })
    await appendFile(this.logFilePath, '', 'utf8')
  }

  async writeLog(message: string): Promise<void> {
    await appendFile(
      this.logFilePath,
      `[${new Date().toISOString()}] ${message}\n`,
      'utf8',
    )
  }

  async readManifest(): Promise<SetupManifest | null> {
    try {
      const raw = await readFile(this.setupFilePath, 'utf8')
      return JSON.parse(raw) as SetupManifest
    } catch {
      return null
    }
  }

  async persistManifest(manifest: SetupManifest): Promise<void> {
    await writeFile(this.setupFilePath, JSON.stringify(manifest, null, 2), 'utf8')
  }

  private async fetchJson<T>(url: string): Promise<T | null> {
    try {
      const response = await fetch(url, {
        cache: 'no-store',
        signal: AbortSignal.timeout(HEALTH_CHECK_TIMEOUT_MS),
      })
      if (!response.ok) {
        return null
      }

      return (await response.json()) as T
    } catch {
      return null
    }
  }

  private createRuntimeDetails({
    manifest,
    health,
    aiPayload,
    coachPayload,
  }: {
    manifest: SetupManifest | null
    health: HealthSnapshot
    aiPayload: AiEngineHealthPayload | null
    coachPayload: CoachEngineHealthPayload | null
  }): DesktopRuntimeDetails {
    const huggingFaceDir = join(this.modelsDir, 'huggingface')
    const hostCpuCount = this.getHostCpuCount()

    return {
      appVersion: app.getVersion(),
      installStrategy: INSTALL_STRATEGY,
      isPackaged: app.isPackaged,
      lastReadyAt: manifest?.lastReadyAt ?? null,
      setupRoot: this.setupRoot,
      runtimeDir: this.runtimeDir,
      modelsDir: this.modelsDir,
      huggingFaceDir,
      composeFilePath: this.composeFilePath,
      composeFilePresent: existsSync(this.composeFilePath),
      logsPath: this.logFilePath,
      setupManifestPresent: manifest !== null,
      endpoints: {
        webApp: DESKTOP_WEB_APP_URL,
        aiEngine: AI_ENGINE_URL,
        coachEngine: COACH_ENGINE_URL,
      },
      availability: {
        huggingFaceTokenConfigured:
          aiPayload?.hfTokenConfigured === true ||
          aiPayload?.diagnostics?.hfTokenConfigured === true ||
          Boolean(process.env.HF_TOKEN),
      },
      performance: {
        hostCpuCount,
        cpuThreadsPerService: hostCpuCount,
        containerCpuLimitsApplied: false,
        containerMemoryLimitsApplied: false,
        note:
          'Cadence does not apply per-container CPU or memory caps. On macOS, Docker Desktop still controls the overall machine budget and local engines run on CPU inside that environment.',
      },
      aiEngine: {
        modelId:
          aiPayload?.diagnostics?.modelName ??
          aiPayload?.model ??
          DEFAULT_DESKTOP_SPEECH_MODEL_ID,
        ready: health.aiEngineReady,
        loadError:
          aiPayload?.loadError ??
          aiPayload?.diagnostics?.loadError ??
          null,
        device: aiPayload?.diagnostics?.device ?? null,
      },
      transcriber: {
        modelId:
          aiPayload?.transcriberModel ?? DEFAULT_DESKTOP_TRANSCRIBER_MODEL_ID,
        ready: health.transcriberReady,
        loadError: aiPayload?.transcriberLoadError ?? null,
        device: aiPayload?.transcriberDevice ?? null,
      },
      tts: {
        modelId: aiPayload?.ttsModel ?? DEFAULT_DESKTOP_TTS_MODEL_ID,
        ready: health.ttsReady,
        loadError: aiPayload?.ttsLoadError ?? null,
        device: aiPayload?.ttsDevice ?? null,
        language: aiPayload?.ttsLanguage ?? DEFAULT_DESKTOP_TTS_LANGUAGE,
        instruct: aiPayload?.ttsInstruct ?? DEFAULT_DESKTOP_TTS_INSTRUCT,
      },
      coach: {
        modelId:
          coachPayload?.coachModel ??
          coachPayload?.model ??
          DEFAULT_DESKTOP_COACH_MODEL_ID,
        ready: health.coachEngineReady,
        loadError: coachPayload?.coachLoadError ?? null,
        device: coachPayload?.coachDevice ?? null,
        provider: coachPayload?.provider ?? 'local-coach',
        transformersVersion: coachPayload?.coachTransformersVersion ?? null,
      },
    }
  }
}
