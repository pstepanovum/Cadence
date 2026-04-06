import { rm } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const desktopDir = fileURLToPath(new URL('..', import.meta.url))
const tscCli = fileURLToPath(new URL('../node_modules/typescript/bin/tsc', import.meta.url))
const electronCli = fileURLToPath(new URL('../node_modules/electron/cli.js', import.meta.url))
const distDir = fileURLToPath(new URL('../dist', import.meta.url))

const rawArgs = process.argv.slice(2)
const shouldClear = rawArgs.includes('--clear')
const shouldDryRun = rawArgs.includes('--dry-run')
const forwardedArgs = rawArgs.filter((arg) => arg !== '--clear' && arg !== '--dry-run')

if (shouldClear) {
  await rm(distDir, { recursive: true, force: true })
  console.log('Cleared desktop cache at dist')
}

if (shouldDryRun) {
  console.log(`Dry run: tsc -p tsconfig.json && electron . ${forwardedArgs.join(' ')}`.trim())
  process.exit(0)
}

const compileExitCode = await new Promise((resolve, reject) => {
  const compile = spawn(process.execPath, [tscCli, '-p', 'tsconfig.json'], {
    cwd: desktopDir,
    stdio: 'inherit',
  })

  compile.on('error', reject)
  compile.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal)
      return
    }

    resolve(code ?? 0)
  })
})

if (compileExitCode !== 0) {
  process.exit(compileExitCode)
}

const electron = spawn(process.execPath, [electronCli, '.', ...forwardedArgs], {
  cwd: desktopDir,
  stdio: 'inherit',
})

electron.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }

  process.exit(code ?? 0)
})
