import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApp } from '@react-native-firebase/app';
import {
  connectAuthEmulator,
  deleteUser,
  type AuthCredential,
  type AuthProvider,
  type User,
  getAuth,
  linkWithCredential,
  linkWithPopup,
  OAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  revokeToken,
  signInAnonymously,
  signInWithCredential,
  signInWithPopup,
  signOut,
  unlink,
} from '@react-native-firebase/auth';
import {
  arrayRemove,
  arrayUnion,
  collection,
  connectFirestoreEmulator,
  deleteField,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  onSnapshot,
  query,
  runTransaction,
  Timestamp,
  where,
  writeBatch,
} from '@react-native-firebase/firestore';
import { getRandomBytes } from 'expo-crypto';
import { Platform as RNPlatform } from 'react-native';

import { emulatorConfig } from './config';
import { createFirestoreRepository } from './firestoreRepository';
import { appleForDelete, nativeCredential, signOutOfProviders } from './nativeLogin';
import { type AuthPort, CredentialInUseError, type DeviceStore, type DocData, type FirestorePort, type Platform } from './port';
import { toAuthUser, providerIdOf } from './providers';
import { type AuthUser, DataError, type LoginProvider, type Repository } from './repository';

/**
 * The native driver for iOS and Android. It uses React Native Firebase, which
 * keeps a local cache on the device: the app works offline, and the writes go
 * to the server when the device is online again. The native SDK reads the
 * project config from `GoogleService-Info.plist` and `google-services.json`.
 *
 * Logins: `nativeLogin.ts` gets the credential of Google (both platforms)
 * and of Apple (iOS). Apple on Android has no native SDK: Firebase opens the
 * Apple web page (`linkWithPopup`).
 */

/** Apple on Android uses the web flow of Firebase, with no separate credential. */
const usesWebFlow = (provider: LoginProvider) => provider === 'apple' && RNPlatform.OS === 'android';

function appleProvider(): AuthProvider {
  const provider = new OAuthProvider(providerIdOf('apple'));
  provider.addScope('email');
  provider.addScope('name');
  // The class keeps `providerId` private in its types. The SDK reads it.
  return provider as unknown as AuthProvider;
}

/** A credential that React Native Firebase keeps on the native side after a failed link. */
interface NativeCredentialRef {
  providerId: string;
  token: string;
  secret: string | null;
}

function credentialFromError(error: unknown): NativeCredentialRef | null {
  const info = (error as { userInfo?: { authCredential?: NativeCredentialRef | null } } | null)?.userInfo;
  return info?.authCredential?.token ? info.authCredential : null;
}

const asyncStorageStore: DeviceStore = {
  read: async <T>(key: string) => {
    try {
      const text = await AsyncStorage.getItem(key);
      return text == null ? null : (JSON.parse(text) as T);
    } catch {
      return null;
    }
  },
  write: async (key, value) => {
    if (value === null || value === undefined) await AsyncStorage.removeItem(key);
    else await AsyncStorage.setItem(key, JSON.stringify(value));
  },
};

