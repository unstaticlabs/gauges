import type {
  Curve,
  Execution,
  Gauge,
  GaugeId,
  Label,
  LabelAggregate,
  LabelId,
  UserId,
  UserProfile,
} from '../domain/types';

/**
 * A login method that a user can link to their account. To add one (for
 * example an email link), add its name here, map it in the drivers, and add
 * a button and its text.
 */
export type LoginProvider = 'google' | 'apple';

/** One login of the user. */
export interface Login {
  provider: LoginProvider;
  /** The email that the provider gives, or `null`. Apple can hide it. */
  email: string | null;
}

/** The signed-in user, as the screens see it. */
export interface AuthUser {
  uid: UserId;
  /** `true` when the user has no login: the account exists on this device only. */
  isAnonymous: boolean;
  /** The logins of the user. Empty for an anonymous user. */
  logins: Login[];
  /** The name that a provider gives, or `null`. */
  displayName: string | null;
}

/** What the user chose when the device has data and the login belongs to another account. */
export type MergeChoice = 'merge' | 'discard' | 'cancel';

/** What the device has before a login to an existing account. */
export interface DeviceData {
  gauges: number;
  labels: number;
}

/** The result of `logIn`. */
export type LogInResult =
  /** The login is now part of the current account. Nothing moved. */
  | { kind: 'linked' }
  /** The device now uses the existing account of the login. */
  | { kind: 'switched' }
  /** The device uses the existing account, and the data of the device moved to it. */
  | { kind: 'merged'; report: MergeReport }
  /** The user stopped the login. Nothing changed. */
  | { kind: 'cancelled' };

/** The result of a merge. */
export interface MergeReport {
  gauges: number;
  labels: number;
  /** Items that another member deleted, or that the account cannot take. */
  skipped: number;
}

/** Call it to stop a subscription. */
export type Unsubscribe = () => void;

/** The fields of a new gauge. The repository sets the other fields. */
export interface NewGauge {
  name: string;
  repeatDays: number;
  curve: Curve;
  /**
   * Labels to add after the create. Each must be a label of the caller. The
   * rules accept a new gauge with no labels only, so each label is a separate
   * write after the create. The writes go to the server in order.
   */
  labelIds?: LabelId[];
  /** The time of a first execution by the caller. Leave it out for none. */
  doneAt?: number;
}

/**
 * The result of a create. The ID is ready at once, because the client makes
 * it. The local cache shows the new document at once, also offline.
 * `saved` resolves when the server accepts all the writes, and rejects with
 * a `DataError` when one of them fails. Offline, `saved` waits until the
 * device is online again.
 */
export interface Created<Id extends string> {
  id: Id;
  saved: Promise<void>;
}

/** The fields of a gauge that `updateGauge` changes. */
export interface GaugeChanges {
  name?: string;
  repeatDays?: number;
  curve?: Curve;
}

/** The data in an invite QR code. */
export interface InvitePayload {
  labelId: LabelId;
  code: string;
  /** For example `https://<website>/invite?label=...&code=...`. */
  url: string;
  /** `null` when the invite is valid until a member deletes it. */
  expiresAt: number | null;
}

export interface InviteOptions {
  /** Epoch milliseconds. Leave it out for an invite with no expiry time. */
  expiresAt?: number | null;
}

/** The result of `joinByInvite` and `repairMemberships`. */
export interface JoinResult {
  labelId: LabelId;
  /** The gauges that the user is now a member of. */
  joinedGaugeIds: GaugeId[];
  /**
   * The gauges that the label lists but that the user could not join, for
   * example because a member deleted the gauge.
   */
  skippedGaugeIds: GaugeId[];
}

/**
 * The error that each repository method gives. `code` is one of the codes
 * below, so the screens do not need to know Firebase error codes.
 */
export type DataErrorCode =
  | 'unauthenticated'
  | 'permission-denied'
  | 'not-found'
  | 'invalid-argument'
  | 'unavailable'
  /** The user closed the login window. */
  | 'cancelled'
  /** The login belongs to another account, and this account already has a login. */
  | 'credential-in-use'
  /** Another account uses the email of this login with another login method. */
  | 'account-exists'
  /** The server needs a fresh login before it deletes the account. */
  | 'requires-recent-login'
  | 'unknown';

export class DataError extends Error {
  readonly code: DataErrorCode;
  readonly cause?: unknown;

  constructor(code: DataErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'DataError';
    this.code = code;
    this.cause = cause;
  }
}

/**
 * The one interface that the screens use for data. It has no Firebase types.
 *
 * Each write method returns a promise, except the two create methods (see
 * `Created`). The promise resolves when the server accepts the write, and it
 * rejects with a `DataError` when the write fails.
 * On native, a write made offline stays in the local cache and the subscribers
 * see it at once, but the promise resolves only when the device is online
 * again.
 */
export interface Repository {
  // --- Auth ---------------------------------------------------------------

  /** Calls `listener` now with the current user, and again on each change. */
  onAuthStateChanged(listener: (user: AuthUser | null) => void): Unsubscribe;
  currentUser(): AuthUser | null;
  signInAnonymously(): Promise<AuthUser>;
  signOut(): Promise<void>;

  // --- Account ------------------------------------------------------------

