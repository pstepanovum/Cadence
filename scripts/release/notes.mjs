#!/usr/bin/env node
// FILE: scripts/release/notes.mjs
//
// Prints the CHANGELOG.md section for one tag, for the GitHub release body.
//   node scripts/release/notes.mjs desktop-v0.1.27 [--allow-missing]
// Exits 1 when the tag has no section, unless --allow-missing (dry runs).
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { notesFor } from './lib.mjs'

const [tag] = process.argv.slice(2).filter((arg) => !arg.startsWith('--'))
const allowMissing = process.argv.includes('--allow-missing')
if (!tag) {
  console.error('Usage: node scripts/release/notes.mjs <tag>')
  process.exit(2)
}

const changelog = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'CHANGELOG.md'), 'utf8')
const notes = notesFor(changelog, tag)
if (notes === null) {
  if (!allowMissing) {
    console.error(`CHANGELOG.md has no section for ${tag}`)
    process.exit(1)
  }
  console.log(`Cadence ${tag}`)
} else {
  console.log(notes)
}
