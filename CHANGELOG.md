# Changelog

Notable changes to Cadence, in the [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
format. Each product has its own Unreleased section and its own
[semantic versions](https://semver.org/): the desktop app is tagged
`desktop-vX.Y.Z`, the iOS app `mobile-vX.Y.Z` and the web app `web-vX.Y.Z`.
Add entries under the product's Unreleased heading (`### Added`, `### Changed`,
`### Fixed`, `### Removed`, `### Security`); `scripts/release/bump.mjs` moves
them into the release. See [docs/RELEASING.md](docs/RELEASING.md).

## [Unreleased: desktop]

### Added

- In-app updates: Cadence checks on launch and every six hours, downloads in
  the background and shows "Update ready, restart to install". It never
  restarts on its own. Cadence > Check for Updates checks now.
- Windows installers: an NSIS setup that updates itself and an MSI for
  managed installs, which links to the new version instead.

### Changed

- Builds no longer change the version; `desktop/package.json` is the single
  source and the release tag must match it.
- The download is about 165 MB instead of 2 GB: the app no longer carries
  copies of unrelated project folders.
- On macOS "Update ready" appears only once the update is verified, so
  quitting or restarting from then on always installs it.

### Fixed

- Pronunciation scoring starts: the engine's shared data now ships with the
  app.
- Phone > Connect a Phone shows the QR code instead of asking for a key.
- Setup repairs its Python environment when the app has moved, instead of
  failing on "Retry setup".
- The startup screen no longer says "Cadence could not open" while opening.

## [Unreleased: mobile]

## [Unreleased: web]

### Added

- `GET /api/version` reports the latest web, desktop and iOS versions and the
  minimum supported ones.

### Changed

- The landing page loads about a third less JavaScript (149 KB from 218 KB).
- Text colours meet WCAG AA contrast on every page, in light and dark mode.

### Fixed

- Practice rounds no longer try to sync when no one is signed in.
- Engine status checks no longer log an error every few seconds when your own
  Cadence's engines are off.
