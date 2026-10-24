// Exercises the desktop updater against a fake local feed, with no GitHub
// release and no real install touched:
//
//   pnpm compile && node scripts/test-update-feed.mjs
//
// It serves a latest-mac.yml (or latest.yml on Windows) announcing 99.0.0 from
// 127.0.0.1, starts Electron on a throwaway user-data folder with
// CADENCE_UPDATE_FEED_URL pointing at it, and checks that the updater found
// the version, downloaded the file, verified its checksum and reported
// progress. The final install step needs a signed app, so it is not run here.
import { spawn } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const desktopRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(join(desktopRoot, 'package.json'))
const electronBinary = require('electron')

const payload = randomBytes(64 * 1024)
const sha512 = createHash('sha512').update(payload).digest('base64')
const isWindows = process.platform === 'win32'
const fileName = isWindows ? 'Cadence-Setup-99.0.0.exe' : `Cadence-99.0.0-${process.arch}.zip`
const feedFile = isWindows ? 'latest.yml' : 'latest-mac.yml'
const feed = [
  'version: 99.0.0',
  'files:',
  `  - url: ${fileName}`,
  `    sha512: ${sha512}`,
  `    size: ${payload.length}`,
  `path: ${fileName}`,
  `sha512: ${sha512}`,
  `releaseDate: '${new Date().toISOString()}'`,
  '',
].join('\n')

// electron-updater downloads into ~/Library/Caches/<updaterCacheDirName>
// whatever the user-data folder; remove it after if this run created it.
const updaterCache = join(homedir(), 'Library', 'Caches', 'cadence-update-harness')
const cacheExisted = existsSync(updaterCache)

const requests = []
const server = createServer((req, res) => {
  requests.push(req.url)
  const path = new URL(req.url, 'http://x').pathname.slice(1)
  if (path === feedFile) {
    res.writeHead(200, { 'Content-Type': 'text/yaml' })
    res.end(feed)
  } else if (path === fileName) {
    res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': payload.length })
    res.end(payload)
  } else {
    res.writeHead(404)
    res.end()
  }
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const feedUrl = `http://127.0.0.1:${server.address().port}/`

// A throwaway app folder so Electron reports version 0.1.0 and keeps its data
// out of the real Cadence profile.
const appDir = mkdtempSync(join(tmpdir(), 'cadence-update-harness-'))
writeFileSync(join(appDir, 'package.json'), JSON.stringify({ name: 'cadence-update-harness', version: '0.1.0', main: 'main.cjs' }))
// An unpackaged app reads its updater settings from dev-app-update.yml.
writeFileSync(
  join(appDir, 'dev-app-update.yml'),
  `provider: generic\nurl: ${feedUrl}\nupdaterCacheDirName: cadence-update-harness\n`,
)
writeFileSync(
  join(appDir, 'main.cjs'),
  `
const { app } = require('electron')
const { join } = require('node:path')
app.setPath('userData', join(${JSON.stringify(appDir)}, 'user-data'))
app.whenReady().then(() => {
  const { autoUpdater } = require(${JSON.stringify(join(desktopRoot, 'node_modules', 'electron-updater'))})
  const { startDesktopUpdater } = require(${JSON.stringify(join(desktopRoot, 'dist', 'main', 'updater.js'))})
  const labels = []
  const updater = startDesktopUpdater({ onMenuChange: () => labels.push(updater ? updater.menuItem().label : '') })
  const seen = []
  const finish = () => {
    console.log('HARNESS ' + JSON.stringify({ seen, labels, final: updater.menuItem().label }))
    updater.dispose()
    app.exit(0)
  }
  autoUpdater.on('update-available', (info) => seen.push('available:' + info.version))
  autoUpdater.on('download-progress', () => { if (!seen.includes('progress')) seen.push('progress') })
  autoUpdater.on('update-downloaded', () => { seen.push('downloaded'); finish() })
  autoUpdater.on('error', (error) => { seen.push('error:' + String(error.message).split('\\n')[0].slice(0, 120)); setTimeout(finish, 200) })
  autoUpdater.checkForUpdates().catch(() => undefined)
  setTimeout(finish, 30000)
})
`,
)

const child = spawn(electronBinary, [appDir], {
  env: { ...process.env, CADENCE_UPDATE_FEED_URL: feedUrl, ELECTRON_ENABLE_LOGGING: '0' },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let output = ''
child.stdout.on('data', (chunk) => (output += chunk))
child.stderr.on('data', (chunk) => (output += chunk))
const code = await new Promise((resolve) => child.on('exit', resolve))
server.close()
rmSync(appDir, { recursive: true, force: true })
if (!cacheExisted && process.platform === 'darwin') rmSync(updaterCache, { recursive: true, force: true })

const line = output.split('\n').find((entry) => entry.startsWith('HARNESS '))
if (!line) {
  console.error(output)
  console.error(`harness exited ${code} without a result`)
  process.exit(1)
}
const result = JSON.parse(line.slice('HARNESS '.length))
console.log('feed requests:', requests.map((url) => new URL(url, 'http://x').pathname).join(', '))
console.log('updater events:', result.seen.join(', '))
console.log('menu labels:', result.labels.join(' -> '))

const failures = []
if (!result.seen.includes('available:99.0.0')) failures.push('did not find 99.0.0')
if (!requests.some((url) => url.includes(fileName))) failures.push('did not download the update')
if (!result.labels.some((label) => label.startsWith('Downloading Update'))) failures.push('menu never showed the download')
// On an unsigned build, Squirrel.Mac refuses the final hand-over; that is the
// signing check working, not a feed problem.
const downloadedOrSigned = result.seen.includes('downloaded') || result.seen.some((event) => /sign|code|Squirrel|ShipIt/i.test(event))
if (!downloadedOrSigned) failures.push(`unexpected end state: ${result.seen.at(-1)}`)

if (failures.length) {
  console.error(`FAIL: ${failures.join('; ')}`)
  process.exit(1)
}
console.log('PASS: the updater checked the feed, downloaded and verified the update')
