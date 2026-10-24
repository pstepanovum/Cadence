#!/usr/bin/env node
// FILE: scripts/release/bump.mjs
//
// The one way versions change. See docs/RELEASING.md.
//
//   node scripts/release/bump.mjs desktop patch|minor|major|X.Y.Z [--minimum [X.Y.Z]]
//   node scripts/release/bump.mjs mobile  patch|minor|major|X.Y.Z   App Store submission
//   node scripts/release/bump.mjs mobile  build                     TestFlight: build number only
//   node scripts/release/bump.mjs mobile  live [--minimum-build N] [--app-store-url URL]
//   node scripts/release/bump.mjs web     patch|minor|major|X.Y.Z
//
// Options: --dry-run (print the plan, change nothing), --allow-empty (release
// with no changelog entries), --no-git (write files only), --date YYYY-MM-DD,
// --root DIR (repository root; defaults to this checkout).
//
// It refuses to run with uncommitted changes, writes the files, commits them,
// and tags desktop-vX.Y.Z / mobile-vX.Y.Z / web-vX.Y.Z. It never pushes.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PRODUCTS, planBump } from './lib.mjs'

function parseArgs(argv) {
  const positional = []
  const flags = {}
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (!arg.startsWith('--')) {
      positional.push(arg)
      continue
    }
    const name = arg.slice(2)
    const next = argv[i + 1]
    const takesValue = ['date', 'root', 'minimum-build', 'app-store-url'].includes(name)
    if (takesValue) {
      if (next === undefined) throw new Error(`--${name} needs a value`)
      flags[name] = next
      i += 1
    } else if (name === 'minimum' && next && /^\d+\.\d+\.\d+$/.test(next)) {
      flags.minimum = next
      i += 1
    } else {
      flags[name] = true
    }
  }
  return { positional, flags }
}

function usage(message) {
  console.error(`${message}\n\nUsage: node scripts/release/bump.mjs <${PRODUCTS.join('|')}> <patch|minor|major|X.Y.Z|build|live> [--dry-run]`)
  process.exit(2)
}

const { positional, flags } = parseArgs(process.argv.slice(2))
const [product, action] = positional
if (!PRODUCTS.includes(product)) usage(`Unknown product: ${product ?? '(none)'}`)
if (!action) usage('Missing the bump level')
if ((action === 'build' || action === 'live') && product !== 'mobile') {
  usage(`"${action}" applies to mobile only`)
}

const root = resolve(flags.root ?? join(dirname(fileURLToPath(import.meta.url)), '..', '..'))
const dryRun = Boolean(flags['dry-run'])
const useGit = !flags['no-git']
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
const read = (path) => readFileSync(join(root, path), 'utf8')

try {
  if (useGit && git('status', '--porcelain')) {
    const message = 'The working tree has uncommitted changes. Commit or stash them first.'
    if (!dryRun) throw new Error(message)
    console.warn(`warning: ${message}`)
  }

  const files = {
    changelog: read('CHANGELOG.md'),
    manifest: JSON.parse(read('release/manifest.json')),
    desktopPackage: JSON.parse(read('desktop/package.json')),
    rootPackage: JSON.parse(read('package.json')),
    appJson: JSON.parse(read('mobile/app.json')),
  }

  let minimumBuild
  if (flags['minimum-build'] !== undefined) {
    minimumBuild = Number(flags['minimum-build'])
    if (!Number.isInteger(minimumBuild) || minimumBuild < 1) throw new Error('--minimum-build must be a positive integer')
  }

  const plan = planBump({
    product,
    action,
    files,
    date: flags.date ?? new Date().toISOString().slice(0, 10),
    options: {
      minimum: flags.minimum,
      allowEmpty: Boolean(flags['allow-empty']),
      minimumBuild,
      appStoreUrl: flags['app-store-url'],
    },
  })

  if (useGit && plan.tag && git('tag', '--list', plan.tag)) {
    throw new Error(`Tag ${plan.tag} already exists.`)
  }

  console.log(`${dryRun ? '[dry run] ' : ''}${plan.message}`)
  for (const path of Object.keys(plan.writes)) console.log(`  write ${path}`)
  if (plan.tag) console.log(`  tag   ${plan.tag}`)
  if (dryRun) process.exit(0)

  for (const [path, content] of Object.entries(plan.writes)) {
    writeFileSync(join(root, path), content, 'utf8')
  }

  if (useGit) {
    git('add', '--', ...Object.keys(plan.writes))
    git('commit', '--quiet', '-m', plan.message)
    if (plan.tag) git('tag', '-a', plan.tag, '-m', plan.message)
    const branch = git('rev-parse', '--abbrev-ref', 'HEAD')
    console.log(`\nNext: git push origin ${branch}${plan.tag ? ` ${plan.tag}` : ''}`)
  }
} catch (error) {
  console.error(`bump: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}
