/**
 * dev-all.mjs — starts all Cadence services in parallel with hot-reload.
 *
 * Reload behaviour:
 *   • Next.js web app  — HMR handles it, Electron BrowserWindow never restarts
 *   • Python backends  — uvicorn --reload restarts only the Python worker
 *   • Electron main    — tsc -w recompiles on change, only Electron respawns
 *
 * Usage:
 *   pnpm dev:all            — start everything
 *   pnpm dev:all --clear    — clear all caches, then start
 *   Ctrl-C                  — graceful shutdown, no leftovers
 */

import { rm } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// ─── Paths ────────────────────────────────────────────────────────────────────

const rootDir    = fileURLToPath(new URL('..', import.meta.url))
const desktopDir = path.join(rootDir, 'desktop')
const aiDir      = path.join(rootDir, 'src', 'backend', 'ai-engine')
const coachDir   = path.join(rootDir, 'src', 'backend', 'coach-engine')

const nextCli      = path.join(rootDir, 'node_modules', 'next', 'dist', 'bin', 'next')
const nextCacheDir = path.join(rootDir, '.next')
const desktopDist  = path.join(desktopDir, 'dist')
const tscCli       = path.join(desktopDir, 'node_modules', 'typescript', 'bin', 'tsc')
const electronCli  = path.join(desktopDir, 'node_modules', 'electron', 'cli.js')

// ─── Args ─────────────────────────────────────────────────────────────────────

const rawArgs      = process.argv.slice(2)
const shouldClear  = rawArgs.includes('--clear')   // full wipe (includes models)
const shouldCache  = rawArgs.includes('--cache') || shouldClear  // cache-only clear
const targetPort   = process.env.PORT ?? '3000'
const python       = process.env.PYTHON ?? 'python3'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = createServer()
    server.once('error', () => resolve(false))
    server.once('listening', () => server.close(() => resolve(true)))
    server.listen(Number(port), '127.0.0.1')
  })
}

function prefixedSpawn(tag, color, cmd, args, opts) {
  // ANSI colors: 32 green, 33 yellow, 34 blue, 35 magenta, 36 cyan
  const prefix = `\x1b[${color}m[${tag}]\x1b[0m`

  const env = {
    ...process.env,
    // Disable Python's output buffering so logs stream line-by-line instead
    // of arriving in 8 KB chunks when stdout is a pipe (non-TTY).
    PYTHONUNBUFFERED: '1',
    // Tell Python not to write .pyc bytecode files (cleaner reloads).
    PYTHONDONTWRITEBYTECODE: '1',
    ...(opts?.env ?? {}),
  }

  const child = spawn(cmd, args, { ...opts, env, stdio: ['ignore', 'pipe', 'pipe'] })

  // Both stdout and stderr go to the same prefixed stream so interleaved log
  // lines (e.g. uvicorn access log on stdout, errors on stderr) stay in order.
  function printLines(stream, write) {
    let leftover = ''
    stream.on('data', (chunk) => {
      const text = leftover + chunk.toString()
      const lines = text.split('\n')
      leftover = lines.pop() // incomplete last line — wait for more data
      for (const line of lines) {
        if (line.length > 0) write(`${prefix} ${line}\n`)
      }
    })
    stream.on('end', () => {
      if (leftover.length > 0) write(`${prefix} ${leftover}\n`)
    })
  }

  printLines(child.stdout, (l) => process.stdout.write(l))
  printLines(child.stderr, (l) => process.stderr.write(l))

  return child
}

function log(msg) {
  process.stdout.write(`\x1b[33m[dev:all]\x1b[0m ${msg}\n`)
}

// ─── Clear caches ─────────────────────────────────────────────────────────────

