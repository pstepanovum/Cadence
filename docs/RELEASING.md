# Releasing Cadence

How versions change, how each product ships, and how to undo a release.
Nothing here runs by itself: pushing a tag is the only thing that starts a
build, and only the desktop app builds in CI.

## Version policy

Every product uses [semantic versions](https://semver.org/) (`MAJOR.MINOR.PATCH`)
and has one place where its version lives:

| Product | Source of truth | Tag |
| --- | --- | --- |
| Desktop | `desktop/package.json` `version` | `desktop-vX.Y.Z` |
| iOS | `mobile/app.json` `expo.version` (marketing) and `expo.ios.buildNumber` | `mobile-vX.Y.Z` |
| Web | root `package.json` `version` | `web-vX.Y.Z` |

- Only `scripts/release/bump.mjs` changes these. Builds never do: a desktop
  build whose tag does not match `desktop/package.json` fails.
- The iOS marketing version changes only for an App Store submission.
  TestFlight builds change only the build number, which always goes up and is
  never reused.
- `release/manifest.json` is what `GET /api/version` serves. `bump.mjs`
  updates it.
- `CHANGELOG.md` follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
  with one `## [Unreleased: <product>]` section per product. Add entries there
  as you work; a release moves them into `## [<tag>] - <date>`, and the desktop
  release notes on GitHub are that section.

### bump.mjs

Run from the repository root on a clean tree (it refuses uncommitted changes,
except with `--dry-run`). It writes the files, commits them and tags. It never
pushes.

```bash
node scripts/release/bump.mjs desktop patch            # or minor, major, 0.2.0
node scripts/release/bump.mjs desktop minor --minimum  # also raise desktop.minimum to it
node scripts/release/bump.mjs mobile build             # TestFlight: build number only, no tag
node scripts/release/bump.mjs mobile patch             # App Store submission: version + build, tag
node scripts/release/bump.mjs mobile live --minimum-build 7 --app-store-url https://apps.apple.com/app/id…
node scripts/release/bump.mjs web patch
```

`--dry-run` prints the plan. `--allow-empty` releases with no changelog entries
("Maintenance release."); without it an empty section is refused.
`node scripts/release/notes.mjs <tag>` prints a section's notes.

Tests: `pnpm test` covers the version rules, the changelog rewrite, the plan for
every command, a real run in a temporary git repository, and that the
committed manifest agrees with the version sources.

## Desktop

### Release

1. Make sure `## [Unreleased: desktop]` in `CHANGELOG.md` says what changed.
2. `node scripts/release/bump.mjs desktop patch` (or `minor`, `major`).
3. `git push origin main desktop-vX.Y.Z`

The tag starts `.github/workflows/desktop-release.yml`:

| Job | Runner | Produces |
| --- | --- | --- |
| prepare | ubuntu | checks the tag matches `desktop/package.json`; notes from `CHANGELOG.md` |
| macos | macos-14 | `Cadence-X.Y.Z-arm64.dmg`, `Cadence-X.Y.Z-x64.dmg`, the two `.zip` files the updater downloads, blockmaps, `latest-mac.yml`; signed and notarized |
| windows | windows-latest | `Cadence-Setup-X.Y.Z.exe` (NSIS), `Cadence-X.Y.Z.msi`, blockmap, `latest.yml` |
| publish | ubuntu | creates the release as a draft, uploads the installers, then the `latest*.yml` files, then publishes it and marks it Latest |

The release only leaves draft once every file is up, so an installed app never
sees a half-uploaded release. If one platform fails, nothing is published.
Linux is not built: the bundled Python runtime covers macOS and Windows only.

Check the release page lists all of the files above, then install the DMG on a
Mac to confirm Gatekeeper opens it without a warning.

### Rebuild, dry run

Actions > Desktop Release > Run workflow:

- **tag** empty, **dry run** ticked (the default): builds the chosen branch on
  both platforms and keeps the files as workflow artifacts. Publishes nothing.
- **tag** `desktop-vX.Y.Z`, **dry run** unticked: rebuilds that tag and
  replaces the files on its release. Safe to repeat.

Locally, unsigned: `cd desktop && pnpm build:mac` (the run script sets
`CSC_IDENTITY_AUTO_DISCOVERY=false`). `pnpm build:win` needs Windows.

### Signing secrets

Repository secrets (Settings > Secrets and variables > Actions):

| Secret | For |
| --- | --- |
| `CSC_LINK`, `CSC_KEY_PASSWORD` | Developer ID Application certificate (.p12, base64) |
| `APPLE_API_KEY`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER` | notarization with an App Store Connect API key, or |
| `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` | notarization with an Apple ID |
| `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD` | optional Windows code-signing certificate |

A published release refuses to build without `CSC_LINK`, because macOS only
installs an update over a signed app. Windows signing is optional: without
`WIN_CSC_LINK` the installers are unsigned and Windows SmartScreen shows
"Windows protected your PC" until someone clicks More info > Run anyway. That
stays true until a certificate is added; nothing else changes.

### In-app updates

`desktop/src/main/updater.ts` (rules in `update-policy.ts`, tested in
`tests/desktop/`) uses electron-updater with the GitHub provider. It reads the
release GitHub marks Latest, so mobile and web tags never create GitHub
releases.

- It checks 15 seconds after launch, then every 6 hours, and after the computer
  wakes if a check is due.
- It downloads in the background and then shows a small "Update ready.
  Restart to install." card with Restart and a close button. On macOS the
  card waits until Squirrel.Mac has the update verified, so restarting or
  quitting from then on always installs it. It never restarts
  by itself; if the person quits instead, the update installs on quit.
- Cadence > Check for Updates… checks now and says when you are up to date. The
  same item becomes "Restart to Install Update" once one is ready. Cadence >
  Check for Updates Automatically turns the background checks off
  (`update-preferences.json` in the app's data folder).
- DMG installs update from the `.zip`; NSIS installs from `latest.yml`.
- MSI installs cannot update themselves. The app tells them apart by the NSIS
  uninstaller next to the executable; an MSI install shows "Cadence X.Y.Z is
  available." with a Download button that opens the release page.

To test against a fake feed with no release: `cd desktop && pnpm test:update-feed`.
It serves a `latest-mac.yml` announcing 99.0.0 from 127.0.0.1, runs Electron on
a throwaway profile with `CADENCE_UPDATE_FEED_URL` set, and checks that the
update is found, downloaded and verified. The override only accepts loopback
`http` addresses, so it cannot redirect a real install.

To see an update actually installed, after `cd desktop && pnpm build:mac`:
`CADENCE_TEST_SIGN_IDENTITY="Apple Development: …" node desktop/scripts/test-update-install.mjs`.
Squirrel.Mac only installs an update signed like the running app, so the
script signs two local copies of the built app with that identity (a
development one is enough; `security find-identity -v -p codesigning` lists
them): the installed version and a 99.0.0 copy it serves from 127.0.0.1. It
checks the update is offered, downloaded and shown as "Update ready", that
quitting installs it, and that the app opens as 99.0.0 afterwards. Everything
lives in a temporary folder with a throwaway profile and is deleted after.

### Roll back

Updates only go forward: electron-updater never installs a lower version than
the one running. To pull a bad release:

1. On GitHub, mark the bad release as a pre-release (or delete it). The
   previous release becomes Latest again, so no one else downloads the bad one.
2. Fix forward: revert the change on `main`, `bump.mjs desktop patch`, push the
   new tag. Everyone on the bad version updates to the fix.
3. If people must leave the bad version right away, raise
   `desktop.minimum` with the fix (`--minimum`) so the website and future
   clients can tell them to reinstall from the release page.

Never move or re-push an existing tag; always release a new version.

## iOS

### TestFlight

```bash
node scripts/release/bump.mjs mobile build   # or, in mobile/: npm run ios:bump
cd mobile
npm run ios:archive
npm run ios:upload
git push origin main
```

`npm run testflight` runs the same three steps; its bump commits too, so the
tree must be clean. The marketing version stays the same.

### App Store

1. Fill in `## [Unreleased: mobile]` in `CHANGELOG.md`.
2. `node scripts/release/bump.mjs mobile patch` (or `minor`). This raises
   `expo.version`, adds a build, commits and tags `mobile-vX.Y.Z`.
3. `cd mobile && npm run ios:archive && npm run ios:upload`, then
   `git push origin main mobile-vX.Y.Z`.
4. Submit that build for review in App Store Connect with the changelog text
   as "What's New". Never submit without the owner's say-so.
5. After Apple releases it: `node scripts/release/bump.mjs mobile live`
   (add `--minimum-build N` to force everyone below build N to update, and
   `--app-store-url` the first time), push, and deploy the web so
   `/api/version` serves it.

### Update banner (for the mobile app)

The app calls `GET https://cadence.pstepanov.dev/api/version` on launch and
when it returns to the foreground (at most once an hour):

```json
{
  "web": "0.1.0",
  "desktop": { "latest": "0.1.27", "minimum": "0.1.0", "url": "https://github.com/pstepanovum/Cadence/releases/tag/desktop-v0.1.27" },
  "ios": { "latest": "1.0.0", "minimumBuild": 1, "appStoreUrl": null }
}
```

- Installed build number (`CFBundleVersion`) below `ios.minimumBuild`: a
  blocking "Update Cadence to keep practising" screen with a button to
  `ios.appStoreUrl`.
- Otherwise, installed marketing version below `ios.latest` (compare as
  semantic versions): a soft, dismissible "Update available" banner.
- Otherwise nothing. A failed request, or `appStoreUrl` of `null`, shows
  nothing and never blocks; in own-server mode the app keeps working offline.

Only raise `minimumBuild` for a build that is live on the App Store, never for
a TestFlight-only build.

### Roll back

The App Store has no rollback. While a version is in phased release, pause it
in App Store Connect. Otherwise fix forward: `bump.mjs mobile patch`, upload,
and request an expedited review if it is urgent. Lower `ios.minimumBuild` back
(edit `release/manifest.json`, commit, deploy the web) if a forced update
pointed people at a bad build.

## Web

1. Fill in `## [Unreleased: web]`.
2. `node scripts/release/bump.mjs web patch`, then `git push origin main web-vX.Y.Z`.
3. Deploy that commit with the deploy scripts in `docs/PLATFORM.md`
   (the owner runs these; nothing in CI deploys).
4. Check `https://cadence.pstepanov.dev/api/version` shows the new `web`.

Deploy the web after a desktop or iOS release too, so `/api/version` reflects
the new manifest.

### Roll back

Route traffic back to the previous Cloud Run revision
(`gcloud run services update-traffic <service> --to-revisions <previous>=100`),
then fix forward with a new patch release. Firestore data is not rolled back,
so a release that migrates data needs its own reverse step written before it
ships.
