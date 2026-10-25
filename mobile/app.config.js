// The static config is app.json. This adds what depends on the build's
// environment: Google Sign-In's URL scheme, which is the iOS OAuth client id
// reversed (EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID, see .env.example). Without a
// client id the plugin is left out and the app shows no Google button.
const CLIENT_ID = /^([a-z0-9-]+)\.apps\.googleusercontent\.com$/i;

module.exports = ({ config }) => {
  const clientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim() ?? "";
  const match = CLIENT_ID.exec(clientId);
  if (!match) return config;
  return {
    ...config,
    plugins: [...(config.plugins ?? []), ["@react-native-google-signin/google-signin", { iosUrlScheme: `com.googleusercontent.apps.${match[1]}` }]],
  };
};