if (shouldCache || shouldClear) {
  // ── Resolve platform paths ─────────────────────────────────────────────────
  const home = process.env.HOME ?? process.env.USERPROFILE ?? ''
  const electronUserData = process.platform === 'darwin'
    ? path.join(home, 'Library', 'Application Support', 'Cadence')
    : process.platform === 'win32'
      ? path.join(process.env.APPDATA ?? path.join(home, 'AppData', 'Roaming'), 'Cadence')
      : path.join(process.env.XDG_CONFIG_HOME ?? path.join(home, '.config'), 'Cadence')

  const desktopRuntime = path.join(electronUserData, 'desktop-runtime')

  if (shouldClear) {
    // ── Full wipe — removes everything including AI models and venvs ──────────
    log('Full wipe — clearing all app data, models, and caches…')
    await Promise.all([
      rm(nextCacheDir,     { recursive: true, force: true }).then(() => log('  ✓ .next cleared')),
      rm(desktopDist,      { recursive: true, force: true }).then(() => log('  ✓ desktop/dist cleared')),
      rm(electronUserData, { recursive: true, force: true }).then(() => log(`  ✓ ${electronUserData} cleared`)),
      // Additional macOS system cache locations Electron writes to
      ...(process.platform === 'darwin' ? [
        rm(path.join(home, 'Library', 'Caches', 'Cadence'),         { recursive: true, force: true }),
        rm(path.join(home, 'Library', 'Caches', 'com.cadence.app'), { recursive: true, force: true }),
        rm(path.join(home, 'Library', 'WebKit', 'com.cadence.app'), { recursive: true, force: true }),
      ] : []),
      rm(path.join(aiDir,    '__pycache__'), { recursive: true, force: true }),
      rm(path.join(coachDir, '__pycache__'), { recursive: true, force: true }),
    ])
  } else {
    // ── Cache-only clear — keeps models, venvs, and user state ───────────────
    log('Clearing caches (models and app data preserved)…')
    await Promise.all([
      // Build artifacts
      rm(nextCacheDir, { recursive: true, force: true }).then(() => log('  ✓ .next cleared')),
      rm(desktopDist,  { recursive: true, force: true }).then(() => log('  ✓ desktop/dist cleared')),
      // Python bytecode
      rm(path.join(aiDir,    '__pycache__'), { recursive: true, force: true }),
      rm(path.join(coachDir, '__pycache__'), { recursive: true, force: true }),
      // Electron browser-level caches (safe to nuke, rebuilt on next launch)
      rm(path.join(electronUserData, 'Cache'),              { recursive: true, force: true }),
      rm(path.join(electronUserData, 'Code Cache'),         { recursive: true, force: true }),
      rm(path.join(electronUserData, 'GPUCache'),           { recursive: true, force: true }),
      rm(path.join(electronUserData, 'DawnGraphiteCache'),  { recursive: true, force: true }),
      rm(path.join(electronUserData, 'DawnWebGPUCache'),    { recursive: true, force: true }),
      rm(path.join(electronUserData, 'blob_storage'),       { recursive: true, force: true }),
      // Desktop runtime cache and logs — keeps models/ and venvs/
      rm(path.join(desktopRuntime, 'cache'), { recursive: true, force: true }),
      rm(path.join(desktopRuntime, 'logs'),  { recursive: true, force: true }),
    ]).then(() => log('  ✓ Electron and runtime caches cleared'))
  }
}

// ─── Port check ───────────────────────────────────────────────────────────────

if (!(await isPortAvailable(targetPort))) {
  process.stderr.write(
    `\x1b[31m[dev:all]\x1b[0m Port ${targetPort} is already in use. Stop the existing server or set PORT=<port>.\n`,
  )
  process.exit(1)
}

// ─── Shutdown registry ────────────────────────────────────────────────────────

const allChildren = new Set()
let shuttingDown = false

function trackChild(child) {
  allChildren.add(child)
  child.on('exit', () => allChildren.delete(child))
  return child
}

function killAll(signal) {
  for (const child of allChildren) {
    if (!child.killed) child.kill(signal)
  }
}

