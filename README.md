# Gauges

Gauges shows how long ago you did each chore that comes back. Each chore
has a gauge that empties over time, and you mark the chore done with a
swipe. You can share a label of gauges with the people you live with. The
same app runs on iOS, on Android, and on the web.

## Layout

| Folder | What it holds |
|---|---|
| `mobile/` | The app (Expo, React Native, and TypeScript) for iOS, Android, and the web, and the static pages of the website. |
| `backend/` | The Firestore security rules, and the tests that run against the local Firebase emulator. Gauges has no server code. |

Each folder has its own `package.json`. Run the commands in that folder.

## Quick start

You need Node.js and npm. The emulator also needs Java 21 or later.

With no config, the app runs in demo mode: it uses the demo project
`demo-gauges` and the local emulators. It can never reach a live project.

1. Install the packages. `backend/` imports code from `mobile/`, so install
   `mobile/` first:

   ```sh
   (cd mobile && npm ci)
   (cd backend && npm ci)
   ```

2. Start the local emulators:

   ```sh
   cd backend && npm run emulators
   ```

3. In a second terminal, start the app:

   ```sh
   cd mobile && npx expo start --web
   ```

   With the emulator, the login screen also offers "Continue without an
   account". The Auth emulator shows a test login page for Google and
   Apple.

## Tests

```sh
(cd mobile && npm run lint && npm run typecheck && npm test)
(cd backend && npm run typecheck && npm test)
```

The tests in `backend/` start their own emulators with a `demo-` project
ID. The CI workflow (`.github/workflows/ci.yml`) runs the same checks on
each pull request and on each push to `master`. It deploys nothing.

## Use your own Firebase project

1. Create a Firebase project. Turn on Firestore and Authentication with
   the Google and Apple providers.
2. Add a web app, an iOS app, and an Android app to the project.
3. Copy `mobile/.env.example` to `mobile/.env.local`, and fill in the
   config of the web app.
4. Download `GoogleService-Info.plist` and `google-services.json` into
   `mobile/`. The app uses them in place of the `*.example` files.
5. Copy `mobile/.firebaserc.example` to `mobile/.firebaserc`, and set your
   project ID.
6. Deploy the rules: see "Deploy the rules to your own project" in
   `backend/README.md`.
7. Build the website with `npm run deploy:web` in `mobile/`. See
   `mobile/README.md` for the phone builds.

Git ignores all these files. Change the bundle ID, the package name, and
the domain in `mobile/app.json` and `mobile/public/` for your own app.

## Documentation

| Page | Topic |
|---|---|
| [`mobile/README.md`](mobile/README.md) | The app: the folder layout, the config, the emulator, the builds, and the checks. |
| [`backend/README.md`](backend/README.md) | The Firestore rules, their tests, and their deploy. |

## The first version

The first version of Gauges was an Ionic, Angular, and Capacitor app. The
git tag `old-ionic-app` points to its last commit:

```sh
git checkout old-ionic-app
```

## License

See [`LICENSE`](LICENSE).
