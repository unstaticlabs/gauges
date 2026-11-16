# Gauges backend

This folder holds the Firestore security rules of Gauges and the tests that
check them. Gauges has no server code: the app talks to Firestore and
Firebase Auth directly, and the rules control the access.

## Files

| File | What it does |
|---|---|
| `firestore.rules` | The security rules. |
| `firebase.json` | The emulator ports, and the rules file for the emulator and for a deploy. |
| `scripts/with-emulator.sh` | Starts the emulators with the demo project `demo-gauges`. |
| `test/rules/` | Rules tests with `@firebase/rules-unit-testing`. `handover.rules.test.ts` tests the rules of the account merge. |
| `test/data/` | Tests of the app data layer (`mobile/src/data`) on the emulator. `account.test.ts` tests the login, the link, the merge, and the delete with fake Google and Apple tokens. |

## Requirements

- Node.js and npm.
- Java 21 or later for the emulator. If your default `java` is older, the
  script uses `/opt/homebrew/opt/openjdk@21` when it exists. You can also
  set `JAVA_HOME` yourself.
- The packages of the app, because `test/data/` imports its code. Run
  `npm ci` in `mobile/` first.

## Run the tests

```sh
npm ci
npm test
```

`npm test` starts the Firestore and Auth emulators, runs all tests, and
stops the emulators. The project ID is `demo-gauges`. A `demo-` project ID
never connects to a live Firebase project.

| Command | What it does |
|---|---|
| `npm run test:rules` | The rules tests only. |
| `npm run typecheck` | Checks the types of the tests. |

## Run the emulator for the app

```sh
npm run emulators
```

Then start the app in `mobile/`. With no config, the app uses this
emulator. See `mobile/README.md`.

## Change the rules

1. Change `firestore.rules`.
2. Add or change a test in `test/rules/`.
3. Run `npm test`.

## Deploy the rules to your own project

The rules go to the Firebase project that you name. Use your own project
ID. Log in to the Firebase CLI one time first.

```sh
npx firebase-tools@latest login
npx firebase-tools@latest deploy --only firestore:rules --project <your-project>
```

The deploy replaces the rules of that project. Run the tests before you
deploy.