function shutdown(signal) {
  if (shuttingDown) return
  shuttingDown = true
  log(`Received ${signal} — stopping all services…`)
  killAll(signal)
  const timer = setTimeout(() => { killAll('SIGKILL'); process.exit(1) }, 5000)
  timer.unref()
}

process.on('SIGINT',  () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

// ─── 1. Next.js web app (HMR built-in, Electron never restarts for this) ─────

log('Starting all services…\n')

trackChild(prefixedSpawn(
  'web-app  ', 32,
  process.execPath, [nextCli, 'dev', '--port', targetPort],
  { cwd: rootDir },
))

// ─── 2. AI engine — uvicorn --reload (file-watches src/backend/ai-engine/) ───

trackChild(prefixedSpawn(
  'ai-engine', 36,
  python, [
    '-m', 'uvicorn', 'main:app',
    '--host', '0.0.0.0',
    '--port', process.env.AI_ENGINE_PORT ?? '8000',
    '--reload',
    '--reload-dir', aiDir,
  ],
  { cwd: aiDir },
))

// ─── 3. Coach engine — uvicorn --reload (file-watches src/backend/coach-engine/) ─

trackChild(prefixedSpawn(
  'coach-eng', 35,
  python, [
    '-m', 'uvicorn', 'main:app',
    '--host', '0.0.0.0',
    '--port', process.env.COACH_ENGINE_PORT ?? '8001',
    '--reload',
    '--reload-dir', coachDir,
  ],
  { cwd: coachDir },
))

// ─── 4. Electron — tsc -w recompiles, Electron respawns; BrowserWindow stays ─

// Do an initial compile before launching Electron so the dist/ dir exists.
log('Compiling desktop TypeScript…')
await new Promise((resolve, reject) => {
  const compile = spawn(process.execPath, [tscCli, '-p', 'tsconfig.json'], {
    cwd: desktopDir,
    stdio: 'inherit',
  })
  compile.on('error', reject)
  compile.on('exit', (code) => {
    if (code === 0) resolve()
    else { process.stderr.write('\x1b[31m[dev:all]\x1b[0m Initial TypeScript compile failed.\n'); process.exit(code) }
  })
})

// Spawn Electron and return a function that kills + respawns it.
let electronProcess = null

function spawnElectron() {
  if (shuttingDown) return
  const child = prefixedSpawn(
    'desktop  ', 34,
    process.execPath, [electronCli, '.'],
    { cwd: desktopDir },
  )
  trackChild(child)
  electronProcess = child

  child.on('exit', (code, signal) => {
    electronProcess = null
    // If Electron exited on its own (user closed the window) and we're not
    // shutting down, restart it so the dev loop keeps running.
    if (!shuttingDown && signal !== 'SIGKILL') {
      log('Electron exited — restarting…')
      spawnElectron()
    }
  })

  return child
}

spawnElectron()

// Start tsc in watch mode. On each successful incremental compile, respawn
// Electron so the new main-process code is picked up. The BrowserWindow will
// reconnect to the already-running Next.js dev server on its own.
const tscWatch = prefixedSpawn(
  'tsc-watch', 33,
  process.execPath, [tscCli, '-p', 'tsconfig.json', '--watch', '--preserveWatchOutput'],
  { cwd: desktopDir },
)
trackChild(tscWatch)

// tsc -w prints "Found 0 errors. Watching for file changes." after each
// successful compile. Use that as the trigger to restart Electron.
let firstCompile = true   // skip the initial "ready" message we already handled
tscWatch.stdout.on('data', (d) => {
  if (d.toString().includes('Found 0 errors')) {
    if (firstCompile) { firstCompile = false; return }
    log('\x1b[33mDesktop TypeScript changed — restarting Electron…\x1b[0m')
    if (electronProcess && !electronProcess.killed) {
      electronProcess.kill('SIGTERM')
      // spawnElectron() is called automatically from the exit handler above
    } else {
      spawnElectron()
    }
  }
})
