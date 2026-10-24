#!/usr/bin/env node
// FILE: desktop/scripts/test-update-install.mjs
//
// The whole macOS update, end to end, against a local fake feed: offered,
// downloaded, and applied when the app restarts.
//
//   CADENCE_TEST_SIGN_IDENTITY="Apple Development: …" node desktop/scripts/test-update-install.mjs [--keep]
//
// Squirrel.Mac only installs an update whose signature satisfies the running
// app's designated requirement, so an unsigned build can never apply one.
// This script signs two local copies of the packaged app (build it first
// with `cd desktop && pnpm build:mac`) with a code-signing identity from your
// keychain: the "installed" 0.x copy, and a 99.0.0 copy served as the update.
// A development identity is enough; nothing is notarized, uploaded or kept.
//
// Everything happens in a temporary folder (never /Applications) with a
// throwaway user-data folder, and the feed only ever listens on 127.0.0.1:
//
//   1. start the installed copy with CADENCE_UPDATE_FEED_URL set; it checks
//      15 s after launch, downloads 99.0.0 and shows "Update ready";
//   2. quit it: the update installs on quit (the same Squirrel hand-over as
//      the Restart button, without the automatic relaunch, which would open
//      the app on the real profile);
//   3. start it again and check it now reports 99.0.0.
import { _electron as electron } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

if (process.platform !== 'darwin') {
  console.error('This test is for macOS. Windows updates are covered by `pnpm test:update-feed`.')
  process.exit(2)
}
const identity = process.env.CADENCE_TEST_SIGN_IDENTITY?.trim()
if (!identity) {
  console.error('Set CADENCE_TEST_SIGN_IDENTITY to a code-signing identity (see `security find-identity -v -p codesigning`).')
  process.exit(2)
}

const desktopRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const keep = process.argv.includes('--keep')
const NEW_VERSION = '99.0.0'
const source = join(desktopRoot, 'packages', process.arch === 'arm64' ? 'mac-arm64' : 'mac', 'Cadence.app')
if (!existsSync(source)) {
  console.error(`No packaged app at ${source}. Run \`cd desktop && pnpm build:mac\` first.`)
  process.exit(2)
}

const pnpmStore = join(desktopRoot, 'node_modules', '.pnpm')
const asarDir = readdirSync(pnpmStore).find((name) => name.startsWith('@electron+asar@'))
const asar = createRequire(join(desktopRoot, 'package.json'))(join(pnpmStore, asarDir, 'node_modules', '@electron', 'asar'))

const work = mkdtempSync(join(tmpdir(), 'cadence-update-install-'))
const installed = join(work, 'Applications', 'Cadence.app')
const update = join(work, 'update', 'Cadence.app')
const feedDir = join(work, 'feed')
const profile = join(work, 'profile')
for (const dir of [dirname(installed), dirname(update), feedDir, profile]) mkdirSync(dir, { recursive: true })

