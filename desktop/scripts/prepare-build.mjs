import { mkdir, rm } from 'fs/promises'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

// Clears old installers before a build. The version is not touched here:
// desktop/package.json is the single source of truth and only
// scripts/release/bump.mjs changes it.
const __dirname = dirname(fileURLToPath(import.meta.url))
const packagesDir = join(__dirname, '..', 'packages')

await rm(packagesDir, { recursive: true, force: true })
await mkdir(packagesDir, { recursive: true })
console.log(`[desktop build] cleared ${packagesDir}`)
