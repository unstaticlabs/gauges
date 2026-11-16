import type { Execution, Gauge, GaugeId, Label, LabelId, UserId } from '../domain/types';
import { changeExecutionDate, FutureExecutionError } from '../domain/executions';
import { createAccountOps } from './account';
import { buildInviteUrl, INVITE_CODE_BYTES, isValidInviteCode, toBase64Url } from './invite';
import {
  checkAggregate,
  checkEmoji,
  checkName,
  executionToDoc,
  GAUGES,
  gaugeChangesDoc,
  gaugeFromDoc,
  gaugePath,
  invitePath,
  LABELS,
  labelFromDoc,
  labelPath,
  newGaugeDoc,
  newLabelDoc,
  profileFromDoc,
  userPath,
} from './mapping';
import {
  planAddLabel,
  planClearJoinCode,
  planCreateInvite,
  planDeleteGauge,
  planDeleteLabel,
  planJoinGauge,
  planJoinLabel,
  planLeaveLabel,
  planMarkDone,
  planRemoveExecution,
  planRemoveLabel,
} from './plans';
import type { DocData, DocSnapshot, Platform } from './port';
import {
  type AuthUser,
  type Created,
  DataError,
  type DataErrorCode,
  type JoinResult,
  type Repository,
  type Unsubscribe,
} from './repository';

const KNOWN_CODES: DataErrorCode[] = [
  'unauthenticated',
  'permission-denied',
  'not-found',
  'invalid-argument',
  'unavailable',
  'cancelled',
  'credential-in-use',
  'account-exists',
  'requires-recent-login',
];

/** Other codes of the two SDKs, and the code that the app uses for each. */
const CODE_ALIASES: Record<string, DataErrorCode> = {
  'deadline-exceeded': 'unavailable',
  'network-request-failed': 'unavailable',
  'credential-already-in-use': 'credential-in-use',
  'email-already-in-use': 'account-exists',
  'account-exists-with-different-credential': 'account-exists',
  'popup-closed-by-user': 'cancelled',
  'cancelled-popup-request': 'cancelled',
  'user-cancelled': 'cancelled',
  'web-context-cancelled': 'cancelled',
};

/**
 * Converts an error from either Firebase SDK to a `DataError`. The web SDK
 * gives codes such as `permission-denied`. The native SDK gives codes such as
 * `firestore/permission-denied`.
 */
export function toDataError(error: unknown): DataError {
  if (error instanceof DataError) return error;
  const raw =
    error != null && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  const code = raw.includes('/') ? raw.slice(raw.indexOf('/') + 1) : raw;
  const message = error instanceof Error ? error.message : String(error);
  if ((KNOWN_CODES as string[]).includes(code)) {
    return new DataError(code as DataErrorCode, message, error);
  }
  if (code in CODE_ALIASES) return new DataError(CODE_ALIASES[code], message, error);
  return new DataError('unknown', message, error);
}

async function guard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    throw toDataError(error);
  }
}

/**
 * The repository logic for both platforms. A driver gives the `Platform`
 * (database, auth, and random bytes) and gets the `Repository` back.
 */
