// Learn more https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Content packs ship as `.cpack` assets (JSON read from disk on demand), so a
// level's lessons are not parsed into the JS bundle at launch. See
// scripts/sync-content.mjs.
config.resolver.assetExts.push("cpack");

module.exports = config;