const started = Date.now()
const seconds = () => ((Date.now() - started) / 1000).toFixed(1)
const results = []
function record(name, ok, detail) {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''} at ${seconds()} s`)
}

const plist = (app, command) => execFileSync('/usr/libexec/PlistBuddy', ['-c', command, join(app, 'Contents', 'Info.plist')]).toString().trim()
const bundleVersion = (app) => plist(app, 'Print :CFBundleShortVersionString')

function sign(app) {
  execFileSync('codesign', [
    '--force', '--deep', '--options', 'runtime', '--timestamp=none',
    '--entitlements', join(desktopRoot, 'assets', 'entitlements.mac.plist'),
    '--sign', identity, app,
  ], { stdio: ['ignore', 'ignore', 'pipe'] })
  execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: ['ignore', 'ignore', 'pipe'] })
}

/** Turns a copy of the app into version `version`: Info.plist and the asar's package.json. */
function setVersion(app, version) {
  plist(app, `Set :CFBundleShortVersionString ${version}`)
  plist(app, `Set :CFBundleVersion ${version}`)
  const archive = join(app, 'Contents', 'Resources', 'app.asar')
  const unpacked = join(work, 'asar')
  asar.extractAll(archive, unpacked)
  const pkgPath = join(unpacked, 'package.json')
  writeFileSync(pkgPath, JSON.stringify({ ...JSON.parse(readFileSync(pkgPath, 'utf8')), version }, null, 2))
  rmSync(archive)
  return asar.createPackage(unpacked, archive).then(() => {
    const { headerString } = asar.getRawHeader(archive)
    plist(app, `Set :ElectronAsarIntegrity:Resources/app.asar:hash ${createHash('sha256').update(headerString).digest('hex')}`)
    rmSync(unpacked, { recursive: true, force: true })
  })
}

// electron-updater and Squirrel keep their downloads in ~/Library/Caches
// whatever the user-data folder; remove the ones this run creates.
const caches = ['cadence-desktop-updater', 'com.cadence.app', 'com.cadence.app.ShipIt']
  .map((name) => join(homedir(), 'Library', 'Caches', name))
  .filter((path) => !existsSync(path))

let server = null
let electronApp = null
try {
  // The installed copy and the update, both signed by the same identity.
  execFileSync('ditto', [source, installed])
  sign(installed)
  const fromVersion = bundleVersion(installed)
  execFileSync('ditto', [source, update])
  await setVersion(update, NEW_VERSION)
  sign(update)
  const zipName = `Cadence-${NEW_VERSION}-${process.arch}.zip`
  const zipPath = join(feedDir, zipName)
  execFileSync('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', update, zipPath])
  const zipSize = statSync(zipPath).size
  const sha512 = createHash('sha512').update(readFileSync(zipPath)).digest('base64')
  writeFileSync(
    join(feedDir, 'latest-mac.yml'),
    [`version: ${NEW_VERSION}`, 'files:', `  - url: ${zipName}`, `    sha512: ${sha512}`, `    size: ${zipSize}`, `path: ${zipName}`, `sha512: ${sha512}`, `releaseDate: '${new Date().toISOString()}'`, ''].join('\n'),
  )
  console.log(`installed ${fromVersion}, update ${NEW_VERSION} (${(zipSize / 1e6).toFixed(0)} MB zip), signed by "${identity}", at ${seconds()} s`)

  // The fake feed, loopback only.
  const requests = []
  server = createServer((req, res) => {
    const name = new URL(req.url ?? '/', 'http://x').pathname.slice(1)
    requests.push(name)
    const file = join(feedDir, name)
    if (!name || name.includes('/') || !existsSync(file)) {
      res.writeHead(404)
      return res.end()
    }
    res.writeHead(200, { 'Content-Length': statSync(file).size, 'Content-Type': name.endsWith('.yml') ? 'text/yaml' : 'application/zip' })
    createReadStream(file).pipe(res)
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const feedUrl = `http://127.0.0.1:${server.address().port}/`

  const launch = () =>
    electron.launch({
      executablePath: join(installed, 'Contents', 'MacOS', 'Cadence'),
      args: [`--user-data-dir=${profile}`],
      env: { ...process.env, CADENCE_UPDATE_FEED_URL: feedUrl, CADENCE_DESKTOP_PORT: '3150' },
      timeout: 120_000,
    })

  // 1. Offered and downloaded.
  electronApp = await launch()
  const window = await electronApp.firstWindow()
  const before = await electronApp.evaluate(({ app }) => app.getVersion())
  const notice = window.locator('#cadence-update-notice')
  const ready = await notice
    .filter({ hasText: 'Update ready' })
    .waitFor({ timeout: 180_000 })
    .then(() => true, () => false)
  record('update offered', requests.includes('latest-mac.yml'), `feed requests: ${[...new Set(requests)].join(', ')}`)
  record('update downloaded and staged', ready && requests.includes(zipName), ready ? `"${(await notice.textContent())?.trim()}"` : 'no "Update ready" notice')
  const restartButton = ready && (await notice.getByRole('button', { name: 'Restart' }).isVisible())
  record('Restart button shown', restartButton)

  // 2. Quit the normal way (Playwright's close() kills the process, which
  // skips the termination hook where Squirrel hands the update to ShipIt).
  const exited = new Promise((resolve) => electronApp.process().once('exit', resolve))
  await electronApp.evaluate(({ app }) => setTimeout(() => app.quit(), 100))
  await exited
  electronApp = null
  const deadline = Date.now() + 180_000
  while (Date.now() < deadline && bundleVersion(installed) !== NEW_VERSION) await new Promise((r) => setTimeout(r, 1000))
  const onDisk = bundleVersion(installed)
  record('update applied on quit', onDisk === NEW_VERSION, `${before} -> ${onDisk} on disk`)

  // 3. Restart: the app that opens is the new version, still signed.
  let after = null
  if (onDisk === NEW_VERSION) {
    execFileSync('codesign', ['--verify', '--deep', '--strict', installed], { stdio: ['ignore', 'ignore', 'pipe'] })
    electronApp = await launch()
    await electronApp.firstWindow()
    after = await electronApp.evaluate(({ app }) => app.getVersion())
    const closed = new Promise((resolve) => electronApp.process().once('exit', resolve))
    await electronApp.evaluate(({ app }) => setTimeout(() => app.quit(), 100))
    await closed
    electronApp = null
  }
  record('restart runs the new version', after === NEW_VERSION, `app.getVersion() = ${after}`)
} catch (error) {
  record('update run', false, String(error?.stderr ?? error).split('\n')[0])
} finally {
  await electronApp?.close().catch(() => undefined)
  server?.close()
  if (keep) console.log(`kept ${work}`)
  else rmSync(work, { recursive: true, force: true })
  for (const path of caches) rmSync(path, { recursive: true, force: true })
}

const failed = results.filter((r) => !r.ok)
console.log(`${results.length - failed.length}/${results.length} passed in ${seconds()} s`)
process.exit(failed.length ? 1 : 0)
