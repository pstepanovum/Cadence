import { app, shell } from 'electron'
import { type ChildProcess, spawn } from 'child_process'
import { createHash } from 'crypto'
import { appendFile, mkdir, readFile, rm, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import { cpus } from 'os'
import { join } from 'path'
import {
  AI_ENGINE_URL,
  COACH_ENGINE_URL,
  COMMAND_ENV,
  DEFAULT_DESKTOP_COACH_MODEL_ID,
  DEFAULT_DESKTOP_SPEECH_MODEL_ID,
  DEFAULT_DESKTOP_TRANSCRIBER_MODEL_ID,
  DEFAULT_DESKTOP_TTS_INSTRUCT,
  DEFAULT_DESKTOP_TTS_LANGUAGE,
  DEFAULT_DESKTOP_TTS_MODEL_ID,
  DESKTOP_WEB_APP_URL,
  HEALTH_CHECK_TIMEOUT_MS,
  INSTALL_STRATEGY,
  MIN_DESKTOP_PYTHON_MAJOR,
  MIN_DESKTOP_PYTHON_MINOR,
} from './constants'
import type {
  AiEngineHealthPayload,
  CoachEngineHealthPayload,
  CommandResult,
  DesktopRuntimeDetails,
  DesktopRuntimeLocation,
  HealthSnapshot,
  RunCommandOptions,
  RuntimeFailureSnapshot,
  SetupManifest,
} from './types'

type ServiceName = 'ai-engine' | 'coach-engine'

interface RuntimeManifestFile {
  strategy: 'native-sidecar-beta'
  pythonCommand: string | null
  aiEngineDir: string
  coachEngineDir: string
  aiVenvPath: string
  coachVenvPath: string
  aiEngineLogPath: string
  coachEngineLogPath: string
  lastPreparedAt: string | null
  lastStartedAt: string | null
}

interface ServiceProcessSnapshot {
  pid: number | null
  exitCode: number | null
  signal: NodeJS.Signals | null
}

interface PythonCommandDetails {
  command: string
  version: string
  major: number
  minor: number
  patch: number
}

export class DesktopSetupSupport {
  readonly setupRoot = join(app.getPath('userData'), 'desktop-runtime')
  readonly logsDir = join(this.setupRoot, 'logs')
  readonly runtimeDir = join(this.setupRoot, 'runtime')
  readonly modelsDir = join(this.setupRoot, 'models')
  readonly venvsDir = join(this.setupRoot, 'venvs')
  readonly cacheDir = join(this.setupRoot, 'cache')
  readonly setupFilePath = join(this.setupRoot, 'setup.json')
  readonly logFilePath = join(this.logsDir, 'desktop-setup.log')
  readonly runtimeManifestPath = join(this.runtimeDir, 'runtime-manifest.json')
  readonly aiEngineLogPath = join(this.logsDir, 'ai-engine.log')
  readonly coachEngineLogPath = join(this.logsDir, 'coach-engine.log')

  private cachedPythonCommand: PythonCommandDetails | null = null
  private readonly serviceProcesses = new Map<ServiceName, ChildProcess>()
  private readonly serviceProcessState = new Map<ServiceName, ServiceProcessSnapshot>()

  private getBundledPythonCandidates(): string[] {
    const archDir =
      process.arch === 'arm64'
        ? 'aarch64-apple-darwin'
        : process.arch === 'x64'
          ? 'x86_64-apple-darwin'
          : null

    if (!archDir) {
      return []
    }

    const roots = app.isPackaged
      ? [
          join(
            (process as NodeJS.Process & { resourcesPath: string }).resourcesPath,
            'desktop-runtime',
            'python',
            archDir,
          ),
        ]
      : [
          join(__dirname, '..', '..', 'vendor', 'python', archDir),
          join(process.cwd(), 'vendor', 'python', archDir),
        ]

    return roots.flatMap((root) => [
      join(root, 'python', 'bin', 'python3'),
      join(root, 'python', 'bin', 'python'),
    ])
  }

  getHostCpuCount(): number {
    return Math.max(1, cpus().length || 1)
  }

  hasExistingSetupArtifacts(): boolean {
    return (
      existsSync(this.setupFilePath) ||
      existsSync(this.runtimeManifestPath) ||
      existsSync(this.getServiceVenvPythonPath('ai-engine')) ||
      existsSync(this.getServiceVenvPythonPath('coach-engine'))
    )
  }

  async openLogs(): Promise<void> {
    await this.ensureDirectories()

    const aiTail = await this.readLogTail(this.aiEngineLogPath)
    const coachTail = await this.readLogTail(this.coachEngineLogPath)

    if (aiTail) {
      await this.writeLog('----- ai-engine log tail -----')
      await this.writeLog(aiTail)
    }

    if (coachTail) {
      await this.writeLog('----- coach-engine log tail -----')
      await this.writeLog(coachTail)
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
      runtimeManifestPath: this.runtimeManifestPath,
      aiEngineLogPath: this.aiEngineLogPath,
      coachEngineLogPath: this.coachEngineLogPath,
    }

    const target = targets[location]
    const parentFallback =
      location === 'runtimeManifestPath'
        ? this.runtimeDir
        : location === 'aiEngineLogPath' || location === 'coachEngineLogPath'
          ? this.logsDir
          : target

    if (!existsSync(target)) {
      await shell.openPath(parentFallback)
      return
    }

    if (
      location === 'logsPath' ||
      location === 'runtimeManifestPath' ||
      location === 'aiEngineLogPath' ||
      location === 'coachEngineLogPath'
    ) {
      shell.showItemInFolder(target)
      return
    }

    await shell.openPath(target)
  }

  async inspectRuntime(): Promise<{
    health: HealthSnapshot
    details: DesktopRuntimeDetails
  }> {
    const manifest = await this.readManifest()
    const pythonCommand = await this.detectPythonCommand()
    const [aiPayload, coachPayload] = await Promise.all([
      this.fetchJson<AiEngineHealthPayload>(AI_ENGINE_URL),
      this.fetchJson<CoachEngineHealthPayload>(COACH_ENGINE_URL),
    ])

    const aiEngineReady = aiPayload?.modelReady === true
    const coachEngineReady = coachPayload?.ready === true
    const transcriberReady = aiPayload?.transcriberReady === true
    const ttsReady =
      aiPayload?.ttsReady === true && aiPayload?.ttsProvider === 'omnivoice'

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
      details: await this.createRuntimeDetails({
        manifest,
        health,
        aiPayload,
        coachPayload,
        pythonCommand,
      }),
    }
  }

  async inspectRuntimeFailure(): Promise<RuntimeFailureSnapshot | null> {
    for (const serviceName of ['ai-engine', 'coach-engine'] as const) {
      const snapshot = this.serviceProcessState.get(serviceName)
      if (!snapshot || snapshot.exitCode === null) {
        continue
      }

      const logTail = await this.readLogTail(this.getServiceLogPath(serviceName))
      if (
        serviceName === 'coach-engine' &&
        /out of memory|oom|killed/i.test(logTail)
      ) {
        await this.writeLog(
          'Coach runtime exited while loading the local model. This usually means the model ran out of memory.',
        )
        return {
          type: 'coach-oom',
          message:
            'Cadence ran out of memory while loading the conversation coach. Please retry setup so it can start again with the lighter local profile.',
        }
      }

      return {
        type: 'service-exit',
        message:
          serviceName === 'ai-engine'
            ? 'Cadence could not keep the local speech tools running. Open View details to see the latest service log, then try setup again.'
            : 'Cadence could not keep the local coach running. Open View details to see the latest service log, then try setup again.',
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

  async detectPythonCommand(): Promise<string | null> {
    const resolution = await this.resolvePythonCommand()
    return resolution.supported?.command ?? null
  }

  private async resolvePythonCommand(): Promise<{
    supported: PythonCommandDetails | null
    incompatible: PythonCommandDetails | null
  }> {
    if (this.cachedPythonCommand) {
      return {
        supported: this.cachedPythonCommand,
        incompatible: null,
      }
    }

    const candidates = [
      process.env.CADENCE_DESKTOP_PYTHON,
      ...this.getBundledPythonCandidates(),
      'python3.12',
      'python3.11',
      'python3.10',
      'python3',
      'python',
    ].filter((candidate): candidate is string => Boolean(candidate))

    let bestIncompatible: PythonCommandDetails | null = null

    for (const candidate of candidates) {
      const details = await this.inspectPythonCommand(candidate)
      if (!details) {
        continue
      }

      if (this.isSupportedPython(details)) {
        this.cachedPythonCommand = details
        await this.writeLog(
          `Using ${details.command} (${details.version}) for the local desktop runtime.`,
        )
        return {
          supported: details,
          incompatible: bestIncompatible,
        }
      }

      if (
        !bestIncompatible ||
        details.major > bestIncompatible.major ||
        (details.major === bestIncompatible.major &&
          details.minor > bestIncompatible.minor) ||
        (details.major === bestIncompatible.major &&
          details.minor === bestIncompatible.minor &&
          details.patch > bestIncompatible.patch)
      ) {
        bestIncompatible = details
      }
    }

    return {
      supported: null,
      incompatible: bestIncompatible,
    }
  }

  async prepareNativeRuntime({
    aiEngineDir,
    coachEngineDir,
    onStatus,
    onInstallChunk,
  }: {
    aiEngineDir: string
    coachEngineDir: string
    onStatus?: (step: string, percent: number) => void
    onInstallChunk?: (chunk: string) => void
  }): Promise<string> {
    await this.ensureDirectories()

    const pythonResolution = await this.resolvePythonCommand()
    const pythonCommand = pythonResolution.supported?.command ?? null
    if (!pythonCommand) {
      if (pythonResolution.incompatible) {
        await this.writeLog(
          `Cadence found ${pythonResolution.incompatible.command} (${pythonResolution.incompatible.version}), but it needs Python ${MIN_DESKTOP_PYTHON_MAJOR}.${MIN_DESKTOP_PYTHON_MINOR}+ for the local desktop runtime.`,
        )
        throw new Error(
          `Cadence needs Python ${MIN_DESKTOP_PYTHON_MAJOR}.${MIN_DESKTOP_PYTHON_MINOR} or newer on this Mac. I found ${pythonResolution.incompatible.version} instead. Please install Python ${MIN_DESKTOP_PYTHON_MAJOR}.${MIN_DESKTOP_PYTHON_MINOR}+ and try setup again.`,
        )
      }

      if (app.isPackaged) {
        throw new Error(
          'Cadence could not find its bundled Python runtime inside the desktop app. Reinstall the app, then try setup again.',
        )
      }

      throw new Error(
        `Cadence could not find Python ${MIN_DESKTOP_PYTHON_MAJOR}.${MIN_DESKTOP_PYTHON_MINOR} or newer on this Mac. Install Python ${MIN_DESKTOP_PYTHON_MAJOR}.${MIN_DESKTOP_PYTHON_MINOR}+ and try setup again.`,
      )
    }

    onStatus?.('Preparing the local Cadence helper on this Mac.', 20)
    await this.ensureServiceEnvironment({
      serviceName: 'ai-engine',
      serviceDir: aiEngineDir,
      pythonCommand,
      onStatus,
      onInstallChunk,
      createPercent: 24,
      installPercent: 34,
      installMessage: 'Installing the local speech tools.',
    })

    await this.ensureServiceEnvironment({
      serviceName: 'coach-engine',
      serviceDir: coachEngineDir,
      pythonCommand,
      onStatus,
      onInstallChunk,
      createPercent: 40,
      installPercent: 50,
      installMessage: 'Installing the local coach tools.',
    })

    const manifest: RuntimeManifestFile = {
      strategy: INSTALL_STRATEGY,
      pythonCommand,
      aiEngineDir,
      coachEngineDir,
      aiVenvPath: this.getServiceVenvDir('ai-engine'),
      coachVenvPath: this.getServiceVenvDir('coach-engine'),
      aiEngineLogPath: this.aiEngineLogPath,
      coachEngineLogPath: this.coachEngineLogPath,
      lastPreparedAt: new Date().toISOString(),
      lastStartedAt: null,
    }
    await this.persistRuntimeManifest(manifest)
    return pythonCommand
  }

  private isSupportedPython(details: PythonCommandDetails): boolean {
    if (details.major !== MIN_DESKTOP_PYTHON_MAJOR) {
      return details.major > MIN_DESKTOP_PYTHON_MAJOR
    }

    return details.minor >= MIN_DESKTOP_PYTHON_MINOR
  }

  private async inspectPythonCommand(
    command: string,
  ): Promise<PythonCommandDetails | null> {
    const result = await this.runCommand(
      command,
      [
        '-c',
        'import sys; print(f"{sys.version_info[0]}.{sys.version_info[1]}.{sys.version_info[2]}")',
      ],
      {
        allowFailure: true,
      },
    )

    const versionText = result.stdout.trim() || result.stderr.trim()
    const match = versionText.match(/(\d+)\.(\d+)\.(\d+)/)
    if (!match) {
      return null
    }

    const [, majorText, minorText, patchText] = match
    return {
      command,
      version: `${majorText}.${minorText}.${patchText}`,
      major: Number.parseInt(majorText, 10),
      minor: Number.parseInt(minorText, 10),
      patch: Number.parseInt(patchText, 10),
    }
  }

  async startNativeRuntime({
    aiEngineDir,
    coachEngineDir,
  }: {
    aiEngineDir: string
    coachEngineDir: string
  }): Promise<void> {
    await this.ensureDirectories()
    await this.stopAllRuntimeProcesses()

    this.serviceProcessState.clear()

    await this.spawnServiceProcess({
      serviceName: 'ai-engine',
      serviceDir: aiEngineDir,
      pythonPath: this.getServiceVenvPythonPath('ai-engine'),
      env: this.createServiceEnv('ai-engine'),
    })

    await this.spawnServiceProcess({
      serviceName: 'coach-engine',
      serviceDir: coachEngineDir,
      pythonPath: this.getServiceVenvPythonPath('coach-engine'),
      env: this.createServiceEnv('coach-engine'),
    })

    const manifest = await this.readRuntimeManifest()
    if (manifest) {
      await this.persistRuntimeManifest({
        ...manifest,
        lastStartedAt: new Date().toISOString(),
      })
    }
  }

  async stopAllRuntimeProcesses(): Promise<void> {
    for (const serviceName of ['ai-engine', 'coach-engine'] as const) {
      await this.stopServiceProcess(serviceName)
    }
  }

  dispose(): void {
    for (const serviceName of ['ai-engine', 'coach-engine'] as const) {
      void this.stopServiceProcess(serviceName)
    }
  }

  async runCommand(
    command: string,
    args: string[],
    options: RunCommandOptions = {},
  ): Promise<CommandResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        env: {
          ...COMMAND_ENV,
          ...(options.env ?? {}),
        },
        cwd: options.cwd ?? this.runtimeDir,
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
      normalized.includes('creating virtual environment') ||
      normalized.includes('python -m venv') ||
      normalized.includes('ensurepip')
    ) {
      return 'Preparing Cadence locally on this Mac.'
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
      normalized.includes('building wheel') ||
      normalized.includes('running build') ||
      normalized.includes('preparing metadata')
    ) {
      return 'Finishing the local setup in the background.'
    }

    if (
      normalized.includes('uvicorn') ||
      normalized.includes('application startup complete') ||
      normalized.includes('running on http')
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

  async ensureDirectories(): Promise<void> {
    await mkdir(this.logsDir, { recursive: true })
    await mkdir(this.runtimeDir, { recursive: true })
    await mkdir(this.modelsDir, { recursive: true })
    await mkdir(this.venvsDir, { recursive: true })
    await mkdir(this.cacheDir, { recursive: true })
    await mkdir(join(this.modelsDir, 'huggingface'), { recursive: true })
    await appendFile(this.logFilePath, '', 'utf8')
    await appendFile(this.aiEngineLogPath, '', 'utf8')
    await appendFile(this.coachEngineLogPath, '', 'utf8')
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

  private getServiceVenvDir(serviceName: ServiceName): string {
    return join(this.venvsDir, serviceName)
  }

  private getServiceVenvPythonPath(serviceName: ServiceName): string {
    return process.platform === 'win32'
      ? join(this.getServiceVenvDir(serviceName), 'Scripts', 'python.exe')
      : join(this.getServiceVenvDir(serviceName), 'bin', 'python')
  }

  private getServiceLogPath(serviceName: ServiceName): string {
    return serviceName === 'ai-engine'
      ? this.aiEngineLogPath
      : this.coachEngineLogPath
  }

  private getServicePidPath(serviceName: ServiceName): string {
    return join(this.runtimeDir, `${serviceName}.pid`)
  }

  private getInstallMarkerPath(serviceName: ServiceName): string {
    return join(this.runtimeDir, `${serviceName}.install.json`)
  }

  private resolveRequirementsPath(serviceDir: string): string {
    const archSpecificRequirementsPath = join(
      serviceDir,
      `requirements.desktop.${process.arch}.txt`,
    )
    if (existsSync(archSpecificRequirementsPath)) {
      return archSpecificRequirementsPath
    }

    const desktopRequirementsPath = join(serviceDir, 'requirements.desktop.txt')
    if (existsSync(desktopRequirementsPath)) {
      return desktopRequirementsPath
    }

    return join(serviceDir, 'requirements.txt')
  }

  private createServiceEnv(serviceName: ServiceName): NodeJS.ProcessEnv {
    const threadCount = String(this.getHostCpuCount())
    const huggingFaceDir = join(this.modelsDir, 'huggingface')
    const shared = {
      ...process.env,
      HF_HOME: huggingFaceDir,
      HF_HUB_CACHE: huggingFaceDir,
      XDG_CACHE_HOME: this.cacheDir,
      CADENCE_LOG_LEVEL: 'INFO',
      CADENCE_CPU_THREADS: threadCount,
      OMP_NUM_THREADS: threadCount,
      OMP_THREAD_LIMIT: threadCount,
      OPENBLAS_NUM_THREADS: threadCount,
      MKL_NUM_THREADS: threadCount,
      VECLIB_MAXIMUM_THREADS: threadCount,
      NUMEXPR_NUM_THREADS: threadCount,
      PIP_NO_CACHE_DIR: '1',
      PIP_DISABLE_PIP_VERSION_CHECK: '1',
      PYTHONUNBUFFERED: '1',
      HF_TOKEN: process.env.HF_TOKEN ?? '',
    }

    if (serviceName === 'ai-engine') {
      return {
        ...shared,
        AI_ENGINE_HOST: '127.0.0.1',
        AI_ENGINE_PORT: '8000',
        CADENCE_TTS_PROVIDER: 'auto',
        CADENCE_TTS_REQUIRE_MODEL: '1',
      }
    }

    return {
      ...shared,
      COACH_ENGINE_HOST: '127.0.0.1',
      COACH_ENGINE_PORT: '8001',
      COACH_LLM_MODEL_ID: DEFAULT_DESKTOP_COACH_MODEL_ID,
    }
  }

  private async ensureServiceEnvironment({
    serviceName,
    serviceDir,
    pythonCommand,
    onStatus,
    onInstallChunk,
    createPercent,
    installPercent,
    installMessage,
  }: {
    serviceName: ServiceName
    serviceDir: string
    pythonCommand: string
    onStatus?: (step: string, percent: number) => void
    onInstallChunk?: (chunk: string) => void
    createPercent: number
    installPercent: number
    installMessage: string
  }): Promise<void> {
    const venvDir = this.getServiceVenvDir(serviceName)
    const pythonPath = this.getServiceVenvPythonPath(serviceName)
    const requirementsPath = this.resolveRequirementsPath(serviceDir)
    const requirementsFile = requirementsPath.split('/').at(-1) ?? 'requirements.txt'
    const installMarkerPath = this.getInstallMarkerPath(serviceName)
    const requirementsHash = createHash('sha256')
      .update(await readFile(requirementsPath, 'utf8'))
      .digest('hex')

    if (!existsSync(pythonPath)) {
      onStatus?.('Preparing the local Cadence helper on this Mac.', createPercent)
      await this.writeLog(`Creating virtual environment for ${serviceName}`)
      const createVenv = await this.runCommand(
        pythonCommand,
        ['-m', 'venv', venvDir],
        {
          allowFailure: true,
          cwd: serviceDir,
          onStdoutChunk: onInstallChunk,
          onStderrChunk: onInstallChunk,
        },
      )

      if (createVenv.exitCode !== 0) {
        throw new Error(
          createVenv.stderr.trim() ||
            createVenv.stdout.trim() ||
            `Cadence could not create the local environment for ${serviceName}.`,
        )
      }
    }

    const installMarker = await this.readInstallMarker(installMarkerPath)
    if (installMarker?.requirementsHash === requirementsHash) {
      return
    }

    onStatus?.(installMessage, installPercent)
    await this.writeLog(
      `Installing local dependencies for ${serviceName} using ${requirementsFile}`,
    )

    const upgradePip = await this.runCommand(
      pythonPath,
      [
        '-m',
        'pip',
        'install',
        '--no-cache-dir',
        '--upgrade',
        'pip',
        'setuptools',
        'wheel',
      ],
      {
        allowFailure: true,
        cwd: serviceDir,
        env: this.createServiceEnv(serviceName),
        onStdoutChunk: onInstallChunk,
        onStderrChunk: onInstallChunk,
      },
    )

    if (upgradePip.exitCode !== 0) {
      throw new Error(
        upgradePip.stderr.trim() ||
          upgradePip.stdout.trim() ||
          `Cadence could not prepare pip for ${serviceName}.`,
      )
    }

    const installRequirements = await this.runCommand(
      pythonPath,
      ['-m', 'pip', 'install', '--no-cache-dir', '-r', requirementsFile],
      {
        allowFailure: true,
        cwd: serviceDir,
        env: this.createServiceEnv(serviceName),
        onStdoutChunk: onInstallChunk,
        onStderrChunk: onInstallChunk,
      },
    )

    if (installRequirements.exitCode !== 0) {
      throw new Error(
        installRequirements.stderr.trim() ||
          installRequirements.stdout.trim() ||
          `Cadence could not install the local dependencies for ${serviceName}.`,
      )
    }

    await writeFile(
      installMarkerPath,
      JSON.stringify(
        {
          requirementsHash,
          updatedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
      'utf8',
    )
  }

  private async spawnServiceProcess({
    serviceName,
    serviceDir,
    pythonPath,
    env,
  }: {
    serviceName: ServiceName
    serviceDir: string
    pythonPath: string
    env: NodeJS.ProcessEnv
  }): Promise<void> {
    if (!existsSync(pythonPath)) {
      throw new Error(
        `Cadence could not find the local Python environment for ${serviceName}.`,
      )
    }

    await this.writeLog(`Starting ${serviceName} from ${serviceDir}`)
    const child = spawn(pythonPath, ['-u', 'main.py'], {
      cwd: serviceDir,
      env: {
        ...COMMAND_ENV,
        ...env,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    this.serviceProcesses.set(serviceName, child)
    this.serviceProcessState.set(serviceName, {
      pid: child.pid ?? null,
      exitCode: null,
      signal: null,
    })
    await writeFile(this.getServicePidPath(serviceName), String(child.pid ?? ''), 'utf8')

    child.stdout?.on('data', (chunk) => {
      void this.writeServiceChunk(serviceName, chunk.toString())
    })

    child.stderr?.on('data', (chunk) => {
      void this.writeServiceChunk(serviceName, chunk.toString())
    })

    child.on('error', (error) => {
      this.serviceProcessState.set(serviceName, {
        pid: child.pid ?? null,
        exitCode: 1,
        signal: null,
      })
      void this.writeLog(`${serviceName} failed to start: ${error.message}`)
    })

    child.on('exit', (code, signal) => {
      this.serviceProcesses.delete(serviceName)
      this.serviceProcessState.set(serviceName, {
        pid: child.pid ?? null,
        exitCode: code ?? 0,
        signal,
      })
      void this.writeLog(
        `${serviceName} exited code=${code ?? 'null'} signal=${signal ?? 'null'}`,
      )
      void rm(this.getServicePidPath(serviceName), { force: true })
    })

    await new Promise((resolve) => setTimeout(resolve, 600))
  }

  private async stopServiceProcess(serviceName: ServiceName): Promise<void> {
    const child = this.serviceProcesses.get(serviceName)
    if (child && !child.killed) {
      try {
        child.kill('SIGTERM')
      } catch {
        // Ignore
      }
    }

    const pidPath = this.getServicePidPath(serviceName)
    if (existsSync(pidPath)) {
      const pid = await readFile(pidPath, 'utf8').catch(() => '')
      const normalized = Number(pid.trim())
      if (Number.isFinite(normalized) && normalized > 0) {
        try {
          process.kill(normalized, 'SIGTERM')
        } catch {
          // Ignore
        }
      }
    }

    this.serviceProcesses.delete(serviceName)
    await rm(pidPath, { force: true })
  }

  private async writeServiceChunk(
    serviceName: ServiceName,
    chunk: string,
  ): Promise<void> {
    const serviceLogPath = this.getServiceLogPath(serviceName)
    await appendFile(serviceLogPath, chunk, 'utf8')

    const lines = chunk
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)

    for (const line of lines) {
      await this.writeLog(`[${serviceName}] ${line}`)
    }
  }

  private async readRuntimeManifest(): Promise<RuntimeManifestFile | null> {
    try {
      const raw = await readFile(this.runtimeManifestPath, 'utf8')
      return JSON.parse(raw) as RuntimeManifestFile
    } catch {
      return null
    }
  }

  private async persistRuntimeManifest(
    manifest: RuntimeManifestFile,
  ): Promise<void> {
    await writeFile(
      this.runtimeManifestPath,
      JSON.stringify(manifest, null, 2),
      'utf8',
    )
  }

  private async readInstallMarker(
    installMarkerPath: string,
  ): Promise<{ requirementsHash?: string } | null> {
    try {
      const raw = await readFile(installMarkerPath, 'utf8')
      return JSON.parse(raw) as { requirementsHash?: string }
    } catch {
      return null
    }
  }

  private async readLogTail(path: string, maxLines = 60): Promise<string> {
    if (!existsSync(path)) {
      return ''
    }

    try {
      const raw = await readFile(path, 'utf8')
      return raw
        .split(/\r?\n/)
        .filter(Boolean)
        .slice(-maxLines)
        .join('\n')
    } catch {
      return ''
    }
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

  private async createRuntimeDetails({
    manifest,
    health,
    aiPayload,
    coachPayload,
    pythonCommand,
  }: {
    manifest: SetupManifest | null
    health: HealthSnapshot
    aiPayload: AiEngineHealthPayload | null
    coachPayload: CoachEngineHealthPayload | null
    pythonCommand: string | null
  }): Promise<DesktopRuntimeDetails> {
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
      runtimeManifestPath: this.runtimeManifestPath,
      runtimeManifestPresent: existsSync(this.runtimeManifestPath),
      logsPath: this.logFilePath,
      aiEngineLogPath: this.aiEngineLogPath,
      coachEngineLogPath: this.coachEngineLogPath,
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
        pythonCommand,
      },
      performance: {
        hostCpuCount,
        cpuThreadsPerService: hostCpuCount,
        containerCpuLimitsApplied: false,
        containerMemoryLimitsApplied: false,
        note:
          'Cadence ships its own local runtime in the desktop app, starts the speech and coach services directly on this Mac, and can use native acceleration when the local model supports it.',
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
        provider: aiPayload?.ttsProvider ?? null,
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
