// The static config is app.json. This adds what depends on the build's
// environment:
//
//   - Google Sign-In's URL scheme, which is the iOS OAuth client id reversed
//     (EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID, see .env.example). Without a client
//     id the plugin is left out and the app shows no Google button.
//   - The optional iCloud copy of the learner's recordings
//     (plugins/with-icloud-recordings.js), only when the build sets
//     CADENCE_ICLOUD=1, since that entitlement needs the iCloud container on
//     the App ID first (docs/PLATFORM.md, section 19).
const CLIENT_ID = /^([a-z0-9-]+)\.apps\.googleusercontent\.com$/i;

module.exports = ({ config }) => {
  const plugins = [...(config.plugins ?? [])];
  const clientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim() ?? "";
  const match = CLIENT_ID.exec(clientId);
  if (match) plugins.push(["@react-native-google-signin/google-signin", { iosUrlScheme: `com.googleusercontent.apps.${match[1]}` }]);
  if (process.env.CADENCE_ICLOUD === "1") plugins.push("./plugins/with-icloud-recordings");
  return plugins.length === (config.plugins ?? []).length ? config : { ...config, plugins };
};
