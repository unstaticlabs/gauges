import { deleteApp, type FirebaseApp, getApps, initializeApp } from 'firebase/app';
import {
  type Auth,
  type AuthCredential,
  type AuthProvider,
  connectAuthEmulator,
  deleteUser,
  getAuth,
  GoogleAuthProvider,
  linkWithCredential,
  linkWithPopup,
  OAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  signInAnonymously,
  signInWithCredential,
  signInWithPopup,
  signOut,
  unlink,
  type User,
} from 'firebase/auth';
import {
  arrayRemove,
  arrayUnion,
  collection,
  connectFirestoreEmulator,
  deleteField,
  doc,
  type Firestore,
  getDoc,
  getDocs,
  getFirestore,
  onSnapshot,
  query,
  runTransaction,
  Timestamp,
  where,
  writeBatch,
} from 'firebase/firestore';

import { EMULATOR_PROJECT_ID, emulatorConfig, type EmulatorConfig, firebaseWebConfig } from './config';
import { createFirestoreRepository } from './firestoreRepository';
import { CredentialInUseError, type AuthPort, type DeviceStore, type FirestorePort, type Platform } from './port';
import { toAuthUser as mapUser, providerIdOf } from './providers';
import { type AuthUser, DataError, type LoginProvider, type Repository } from './repository';
import { withoutAnonymous } from './withoutAnonymous';

/**
 * The web driver. It uses the Firebase JS SDK. The website needs a login
 * (Google or Apple, in a popup window). It never signs in anonymously on the
 * live project, because bots made many empty accounts with the old web app.
 * With the emulator, the login screen also offers to continue without an
 * account, so that you can test the link and the merge in a browser.
 */

function toAuthUser(user: User | null): AuthUser | null {
  return mapUser(user);
}

function providerObject(provider: LoginProvider): AuthProvider {
  if (provider === 'google') {
    const google = new GoogleAuthProvider();
    google.setCustomParameters({ prompt: 'select_account' });
    return google;
  }
  const apple = new OAuthProvider(providerIdOf('apple'));
  apple.addScope('email');
  apple.addScope('name');
  return apple;
}

function credentialFromError(provider: LoginProvider, error: unknown): AuthCredential | null {
  const e = error as Parameters<typeof GoogleAuthProvider.credentialFromError>[0];
  return provider === 'google' ? GoogleAuthProvider.credentialFromError(e) : OAuthProvider.credentialFromError(e);
}

function errorCode(error: unknown): string {
  return error != null && typeof error === 'object' && 'code' in error ? String(error.code) : '';
}

export function webFirestorePort(db: Firestore): FirestorePort {
  return {
    newId: (path) => doc(collection(db, path)).id,
    get: async (path) => {
      const snap = await getDoc(doc(db, path));
      return snap.exists() ? snap.data() : null;
    },
    watchMembership: (path, uid, onNext, onError) =>
      onSnapshot(
        query(collection(db, path), where('members', 'array-contains', uid)),
        (snap) => onNext(snap.docs.map((d) => ({ id: d.id, data: d.data() }))),
        onError,
      ),
    listMembership: async (path, uid) => {
      const snap = await getDocs(query(collection(db, path), where('members', 'array-contains', uid)));
      return snap.docs.map((d) => ({ id: d.id, data: d.data() }));
    },
    commit: async (ops) => {
      const batch = writeBatch(db);
      for (const op of ops) {
        if (op.type === 'set') batch.set(doc(db, op.path), op.data, { merge: !!op.merge });
        else if (op.type === 'update') batch.update(doc(db, op.path), op.data);
        else batch.delete(doc(db, op.path));
      }
      await batch.commit();
    },
    runTransaction: (fn) =>
      runTransaction(db, (tx) =>
        fn({
          get: async (path) => {
            const snap = await tx.get(doc(db, path));
            return snap.exists() ? snap.data() : null;
          },
          update: (path, data) => {
            tx.update(doc(db, path), data);
          },
        }),
      ),
    arrayUnion: (...values) => arrayUnion(...values),
    arrayRemove: (...values) => arrayRemove(...values),
    deleteField: () => deleteField(),
    timestamp: (ms) => Timestamp.fromMillis(ms),
  };
}

export interface WebAuthOptions {
  /**
   * `false` on the live website: it never makes an anonymous user, and it
   * signs out an anonymous user that the browser restores (see
   * `withoutAnonymous`).
   */
  allowAnonymous: boolean;
  /**
   * Tests only: gives an ID token of a provider in place of the popup
   * window. The Auth emulator accepts an unsigned JSON token such as
   * `{"sub":"abc","email":"a@example.com"}`.
   */
  idTokenFor?: (provider: LoginProvider) => string;
}

