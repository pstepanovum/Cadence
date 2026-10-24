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

## [Unreleased: mobile]

## [Unreleased: web]

### Added

- `GET /api/version` reports the latest web, desktop and iOS versions and the
  minimum supported ones.
