// FILE: scripts/release/lib.mjs
//
// Pure helpers behind bump.mjs and notes.mjs: semantic versions, the
// CHANGELOG.md sections (Keep a Changelog, one Unreleased section per product)
// and release/manifest.json. No file or git access here, so tests/release/
// can exercise all of it.

export const PRODUCTS = ['desktop', 'mobile', 'web']
export const REPO_URL = 'https://github.com/pstepanovum/Cadence'

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/

export function parseSemver(version) {
  const match = SEMVER.exec(String(version ?? '').trim())
  if (!match) throw new Error(`Not a semantic version: ${version}`)
  return match.slice(1, 4).map(Number)
}

export function compareSemver(a, b) {
  const left = parseSemver(a)
  const right = parseSemver(b)
  for (let i = 0; i < 3; i += 1) {
    if (left[i] !== right[i]) return left[i] < right[i] ? -1 : 1
  }
  return 0
}

/** `level` is patch, minor, major or an explicit X.Y.Z above the current one. */
export function bumpSemver(current, level) {
  const [major, minor, patch] = parseSemver(current)
  let next
  if (level === 'major') next = `${major + 1}.0.0`
  else if (level === 'minor') next = `${major}.${minor + 1}.0`
  else if (level === 'patch') next = `${major}.${minor}.${patch + 1}`
  else {
    parseSemver(level)
    next = String(level).trim()
  }
  if (compareSemver(next, current) <= 0) {
    throw new Error(`${next} is not above the current version ${current}`)
  }
  return next
}

export function tagFor(product, version) {
  if (!PRODUCTS.includes(product)) throw new Error(`Unknown product: ${product}`)
  return `${product}-v${version}`
}

export function unreleasedHeading(product) {
  return `## [Unreleased: ${product}]`
}

/** Splits the changelog into the text before the first "## " and the sections. */
function splitSections(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const preamble = []
  const sections = []
  const links = []
  let current = null
  for (const line of lines) {
    if (line.startsWith('## ')) {
      current = { heading: line.trimEnd(), body: [] }
      sections.push(current)
    } else if (line.startsWith('[') && /^\[[^\]]+\]:\s/.test(line)) {
      // Link references stay at the bottom; collect them separately.
      links.push(line)
    } else if (current) {
      current.body.push(line)
    } else {
      preamble.push(line)
    }
  }
  return { preamble, sections, links }
}

function trimBlank(lines) {
  let start = 0
  let end = lines.length
  while (start < end && lines[start].trim() === '') start += 1
  while (end > start && lines[end - 1].trim() === '') end -= 1
  return lines.slice(start, end)
}

function joinSections({ preamble, sections, links }) {
  const out = [...trimBlank(preamble), '']
  for (const section of sections) {
    out.push(section.heading, '')
    const body = trimBlank(section.body)
    if (body.length) out.push(...body, '')
  }
  if (links.length) out.push(...links, '')
  return out.join('\n')
}

/**
 * Moves the product's Unreleased entries into a new `## [<tag>] - <date>`
 * section placed above the newest release, leaves the Unreleased heading
 * empty, and adds a link reference for the tag.
 */
export function releaseChangelog(text, { product, version, date, allowEmpty = false }) {
  const parsed = splitSections(text)
  const heading = unreleasedHeading(product)
  const unreleased = parsed.sections.find((section) => section.heading === heading)
  if (!unreleased) throw new Error(`CHANGELOG.md has no "${heading}" section`)

  const tag = tagFor(product, version)
  if (parsed.sections.some((section) => section.heading.startsWith(`## [${tag}]`))) {
    throw new Error(`CHANGELOG.md already has a section for ${tag}`)
  }

  let body = trimBlank(unreleased.body)
  if (!body.some((line) => /^\s*[-*] \S/.test(line))) {
    if (!allowEmpty) {
      throw new Error(`"${heading}" has no entries. Add them, or pass --allow-empty.`)
    }
    body = ['### Changed', '', '- Maintenance release.']
  }
  unreleased.body = []

  const firstRelease = parsed.sections.findIndex((section) => !section.heading.startsWith('## [Unreleased'))
  const at = firstRelease === -1 ? parsed.sections.length : firstRelease
  parsed.sections.splice(at, 0, { heading: `## [${tag}] - ${date}`, body })
  parsed.links.unshift(`[${tag}]: ${REPO_URL}/releases/tag/${tag}`)
  return joinSections(parsed)
}

/** The body of one released section, for the GitHub release notes. */
export function notesFor(text, tag) {
  const { sections } = splitSections(text)
  const section = sections.find((entry) => entry.heading.startsWith(`## [${tag}]`))
  if (!section) return null
  return trimBlank(section.body).join('\n')
}

