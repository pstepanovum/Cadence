import { spawn } from 'node:child_process'

const rawArgs = process.argv.slice(2)
const shouldSign =
  rawArgs.includes('--signed') || process.env.CADENCE_DESKTOP_SIGN === '1'
const args = rawArgs.filter((arg) => arg !== '--signed')

const env = {
  ...process.env,
}

if (!shouldSign) {
  env.CSC_IDENTITY_AUTO_DISCOVERY = 'false'
  delete env.CSC_LINK
  delete env.CSC_KEY_PASSWORD
  delete env.CSC_NAME
  delete env.APPLE_ID
  delete env.APPLE_APP_SPECIFIC_PASSWORD
  delete env.APPLE_TEAM_ID
  delete env.APPLE_API_KEY
  delete env.APPLE_API_KEY_ID
  delete env.APPLE_API_ISSUER
  console.log(
    '[desktop build] local unsigned packaging enabled; skipping mac signing and notarization.',
  )
} else {
  console.log('[desktop build] signed packaging enabled.')
}

const child = spawn(
  process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
  ['exec', 'electron-builder', ...args],
  {
    cwd: process.cwd(),
    env,
    stdio: 'inherit',
  },
)

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }

  process.exit(code ?? 1)
})

