import * as http from 'http'
import { existsSync } from 'node:fs'
import { join } from 'path'
import { utilityProcess, type UtilityProcess } from 'electron'

export function waitForServer(
  appOrigin: string,
  retries = 40,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const attempt = (remaining: number) => {
      const req = http.get(appOrigin, (res) => {
        if (res.statusCode && res.statusCode < 500) {
          resolve()
        } else {
          retry(remaining)
        }
      })
      req.on('error', () => retry(remaining))
      req.end()
    }

    const retry = (remaining: number) => {
      if (remaining <= 0) {
        reject(
          new Error(
            'Cadence Desktop runtime failed to start within the expected time.',
          ),
        )
        return
      }
      setTimeout(() => attempt(remaining - 1), 500)
    }

    attempt(retries)
  })
}

export async function startNextServer({
  appOrigin,
  port,
  resourcesPath,
}: {
  appOrigin: string
  port: number
  resourcesPath: string
}): Promise<UtilityProcess> {
  return new Promise((resolve, reject) => {
    const serverScript = join(resourcesPath, 'next-server', 'server.js')
    const nextServerRoot = join(resourcesPath, 'next-server')
    const modulesSqlPath = join(nextServerRoot, 'supabase', 'modules.sql')
    const desktopRuntime = utilityProcess.fork(serverScript, [], {
      cwd: nextServerRoot,
      env: {
        ...process.env,
        PORT: String(port),
        HOSTNAME: '127.0.0.1',
        ...(existsSync(modulesSqlPath)
          ? { CADENCE_MODULES_SQL_PATH: modulesSqlPath }
          : {}),
        NODE_ENV: 'production',
        CADENCE_DESKTOP_AI_ENGINE_URL:
          process.env.CADENCE_DESKTOP_AI_ENGINE_URL ??
          `http://127.0.0.1:${process.env.CADENCE_DESKTOP_AI_ENGINE_PORT ?? '8010'}`,
        CADENCE_DESKTOP_COACH_ENGINE_URL:
          process.env.CADENCE_DESKTOP_COACH_ENGINE_URL ??
          `http://127.0.0.1:${process.env.CADENCE_DESKTOP_COACH_ENGINE_PORT ?? '8011'}`,
        NEXT_SHARP_PATH: join(resourcesPath, 'next-server', 'node_modules', 'sharp'),
      },
      stdio: 'pipe',
      serviceName: 'Cadence Desktop Runtime',
    })

    let settled = false
    const finishSuccess = () => {
      if (settled) {
        return
      }
      settled = true
      resolve(desktopRuntime)
    }

    const finishError = (error: Error) => {
      if (settled) {
        return
      }
      settled = true
      reject(error)
    }

    desktopRuntime.stdout?.on('data', (chunk) => {
      const message = chunk.toString()
      console.log('[cadence-runtime]', message)
      if (message.includes('Ready') || message.includes('started server')) {
        finishSuccess()
      }
    })

    desktopRuntime.stderr?.on('data', (chunk) => {
      console.error('[cadence-runtime:err]', chunk.toString())
    })

    desktopRuntime.on('error', (error) => {
      finishError(
        new Error(
          `Cadence desktop runtime failed: ${JSON.stringify(error)}`,
        ),
      )
    })
    desktopRuntime.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        finishError(
          new Error(`Cadence desktop runtime exited with code ${code}`),
        )
      }
    })

    waitForServer(appOrigin).then(finishSuccess).catch(finishError)
  })
}
