/**
 * Config plugin: signs the Android release build with your upload key.
 * `expo prebuild --clean` makes `android/` again, and this plugin adds
 * the signing config each time, so the setting is not lost.
 *
 * The build reads `mobile/keystore.properties` (git ignores it). See
 * `keystore.properties.example`. Without the file, the release build uses the
 * debug key, which Google Play does not accept. `scripts/build-android.sh`
 * says so clearly.
 */
const { withAppBuildGradle } = require('expo/config-plugins');

const MARKER = '// gauges: release signing';

const PROPERTIES = `${MARKER}
def gaugesKeystoreFile = rootProject.file('../keystore.properties')
def gaugesKeystore = new Properties()
if (gaugesKeystoreFile.exists()) {
    gaugesKeystoreFile.withInputStream { gaugesKeystore.load(it) }
}
`;

const SIGNING_CONFIG = `
        release {
            if (gaugesKeystoreFile.exists()) {
                // An absolute path stays as it is. A relative path starts in mobile/.
                storeFile rootProject.file('..').toPath().resolve(gaugesKeystore['storeFile']).toFile()
                storePassword gaugesKeystore['storePassword']
                keyAlias gaugesKeystore['keyAlias']
                keyPassword gaugesKeystore['keyPassword']
            }
        }`;

function addSigning(gradle) {
  if (gradle.includes(MARKER)) return gradle;
  let out = gradle.replace(/^android \{/m, `${PROPERTIES}\nandroid {`);
  out = out.replace(
    /(signingConfigs \{\s*\n\s*debug \{[^}]*\})/,
    `$1${SIGNING_CONFIG}`,
  );
  out = out.replace(
    /(release \{\s*\n(?:\s*\/\/.*\n)*\s*)signingConfig signingConfigs\.debug/,
    '$1signingConfig gaugesKeystoreFile.exists() ? signingConfigs.release : signingConfigs.debug',
  );
  const ok =
    out.includes(MARKER) &&
    out.includes("gaugesKeystore['keyAlias']") &&
    out.includes('signingConfig gaugesKeystoreFile.exists() ? signingConfigs.release : signingConfigs.debug');
  if (!ok) {
    throw new Error('with-release-signing: android/app/build.gradle has an unknown shape. Update the plugin.');
  }
  return out;
}

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (mod) => {
    if (mod.modResults.language !== 'groovy') {
      throw new Error('with-release-signing: expected a Groovy build.gradle.');
    }
    mod.modResults.contents = addSigning(mod.modResults.contents);
    return mod;
  });
};

module.exports.addSigning = addSigning;
