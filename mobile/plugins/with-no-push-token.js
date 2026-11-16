/**
 * Config plugin: stops Firebase Cloud Messaging from making a push token at
 * the start of the Android app. `expo-notifications` brings the FCM library
 * also when remote notifications are off. The app uses local reminders only,
 * so it needs no token, and the app collects no device ID.
 */
const { AndroidConfig, withAndroidManifest } = require('expo/config-plugins');

module.exports = function withNoPushToken(config) {
  return withAndroidManifest(config, (mod) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(mod.modResults);
    AndroidConfig.Manifest.addMetaDataItemToMainApplication(app, 'firebase_messaging_auto_init_enabled', 'false');
    return mod;
  });
};
