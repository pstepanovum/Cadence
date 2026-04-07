import { headers } from 'next/headers'

export type AppRuntime = 'desktop' | 'web'

export const CADENCE_DESKTOP_UA_TOKEN = 'CadenceDesktop'
export const DEFAULT_WEB_AI_ENGINE_URL = 'http://127.0.0.1:8000'
export const DEFAULT_WEB_COACH_ENGINE_URL = 'http://127.0.0.1:8001'
export const DEFAULT_DESKTOP_AI_ENGINE_URL = `http://127.0.0.1:${process.env.CADENCE_DESKTOP_AI_ENGINE_PORT ?? '8010'}`
export const DEFAULT_DESKTOP_COACH_ENGINE_URL = `http://127.0.0.1:${process.env.CADENCE_DESKTOP_COACH_ENGINE_PORT ?? '8011'}`

export async function getRequestRuntime(): Promise<AppRuntime> {
  const userAgent = (await headers()).get('user-agent') ?? ''
  return getRuntimeFromUserAgent(userAgent)
}

export function getRuntimeFromUserAgent(
  userAgent: string | null | undefined,
): AppRuntime {
  return (userAgent ?? '').includes(CADENCE_DESKTOP_UA_TOKEN)
    ? 'desktop'
    : 'web'
}

export function getRequestRuntimeFromRequest(request: Request): AppRuntime {
  return getRuntimeFromUserAgent(request.headers.get('user-agent'))
}

export function getAiEngineUrl(runtime: AppRuntime): string {
  if (runtime === 'desktop') {
    return normalizeBaseUrl(
      process.env.CADENCE_DESKTOP_AI_ENGINE_URL,
      DEFAULT_DESKTOP_AI_ENGINE_URL,
    )
  }

  return normalizeBaseUrl(process.env.AI_ENGINE_URL, DEFAULT_WEB_AI_ENGINE_URL)
}

export function getCoachEngineUrl(runtime: AppRuntime): string {
  if (runtime === 'desktop') {
    return normalizeBaseUrl(
      process.env.CADENCE_DESKTOP_COACH_ENGINE_URL,
      DEFAULT_DESKTOP_COACH_ENGINE_URL,
    )
  }

  return normalizeBaseUrl(
    process.env.AI_COACH_ENGINE_URL,
    DEFAULT_WEB_COACH_ENGINE_URL,
  )
}

export function getAiEngineUrlForRequest(request: Request): string {
  return getAiEngineUrl(getRequestRuntimeFromRequest(request))
}

export function getCoachEngineUrlForRequest(request: Request): string {
  return getCoachEngineUrl(getRequestRuntimeFromRequest(request))
}

function normalizeBaseUrl(value: string | undefined, fallback: string): string {
  return value?.replace(/\/$/, '') ?? fallback
}
