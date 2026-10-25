# Content pipeline

Builds the static content packs (docs/PLATFORM.md, section 3) from `content/`.
Run by hand, never at request time. Needs Node 22.6 or newer, `bzcat`, and
for the Gemini steps `GEMINI_API_KEY` (or `~/.config/pstepanov/gemini.env`).
Downloads and API responses are cached in `scripts/content/.cache/`
(gitignored); results are committed under `content/` and `public/packs/`.

| Step | Command | Writes |
| --- | --- | --- |
| Tatoeba word counts | `node scripts/content/tatoeba.mjs freq` | `.cache/tatoeba/word-freq.json` |
| Vocabulary | `node scripts/content/vocab.mjs` | `content/vocab/<level>.json` |
| Tatoeba sentences | `node scripts/content/tatoeba.mjs sentences` | `content/sentences/<level>.json` |
| Grammar drafts | `node scripts/content/generate.mjs [--level B1] [--only slug]` | `content/grammar/<level>/<slug>.json` |
| Blind check | `node scripts/content/check.mjs [--level B1] [--only slug]` | `check` in each grammar file |
| Placement bank | `node scripts/content/placement.mjs [--level C1] [--type error]` | `content/placement/<level>.json` (drafts, blind check and level check) |
| Tatoeba grammar examples | `node scripts/content/examples.mjs` | `tatoebaExamples` in each grammar file |
| Mouth-map targets | `node scripts/content/fit-articulation.mjs` | `content/articulation/*.json` |
| Phrase bank | `node scripts/content/phrases.mjs [--level C1] [--only meetings] [--round 2]` | `content/phrases/<level>/<situation>.json` (drafts and the blind check; later rounds grow the bank) |
| Slang | `node scripts/content/slang.mjs [--only reactions]` | `content/slang/<category>.json` (drafts, blind check, recency and appropriateness review) |
| Plateau track | `node scripts/content/fossilization.mjs [--only th-sounds [--salt 2]]` | `content/fossilization/<error>.json` (contrasts, drills, probes, pairs, stress; blind-checked) |
| Validate | `node scripts/content/validate.mjs`, `node scripts/content/validate-articulation.mjs` | nothing; exits 1 on any problem |
| Build packs | `node scripts/content/build.mjs` (`--check` to verify) | `public/packs/` |
| Audio (owner, paid) | `node scripts/content/audio.mjs [--run]` | `.cache/audio/`, then rebuild |

Every Gemini call is temperature 0 with a fixed seed and a JSON schema, and is
cached by prompt, so reruns are free and repeatable. Phrases, slang and plateau
material are checked the same way (docs/PLATFORM.md sections 17 and 18). Only exercises that pass
the blind check (`pass`, or `fixed` when a second correct answer was added)
reach a pack. Placement items also need a level check: a second model rates
each item's CEFR level, and one rated more than a level away from its band is
dropped. Sources and licences are in `CREDITS.md`.
