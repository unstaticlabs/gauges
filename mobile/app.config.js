/**
 * Adds the native Firebase config files to the Expo config in `app.json`.
 *
 * Each platform uses the real file when it exists, and the example file of
 * the demo project otherwise. Git ignores the real files. See README.md.
 */
const fs = require('fs');
const path = require('path');

/** Gives `./<name>` when the file exists, else `./<name>.example`. */
function configFile(name) {
  return fs.existsSync(path.join(__dirname, name)) ? `./${name}` : `./${name}.example`;
}

module.exports = ({ config }) => ({
  ...config,
  ios: { ...config.ios, googleServicesFile: configFile('GoogleService-Info.plist') },
  android: { ...config.android, googleServicesFile: configFile('google-services.json') },
});
