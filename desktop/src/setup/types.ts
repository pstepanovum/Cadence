export type DesktopSetupPhase =
  | 'idle'
  | 'checking'
  | 'installing'
  | 'starting-services'
  | 'verifying'
  | 'ready'
  | 'error'

export interface DesktopSetupState {
  phase: DesktopSetupPhase
  currentStep: string | null
  percent: number
  aiEngineReady: boolean
  coachEngineReady: boolean
  transcriberReady: boolean
  ttsReady: boolean
  modelsReady: boolean
  error: string | null
  logsPath: string | null
  installStrategy: 'docker-beta'
  isPackaged: boolean
  runtimeDetails: DesktopRuntimeDetails | null
}

export interface DesktopRuntimeDetails {
  appVersion: string
  installStrategy: 'docker-beta'
  isPackaged: boolean
  lastReadyAt: string | null
  setupRoot: string
  runtimeDir: string
  modelsDir: string
  huggingFaceDir: string
  composeFilePath: string
  composeFilePresent: boolean
  logsPath: string
  setupManifestPresent: boolean
  endpoints: {
    webApp: string
    aiEngine: string
    coachEngine: string
  }
  availability: {
    huggingFaceTokenConfigured: boolean
  }
  performance: {
    hostCpuCount: number
    cpuThreadsPerService: number
    containerCpuLimitsApplied: boolean
    containerMemoryLimitsApplied: boolean
    note: string
  }
  aiEngine: {
    modelId: string
    ready: boolean
    loadError: string | null
    device: string | null
  }
  transcriber: {
    modelId: string
    ready: boolean
    loadError: string | null
    device: string | null
  }
  tts: {
    modelId: string
    ready: boolean
    loadError: string | null
    device: string | null
    language: string
    instruct: string
  }
  coach: {
    modelId: string
    ready: boolean
    loadError: string | null
    device: string | null
    provider: string
    transformersVersion: string | null
  }
}

export type DesktopRuntimeLocation =
  | 'setupRoot'
  | 'runtimeDir'
  | 'modelsDir'
  | 'huggingFaceDir'
  | 'logsPath'
  | 'composeFilePath'

export interface SetupManifest {
  version: 1
  appVersion: string
  lastReadyAt: string | null
}

export interface AiEngineHealthPayload {
  model?: string
  modelReady?: boolean
  loadError?: string | null
  hfTokenConfigured?: boolean
  diagnostics?: {
    modelName?: string
    loadError?: string | null
    hfTokenConfigured?: boolean
    device?: string | null
  }
  ttsModel?: string
  ttsLanguage?: string
  ttsInstruct?: string
  transcriberReady?: boolean
  transcriberModel?: string
  transcriberLoadError?: string | null
  transcriberDevice?: string | null
  ttsReady?: boolean
  ttsLoadError?: string | null
  ttsDevice?: string | null
}

export interface CoachEngineHealthPayload {
  ready?: boolean
  provider?: string
  model?: string
  coachReady?: boolean
  coachModel?: string
  coachDevice?: string | null
  coachLoadError?: string | null
  coachTransformersVersion?: string | null
}

export interface HealthSnapshot {
  aiEngineReady: boolean
  coachEngineReady: boolean
  transcriberReady: boolean
  ttsReady: boolean
  modelsReady: boolean
}

export interface RuntimeFailureSnapshot {
  type: 'coach-oom'
  message: string
}

export interface CommandResult {
  stdout: string
  stderr: string
  exitCode: number | null
}

export interface RunCommandOptions {
  allowFailure?: boolean
  onStdoutChunk?: (chunk: string) => void
  onStderrChunk?: (chunk: string) => void
}

export interface ComposeCommand {
  command: string
  argsPrefix: string[]
}

export type StateListener = (state: DesktopSetupState) => void
