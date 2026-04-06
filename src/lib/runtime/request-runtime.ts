import { headers } from 'next/headers'

export type AppRuntime = 'desktop' | 'web'

export const CADENCE_DESKTOP_UA_TOKEN = 'CadenceDesktop'

export async function getRequestRuntime(): Promise<AppRuntime> {
  const userAgent = (await headers()).get('user-agent') ?? ''
  return userAgent.includes(CADENCE_DESKTOP_UA_TOKEN) ? 'desktop' : 'web'
}
