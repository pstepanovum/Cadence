import { mkdir, readFile, rm } from 'fs/promises'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

// Release builds never change the version. They check that the tag being
// built (CADENCE_RELEASE_TAG, e.g. desktop-v0.1.27) names the version already
// committed in desktop/package.json, so a tag and its installers cannot
// disagree. Without a tag (a local or dry-run build) the check is skipped.
const __dirname = dirname(fileURLToPath(import.meta.url))
const desktopRoot = join(__dirname, '..')
const packagesDir = join(desktopRoot, 'packages')

const { version } = JSON.parse(await readFile(join(desktopRoot, 'package.json'), 'utf8'))
const tag = String(process.env.CADENCE_RELEASE_TAG ?? '').trim()

if (tag) {
  const expected = `desktop-v${version}`
  if (tag !== expected) {
    console.error(
      `[desktop release] tag ${tag} does not match desktop/package.json (${expected}). ` +
        'Bump with scripts/release/bump.mjs and tag the bump commit.',
    )
    process.exit(1)
  }
  console.log(`[desktop release] building ${tag}`)
} else {
  console.log(`[desktop release] no tag given; building ${version} without publishing`)
}

await rm(packagesDir, { recursive: true, force: true })
await mkdir(packagesDir, { recursive: true })
