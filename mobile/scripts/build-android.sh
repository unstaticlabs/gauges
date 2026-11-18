#!/bin/sh
# Builds the Android release bundle (.aab) for Google Play on this computer.
#
#   scripts/build-android.sh          # the .aab
#   scripts/build-android.sh --apk    # also a release .apk, to install on a test phone
#   scripts/build-android.sh --upload # the .aab, then upload it to Google Play
#
# It needs the config of your deployment: google-services.json and
# .env.local (see README.md). It refuses to build in demo mode.
#
# Steps: a clean prebuild, then `gradlew bundleRelease`. The build signs with
# the upload key in mobile/keystore.properties (see keystore.properties.example).
# Without that file, it signs with the debug key, and Google Play refuses the
# bundle. The output goes to mobile/build/.
#
# --upload sends the signed bundle to a track of Google Play with
# scripts/upload-android.mjs. It needs keystore.properties, and
# PLAY_SERVICE_ACCOUNT_PATH (and optionally PLAY_TRACK) in .env.local (see
# README.md). It checks them before the build starts.
set -eu

cd "$(dirname "$0")/.."
MOBILE=$(pwd)
OUT="$MOBILE/build"
APK=0
UPLOAD=0
for arg in "$@"; do
  case "$arg" in
    --apk) APK=1 ;;
    --upload) UPLOAD=1 ;;
    -h|--help) sed -n '2,19p' "$0"; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done

say() { printf '\n== %s\n' "$1"; }
stop() { printf '\nSTOP: %s\n' "$1" >&2; exit 1; }

# 1. A release build must use the config of your deployment, never the
# demo project or the emulator.
if [ -n "${EXPO_PUBLIC_FIREBASE_EMULATOR_HOST:-}" ]; then
  stop "EXPO_PUBLIC_FIREBASE_EMULATOR_HOST is set. Run 'unset EXPO_PUBLIC_FIREBASE_EMULATOR_HOST' first."
fi
[ -f google-services.json ] || stop "google-services.json is missing. Download it from your Firebase project (see README.md)."
[ -f .env.local ] || stop ".env.local is missing. Copy .env.example to .env.local and fill it in."
for name in EXPO_PUBLIC_FIREBASE_API_KEY EXPO_PUBLIC_FIREBASE_PROJECT_ID EXPO_PUBLIC_FIREBASE_APP_ID EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID EXPO_PUBLIC_WEBSITE_URL; do
  grep -q "^$name=." .env.local || stop "$name has no value in .env.local."
done
grep -q '^EXPO_PUBLIC_FIREBASE_EMULATOR_HOST=' .env.local && stop ".env.local sets EXPO_PUBLIC_FIREBASE_EMULATOR_HOST. Remove the line."

# The upload needs the upload key and the Google Play settings. Check them
# now, before the long build. The check reads the key file, but it does not
# use the network and does not print the key.
if [ "$UPLOAD" = 1 ]; then
  [ -f keystore.properties ] || stop "--upload needs a bundle signed with the upload key. Add keystore.properties (see keystore.properties.example)."
  node scripts/upload-android.mjs --check || exit 1
fi

# 2. Tools: JDK 17 or later, and the Android SDK.
java_major() { "$1" -version 2>&1 | sed -n 's/.*version "\([0-9]*\).*/\1/p' | head -n 1; }
if [ -n "${JAVA_HOME:-}" ]; then JAVA_BIN="$JAVA_HOME/bin/java"; else JAVA_BIN=java; fi
MAJOR=$(java_major "$JAVA_BIN" || true)
[ -n "$MAJOR" ] && [ "$MAJOR" -ge 17 ] || stop "Gradle needs JDK 17 or later. Set JAVA_HOME."
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
[ -d "$ANDROID_HOME/platforms" ] || stop "No Android SDK at $ANDROID_HOME. Set ANDROID_HOME."
echo "JDK $MAJOR, Android SDK $ANDROID_HOME"

# 3. Signing.
if [ -f keystore.properties ]; then
  SIGNED=1
  echo "Signing with the upload key from keystore.properties."
else
  SIGNED=0
  echo "WARNING: no keystore.properties. The bundle is signed with the DEBUG key."
  echo "         Google Play refuses it. Use it only to check the build."
fi

# 4. A clean prebuild. Prebuild changes the android and ios scripts of
# package.json, so the script puts the file back.
say "Prebuild"
PKG_BACKUP=$(mktemp)
cp package.json "$PKG_BACKUP"
restore() { if [ -f "$PKG_BACKUP" ]; then mv "$PKG_BACKUP" package.json; fi; }
trap restore EXIT
CI=1 npx expo prebuild --platform android --clean --no-install
restore
trap - EXIT

# 5. Build.
say "Gradle bundleRelease"
TASKS="bundleRelease"
[ "$APK" = 1 ] && TASKS="$TASKS assembleRelease"
(cd android && ./gradlew $TASKS --no-daemon)

# 6. Copy, name, and check the result.
VERSION=$(node -p "require('./app.json').expo.version")
CODE=$(node -p "require('./app.json').expo.android.versionCode")
SUFFIX=""
[ "$SIGNED" = 0 ] && SUFFIX="-DEBUG-SIGNED"
mkdir -p "$OUT"
AAB="$OUT/gauges-$VERSION-$CODE$SUFFIX.aab"
cp android/app/build/outputs/bundle/release/app-release.aab "$AAB"
if [ "$APK" = 1 ]; then
  cp android/app/build/outputs/apk/release/app-release.apk "$OUT/gauges-$VERSION-$CODE$SUFFIX.apk"
fi

say "Result"
MANIFEST=$(find android/app/build/intermediates -path '*release*' -name AndroidManifest.xml | head -n 1)
if [ -n "$MANIFEST" ]; then
  grep -o 'android:versionCode="[0-9]*"\|android:versionName="[^"]*"\|android:targetSdkVersion="[0-9]*"\|android:minSdkVersion="[0-9]*"' "$MANIFEST" | sort -u
fi
SIGNER=$(keytool -printcert -jarfile "$AAB" 2>/dev/null | sed -n 's/^Owner: //p' | head -n 1)
echo "Signer: ${SIGNER:-unknown}"
echo "Bundle: $AAB"
if [ "$SIGNED" = 0 ] || echo "$SIGNER" | grep -q 'Android Debug'; then
  echo
  echo "NOT FOR UPLOAD: this bundle has the debug key. Add keystore.properties and run again."
  [ "$UPLOAD" = 1 ] && stop "--upload does not upload a bundle with the debug key."
  exit 0
fi
if [ "$UPLOAD" = 0 ]; then
  echo
  echo "Upload the bundle in the Play Console, or run this script with --upload."
  exit 0
fi

# 7. Upload to Google Play.
# The script prints UPLOAD OK, or STOP with the reason.
node scripts/upload-android.mjs "$AAB" || exit 1
