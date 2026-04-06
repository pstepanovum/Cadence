type DesktopRuntimeLocation =
  | 'setupRoot'
  | 'runtimeDir'
  | 'modelsDir'
  | 'huggingFaceDir'
  | 'logsPath'
  | 'composeFilePath'

interface DesktopRuntimeDetails {
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

interface DesktopSetupState {
  phase:
    | 'idle'
    | 'checking'
    | 'installing'
    | 'starting-services'
    | 'verifying'
    | 'ready'
    | 'error'
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

interface Window {
  electron?: {
    isElectron?: boolean
    platform?: string
    openDevTools?: () => Promise<null>
  }
  cadenceDesktopSetup?: {
    getState: () => Promise<DesktopSetupState | null>
    getRuntimeDetails: () => Promise<DesktopRuntimeDetails | null>
    install: () => Promise<DesktopSetupState | null>
    retry: () => Promise<DesktopSetupState | null>
    openLogs: () => Promise<null>
    openLocation: (location: DesktopRuntimeLocation) => Promise<null>
    onProgress: (listener: (state: DesktopSetupState) => void) => () => void
  }
}
