/**
 * The Cadence widgets: the streak and today's goal (Home Screen small, Lock
 * Screen circular and inline) and the word of the day (Home Screen medium).
 *
 * Generated into the Xcode project by @bacons/apple-targets on every
 * `expo prebuild`; everything in this folder is the widget's source. It reads
 * the snapshot the app writes into the App Group (src/lib/widget).
 *
 * @type {import('@bacons/apple-targets/app.plugin').ConfigFunction}
 */
module.exports = (config) => ({
  type: "widget",
  name: "CadenceWidget",
  displayName: "Cadence",
  // dev.pstepanov.cadence.widget
  bundleIdentifier: ".widget",
  // containerBackground and the Lock Screen families need iOS 17.
  deploymentTarget: "17.0",
  entitlements: {
    "com.apple.security.application-groups": config.ios?.entitlements?.["com.apple.security.application-groups"] ?? ["group.dev.pstepanov.cadence"],
  },
});
