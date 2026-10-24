// Stands in for @revenuecat/purchases-js-hybrid-mappings in release builds
// for iOS and Android (metro.config.js). react-native-purchases only uses that
// package in its browser mode (Expo Go and the web), which a store build never
// enters, and it is about 1 MB of the JS bundle.
module.exports = {};