export function createFirestoreRepository(platform: Platform): Repository {
  const { firestore: fs, auth } = platform;
  const now = platform.now ?? (() => Date.now());

  // The last copy of each label from the live list, and each label that
  // this client created. `addLabelToGauge` and `createGauge` use them, so
  // that they do not wait for a read. An old copy can miss a new member.
  // That member gets the gauge with `repairMemberships` on their next start.
  const known = { labels: new Map<LabelId, Label>() };
  // The labels that this client created and the server did not confirm yet.
  // A read of such a label can reach the server before its create, and the
  // rules then refuse the read. Nobody else can join a label before it is on
  // the server, so this copy is exact until the create is confirmed.
  const pendingLabels = new Map<LabelId, Label>();
  const noCache = new Map<string, never>();
  let knownFor: UserId | null = null;
  /** The number of live lists that keep each map up to date. */
  const watchers = new Map<Map<string, unknown>, number>();

  /**
   * Keeps a copy of a document that this client created. Only while a live
   * list runs: the list replaces the copy with the server copy. Without a
   * live list, a copy gets old, so the writes read the document again.
   */
  function remember<T extends { id: string }>(cache: Map<string, T>, item: T): void {
    if ((watchers.get(cache) ?? 0) > 0) cache.set(item.id, item);
  }

  function resetKnown(uid: UserId | null): void {
    if (knownFor === uid) return;
    knownFor = uid;
    known.labels.clear();
    pendingLabels.clear();
  }

  function requireUser(): AuthUser {
    const user = auth.current();
    if (!user) throw new DataError('unauthenticated', 'No user is signed in.');
    return user;
  }

  /** Gives `null` for a missing document and for a document the user cannot read. */
  async function tryGet(path: string): Promise<DocData | null> {
    try {
      return await fs.get(path);
    } catch (error) {
      const e = toDataError(error);
      if (e.code === 'permission-denied' || e.code === 'not-found') return null;
      throw e;
    }
  }

  /** Moves one execution with the domain rule. A time after now is an invalid argument. */
  function moveTo(executions: Execution[], execution: Execution, newAt: number): Execution[] {
    try {
      return changeExecutionDate(executions, execution, newAt, now());
    } catch (error) {
      if (error instanceof FutureExecutionError) {
        throw new DataError('invalid-argument', 'The new time is in the future.', error);
      }
      throw error;
    }
  }

  async function getGauge(id: GaugeId): Promise<Gauge> {
    const data = await fs.get(gaugePath(id));
    if (!data) throw new DataError('not-found', 'The gauge does not exist.');
    return gaugeFromDoc(id, data);
  }

  async function getLabel(id: LabelId): Promise<Label> {
    const data = await fs.get(labelPath(id));
    if (!data) throw new DataError('not-found', 'The label does not exist.');
    return labelFromDoc(id, data);
  }

  /** Gives the known copy of a label, or reads it. */
  async function knownLabel(id: LabelId): Promise<Label> {
    return known.labels.get(id) ?? pendingLabels.get(id) ?? getLabel(id);
  }

  async function readableLabels(ids: LabelId[]): Promise<Label[]> {
    const docs = await Promise.all(ids.map(async (id) => ({ id, data: await tryGet(labelPath(id)) })));
    return docs.flatMap(({ id, data }) => (data ? [labelFromDoc(id, data)] : []));
  }

  async function readableGauges(ids: GaugeId[]): Promise<Gauge[]> {
    const docs = await Promise.all(ids.map(async (id) => ({ id, data: await tryGet(gaugePath(id)) })));
    return docs.flatMap(({ id, data }) => (data ? [gaugeFromDoc(id, data)] : []));
  }

  async function myLabels(uid: UserId): Promise<Label[]> {
    const docs = await fs.listMembership(LABELS, uid);
    return docs.map((d) => labelFromDoc(d.id, d.data));
  }

  /** Joins each gauge in `gaugeIds` through `labelId`. Each gauge is a separate write. */
  async function joinGauges(labelId: LabelId, gaugeIds: GaugeId[], uid: UserId): Promise<JoinResult> {
    const results = await Promise.allSettled(
      gaugeIds.map((id) => fs.commit(planJoinGauge(id, labelId, uid, fs))),
    );
    const result: JoinResult = { labelId, joinedGaugeIds: [], skippedGaugeIds: [] };
    results.forEach((r, i) => {
      (r.status === 'fulfilled' ? result.joinedGaugeIds : result.skippedGaugeIds).push(gaugeIds[i]);
    });
    return result;
  }

  function subscribeMembership<T extends { id: string }>(
    collection: string,
    map: (id: string, data: DocData) => T,
    cache: Map<string, T> | null,
    onData: (items: T[]) => void,
    onError?: (error: DataError) => void,
  ): Unsubscribe {
    let inner: Unsubscribe | null = null;
    const counted = cache ?? noCache;
    watchers.set(counted, (watchers.get(counted) ?? 0) + 1);
    const stopAuth = auth.onChange((user) => {
      inner?.();
      inner = null;
      resetKnown(user?.uid ?? null);
      if (!user) {
        onData([]);
        return;
      }
      inner = fs.watchMembership(
        collection,
        user.uid,
        (docs: DocSnapshot[]) => {
          const items = docs.map((d) => map(d.id, d.data));
          if (cache) {
            cache.clear();
            for (const item of items) cache.set(item.id, item);
          }
          onData(items);
        },
        (error) => onError?.(toDataError(error)),
      );
    });
    return () => {
      stopAuth();
      inner?.();
      inner = null;
      // With no live list, the copies get old. Read the documents again.
      const left = (watchers.get(counted) ?? 1) - 1;
      watchers.set(counted, left);
      if (left === 0) cache?.clear();
    };
  }

  async function deleteLabelAs(label: Label): Promise<void> {
    const gauges = await readableGauges(label.gaugeIds);
    const otherLabelIds = new Set(gauges.flatMap((g) => g.labelIds).filter((id) => id !== label.id));
    const others = await readableLabels([...otherLabelIds]);
    await fs.commit(planDeleteLabel(label, gauges, others, fs));
  }

  // A link or an unlink keeps the user ID, so the SDK sends no auth event.
  // These listeners hear about the new logins anyway.
  const userListeners = new Set<(user: AuthUser | null) => void>();
  let changedUser: AuthUser | null = null;
  const account = createAccountOps({
    platform,
    repository: () => repository,
    now,
    toDataError,
    userChanged: (user) => {
      changedUser = user;
      for (const listener of userListeners) listener(user);
    },
  });

  function currentUser(): AuthUser | null {
    const user = auth.current();
    return user && changedUser?.uid === user.uid ? changedUser : user;
  }

  const repository: Repository = {
    // --- Auth -------------------------------------------------------------

    onAuthStateChanged: (listener) => {
      userListeners.add(listener);
      const stop = auth.onChange((user) => {
        if (user?.uid !== changedUser?.uid) changedUser = null;
        listener(currentUser());
      });
      return () => {
        userListeners.delete(listener);
        stop();
      };
    },
    currentUser,
    signInAnonymously: () => guard(() => auth.signInAnonymously()),
    signOut: () => guard(() => auth.signOut()),

    // --- Account ----------------------------------------------------------

    ...account,

    // --- Profiles ---------------------------------------------------------

    getProfiles: (ids) =>
      guard(async () => {
        const unique = [...new Set(ids)];
        const docs = await Promise.all(unique.map(async (id) => ({ id, data: await fs.get(userPath(id)) })));
        return docs.flatMap(({ id, data }) => (data ? [profileFromDoc(id, data)] : []));
      }),

    setMyName: (name) =>
      guard(async () => {
        const user = requireUser();
        await fs.commit([
          { type: 'set', path: userPath(user.uid), data: { name: checkName(name) }, merge: true },
        ]);
      }),

    // --- Live lists -------------------------------------------------------

    subscribeMyGauges: (onData, onError) =>
      subscribeMembership(GAUGES, gaugeFromDoc, null, onData, onError),
    subscribeMyLabels: (onData, onError) =>
      subscribeMembership(LABELS, labelFromDoc, known.labels, onData, onError),

    // --- Gauges -----------------------------------------------------------

    createGauge: (input) => {
      const user = requireUser();
      resetKnown(user.uid);
      const id = fs.newId(GAUGES);
      const createdAt = now();
      const data = newGaugeDoc(input, user.uid, createdAt, fs.timestamp);

      // Each commit goes into the local cache at once. The SDK sends the
      // writes to the server in the order of the commits.
      const writes: Promise<void>[] = [fs.commit([{ type: 'set', path: gaugePath(id), data }])];
      if (input.doneAt !== undefined) {
        const execution: Execution = { at: Math.min(input.doneAt, createdAt), by: user.uid };
        writes.push(fs.commit(planMarkDone(id, execution, fs)));
      }
      // The rules accept a new gauge with no labels only. So each label is a
      // separate write after the create.
      for (const labelId of [...new Set(input.labelIds ?? [])]) {
        const copy = known.labels.get(labelId) ?? pendingLabels.get(labelId);
        const add = (label: Label) => fs.commit(planAddLabel({ id }, label, user.uid, fs));
        writes.push(copy ? Promise.resolve(copy).then(add) : getLabel(labelId).then(add));
      }
      return { id, saved: guard(() => Promise.all(writes).then(() => undefined)) };
    },

    updateGauge: (gaugeId, changes) =>
      guard(async () => {
        requireUser();
        const data = gaugeChangesDoc(changes);
        if (Object.keys(data).length === 0) return;
        await fs.commit([{ type: 'update', path: gaugePath(gaugeId), data }]);
      }),

    archiveGauge: (gaugeId) =>
      guard(async () => {
        requireUser();
        await fs.commit([
          { type: 'update', path: gaugePath(gaugeId), data: { archivedAt: fs.timestamp(now()) } },
        ]);
      }),

    unarchiveGauge: (gaugeId) =>
      guard(async () => {
        requireUser();
        await fs.commit([{ type: 'update', path: gaugePath(gaugeId), data: { archivedAt: null } }]);
      }),

    deleteGauge: (gaugeId) =>
      guard(async () => {
        const user = requireUser();
        const gauge = await getGauge(gaugeId);
        const labels = (await readableLabels(gauge.labelIds)).filter((l) => l.members.includes(user.uid));
        await fs.commit(planDeleteGauge(gaugeId, labels, fs));
      }),

    markDone: (gaugeId, at) =>
      guard(async () => {
        const user = requireUser();
        const execution: Execution = { at: at ?? now(), by: user.uid };
        await fs.commit(planMarkDone(gaugeId, execution, fs));
      }),

    editExecution: (gaugeId, execution, newAt) =>
      guard(async () => {
        requireUser();
        // A transaction reads the current list, so an execution that another
        // device added at the same time is not lost.
        await fs.runTransaction(async (tx) => {
          const data = await tx.get(gaugePath(gaugeId));
          if (!data) throw new DataError('not-found', 'The gauge does not exist.');
          const current = gaugeFromDoc(gaugeId, data).executions;
          if (!current.some((e) => e.at === execution.at && e.by === execution.by)) {
            throw new DataError('not-found', 'The execution does not exist. Another device changed it.');
          }
          const executions = moveTo(current, execution, newAt);
          tx.update(gaugePath(gaugeId), {
            executions: executions.map((e) => executionToDoc(e, fs.timestamp)),
          });
        });
      }),

    removeExecution: (gaugeId, execution) =>
      guard(async () => {
        requireUser();
        await fs.commit(planRemoveExecution(gaugeId, execution, fs));
      }),

    setMuted: (gaugeId, muted) =>
      guard(async () => {
        const user = requireUser();
        const value = muted ? fs.arrayUnion(user.uid) : fs.arrayRemove(user.uid);
        await fs.commit([{ type: 'update', path: gaugePath(gaugeId), data: { mutedBy: value } }]);
      }),

    // --- Labels -----------------------------------------------------------

    createLabel: (name, emoji): Created<LabelId> => {
      const user = requireUser();
      resetKnown(user.uid);
      const id = fs.newId(LABELS);
      const createdAt = now();
      const data = newLabelDoc(name, user.uid, createdAt, fs.timestamp, emoji);
      const copy: Label = {
        id,
        name: data.name as string,
        members: [user.uid],
        gaugeIds: [],
        createdBy: user.uid,
        createdAt,
      };
      if (typeof data.emoji === 'string') copy.emoji = data.emoji;
      remember(known.labels, copy);
      pendingLabels.set(id, copy);
      const saved = guard(() => fs.commit([{ type: 'set', path: labelPath(id), data }]));
      // After the server confirms the create, a read is safe again.
      const forget = () => {
        if (pendingLabels.get(id) === copy) pendingLabels.delete(id);
      };
      saved.then(forget, forget);
      return { id, saved };
    },

    renameLabel: (labelId, name) =>
      guard(async () => {
        requireUser();
        await fs.commit([{ type: 'update', path: labelPath(labelId), data: { name: checkName(name) } }]);
      }),

    setLabelEmoji: (labelId, emoji) =>
      guard(async () => {
        requireUser();
        const value = emoji === null ? null : checkEmoji(emoji);
        await fs.commit([{ type: 'update', path: labelPath(labelId), data: { emoji: value } }]);
      }),

    setLabelAggregate: (labelId, mode) =>
      guard(async () => {
        requireUser();
        await fs.commit([{ type: 'update', path: labelPath(labelId), data: { aggregate: checkAggregate(mode) } }]);
      }),

    deleteLabel: (labelId) =>
      guard(async () => {
        requireUser();
        await deleteLabelAs(await getLabel(labelId));
      }),

    addLabelToGauge: (gaugeId, labelId) =>
      guard(async () => {
        const user = requireUser();
        // The plan needs only the ID of the gauge and the members of the label.
        const label = await knownLabel(labelId);
        await fs.commit(planAddLabel({ id: gaugeId }, label, user.uid, fs));
      }),

    removeLabelFromGauge: (gaugeId, labelId) =>
      guard(async () => {
        const user = requireUser();
        // A removal needs the current members, so it reads the documents.
        const [gauge, label] = await Promise.all([getGauge(gaugeId), getLabel(labelId)]);
        const others = await readableLabels(gauge.labelIds.filter((id) => id !== labelId));
        await fs.commit(planRemoveLabel(gauge, label, others, user.uid, fs));
      }),

    // --- Sharing ----------------------------------------------------------

    createInvite: (labelId, options) =>
      guard(async () => {
        const user = requireUser();
        const expiresAt = options?.expiresAt ?? null;
        if (expiresAt != null && expiresAt <= now()) {
          throw new DataError('invalid-argument', 'The expiry time is in the past.');
        }
        const code = toBase64Url(platform.randomBytes(INVITE_CODE_BYTES));
        await fs.commit(planCreateInvite(labelId, code, user.uid, now(), expiresAt, fs));
        return { labelId, code, url: buildInviteUrl(labelId, code), expiresAt };
      }),

    revokeInvite: (labelId, code) =>
      guard(async () => {
        requireUser();
        if (!isValidInviteCode(code)) throw new DataError('invalid-argument', 'The code is not valid.');
        await fs.commit([{ type: 'delete', path: invitePath(labelId, code) }]);
      }),

    joinByInvite: ({ labelId, code }) =>
      guard(async () => {
        const user = requireUser();
        if (!isValidInviteCode(code)) throw new DataError('invalid-argument', 'The code is not valid.');
        try {
          await fs.commit(planJoinLabel(labelId, code, user.uid, fs));
        } catch (error) {
          const e = toDataError(error);
          if (e.code === 'permission-denied') {
            throw new DataError('permission-denied', 'The invite is not valid or it expired.', error);
          }
          throw e;
        }
        // Only the rule check needs the code. Remove it from the label. A
        // failure here does not stop the join.
        await fs.commit(planClearJoinCode(labelId, fs)).catch(() => undefined);
        const label = await getLabel(labelId);
        return joinGauges(labelId, label.gaugeIds, user.uid);
      }),

    leaveLabel: (labelId) =>
      guard(async () => {
        const user = requireUser();
        const label = await getLabel(labelId);
        if (label.members.length <= 1) {
          await deleteLabelAs(label);
          return;
        }
        const [gauges, labels] = await Promise.all([readableGauges(label.gaugeIds), myLabels(user.uid)]);
        await fs.commit(planLeaveLabel(label, gauges, labels, user.uid, fs));
      }),

    repairMemberships: () =>
      guard(async () => {
        const user = requireUser();
        const [labels, gaugeDocs] = await Promise.all([
          myLabels(user.uid),
          fs.listMembership(GAUGES, user.uid),
        ]);
        const mine = new Set(gaugeDocs.map((d) => d.id));
        const results: JoinResult[] = [];
        for (const label of labels) {
          const missing = label.gaugeIds.filter((id) => !mine.has(id));
          if (missing.length === 0) continue;
          const result = await joinGauges(label.id, missing, user.uid);
          result.joinedGaugeIds.forEach((id) => mine.add(id));
          results.push(result);
        }
        return results;
      }),
  };

  return repository;
}