export function validateManifest(manifest) {
  const errors = []
  const semverOk = (value) => typeof value === 'string' && SEMVER.test(value)
  if (!semverOk(manifest?.web)) errors.push('web must be a semantic version')

  const desktop = manifest?.desktop
  if (!semverOk(desktop?.latest)) errors.push('desktop.latest must be a semantic version')
  if (!semverOk(desktop?.minimum)) errors.push('desktop.minimum must be a semantic version')
  if (semverOk(desktop?.latest) && semverOk(desktop?.minimum) && compareSemver(desktop.minimum, desktop.latest) > 0) {
    errors.push('desktop.minimum must not be above desktop.latest')
  }
  if (typeof desktop?.url !== 'string' || !desktop.url.startsWith(`${REPO_URL}/releases/`)) {
    errors.push('desktop.url must be a release page of the Cadence repository')
  }

  const ios = manifest?.ios
  if (!semverOk(ios?.latest)) errors.push('ios.latest must be a semantic version')
  if (!Number.isInteger(ios?.minimumBuild) || ios.minimumBuild < 1) {
    errors.push('ios.minimumBuild must be a positive integer')
  }
  if (ios?.appStoreUrl !== null && !(typeof ios?.appStoreUrl === 'string' && ios.appStoreUrl.startsWith('https://apps.apple.com/'))) {
    errors.push('ios.appStoreUrl must be null or an https://apps.apple.com/ link')
  }
  return errors
}

export function desktopReleaseUrl(version) {
  return `${REPO_URL}/releases/tag/${tagFor('desktop', version)}`
}

/** Returns a new manifest with the changes applied, validated. */
export function updateManifest(manifest, changes) {
  const next = structuredClone(manifest)
  if (changes.web) next.web = changes.web
  if (changes.desktopLatest) {
    next.desktop.latest = changes.desktopLatest
    next.desktop.url = desktopReleaseUrl(changes.desktopLatest)
  }
  if (changes.desktopMinimum) next.desktop.minimum = changes.desktopMinimum
  if (changes.iosLatest) next.ios.latest = changes.iosLatest
  if (changes.iosMinimumBuild !== undefined) next.ios.minimumBuild = changes.iosMinimumBuild
  if (changes.appStoreUrl !== undefined) next.ios.appStoreUrl = changes.appStoreUrl

  const errors = validateManifest(next)
  if (errors.length) throw new Error(`release/manifest.json would be invalid: ${errors.join('; ')}`)
  return next
}

export function stringifyJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}

/**
 * The plan for one bump, decided from the current files. bump.mjs writes it;
 * tests check it without touching git.
 */
export function planBump({ product, action, files, date, options = {} }) {
  const writes = {}
  let tag = null
  let message
  let version

  if (product === 'mobile' && action === 'build') {
    const app = structuredClone(files.appJson)
    const build = Number.parseInt(app.expo.ios.buildNumber, 10) + 1
    app.expo.ios.buildNumber = String(build)
    writes['mobile/app.json'] = stringifyJson(app)
    message = `Bump the iOS build number to ${build} for TestFlight`
    return { writes, tag, message, version: app.expo.version, build }
  }

  if (product === 'mobile' && action === 'live') {
    // After Apple releases a version: the app's banner starts pointing at it.
    const manifest = updateManifest(files.manifest, {
      iosLatest: files.appJson.expo.version,
      iosMinimumBuild: options.minimumBuild,
      appStoreUrl: options.appStoreUrl,
    })
    writes['release/manifest.json'] = stringifyJson(manifest)
    message = `Mark iOS ${files.appJson.expo.version} as live on the App Store`
    return { writes, tag, message, version: files.appJson.expo.version }
  }

  const changes = {}
  if (product === 'desktop') {
    const pkg = structuredClone(files.desktopPackage)
    version = bumpSemver(pkg.version, action)
    pkg.version = version
    writes['desktop/package.json'] = stringifyJson(pkg)
    changes.desktopLatest = version
    if (options.minimum) changes.desktopMinimum = options.minimum === true ? version : options.minimum
  } else if (product === 'mobile') {
    // An App Store submission: new marketing version and a new build.
    const app = structuredClone(files.appJson)
    version = bumpSemver(app.expo.version, action)
    app.expo.version = version
    app.expo.ios.buildNumber = String(Number.parseInt(app.expo.ios.buildNumber, 10) + 1)
    writes['mobile/app.json'] = stringifyJson(app)
  } else if (product === 'web') {
    const pkg = structuredClone(files.rootPackage)
    version = bumpSemver(pkg.version, action)
    pkg.version = version
    writes['package.json'] = stringifyJson(pkg)
    changes.web = version
  } else {
    throw new Error(`Unknown product: ${product}`)
  }

  if (Object.keys(changes).length) {
    writes['release/manifest.json'] = stringifyJson(updateManifest(files.manifest, changes))
  }
  writes['CHANGELOG.md'] = releaseChangelog(files.changelog, {
    product,
    version,
    date,
    allowEmpty: options.allowEmpty,
  })
  tag = tagFor(product, version)
  message = `Release ${product} ${version}`
  return { writes, tag, message, version }
}
