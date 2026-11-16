import type { GaugeId, LabelId, UserId } from '../domain/types';
import { INVITE_CODE_BYTES, toBase64Url } from './invite';
import { GAUGES, gaugeFromDoc, gaugePath, handoverPath, LABELS, labelPath, userPath } from './mapping';
import {
  claimedGaugeChanges,
  planClaimAdd,
  planClaimRemoveFromLabel,
  planCreateHandover,
  planDeleteGauge,
  planTakeHandover,
} from './plans';
import { CredentialInUseError, type Platform, type SignInCredential } from './port';
import {
  type AuthUser,
  DataError,
  type DeviceData,
  type LoginProvider,
  type LogInResult,
  type MergeChoice,
  type MergeReport,
  type Repository,
} from './repository';

/**
 * Login, account link, account merge, and account delete. The code works on
 * the `Platform`, so the emulator tests run it with the web driver.
 *
 * The merge
 * ---------
 * The old account is the anonymous account of the device. The new account
 * is the account of the login. The old account cannot learn the ID of the
 * new account before the sign-in, and after the sign-in the device cannot
 * write as the old account. So the merge uses a hand-over:
 *
 * 1. As the old account: write the list of its gauges and labels and a new
 *    secret code to the device (`MERGE_KEY`). Create `handovers/{code}`
 *    with `from` = the old account. Delete the old profile.
 * 2. Sign in to the new account.
 * 3. As the new account: set `to` on the hand-over. From now on, only the
 *    new account can use the code. Then, for each label and gauge in the
 *    list, add the new account next to the old one, and take its place as
 *    creator (`claimVia` names the code for the rules). Then remove the old
 *    account, and give its executions to the new account.
 * 4. Copy the old name if the new account has none. Delete the hand-over
 *    and the record on the device.
 *
 * Each step can run again. If the app stops after step 1, the record stays
 * on the device, and `resumeMerge` ends the merge on the next start. If the
 * app stops before the sign-in, `resumeMerge` undoes step 1.
 */

/** The key of the merge record on the device. */
export const MERGE_KEY = 'gauges.accountMerge.v1';

export interface PendingMerge {
  version: 1;
  code: string;
  from: UserId;
  /** The name of the old account, to copy when the new account has none. */
  fromName: string | null;
  gauges: { id: GaugeId; creator: boolean; muted: boolean }[];
  labels: { id: LabelId; creator: boolean }[];
}

interface Inventory {
  gauges: PendingMerge['gauges'];
  labels: PendingMerge['labels'];
}

export interface AccountDeps {
  platform: Platform;
  /** The repository, for `leaveLabel`. */
  repository: () => Repository;
  now: () => number;
  /** Tells the auth listeners that the logins of the user changed. */
  userChanged: (user: AuthUser) => void;
  toDataError: (error: unknown) => DataError;
}

export interface AccountOps {
  logIn: Repository['logIn'];
  unlinkLogin: Repository['unlinkLogin'];
  resumeMerge: Repository['resumeMerge'];
  reauthenticate: Repository['reauthenticate'];
  deleteAccount: Repository['deleteAccount'];
}

