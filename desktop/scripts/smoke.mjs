#!/usr/bin/env node
// FILE: desktop/scripts/smoke.mjs
//
// Desktop launch smoke test (docs/PLATFORM.md, test matrix "Desktop"), with
// Playwright's Electron driver:
//
//   node desktop/scripts/smoke.mjs [--app <Cadence.app>] [--dmg <Cadence-X.Y.Z-arch.dmg>] [--profile <dir>] [--keep]
//
// It starts the packaged app from desktop/packages (build it first with
// `cd desktop && pnpm build:mac`), or with --dmg installs it from the DMG the
// way a person would (mount, copy Cadence.app out, unmount; into a temporary
// folder, never /Applications), on a throwaway user-data folder so the real
// Cadence profile is never touched, and checks that:
//
//   1. the window opens;
//   2. local mode reaches the dashboard without an account;
//   3. /pair renders a QR;
//   4. /api/health reports both engines ready within the setup timeout;
//   5. a lesson (a quiz round) works with every non-loopback request blocked.
//
// --keep leaves the throwaway profile (with its Python runtime) for a faster
// second run; it is several gigabytes. Exit code 1 on any failure.
import { _electron as electron } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const desktopRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const SETUP_TIMEOUT_MS = 20 * 60 * 1000 // src/setup/constants.ts INSTALL_TIMEOUT_MS
const PORT = Number(process.env.CADENCE_DESKTOP_PORT ?? 3140)
const args = process.argv.slice(2)
const keep = args.includes('--keep')
const appArg = args.includes('--app') ? args[args.indexOf('--app') + 1] : null
const profileArg = args.includes('--profile') ? args[args.indexOf('--profile') + 1] : null
const dmgArg = args.includes('--dmg') ? args[args.indexOf('--dmg') + 1] : null

/** Installs Cadence.app from a DMG into a temporary folder and returns its path. */
function installFromDmg(dmg) {
  const work = mkdtempSync(join(tmpdir(), 'cadence-dmg-install-'))
  const mountPoint = join(work, 'volume')
  const target = join(work, 'Applications')
  mkdirSync(mountPoint)
  mkdirSync(target)
  execFileSync('hdiutil', ['attach', dmg, '-nobrowse', '-readonly', '-noautoopen', '-mountpoint', mountPoint], { stdio: 'ignore' })
  try {
    if (!existsSync(join(mountPoint, 'Cadence.app'))) throw new Error('the DMG has no Cadence.app')
    if (!existsSync(join(mountPoint, 'Applications'))) throw new Error('the DMG has no Applications shortcut')
    execFileSync('ditto', [join(mountPoint, 'Cadence.app'), join(target, 'Cadence.app')])
  } finally {
    execFileSync('hdiutil', ['detach', mountPoint, '-quiet'])
  }
  console.log(`installed from ${dmg} into ${target}`)
  return { app: join(target, 'Cadence.app'), work }
}
const installed = dmgArg ? installFromDmg(dmgArg) : null

function packagedBinary() {
  const candidates = installed
    ? [installed.app]
    : appArg
    ? [appArg]
    : [join(desktopRoot, 'packages', `mac-${process.arch}`, 'Cadence.app'), join(desktopRoot, 'packages', 'mac', 'Cadence.app')]
  for (const candidate of candidates) {
    const binary = candidate.endsWith('.app') ? join(candidate, 'Contents', 'MacOS', 'Cadence') : candidate
    if (existsSync(binary)) return binary
  }
  throw new Error(`No packaged app found (${candidates.join(', ')}). Run \`cd desktop && pnpm build:mac\` first.`)
}

