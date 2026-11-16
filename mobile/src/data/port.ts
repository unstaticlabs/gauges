import type { AuthUser, LoginProvider, Unsubscribe } from './repository';

/**
 * The small set of database and auth operations that the shared repository
 * code needs. Each platform driver (`client.native.ts`, `client.web.ts`)
 * implements it with its own Firebase SDK. The shared code never imports a
 * Firebase SDK.
 */

export type DocData = Record<string, unknown>;

export interface DocSnapshot {
  id: string;
  data: DocData;
}

/**
 * One write in a batch. `data` can hold the values that `arrayUnion`,
 * `arrayRemove`, `deleteField`, and `timestamp` of the port make.
 */
export type WriteOp =
  | { type: 'set'; path: string; data: DocData; merge?: boolean }
  | { type: 'update'; path: string; data: DocData }
  | { type: 'delete'; path: string };

export interface TransactionPort {
  /** Gives `null` when the document does not exist. */
  get(path: string): Promise<DocData | null>;
  update(path: string, data: DocData): void;
}

export interface FirestorePort {
  /** Makes a new random document ID in the collection. */
  newId(collectionPath: string): string;
  /** Gives `null` when the document does not exist. */
  get(path: string): Promise<DocData | null>;
  /**
   * Gives each document of the collection where the array field `members`
   * holds `uid`, and each change to that list.
   */
  watchMembership(
    collectionPath: string,
    uid: string,
    onNext: (docs: DocSnapshot[]) => void,
    onError: (error: unknown) => void,
  ): Unsubscribe;
  /** Gives the same documents as `watchMembership`, one time. */
  listMembership(collectionPath: string, uid: string): Promise<DocSnapshot[]>;
  /** Writes all the operations in one atomic batch. */
  commit(ops: WriteOp[]): Promise<void>;
  runTransaction<T>(fn: (tx: TransactionPort) => Promise<T>): Promise<T>;
  arrayUnion(...values: unknown[]): unknown;
  arrayRemove(...values: unknown[]): unknown;
  deleteField(): unknown;
  /** Makes a database timestamp from epoch milliseconds. */
  timestamp(ms: number): unknown;
}

/**
 * A credential of a provider that signs in to an existing account. Only the
 * driver that made it reads `opaque`.
 */
export interface SignInCredential {
  provider: LoginProvider;
  opaque: unknown;
}

/**
 * The error of `AuthPort.link` when the login belongs to another account.
 * It carries the credential that signs in to that account.
 */
export class CredentialInUseError extends Error {
  readonly credential: SignInCredential;

  constructor(credential: SignInCredential) {
    super('The login belongs to another account.');
    this.name = 'CredentialInUseError';
    this.credential = credential;
  }
}

/**
 * Each method that shows the window of a provider rejects with a
 * `DataError` with the code `cancelled` when the user closes it.
 */
export interface AuthPort {
  current(): AuthUser | null;
  onChange(listener: (user: AuthUser | null) => void): Unsubscribe;
  signInAnonymously(): Promise<AuthUser>;
  signOut(): Promise<void>;
  /** Links a login to the current user. Rejects with `CredentialInUseError`. */
  link(provider: LoginProvider): Promise<AuthUser>;
  /** Signs in with a provider, in place of the current user. */
  signIn(provider: LoginProvider): Promise<AuthUser>;
  signInWithCredential(credential: SignInCredential): Promise<AuthUser>;
  unlink(provider: LoginProvider): Promise<AuthUser>;
  reauthenticate(provider: LoginProvider): Promise<void>;
  /**
   * Runs before an account delete, before the data goes. iOS revokes the
   * Apple tokens here. Leave it out when the platform has nothing to do.
   */
  beforeDelete?(): Promise<void>;
  /** Deletes the current auth user. It can reject with `requires-recent-login`. */
  deleteUser(): Promise<void>;
}

/** Small values that stay on the device. A failed read gives `null`. */
export interface DeviceStore {
  read<T>(key: string): Promise<T | null>;
  /** `null` removes the value. */
  write(key: string, value: unknown): Promise<void>;
}

export interface Platform {
  firestore: FirestorePort;
  auth: AuthPort;
  /** Keeps the state of a merge until it is complete. */
  store: DeviceStore;
  /** Gives `length` random bytes from a secure source. */
  randomBytes(length: number): Uint8Array;
  /** Gives the time now in epoch milliseconds. Tests can replace it. */
  now?: () => number;
}