export function webAuthPort(auth: Auth, options: WebAuthOptions): AuthPort {
  const { idTokenFor } = options;
  const credentialFor = idTokenFor
    ? (provider: LoginProvider): AuthCredential =>
        provider === 'google'
          ? GoogleAuthProvider.credential(idTokenFor(provider))
          : new OAuthProvider(providerIdOf(provider)).credential({ idToken: idTokenFor(provider) })
    : undefined;
  const requireUser = (): User => {
    if (!auth.currentUser) throw new DataError('unauthenticated', 'No user is signed in.');
    return auth.currentUser;
  };
  const signedIn = (user: User): AuthUser => toAuthUser(user)!;

  const port: AuthPort = {
    current: () => toAuthUser(auth.currentUser),
    onChange: (listener) => onAuthStateChanged(auth, (user) => listener(toAuthUser(user))),
    signInAnonymously: async () => signedIn((await signInAnonymously(auth)).user),
    signOut: () => signOut(auth),
    link: async (provider) => {
      const user = requireUser();
      try {
        const result = credentialFor
          ? await linkWithCredential(user, credentialFor(provider))
          : await linkWithPopup(user, providerObject(provider));
        return signedIn(result.user);
      } catch (error) {
        if (errorCode(error) === 'auth/credential-already-in-use') {
          const credential = credentialFromError(provider, error) ?? credentialFor?.(provider);
          if (credential) throw new CredentialInUseError({ provider, opaque: credential });
        }
        throw error;
      }
    },
    signIn: async (provider) =>
      signedIn(
        credentialFor
          ? (await signInWithCredential(auth, credentialFor(provider))).user
          : (await signInWithPopup(auth, providerObject(provider))).user,
      ),
    signInWithCredential: async (credential) =>
      signedIn((await signInWithCredential(auth, credential.opaque as AuthCredential)).user),
    unlink: async (provider) => signedIn(await unlink(requireUser(), providerIdOf(provider))),
    reauthenticate: async (provider) => {
      const user = requireUser();
      if (credentialFor) await reauthenticateWithCredential(user, credentialFor(provider));
      else await reauthenticateWithPopup(user, providerObject(provider));
    },
    deleteUser: () => deleteUser(requireUser()),
  };
  return options.allowAnonymous ? port : withoutAnonymous(port);
}

/** Keeps values in the local storage of the browser. */
export const browserDeviceStore: DeviceStore = {
  read: async <T>(key: string) => {
    try {
      const text = globalThis.localStorage?.getItem(key);
      return text == null ? null : (JSON.parse(text) as T);
    } catch {
      return null;
    }
  },
  write: async (key, value) => {
    const storage = globalThis.localStorage;
    if (!storage) return;
    if (value === null || value === undefined) storage.removeItem(key);
    else storage.setItem(key, JSON.stringify(value));
  },
};

/** Keeps values in memory. Tests use one for each device. */
export function memoryDeviceStore(): DeviceStore & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    read: async <T>(key: string) => {
      const text = values.get(key);
      return text == null ? null : (JSON.parse(text) as T);
    },
    write: async (key, value) => {
      if (value === null || value === undefined) values.delete(key);
      else values.set(key, JSON.stringify(value));
    },
  };
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

export interface WebRepositoryOptions {
  /** A separate Firebase app name. Tests use one app for each user. */
  appName?: string;
  /** With an emulator, the app uses the demo project and talks to the emulator only. */
  emulator?: EmulatorConfig | null;
  /** The device store. Tests give a memory store, one for each device. */
  store?: DeviceStore;
  /** See `WebAuthOptions.idTokenFor`. */
  idTokenFor?: WebAuthOptions['idTokenFor'];
}

/** Makes a repository on a new Firebase app, or on the app with the same name. */
export function createWebRepository(options: WebRepositoryOptions = {}): Repository {
  const { appName = '[DEFAULT]', emulator = null, store = browserDeviceStore, idTokenFor } = options;
  const existing = getApps().find((a) => a.name === appName);
  const config = emulator ? { ...firebaseWebConfig, projectId: EMULATOR_PROJECT_ID } : firebaseWebConfig;
  const app: FirebaseApp = existing ?? initializeApp(config, appName);
  const db = getFirestore(app);
  const auth = getAuth(app);
  if (emulator && !existing) {
    connectFirestoreEmulator(db, emulator.host, emulator.firestorePort);
    connectAuthEmulator(auth, `http://${emulator.host}:${emulator.authPort}`, { disableWarnings: true });
  }
  const platform: Platform = {
    firestore: webFirestorePort(db),
    // Anonymous users exist on the web only with the emulator.
    auth: webAuthPort(auth, { allowAnonymous: emulator !== null, idTokenFor }),
    store,
    randomBytes,
  };
  return createFirestoreRepository(platform);
}

/** Deletes each Firebase app and closes its connections. Tests call it at the end. */
export async function disposeWebApps(): Promise<void> {
  await Promise.all(getApps().map((app) => deleteApp(app)));
}

/** The web app never signs in by itself. It shows the login screen. */
export const signsInAutomatically = false;

/**
 * `true` when the login screen offers to continue without an account. On
 * the web, only with the emulator: a development path to test the link and
 * the merge. The live website needs a login.
 */
export const anonymousAllowed = emulatorConfig() !== null;

/** The providers of the login screen, in their order. */
export const loginProviders: LoginProvider[] = ['google', 'apple'];

let instance: Repository | null = null;

/** Gives the one repository of the app. */
export function getRepository(): Repository {
  instance ??= createWebRepository({ emulator: emulatorConfig() });
  return instance;
}