const results = []
const started = Date.now()
const seconds = () => ((Date.now() - started) / 1000).toFixed(1)
function record(name, ok, detail) {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''} at ${seconds()} s`)
}

const isLoopback = (url) => {
  try {
    const { protocol, hostname } = new URL(url)
    if (protocol === 'data:' || protocol === 'devtools:' || protocol === 'blob:') return true
    return ['127.0.0.1', 'localhost', '[::1]', '::1'].includes(hostname)
  } catch {
    return true
  }
}

const profile = profileArg ?? mkdtempSync(join(tmpdir(), 'cadence-desktop-smoke-'))
mkdirSync(profile, { recursive: true })
// Updates stay off: this run must never reach GitHub.
writeFileSync(join(profile, 'update-preferences.json'), JSON.stringify({ autoCheck: false }))

const binary = packagedBinary()
console.log(`app: ${binary}\nprofile: ${profile}\nport: ${PORT}`)
const app = await electron.launch({
  executablePath: binary,
  args: [`--user-data-dir=${profile}`],
  env: { ...process.env, CADENCE_DESKTOP_PORT: String(PORT) },
  timeout: 120_000,
})
const consoleErrors = []

try {
  // 1. The window opens.
  const window = await app.firstWindow({ timeout: 120_000 })
  window.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(`${window.url()}: ${m.text()}`)
  })
  window.on('response', (r) => {
    if (r.status() >= 400) consoleErrors.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`)
  })
  await window.waitForLoadState('domcontentloaded')
  record('window opens', true, await window.title())

  // 2. Local mode reaches the dashboard without an account.
  const origin = await (async () => {
    const deadline = Date.now() + 120_000
    while (Date.now() < deadline) {
      const url = window.url()
      if (/^http:\/\/(127\.0\.0\.1|localhost):\d+\//.test(url)) return new URL(url).origin
      await window.waitForTimeout(500)
    }
    throw new Error(`the app never loaded its local server (last URL ${window.url()})`)
  })()
  if (new URL(window.url()).pathname.startsWith('/setup')) {
    await window.getByRole('button', { name: 'Continue locally' }).click()
  }
  // First run installs the native runtime before the dashboard opens.
  await window.waitForURL(/\/(dashboard|desktop\/setup)/, { timeout: 120_000 })
  const firstStop = new URL(window.url()).pathname
  console.log(`after choosing local mode: ${firstStop}`)
  if (firstStop.startsWith('/desktop/setup')) {
    const start = window.getByRole('button', { name: /^(Start setup|Retry setup)/ })
    if (await start.waitFor({ timeout: 15_000 }).then(() => true, () => false)) await start.click()
  }

  // 4. Both engines ready within the setup timeout (the setup screen drives the install).
  const healthStart = Date.now()
  let health = null
  while (Date.now() - healthStart < SETUP_TIMEOUT_MS) {
    health = await window
      .evaluate(async () => {
        const response = await fetch('/api/health', { cache: 'no-store' })
        return { status: response.status, body: await response.json().catch(() => null) }
      })
      .catch(() => null)
    const engines = health?.body
    const ready = engines && engineReady(engines, 'ai') && engineReady(engines, 'coach')
    if (ready) break
    const retry = window.getByRole('button', { name: 'Retry setup' })
    if (await retry.isVisible().catch(() => false)) {
      const message = await window.locator('.bg-blushed-brick').first().textContent().catch(() => '')
      console.log(`setup failed: ${message?.trim()}`)
      break
    }
    if ((Date.now() - healthStart) % 60_000 < 5_000) console.log(`waiting for engines: ${JSON.stringify(health?.body ?? null).slice(0, 300)}`)
    await window.waitForTimeout(5_000)
  }
  const engines = health?.body
  const enginesReady = Boolean(engines && engineReady(engines, 'ai') && engineReady(engines, 'coach'))
  record('/api/health reports both engines ready', enginesReady, `${((Date.now() - healthStart) / 1000).toFixed(0)} s, ${JSON.stringify(engines).slice(0, 200)}`)

  await window.goto(`${origin}/dashboard`)
  await window.waitForLoadState('domcontentloaded')
  const onDashboard = new URL(window.url()).pathname === '/dashboard'
  const heading = onDashboard ? await window.getByRole('heading', { level: 1 }).first().textContent({ timeout: 30_000 }).catch(() => null) : null
  record('local mode reaches the dashboard without an account', onDashboard && Boolean(heading), `${window.url()} "${heading?.trim() ?? ''}"`)

  // 3. /pair renders a QR. The app opens it with the owner key from its data
  // folder (Phone > Connect a Phone); read the same key, never print it.
  const { adminToken } = JSON.parse(readFileSync(join(profile, 'cadence-data', 'desktop-pairing.json'), 'utf8'))
  await window.goto(`${origin}/pair?k=${encodeURIComponent(adminToken)}`)
  const qr = window.locator('[role="img"][aria-label="Pairing QR code"] svg').first()
  const qrVisible = await qr.waitFor({ state: 'visible', timeout: 30_000 }).then(() => true, () => false)
  record('/pair renders a QR', qrVisible, new URL(window.url()).pathname)

  // 5. A lesson works offline: everything but the app's own server is blocked.
  const blocked = []
  await window.context().route('**/*', (route) => {
    const url = route.request().url()
    if (isLoopback(url)) return route.continue()
    blocked.push(url)
    return route.abort('internetdisconnected')
  })
  await window.goto(`${origin}/practice/quiz?level=B1`)
  let lessonOk = false
  let lessonDetail = ''
  try {
    for (let step = 0; step < 30; step++) {
      if (await window.getByText('Round done').isVisible()) break
      const results = window.getByRole('button', { name: 'See results' })
      if (await results.isVisible()) {
        await results.click()
        continue
      }
      const card = window.locator('article').first()
      await card.waitFor({ timeout: 15_000 })
      const radios = card.getByRole('radio')
      if ((await radios.count()) > 0) await radios.first().check({ force: true })
      else for (const box of await card.getByRole('textbox').all()) await box.fill('test')
      await card.getByRole('button', { name: 'Check' }).click()
      await window.getByRole('button', { name: /^(Next|See results)$/ }).click()
    }
    lessonOk = await window.getByText('Round done').isVisible()
    lessonDetail = `${blocked.length} outside requests blocked`
  } catch (error) {
    lessonDetail = String(error).split('\n')[0]
  }
  record('a lesson works offline', lessonOk, lessonDetail)
  await window.screenshot({ path: join(desktopRoot, '..', 'build', 'test-screenshots', 'desktop', 'lesson-offline.png') }).catch(() => undefined)
} catch (error) {
  record('smoke run', false, String(error).split('\n')[0])
} finally {
  await app.close().catch(() => undefined)
  if (!keep && !profileArg) rmSync(profile, { recursive: true, force: true })
  if (installed) rmSync(installed.work, { recursive: true, force: true })
}

function engineReady(body, which) {
  // /api/health: { aiEngine: {...}, coachEngine: {...} } or flat flags.
  const entry = body?.engines?.[which]
  if (entry && typeof entry === 'object') return entry.ready === true || entry.status === 'ok' || entry.ok === true
  return body?.[`${which}Ready`] === true
}

if (consoleErrors.length) console.log(`console errors:\n  ${consoleErrors.join('\n  ')}`)
const failed = results.filter((r) => !r.ok)
console.log(`${results.length - failed.length}/${results.length} passed in ${seconds()} s`)
process.exit(failed.length ? 1 : 0)
