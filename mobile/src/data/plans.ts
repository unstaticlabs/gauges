import type { Execution, Gauge, GaugeId, Label, LabelId, UserId } from '../domain/types';
import { executionToDoc, gaugePath, handoverPath, invitePath, labelPath } from './mapping';
import type { DocData, FirestorePort, WriteOp } from './port';
import { DataError } from './repository';

/**
 * The write plans. Each function is pure: it takes app types and gives the
 * list of writes for one batch. The rules in `backend/firestore.rules` accept
 * exactly these shapes, so keep the two files in step.
 *
 * The plans use `arrayUnion` and `arrayRemove` for lists. The server applies
 * them to the current document, so a plan made from a stale copy does not
 * undo a write from another device.
 */

export type Sentinels = Pick<FirestorePort, 'arrayUnion' | 'arrayRemove' | 'deleteField' | 'timestamp'>;

function removeFrom(s: Sentinels, values: string[]): unknown {
  return s.arrayRemove(...values);
}

/** Adds one execution. Two devices that mark done at once both keep theirs. */
export function planMarkDone(gaugeId: GaugeId, execution: Execution, s: Sentinels): WriteOp[] {
  return [
    {
      type: 'update',
      path: gaugePath(gaugeId),
      data: { executions: s.arrayUnion(executionToDoc(execution, s.timestamp)) },
    },
  ];
}

export function planRemoveExecution(gaugeId: GaugeId, execution: Execution, s: Sentinels): WriteOp[] {
  return [
    {
      type: 'update',
      path: gaugePath(gaugeId),
      data: { executions: s.arrayRemove(executionToDoc(execution, s.timestamp)) },
    },
  ];
}

/**
 * Puts the label on the gauge. The batch writes the label ID into the gauge,
 * the gauge ID into the label, and the label members into the gauge members.
 * `joinVia` names the label for the rules.
 */
export function planAddLabel(gauge: Pick<Gauge, 'id'>, label: Label, uid: UserId, s: Sentinels): WriteOp[] {
  if (!label.members.includes(uid)) {
    throw new DataError('permission-denied', 'You are not a member of this label.');
  }
  return [
    {
      type: 'update',
      path: gaugePath(gauge.id),
      data: {
        labelIds: s.arrayUnion(label.id),
        members: s.arrayUnion(...label.members),
        joinVia: label.id,
      },
    },
    { type: 'update', path: labelPath(label.id), data: { gaugeIds: s.arrayUnion(gauge.id) } },
  ];
}

/**
 * Gives the members to remove from `gauge` when `removed` goes off it.
 *
 * A user stays when they are the creator, or a member of another label on the
 * gauge that the caller can read (`knownLabels`). The caller cannot read a
 * label of which they are not a member. A user that has access only through
 * such a label is removed by mistake, and gets access back with
 * `repairMemberships` on their next start.
 */
export function membersToRemove(gauge: Gauge, removed: Label, knownLabels: Label[]): UserId[] {
  const keep = new Set<UserId>([gauge.createdBy]);
  for (const label of knownLabels) {
    if (label.id === removed.id || !gauge.labelIds.includes(label.id)) continue;
    for (const member of label.members) keep.add(member);
  }
  return removed.members.filter((m) => !keep.has(m) && gauge.members.includes(m));
}

function gaugeLabelRemoval(gauge: Gauge, removed: Label, knownLabels: Label[], s: Sentinels): WriteOp {
  const leaving = membersToRemove(gauge, removed, knownLabels);
  const data: DocData = { labelIds: s.arrayRemove(removed.id) };
  if (leaving.length > 0) {
    data.members = removeFrom(s, leaving);
    data.mutedBy = removeFrom(s, leaving);
  }
  return { type: 'update', path: gaugePath(gauge.id), data };
}

/** Takes the label off the gauge, and removes the members that it gave. */
export function planRemoveLabel(
  gauge: Gauge,
  label: Label,
  knownLabels: Label[],
  uid: UserId,
  s: Sentinels,
): WriteOp[] {
  if (!label.members.includes(uid)) {
    throw new DataError('permission-denied', 'You are not a member of this label.');
  }
  return [
    gaugeLabelRemoval(gauge, label, knownLabels, s),
    { type: 'update', path: labelPath(label.id), data: { gaugeIds: s.arrayRemove(gauge.id) } },
  ];
}

/**
 * Deletes the label and takes it off each gauge in `gauges`. Give only the
 * gauges that the caller can read and that carry the label.
 */
export function planDeleteLabel(
  label: Label,
  gauges: Gauge[],
  knownLabels: Label[],
  s: Sentinels,
): WriteOp[] {
  const ops: WriteOp[] = gauges
    .filter((g) => g.labelIds.includes(label.id))
    .map((g) => gaugeLabelRemoval(g, label, knownLabels, s));
  ops.push({ type: 'delete', path: labelPath(label.id) });
  return ops;
}

/**
 * Removes the caller from the label and from each gauge in `gauges` that they
 * have through no other label. The creator of a gauge always stays on it.
 */
