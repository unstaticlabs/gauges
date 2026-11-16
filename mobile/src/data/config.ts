/**
 * The settings of one deployment of Gauges.
 *
 * The values come from `EXPO_PUBLIC_*` variables. Put them in
 * `mobile/.env.local` (see `mobile/.env.example`). Expo reads that file and
 * puts the values into the bundle at build time.
 *
 * With no Firebase web config, the app runs in demo mode: it uses the demo
 * project `demo-gauges` and the local emulators, so it can never reach a
 * live project. The native apps read their Firebase project from
 * `GoogleService-Info.plist` (iOS) and `google-services.json` (Android).
 *
 * Expo replaces only a literal `process.env.EXPO_PUBLIC_NAME`. Do not read
 * these variables in another form.
 */

/** The project ID of demo mode and of the emulators. */
export const EMULATOR_PROJECT_ID = 'demo-gauges';

const LIVE_API_KEY = process.env.EXPO_PUBLIC_FIREBASE_API_KEY;
const LIVE_PROJECT_ID = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID;
const LIVE_APP_ID = process.env.EXPO_PUBLIC_FIREBASE_APP_ID;

/** `true` when no Firebase web config is set. The app then uses the emulators. */
export const DEMO_MODE = !LIVE_API_KEY || !LIVE_PROJECT_ID || !LIVE_APP_ID;

/**
 * The public client config of the Firebase web app. It is not a secret:
 * each web client gets it. The security rules protect the data.
 */
export const firebaseWebConfig = DEMO_MODE
  ? {
      apiKey: 'demo-api-key',
      authDomain: `${EMULATOR_PROJECT_ID}.firebaseapp.com`,
      projectId: EMULATOR_PROJECT_ID,
      storageBucket: `${EMULATOR_PROJECT_ID}.appspot.com`,
      messagingSenderId: '000000000000',
      appId: '1:000000000000:web:0000000000000000000000',
    }
  : {
      apiKey: LIVE_API_KEY,
      authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: LIVE_PROJECT_ID,
      storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      appId: LIVE_APP_ID,
    };

/**
 * The OAuth client of type "Web application" of the Firebase project.
 * Google Sign-In on iOS and Android asks for an ID token for this client,
 * so that Firebase accepts it. It is in `google-services.json`
 * (`client_type` 3). It is not a secret. Without it, Google Sign-In on the
 * phone does not work.
 */
export const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';

/**
 * The website: the web app, the legal pages, and the invite links. iOS and
 * Android open `/invite` links of this host in the app (see `app.json`).
 * The default is a placeholder host. An invite link must use https.
 */
export const WEBSITE_URL = process.env.EXPO_PUBLIC_WEBSITE_URL || 'https://gauges.example.com';

/** The emulator host of demo mode. */
const DEMO_EMULATOR_HOST = DEMO_MODE ? '127.0.0.1' : undefined;

export interface EmulatorConfig {
  host: string;
  firestorePort: number;
  authPort: number;
}

/**
 * Reads the emulator switch. Set `EXPO_PUBLIC_FIREBASE_EMULATOR_HOST` to use
 * the local emulator with a real config, for example `127.0.0.1`. In demo
 * mode, the app always uses the emulator, by default on `127.0.0.1`. On
 * Android, React Native Firebase changes `127.0.0.1` to `10.0.2.2` for the
 * Android emulator. The ports are the same as in `backend/firebase.json`.
 */
export function emulatorConfig(
  host: string | undefined = process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST || DEMO_EMULATOR_HOST,
): EmulatorConfig | null {
  if (!host) return null;
  return { host, firestorePort: 8080, authPort: 9099 };
}
