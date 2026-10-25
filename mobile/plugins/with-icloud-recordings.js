// Adds the iCloud Documents entitlement and the Cadence folder in iCloud
// Drive, for the optional recordings copy (modules/cadence-icloud). Applied
// only when the build sets CADENCE_ICLOUD=1 (app.config.js), because the
// container has to exist on the App ID first; docs/PLATFORM.md section 19 has the
// developer portal steps. Without it the app keeps recordings on the phone.
const { withEntitlementsPlist, withInfoPlist } = require("expo/config-plugins");

const CONTAINER = "iCloud.dev.pstepanov.cadence";

module.exports = function withICloudRecordings(config) {
  config = withEntitlementsPlist(config, (mod) => {
    mod.modResults["com.apple.developer.icloud-container-identifiers"] = [CONTAINER];
    mod.modResults["com.apple.developer.ubiquity-container-identifiers"] = [CONTAINER];
    mod.modResults["com.apple.developer.icloud-services"] = ["CloudDocuments"];
    return mod;
  });
  config = withInfoPlist(config, (mod) => {
    mod.modResults.NSUbiquitousContainers = {
      [CONTAINER]: {
        NSUbiquitousContainerIsDocumentScopePublic: true,
        NSUbiquitousContainerName: "Cadence",
        NSUbiquitousContainerSupportedFolderLevels: "Any",
      },
    };
    return mod;
  });
  return config;
};
