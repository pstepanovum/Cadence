import { readFile, readdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const desktopRoot = join(__dirname, '..')

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit', ...opts })
    child.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${cmd} ${args.join(' ')} exited with code ${code}`))
    })
    child.on('error', reject)
  })
}

function runCapture(cmd, args) {
  return new Promise((resolve, reject) => {
    let out = ''
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'inherit'] })
    child.stdout.on('data', (d) => (out += d))
    child.on('exit', (code) => {
      if (code === 0) resolve(out.trim())
      else reject(new Error(`${cmd} ${args.join(' ')} exited with code ${code}`))
    })
    child.on('error', reject)
  })
}

async function main() {
  const packageJson = JSON.parse(await readFile(join(desktopRoot, 'package.json'), 'utf8'))
  const version = packageJson.version

  // Determine tag: prefer explicit env var, fall back to package version
  const rawTag = process.env.CADENCE_RELEASE_TAG?.trim()
  const tag = rawTag || `desktop-v${version}`

  console.log(`[github release] publishing tag: ${tag}  version: ${version}`)

  // Collect DMG artifacts
  const packagesDir = join(desktopRoot, 'packages')
  const allFiles = await readdir(packagesDir)
  const artifacts = allFiles
    .filter((f) => f.endsWith('.dmg'))
    .map((f) => join(packagesDir, f))

  if (artifacts.length === 0) {
    throw new Error(`No .dmg files found in ${packagesDir}`)
  }

  console.log(`[github release] artifacts:\n  ${artifacts.join('\n  ')}`)

  // Check if release already exists
  let releaseExists = false
  try {
    await runCapture('gh', ['release', 'view', tag])
    releaseExists = true
    console.log(`[github release] release ${tag} already exists, uploading assets to it.`)
  } catch {
    // release doesn't exist yet
  }

  if (!releaseExists) {
    console.log(`[github release] creating release ${tag} …`)
    await run('gh', [
      'release', 'create', tag,
      '--title', `Cadence ${tag}`,
      '--notes', `Cadence desktop release ${tag}`,
      '--draft',
      ...artifacts,
    ])
    console.log(`[github release] release created (draft) and artifacts uploaded.`)
  } else {
    // Upload assets to existing release (overwrite if present)
    await run('gh', [
      'release', 'upload', tag,
      '--clobber',
      ...artifacts,
    ])
    console.log(`[github release] artifacts uploaded to existing release.`)
  }
}

main().catch((err) => {
  console.error(`[github release] ${err instanceof Error ? err.message : String(err)}`)
  process.exitCode = 1
})