  /**
   * Logs in with a provider. It shows the window of the provider.
   *
   * - No user: it signs in to the account of the login, or makes one.
   * - An anonymous user: it links the login to the current account, so the
   *   user ID and the data stay. If the login belongs to another account,
   *   the device switches to that account. When the device has data, it
   *   calls `decide` first. With `merge`, the data of the device moves to
   *   the other account (see `resumeMerge`).
   * - A user with a login: it adds a second login. If the login belongs to
   *   another account, it rejects with `credential-in-use`.
   *
   * It rejects with `cancelled` when the user closes the window.
   */
  logIn(provider: LoginProvider, decide: (data: DeviceData) => Promise<MergeChoice>): Promise<LogInResult>;
  /** Removes one login. The account must keep at least one login. */
  unlinkLogin(provider: LoginProvider): Promise<void>;
  /**
   * Ends a merge that stopped, for example because the app closed. The
   * device keeps what it needs until the merge is complete. Call it after
   * each sign-in. It gives `null` when no merge waits.
   */
  resumeMerge(): Promise<MergeReport | null>;
  /** Shows the window of the provider again. Use it after `requires-recent-login`. */
  reauthenticate(provider: LoginProvider): Promise<void>;
  /**
   * Leaves the shared labels, deletes the private gauges and labels and the
   * profile, then deletes the account. Gauges that the user created and
   * that other members use stay with them. It can reject with
   * `requires-recent-login`: call `reauthenticate`, then call it again.
   */
  deleteAccount(): Promise<void>;

  // --- Profiles -----------------------------------------------------------

  /** Gives the profiles that exist. It leaves out IDs with no profile. */
  getProfiles(ids: UserId[]): Promise<UserProfile[]>;
  setMyName(name: string): Promise<void>;

  // --- Live lists ---------------------------------------------------------

  /**
   * Gives the gauges of the current user, and each change to them. It follows
   * the auth state: with no user, it gives an empty list.
   */
  subscribeMyGauges(
    onData: (gauges: Gauge[]) => void,
    onError?: (error: DataError) => void,
  ): Unsubscribe;
  subscribeMyLabels(
    onData: (labels: Label[]) => void,
    onError?: (error: DataError) => void,
  ): Unsubscribe;

  // --- Gauges -------------------------------------------------------------

  /**
   * Creates a gauge and does not wait for the server. It throws a `DataError`
   * at once when no user is signed in or when a value is not valid.
   */
  createGauge(input: NewGauge): Created<GaugeId>;
  updateGauge(gaugeId: GaugeId, changes: GaugeChanges): Promise<void>;
  archiveGauge(gaugeId: GaugeId): Promise<void>;
  unarchiveGauge(gaugeId: GaugeId): Promise<void>;
  deleteGauge(gaugeId: GaugeId): Promise<void>;
  /** Adds one execution by the current user. `at` is now when it is missing. */
  markDone(gaugeId: GaugeId, at?: number): Promise<void>;
  /** Moves one execution to a new time. It finds the execution by `at` and `by`. */
  editExecution(gaugeId: GaugeId, execution: Execution, newAt: number): Promise<void>;
  removeExecution(gaugeId: GaugeId, execution: Execution): Promise<void>;
  /** Mutes or unmutes the reminders of one gauge for the current user. */
  setMuted(gaugeId: GaugeId, muted: boolean): Promise<void>;
  /**
   * Pauses the gauge for all members: its level stops (see
   * `src/domain/pause.ts`). It does nothing when the gauge is paused
   * already. It is a transaction, so it needs a connection.
   */
  pauseGauge(gaugeId: GaugeId): Promise<void>;
  /**
   * Resumes a paused gauge for all members. The gauge empties again from
   * its level at the start of the pause. It does nothing when the gauge is
   * not paused. It is a transaction: when two devices resume at once, the
   * paused time counts one time.
   */
  resumeGauge(gaugeId: GaugeId): Promise<void>;

  // --- Labels -------------------------------------------------------------

  /**
   * Creates a label and does not wait for the server, as `createGauge`.
   * `emoji` is optional: a label with no emoji shows a default one.
   */
  createLabel(name: string, emoji?: string | null): Created<LabelId>;
  renameLabel(labelId: LabelId, name: string): Promise<void>;
  /** Sets the emoji of a label for all members. `null` removes it, so the default shows. */
  setLabelEmoji(labelId: LabelId, emoji: string | null): Promise<void>;
  /** Sets how the label computes its level, for all members. */
  setLabelAggregate(labelId: LabelId, mode: LabelAggregate): Promise<void>;
  /**
   * Deletes the label and removes it from each gauge of the current user.
   * Only the creator, or the last member, can delete a label.
   */
  deleteLabel(labelId: LabelId): Promise<void>;
  addLabelToGauge(gaugeId: GaugeId, labelId: LabelId): Promise<void>;
  removeLabelFromGauge(gaugeId: GaugeId, labelId: LabelId): Promise<void>;

  // --- Sharing ------------------------------------------------------------

  createInvite(labelId: LabelId, options?: InviteOptions): Promise<InvitePayload>;
  revokeInvite(labelId: LabelId, code: string): Promise<void>;
  /** Joins the label, then each gauge that the label lists. */
  joinByInvite(invite: { labelId: LabelId; code: string }): Promise<JoinResult>;
  /**
   * Leaves the label and each of its gauges that the user has through no
   * other label. The last member deletes the label instead.
   */
  leaveLabel(labelId: LabelId): Promise<void>;
  /**
   * Joins each gauge that a label of the current user lists, if the user is
   * not a member yet. Call it on start. It repairs the case where another
   * member removed a label from a gauge and so removed the user by mistake.
   */
  repairMemberships(): Promise<JoinResult[]>;
}