export function createAccountOps(deps: AccountDeps): AccountOps {
  const { platform, now, toDataError } = deps;
  const { firestore: fs, auth, store } = platform;
  let running: Promise<MergeReport | null> | null = null;

  function requireUser(): AuthUser {
    const user = auth.current();
    if (!user) throw new DataError('unauthenticated', 'No user is signed in.');
    return user;
  }

  /** Runs a write that can fail because the document is gone. Gives `false` then. */
  async function tryCommit(run: () => Promise<void>): Promise<boolean> {
    try {
      await run();
      return true;
    } catch (error) {
      const e = toDataError(error);
      if (e.code === 'permission-denied' || e.code === 'not-found') return false;
      throw e;
    }
  }

  async function readName(uid: UserId): Promise<string | null> {
    const data = await fs.get(userPath(uid)).catch(() => null);
    return data && typeof data.name === 'string' && data.name.trim() ? data.name : null;
  }

  async function inventory(uid: UserId): Promise<Inventory> {
    const [gauges, labels] = await Promise.all([
      fs.listMembership(GAUGES, uid),
      fs.listMembership(LABELS, uid),
    ]);
    return {
      gauges: gauges.map((d) => {
        const g = gaugeFromDoc(d.id, d.data);
        return { id: d.id, creator: g.createdBy === uid, muted: g.mutedBy.includes(uid) };
      }),
      labels: labels.map((d) => ({ id: d.id, creator: d.data.createdBy === uid })),
    };
  }

  /** Gives the profile a name from the provider when it has none. */
  async function nameFromProvider(user: AuthUser): Promise<void> {
    if (!user.displayName || (await readName(user.uid))) return;
    const name = user.displayName.trim().slice(0, 60);
    if (!name) return;
    await fs
      .commit([{ type: 'set', path: userPath(user.uid), data: { name }, merge: true }])
      .catch(() => undefined);
  }

  // --- Merge --------------------------------------------------------------

  /** Step 1, as the old account. */
  async function prepare(user: AuthUser, items: Inventory): Promise<PendingMerge> {
    const pending: PendingMerge = {
      version: 1,
      code: toBase64Url(platform.randomBytes(INVITE_CODE_BYTES)),
      from: user.uid,
      fromName: await readName(user.uid),
      ...items,
    };
    // The record goes to the device before the hand-over exists, so that
    // the device can always undo or end the merge.
    await store.write(MERGE_KEY, pending);
    try {
      await fs.commit(planCreateHandover(pending.code, user.uid, now(), fs));
    } catch (error) {
      await store.write(MERGE_KEY, null);
      throw error;
    }
    await fs.commit([{ type: 'delete', path: userPath(user.uid) }]).catch(() => undefined);
    return pending;
  }

  /** Undoes step 1, as the old account, when the sign-in did not happen. */
  async function undo(pending: PendingMerge): Promise<void> {
    if (pending.fromName) {
      await fs
        .commit([{ type: 'set', path: userPath(pending.from), data: { name: pending.fromName }, merge: true }])
        .catch(() => undefined);
    }
    await fs.commit([{ type: 'delete', path: handoverPath(pending.code) }]).catch(() => undefined);
    await store.write(MERGE_KEY, null);
  }

  /** Steps 3 and 4, as the new account. */
  async function finish(pending: PendingMerge, me: AuthUser): Promise<MergeReport> {
    const { code, from } = pending;
    const to = me.uid;
    const report: MergeReport = { gauges: 0, labels: 0, skipped: 0 };

    try {
      await fs.commit(planTakeHandover(code, to));
    } catch (error) {
      const e = toDataError(error);
      // The hand-over expired or is gone. Nothing can end this merge.
      if (e.code === 'permission-denied' || e.code === 'not-found') {
        await store.write(MERGE_KEY, null);
        throw new DataError('permission-denied', 'The hand-over expired.', error);
      }
      throw e;
    }

    for (const label of pending.labels) {
      const path = labelPath(label.id);
      const added = await tryCommit(() => fs.commit(planClaimAdd(path, code, to, { creator: label.creator }, fs)));
      const removed = added && (await tryCommit(() => fs.commit(planClaimRemoveFromLabel(label.id, code, from, fs))));
      if (removed || (await isDone(path, from, to))) report.labels += 1;
      else report.skipped += 1;
    }

    for (const gauge of pending.gauges) {
      const path = gaugePath(gauge.id);
      const options = { creator: gauge.creator, muted: gauge.muted };
      const added = await tryCommit(() => fs.commit(planClaimAdd(path, code, to, options, fs)));
      const moved =
        added &&
        (await tryCommit(() =>
          fs.runTransaction(async (tx) => {
            const data = await tx.get(path);
            if (!data) return;
            const changes = claimedGaugeChanges(gaugeFromDoc(gauge.id, data), from, to, fs);
            if (changes) tx.update(path, changes);
          }),
        ));
      if (moved || (await isDone(path, from, to))) report.gauges += 1;
      else report.skipped += 1;
    }

    if (pending.fromName && !(await readName(to))) {
      await fs
        .commit([{ type: 'set', path: userPath(to), data: { name: pending.fromName }, merge: true }])
        .catch(() => undefined);
    }
    await fs.commit([{ type: 'delete', path: handoverPath(code) }]).catch(() => undefined);
    await store.write(MERGE_KEY, null);
    return report;
  }

  /** `true` when the new account has the document and the old one does not. A run before did it. */
  async function isDone(path: string, from: UserId, to: UserId): Promise<boolean> {
    const data = await fs.get(path).catch(() => null);
    const members = Array.isArray(data?.members) ? (data.members as unknown[]) : [];
    return members.includes(to) && !members.includes(from);
  }

  function resumeMerge(): Promise<MergeReport | null> {
    running ??= (async () => {
      try {
        const pending = await store.read<PendingMerge>(MERGE_KEY);
        if (!pending || pending.version !== 1) return null;
        const me = auth.current();
        if (!me) return null;
        if (me.uid === pending.from) {
          // The sign-in did not happen. Undo step 1.
          await undo(pending);
          return null;
        }
        // Only an account with a login takes data. A new anonymous account
        // here means that the user signed out and started again.
        if (me.isAnonymous) return null;
        return await finish(pending, me);
      } finally {
        running = null;
      }
    })();
    return running.catch((error) => {
      throw toDataError(error);
    });
  }

  // --- Delete -------------------------------------------------------------

  /**
   * Leaves the shared labels and deletes the private ones, deletes the
   * gauges that only the user has, leaves the gauges of others, and deletes
   * the profile. A gauge that the user created and that others use stays:
   * the rules keep its creator in `members`.
   */
  async function removeMyData(uid: UserId): Promise<void> {
    const repository = deps.repository();
    const labels = await fs.listMembership(LABELS, uid);
    for (const label of labels) {
      await repository.leaveLabel(label.id).catch((error) => {
        const e = toDataError(error);
        if (e.code !== 'not-found' && e.code !== 'permission-denied') throw e;
      });
    }
    const gauges = (await fs.listMembership(GAUGES, uid)).map((d) => gaugeFromDoc(d.id, d.data));
    for (const gauge of gauges) {
      if (gauge.members.length === 1) {
        await tryCommit(() => fs.commit(planDeleteGauge(gauge.id, [], fs)));
      } else if (gauge.createdBy !== uid) {
        await tryCommit(() =>
          fs.commit([
            {
              type: 'update',
              path: gaugePath(gauge.id),
              data: { members: fs.arrayRemove(uid), mutedBy: fs.arrayRemove(uid) },
            },
          ]),
        );
      }
    }
    await fs.commit([{ type: 'delete', path: userPath(uid) }]).catch(() => undefined);
  }

  // --- Login --------------------------------------------------------------

  async function switchTo(credential: SignInCredential): Promise<AuthUser> {
    const user = await auth.signInWithCredential(credential);
    await nameFromProvider(user);
    return user;
  }

  async function logIn(
    provider: LoginProvider,
    decide: (data: DeviceData) => Promise<MergeChoice>,
  ): Promise<LogInResult> {
    const current = auth.current();
    if (!current) {
      await nameFromProvider(await auth.signIn(provider));
      return { kind: 'switched' };
    }

    let credential: SignInCredential;
    try {
      const user = await auth.link(provider);
      deps.userChanged(user);
      await nameFromProvider(user);
      return { kind: 'linked' };
    } catch (error) {
      if (!(error instanceof CredentialInUseError)) throw error;
      credential = error.credential;
    }

    if (!current.isAnonymous) {
      throw new DataError('credential-in-use', 'The login belongs to another account.');
    }

    const items = await inventory(current.uid);
    if (items.gauges.length === 0 && items.labels.length === 0) {
      await fs.commit([{ type: 'delete', path: userPath(current.uid) }]).catch(() => undefined);
      await switchTo(credential);
      return { kind: 'switched' };
    }

    const choice = await decide({ gauges: items.gauges.length, labels: items.labels.length });
    if (choice === 'cancel') return { kind: 'cancelled' };
    if (choice === 'discard') {
      await removeMyData(current.uid);
      await switchTo(credential);
      return { kind: 'switched' };
    }

    const pending = await prepare(current, items);
    try {
      await switchTo(credential);
    } catch (error) {
      await undo(pending);
      throw error;
    }
    const report = await resumeMerge();
    return { kind: 'merged', report: report ?? { gauges: 0, labels: 0, skipped: 0 } };
  }

  return {
    logIn: (provider, decide) =>
      logIn(provider, decide).catch((error) => {
        throw toDataError(error);
      }),

    unlinkLogin: async (provider) => {
      try {
        const user = requireUser();
        if (user.logins.length <= 1) {
          throw new DataError('invalid-argument', 'The account needs at least one login.');
        }
        deps.userChanged(await auth.unlink(provider));
      } catch (error) {
        throw toDataError(error);
      }
    },

    resumeMerge,

    reauthenticate: (provider) =>
      auth.reauthenticate(provider).catch((error) => {
        throw toDataError(error);
      }),

    deleteAccount: async () => {
      try {
        const user = requireUser();
        await auth.beforeDelete?.();
        await removeMyData(user.uid);
        await auth.deleteUser();
      } catch (error) {
        throw toDataError(error);
      }
    },
  };
}
