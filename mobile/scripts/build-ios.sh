#!/bin/sh
# Builds the iOS app for the App Store on this Mac.
#
#   scripts/build-ios.sh              # archive and export a signed .ipa
#   scripts/build-ios.sh --unsigned   # only check that Release compiles, no signing
#
# It needs the config of your deployment: GoogleService-Info.plist and
# .env.local with APPLE_TEAM_ID (see README.md). It refuses to build in
# demo mode. --unsigned needs no team ID.
#
# Steps: a clean prebuild (with CocoaPods), `xcodebuild archive` for Release
# with automatic signing for your team, then an export for App Store
# Connect. Xcode uses the Apple account that is logged in to Xcode (Xcode >
# Settings > Accounts). The output goes to mobile/build/. Upload the .ipa
# with the Transporter app.
set -eu

cd "$(dirname "$0")/.."
MOBILE=$(pwd)
OUT="$MOBILE/build"
SCHEME=Gauges
UNSIGNED=0
for arg in "$@"; do
  case "$arg" in
    --unsigned) UNSIGNED=1 ;;
    -h|--help) sed -n '2,15p' "$0"; exit 0 ;;
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
[ -f GoogleService-Info.plist ] || stop "GoogleService-Info.plist is missing. Download it from your Firebase project (see README.md)."
[ -f .env.local ] || stop ".env.local is missing. Copy .env.example to .env.local and fill it in."
for name in EXPO_PUBLIC_FIREBASE_API_KEY EXPO_PUBLIC_FIREBASE_PROJECT_ID EXPO_PUBLIC_FIREBASE_APP_ID EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID EXPO_PUBLIC_WEBSITE_URL; do
  grep -q "^$name=." .env.local || stop "$name has no value in .env.local."
done
grep -q '^EXPO_PUBLIC_FIREBASE_EMULATOR_HOST=' .env.local && stop ".env.local sets EXPO_PUBLIC_FIREBASE_EMULATOR_HOST. Remove the line."
TEAM=$(sed -n 's/^APPLE_TEAM_ID=//p' .env.local | head -n 1)
if [ "$UNSIGNED" = 0 ] && [ -z "$TEAM" ]; then
  stop "APPLE_TEAM_ID has no value in .env.local. Set your Apple Developer team ID, or use --unsigned."
fi
command -v xcodebuild >/dev/null || stop "xcodebuild is missing. Install Xcode."
command -v pod >/dev/null || stop "CocoaPods is missing."

# 2. A clean prebuild. Prebuild changes the android and ios scripts of
# package.json, so the script puts the file back.
say "Prebuild and pods"
PKG_BACKUP=$(mktemp)
cp package.json "$PKG_BACKUP"
restore() { if [ -f "$PKG_BACKUP" ]; then mv "$PKG_BACKUP" package.json; fi; }
trap restore EXIT
CI=1 npx expo prebuild --platform ios --clean
restore
trap - EXIT

VERSION=$(node -p "require('./app.json').expo.version")
BUILD=$(node -p "require('./app.json').expo.ios.buildNumber")
ARCHIVE="$OUT/Gauges-$VERSION-$BUILD.xcarchive"
mkdir -p "$OUT"
rm -rf "$ARCHIVE"

# 3. Archive.
if [ "$UNSIGNED" = 1 ]; then
  say "Archive Release without signing (compile check only)"
  xcodebuild archive -workspace ios/$SCHEME.xcworkspace -scheme $SCHEME -configuration Release \
    -destination 'generic/platform=iOS' -archivePath "$ARCHIVE" \
    CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY="" | tail -n 30
  [ -d "$ARCHIVE/Products/Applications/$SCHEME.app" ] || stop "The archive has no app."
  /usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' -c 'Print :CFBundleVersion' -c 'Print :CFBundleIdentifier' \
    "$ARCHIVE/Products/Applications/$SCHEME.app/Info.plist"
  echo
  echo "The Release configuration compiles. The archive is NOT signed and cannot go to the App Store:"
  echo "$ARCHIVE"
  exit 0
fi

say "Archive Release with automatic signing for team $TEAM"
xcodebuild archive -workspace ios/$SCHEME.xcworkspace -scheme $SCHEME -configuration Release \
  -destination 'generic/platform=iOS' -archivePath "$ARCHIVE" \
  -allowProvisioningUpdates \
  DEVELOPMENT_TEAM="$TEAM" CODE_SIGN_STYLE=Automatic | tail -n 30
[ -d "$ARCHIVE" ] || stop "The archive failed."

# 4. Export.
DESTINATION=export
OPTIONS="$OUT/ExportOptions.plist"
cat > "$OPTIONS" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key><string>app-store-connect</string>
  <key>teamID</key><string>$TEAM</string>
  <key>signingStyle</key><string>automatic</string>
  <key>destination</key><string>$DESTINATION</string>
  <key>uploadSymbols</key><true/>
  <key>manageAppVersionAndBuildNumber</key><false/>
</dict>
</plist>
EOF

say "Export ($DESTINATION)"
EXPORT="$OUT/Gauges-$VERSION-$BUILD"
rm -rf "$EXPORT"
xcodebuild -exportArchive -archivePath "$ARCHIVE" -exportPath "$EXPORT" -exportOptionsPlist "$OPTIONS" \
  -allowProvisioningUpdates | tail -n 20

say "Result"
echo "Version $VERSION, build $BUILD"
ls "$EXPORT"/*.ipa
echo "Upload it with the Transporter app."
