/**
 * Expo config plugin: pin androidx.core to a version that does not
 * require Android Gradle Plugin 8.9.1+.
 *
 * The default AGP shipped with Expo SDK 53's toolchain is older than
 * 8.9.1, but newer versions of react-native-screens / safe-area-context
 * pull in androidx.core 1.17.0 transitively, which then refuses to
 * compile because of the AGP version requirement. Pinning the resolved
 * version of androidx.core:core and androidx.core:core-ktx to 1.15.0
 * sidesteps the AGP requirement entirely (1.15.0 is API-compatible with
 * 1.17.0 for the consumers in this project).
 *
 * The pin must be injected at prebuild time because Expo regenerates
 * android/build.gradle and would overwrite a manual edit.
 */
const { withProjectBuildGradle } = require("@expo/config-plugins");

const RESOLUTION_BLOCK = `
// ANDROIDX_CORE_PIN — injected by plugins/withAndroidxCorePin.js
allprojects {
  configurations.all {
    resolutionStrategy.eachDependency { details ->
      if (details.requested.group == 'androidx.core'
          && (details.requested.name == 'core' || details.requested.name == 'core-ktx')) {
        details.useVersion('1.15.0')
        details.because('Pin to 1.15.0 to avoid AGP 8.9.1+ requirement on EAS')
      }
    }
  }
}
`;

module.exports = function withAndroidxCorePin(config) {
  return withProjectBuildGradle(config, (cfg) => {
    if (cfg.modResults.contents.includes("ANDROIDX_CORE_PIN")) {
      return cfg;
    }
    cfg.modResults.contents = cfg.modResults.contents + "\n" + RESOLUTION_BLOCK;
    return cfg;
  });
};
