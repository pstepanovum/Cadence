/**
 * db-cloud.mjs — run Cadence SQL against the Supabase project from `supabase link`.
 *
 * Usage:
 *   pnpm db:cloud                      — apply modules.sql + conversation.sql (no wipe)
 *   pnpm db:cloud --clear              — drop Cadence app tables only; do NOT re-seed
 *   pnpm db:cloud --clear-force        — drop all tables in public (see SQL); do NOT re-seed
 *   pnpm db:cloud --reset              — Cadence table wipe + re-seed
 *   pnpm db:cloud --reset --clear-force — wipe entire public + re-seed
 *
 * Shorthands: db:cloud:clear | db:cloud:clear-force | db:cloud:reset
 *
 * Auth users, Storage buckets, and non-public schemas are not removed.
 */

import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const rootDir = fileURLToPath(new URL('..', import.meta.url))
const args = process.argv.slice(2)

const reset = args.includes('--reset')
const clearForce = args.includes('--clear-force')
const clearOnly = args.includes('--clear')

if (clearForce && clearOnly) {
  console.error('db:cloud: use either --clear or --clear-force, not both.')
  process.exit(1)
}

if (clearOnly && reset) {
  console.error('db:cloud: use --reset alone (it already wipes) or --reset --clear-force; do not combine --clear with --reset.')
  process.exit(1)
}

function runSupabase(relPath) {
  const result = spawnSync(
    'npx',
    ['supabase', 'db', 'query', '-f', relPath, '--linked'],
    {
      cwd: rootDir,
      stdio: 'inherit',
      shell: false,
      env: process.env,
    },
  )
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

function runClear(force) {
  const rel = force ? 'supabase/cloud_clear_force.sql' : 'supabase/cloud_clear.sql'
  const label = force ? '--clear-force' : '--clear'
  console.log(
    `db:cloud ${label}: wiping linked database (${rel}).\n` +
      'Auth, Storage, and system schemas are not removed. No seed will run.\n',
  )
  runSupabase(rel)
  console.log(
    `db:cloud ${label} finished — re-run pnpm db:cloud or pnpm db:cloud:reset to restore schema + seed.\n`,
  )
}

if (clearForce && !reset) {
  runClear(true)
  process.exit(0)
}

if (clearOnly && !reset) {
  runClear(false)
  process.exit(0)
}

if (reset) {
  if (clearForce) {
    console.log('db:cloud --reset --clear-force: force-wiping public tables, then re-seeding.\n')
    runSupabase('supabase/cloud_clear_force.sql')
  } else {
    console.log('db:cloud --reset: dropping Cadence tables, then re-seeding.\n')
    runSupabase('supabase/cloud_clear.sql')
  }
}

runSupabase('supabase/modules.sql')
runSupabase('supabase/conversation.sql')

if (reset) {
  console.log('db:cloud --reset finished (wiped + modules + conversation).')
} else {
  console.log('db:cloud finished (modules + conversation).')
}