function createNativeRepository(): Repository {
  const app = getApp();
  const db = getFirestore(app);
  const auth = getAuth(app);
  const emulator = emulatorConfig();
  if (emulator) {
    connectFirestoreEmulator(db, emulator.host, emulator.firestorePort);
    connectAuthEmulator(auth, `http://${emulator.host}:${emulator.authPort}`);
  }

  const firestore: FirestorePort = {
    newId: (path) => doc(collection(db, path)).id,
    get: async (path) => {
      const snap = await getDoc(doc(db, path));
      return snap.exists() ? (snap.data() as DocData) : null;
    },
    watchMembership: (path, uid, onNext, onError) =>
      onSnapshot(
        query(collection(db, path), where('members', 'array-contains', uid)),
        (snap) => onNext(snap.docs.map((d) => ({ id: d.id, data: d.data() as DocData }))),
        onError,
      ),
    listMembership: async (path, uid) => {
      const snap = await getDocs(query(collection(db, path), where('members', 'array-contains', uid)));
      return snap.docs.map((d) => ({ id: d.id, data: d.data() as DocData }));
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
            return snap.exists() ? (snap.data() as DocData) : null;
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

  const requireUser = (): User => {
    if (!auth.currentUser) throw new DataError('unauthenticated', 'No user is signed in.');
    return auth.currentUser;
  };
  const signedIn = (user: User): AuthUser => toAuthUser(user)!;

  const authPort: AuthPort = {
    current: () => toAuthUser(auth.currentUser),
    onChange: (listener) => onAuthStateChanged(auth, (user) => listener(toAuthUser(user))),
    signInAnonymously: async () => signedIn((await signInAnonymously(auth)).user),
    signOut: async () => {
      await signOutOfProviders();
      await signOut(auth);
    },
    link: async (provider) => {
      const user = requireUser();
      let credential: AuthCredential | null = null;
      try {
        if (usesWebFlow(provider)) return signedIn((await linkWithPopup(user, appleProvider())).user);
        credential = await nativeCredential(provider);
        return signedIn((await linkWithCredential(user, credential)).user);
      } catch (error) {
        if (String((error as { code?: unknown })?.code) === 'auth/credential-already-in-use') {
          // The native SDK keeps a fresh credential: an Apple token works one
          // time only. Without one, a Google token works again. Apple on
          // Android opens the web page again.
          const opaque = credentialFromError(error) ?? credential ?? { webFlow: provider };
          throw new CredentialInUseError({ provider, opaque });
        }
        throw error;
      }
    },
    signIn: async (provider) => {
      if (usesWebFlow(provider)) return signedIn((await signInWithPopup(auth, appleProvider())).user);
      return signedIn((await signInWithCredential(auth, await nativeCredential(provider))).user);
    },
    signInWithCredential: async ({ provider, opaque }) => {
      if (opaque && typeof opaque === 'object' && 'webFlow' in opaque) {
        return signedIn((await signInWithPopup(auth, appleProvider())).user);
      }
      return signedIn((await signInWithCredential(auth, opaque as AuthCredential)).user);
    },
    unlink: async (provider) => {
      const user = await unlink(requireUser(), providerIdOf(provider));
      return signedIn(user);
    },
    reauthenticate: async (provider) => {
      const user = requireUser();
      if (usesWebFlow(provider)) await reauthenticateWithPopup(user, appleProvider());
      else await reauthenticateWithCredential(user, await nativeCredential(provider));
    },
    beforeDelete: async () => {
      const user = requireUser();
      // The App Store asks the app to revoke the Apple tokens of a deleted
      // account. Only iOS can do it from the client. The Apple sheet also
      // counts as a fresh login.
      if (RNPlatform.OS === 'ios' && user.providerData.some((p) => p.providerId === providerIdOf('apple'))) {
        const { credential, authorizationCode } = await appleForDelete();
        await reauthenticateWithCredential(user, credential);
        if (authorizationCode) await revokeToken(auth, authorizationCode);
      }
    },
    deleteUser: async () => {
      await deleteUser(requireUser());
      await signOutOfProviders();
    },
  };

  const platform: Platform = {
    firestore,
    auth: authPort,
    store: asyncStorageStore,
    randomBytes: (length) => getRandomBytes(length),
  };
  return createFirestoreRepository(platform);
}

/**
 * `true`: the native app signs in anonymously on the first start, with no
 * login screen. `SessionProvider` does it.
 */
export const signsInAutomatically = true;

/** `true`: the start screen offers to continue without an account. */
export const anonymousAllowed = true;

/** The providers of the login buttons, in their order. iOS shows Apple first. */
export const loginProviders: LoginProvider[] = RNPlatform.OS === 'ios' ? ['apple', 'google'] : ['google', 'apple'];

let instance: Repository | null = null;

/** Gives the one repository of the app. */
export function getRepository(): Repository {
  instance ??= createNativeRepository();
  return instance;
}