export function planLeaveLabel(
  label: Label,
  gauges: Gauge[],
  myOtherLabels: Label[],
  uid: UserId,
  s: Sentinels,
): WriteOp[] {
  if (label.members.length <= 1) {
    throw new DataError('invalid-argument', 'The last member deletes the label instead.');
  }
  const otherIds = new Set(myOtherLabels.filter((l) => l.id !== label.id).map((l) => l.id));
  const ops: WriteOp[] = [
    { type: 'update', path: labelPath(label.id), data: { members: s.arrayRemove(uid) } },
  ];
  for (const gauge of gauges) {
    if (!gauge.members.includes(uid) || gauge.createdBy === uid) continue;
    if (gauge.labelIds.some((id) => otherIds.has(id))) continue;
    ops.push({
      type: 'update',
      path: gaugePath(gauge.id),
      data: { members: s.arrayRemove(uid), mutedBy: s.arrayRemove(uid) },
    });
  }
  return ops;
}

/** Step 1 of a join: become a member of the label, proven by the code. */
export function planJoinLabel(labelId: LabelId, code: string, uid: UserId, s: Sentinels): WriteOp[] {
  return [
    { type: 'update', path: labelPath(labelId), data: { members: s.arrayUnion(uid), joinCode: code } },
  ];
}

/** Removes the code from the label after the join. Members cannot read invites. */
export function planClearJoinCode(labelId: LabelId, s: Sentinels): WriteOp[] {
  return [{ type: 'update', path: labelPath(labelId), data: { joinCode: s.deleteField() } }];
}

/**
 * Step 2 of a join: add only the caller to the gauge. The rules accept it
 * because the caller is a member of `labelId` and the label is on the gauge.
 */
export function planJoinGauge(gaugeId: GaugeId, labelId: LabelId, uid: UserId, s: Sentinels): WriteOp[] {
  return [
    { type: 'update', path: gaugePath(gaugeId), data: { members: s.arrayUnion(uid), joinVia: labelId } },
  ];
}

/** Deletes the gauge and takes it off each label in `myLabels` that lists it. */
export function planDeleteGauge(gaugeId: GaugeId, myLabels: Label[], s: Sentinels): WriteOp[] {
  const ops: WriteOp[] = myLabels
    .filter((l) => l.gaugeIds.includes(gaugeId))
    .map((l) => ({
      type: 'update' as const,
      path: labelPath(l.id),
      data: { gaugeIds: s.arrayRemove(gaugeId) },
    }));
  ops.push({ type: 'delete', path: gaugePath(gaugeId) });
  return ops;
}

export function planCreateInvite(
  labelId: LabelId,
  code: string,
  uid: UserId,
  now: number,
  expiresAt: number | null,
  s: Sentinels,
): WriteOp[] {
  return [
    {
      type: 'set',
      path: invitePath(labelId, code),
      data: {
        createdBy: uid,
        createdAt: s.timestamp(now),
        expiresAt: expiresAt == null ? null : s.timestamp(expiresAt),
      },
    },
  ];
}

// --- Hand-over (account merge) ---------------------------------------------

/** The days that a hand-over is valid before the new account takes it. */
export const HANDOVER_DAYS = 7;

/**
 * Made by the old (anonymous) account before the sign-in. The code is the
 * document ID. Only this device knows it.
 */
export function planCreateHandover(code: string, from: UserId, now: number, s: Sentinels): WriteOp[] {
  return [
    {
      type: 'set',
      path: handoverPath(code),
      data: {
        from,
        createdAt: s.timestamp(now),
        expiresAt: s.timestamp(now + HANDOVER_DAYS * 24 * 60 * 60 * 1000),
      },
    },
  ];
}

/** Made by the new account after the sign-in. From now on, only it can use the code. */
export function planTakeHandover(code: string, to: UserId): WriteOp[] {
  return [{ type: 'update', path: handoverPath(code), data: { to } }];
}

/**
 * Step 1 of a claim on a gauge or a label: add the new account next to the
 * old one. If the old account created the document, the new account becomes
 * its creator. The write does not read the document, because the new account
 * cannot read it yet.
 */
export function planClaimAdd(
  path: string,
  code: string,
  to: UserId,
  options: { creator: boolean; muted?: boolean },
  s: Sentinels,
): WriteOp[] {
  const data: DocData = { members: s.arrayUnion(to), claimVia: code };
  if (options.creator) data.createdBy = to;
  if (options.muted) data.mutedBy = s.arrayUnion(to);
  return [{ type: 'update', path, data }];
}

/** Step 2 of a claim on a label: remove the old account. */
export function planClaimRemoveFromLabel(labelId: LabelId, code: string, from: UserId, s: Sentinels): WriteOp[] {
  return [
    { type: 'update', path: labelPath(labelId), data: { members: s.arrayRemove(from), claimVia: code } },
  ];
}

/**
 * Step 2 of a claim on a gauge, as a member: remove the old account, and
 * give its executions to the new account. Gives `null` when nothing changes.
 */
export function claimedGaugeChanges(gauge: Gauge, from: UserId, to: UserId, s: Sentinels): DocData | null {
  if (!gauge.members.includes(from)) return null;
  return {
    members: gauge.members.filter((m) => m !== from),
    mutedBy: gauge.mutedBy.filter((m) => m !== from),
    executions: gauge.executions.map((e) => executionToDoc(e.by === from ? { at: e.at, by: to } : e, s.timestamp)),
  };
}
