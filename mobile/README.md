# Gauges mobile app

This folder holds the Gauges app. It uses Expo, Expo Router, and TypeScript in strict mode. The same code builds for iOS, Android, and the web.

## Folder layout

| Folder | What goes here |
|---|---|
| `app/` | Routes only. Each route file renders one screen from `src/screens/`. `_layout.tsx` holds the providers and the navigator. |
| `src/screens/` | The screens and their parts, one folder for each screen. See `src/screens/README.md`. |
| `src/state/` | React context for the session, the live lists, the shared clock, the reminders, the toast, the member names, and the home view. Values that stay on the device (`storage.ts`, `inviteStore.ts`). |
| `src/i18n/` | All user-visible text, and the formatters for times and errors. |
| `src/domain/` | Pure TypeScript rules for gauges. No React and no Firebase. |
| `src/reminders/` | The daily reminder: the scheduler for each platform and the sync. See `src/reminders/README.md`. |
| `src/data/` | Data access behind one interface, with a native and a web implementation. See `src/data/README.md`. |
| `src/ui/` | Shared controls, platform helpers, and the theme (`src/ui/theme`). |
| `public/` | The static pages of the website, and the app-link files in `public/.well-known/`. |
| `plugins/` | Config plugins for the native projects. |
| `scripts/` | The release builds and the website build. |

Import code from `src/` with the `@/` prefix, for example `@/ui/theme`.

## Install

You need Node.js and npm. Run the commands in this folder.

```sh
npm ci
```

## Config

The settings of a deployment stay out of git. Each file has a committed
example:

| File | Example | What it holds |
|---|---|---|
| `.env.local` | `.env.example` | The Firebase web config, the Google web client ID, the website URL, and the Apple team ID for the iOS build. |
| `GoogleService-Info.plist` | `GoogleService-Info.plist.example` | The Firebase config of the iOS app. |
| `google-services.json` | `google-services.json.example` | The Firebase config of the Android app. |
| `.firebaserc` | `.firebaserc.example` | The Firebase project for the website deploy. |
| `keystore.properties` | `keystore.properties.example` | The upload key for the Android release build. |

With no `.env.local`, the app runs in demo mode. It uses the demo project
`demo-gauges` and the local emulators, so it can never reach a live
project. `app.config.js` uses the real native files when they exist, and
the example files of the demo project otherwise.

The release builds and the website build refuse to run in demo mode.

## Use the local emulator

1. Start the emulator in `backend/` (see `backend/README.md`):

   ```sh
   cd ../backend && npm run emulators
   ```

2. Start the app:

   ```sh
   npx expo start
   ```

In demo mode, the app always uses the emulator on `127.0.0.1`. With a real
config, set `EXPO_PUBLIC_FIREBASE_EMULATOR_HOST=127.0.0.1` to use the
emulator. Expo puts the variable into the bundle at build time. Restart
the server with `--clear` after you change it.

On Android, React Native Firebase changes `127.0.0.1` and `localhost` to
`10.0.2.2`, the address of your computer from the Android emulator. From a
real device, use the IP address of your computer.

The native app uses the project ID of its Firebase config file in the
emulator. The Auth emulator keeps all users under `demo-gauges`, because
the emulator runs in single project mode.

The Android emulator needs at least 4 CPU cores and 4 GB of memory for
this app. With less, the sign-in can take more than 15 seconds, and the app
shows "Could not sign in".

## Run the app

### Web

```sh
npm run web
```

The website needs a login (Google or Apple). It never makes an anonymous
user. With the emulator, the login screen also shows "Continue without an
account", so that you can test the account link and the merge in a
browser. A website with a real config never shows it.

To build the website into `dist/`, run:

```sh
npx expo export --platform web
```

### iOS and Android: development build

The app uses React Native Firebase, which has native code. Expo Go does
not contain it, so you need a development build. You build it one time,
and again after each change to native packages or to the Expo config.

```sh
npx expo run:ios       # needs Xcode 26.2 or later
npx expo run:android   # needs the Android SDK and JDK 17 or later
```

After the first build, start the development server with `npm start`. The
development build connects to it. On the first start, the native app signs
in anonymously. Login is optional on the phone: the user links Google or
Apple in Settings.

If an old development build without Firebase is on the device, remove it
first. Else the app shows the error `RNFBAppModule not found`.

## Test the login

Google and Apple login need setup in the Firebase console, the Google
Cloud console, and the Apple Developer account of your project. The SHA-1
fingerprint of each Android signing key must be in the Firebase project.

With the emulator, the website opens the test login page of the Auth
emulator in a popup: click "Add new account", enter an email, and sign in.
The same email on two browser windows is the same account. A real Google
or Apple login does not work with the emulator, also on the phone: the
native SDKs talk to Google and Apple directly.

The tests of the account code (link, switch, merge, delete) run against the
emulator with fake ID tokens. Run `npm test` in `backend/`.

## Invite links and the camera

An invite link has the form
`<website>/invite?label=<labelId>&code=<code>`, where `<website>` is
`EXPO_PUBLIC_WEBSITE_URL`. The QR code holds the same link. Expo Router
sends the link to `app/invite.tsx`.

- On a phone with the app, the system opens the app for the link (iOS
  universal links and Android app links, see `ios.associatedDomains` and
  `android.intentFilters` in `app.json`). This works only when the website
  serves the files in `public/.well-known/`.
- On a phone without the app, and on a computer, the link opens the
  website. The website asks for a Google or Apple login, then shows the
  join screen for the same link.
- The app also reads links of the form `gauges://invite?...`, and a pasted
  link of either form on the join screen.

The join screen scans a QR code with `expo-camera` on iOS and Android. The
camera permission text is in the `expo-camera` plugin entry of `app.json`.
The app does not ask for the microphone. The simulator has no camera, so
test the scan on a device, or paste the link.

## Reminders

The phone shows one notification a day at a time that the user picks (18:00
by default), only on days when a gauge is red. Reminders are on by default.
The app asks for the permission the first time the user has a gauge. The
phone schedules it itself, with `expo-notifications`. The website has no
reminders: Settings shows one line that says that they are in the phone
app. See `src/reminders/README.md`, also for a test on the simulator with
no tap.

## Check the code

```sh
npm run lint        # ESLint with the Expo config
npm run typecheck   # TypeScript, no output files
npm test            # Jest with the jest-expo preset, then the script tests
```

Run all three before you commit. The tests that need the Firebase emulator
are in `backend/`. Run them with `npm test` in that folder.

## Release builds

The release builds need the config of your deployment (see "Config").

| Command | What it does |
|---|---|
| `npm run deploy:web` | Builds the website into `dist/` and checks it: no emulator host, the config of `.env.local`, the Content-Security-Policy hashes, and no HTML comment in the static pages. It prints the deploy command. With `-- --deploy`, it also deploys to Firebase Hosting. |
| `npm run build:android` | A clean prebuild, then a signed Android App Bundle in `build/`. Add `-- --apk` for an APK too. |
| `npm run build:ios` | A clean prebuild, then a signed `.ipa` in `build/`. Add `-- --unsigned` for a compile check without signing. |

The version is `expo.version` in `app.json`. The build number is
`expo.ios.buildNumber` and `expo.android.versionCode`. Each store needs a
new build number for each upload.

`firebase.json` has the placeholder `${FIREBASE_AUTH_DOMAIN}` in the
Content-Security-Policy. `npm run deploy:web` writes `firebase.deploy.json`
with your auth domain, and the deploy uses that file.

## Add a package

Use `npx expo install <package>`, not `npm install`. The Expo command picks the version that matches the Expo SDK.
