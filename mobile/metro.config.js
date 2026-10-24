// Learn more https://docs.expo.dev/guides/customizing-metro/
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Content packs ship as `.cpack` assets (JSON read from disk on demand), so a
// level's lessons are not parsed into the JS bundle at launch. See
// scripts/sync-content.mjs.
config.resolver.assetExts.push("cpack");

// RevenueCat's browser mode (Expo Go and the web) is never used by a native
// release build; leave its 1 MB web SDK out of those bundles.
const NO_BROWSER_MODE = path.join(__dirname, "src/lib/billing/no-browser-mode.js");
const releaseNative = (platform) => process.env.NODE_ENV === "production" && platform !== "web";
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "@revenuecat/purchases-js-hybrid-mappings" && releaseNative(platform)) {
    return { type: "sourceFile", filePath: NO_BROWSER_MODE };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
