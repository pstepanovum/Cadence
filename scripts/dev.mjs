import { rm } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { fileURLToPath } from 'node:url'

const rootDir = fileURLToPath(new URL('..', import.meta.url))
const nextCli = fileURLToPath(new URL('../node_modules/next/dist/bin/next', import.meta.url))
const nextCacheDir = fileURLToPath(new URL('../.next', import.meta.url))

const rawArgs = process.argv.slice(2)
const shouldClear = rawArgs.includes('--clear')
const shouldDryRun = rawArgs.includes('--dry-run')
const forwardedArgs = rawArgs.filter((arg) => arg !== '--clear' && arg !== '--dry-run')
const hasExplicitPort = forwardedArgs.some((arg) =>
  arg === '--port' || arg === '-p' || arg.startsWith('--port='),
)
const targetPort = process.env.PORT ?? '3000'

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = createServer()

    server.once('error', (error) => {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'EADDRINUSE') {
        resolve(false)
        return
      }

      resolve(false)
    })

    server.once('listening', () => {
      server.close(() => resolve(true))
    })

    server.listen(Number(port), '127.0.0.1')
  })
}

if (shouldClear) {
  await rm(nextCacheDir, { recursive: true, force: true })
  console.log('Cleared Next cache at .next')
}

if (shouldDryRun) {
  const dryRunArgs = hasExplicitPort
    ? forwardedArgs
    : ['--port', targetPort, ...forwardedArgs]
  console.log(`Dry run: next dev ${dryRunArgs.join(' ')}`.trim())
  process.exit(0)
}

if (!hasExplicitPort && !(await isPortAvailable(targetPort))) {
  console.error(
    `Port ${targetPort} is already in use. Stop the existing server or run "pnpm dev --port <port>". Cadence Desktop expects the web app on port ${targetPort}.`,
  )
  process.exit(1)
}

const nextArgs = hasExplicitPort
  ? ['dev', ...forwardedArgs]
  : ['dev', '--port', targetPort, ...forwardedArgs]

const child = spawn(process.execPath, [nextCli, ...nextArgs], {
  cwd: rootDir,
  stdio: 'inherit',
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }

  process.exit(code ?? 0)
})
