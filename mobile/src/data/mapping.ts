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
import { singleEmoji } from '../domain/emoji';
import { LABEL_AGGREGATES } from '../domain/label';
import type { DocData } from './port';
import { DataError, type GaugeChanges, type NewGauge } from './repository';

/**
 * The conversion between Firestore documents and the app types. The database
 * stores times as Firestore timestamps. The app types use epoch milliseconds.
 * This file converts at the edge, so the rest of the app sees numbers only.
 */

export const GAUGES = 'gauges';
export const LABELS = 'labels';
export const USERS = 'users';
export const HANDOVERS = 'handovers';

export const gaugePath = (id: GaugeId) => `${GAUGES}/${id}`;
export const labelPath = (id: LabelId) => `${LABELS}/${id}`;
export const userPath = (id: UserId) => `${USERS}/${id}`;
export const handoverPath = (code: string) => `${HANDOVERS}/${code}`;
export const invitePath = (labelId: LabelId, code: string) =>
  `${LABELS}/${labelId}/invites/${code}`;

/** The same limits as in `backend/firestore.rules`. */
export const NAME_MAX_LENGTH = 60;
export const REPEAT_DAYS_MAX = 3650;
export const CURVES: readonly Curve[] = ['linear', 'late', 'ease'];

/** Makes a database timestamp from epoch milliseconds. */
export type ToTimestamp = (ms: number) => unknown;

/**
 * Reads a time from a document. Both Firebase SDKs give a `Timestamp` with a
 * `toMillis()` method. A number is also accepted.
 */
export function readTime(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'object' && 'toMillis' in value) {
    const toMillis = (value as { toMillis: unknown }).toMillis;
    if (typeof toMillis === 'function') return toMillis.call(value) as number;
  }
  return null;
}

function readStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function readExecutions(value: unknown): Execution[] {
  if (!Array.isArray(value)) return [];
  const result: Execution[] = [];
  for (const item of value) {
    if (item == null || typeof item !== 'object') continue;
    const at = readTime((item as DocData).at);
    const by = (item as DocData).by;
    if (at != null && typeof by === 'string') result.push({ at, by });
  }
  return result;
}

function readCurve(value: unknown): Curve {
  return CURVES.includes(value as Curve) ? (value as Curve) : 'linear';
}

export function gaugeFromDoc(id: GaugeId, data: DocData): Gauge {
  return {
    id,
    name: typeof data.name === 'string' ? data.name : '',
    repeatDays: typeof data.repeatDays === 'number' ? data.repeatDays : 1,
    curve: readCurve(data.curve),
    labelIds: readStrings(data.labelIds),
    members: readStrings(data.members),
    createdBy: typeof data.createdBy === 'string' ? data.createdBy : '',
    executions: readExecutions(data.executions),
    archivedAt: readTime(data.archivedAt),
    mutedBy: readStrings(data.mutedBy),
    createdAt: readTime(data.createdAt) ?? 0,
  };
}

export function labelFromDoc(id: LabelId, data: DocData): Label {
  const label: Label = {
    id,
    name: typeof data.name === 'string' ? data.name : '',
    members: readStrings(data.members),
    gaugeIds: readStrings(data.gaugeIds),
    createdBy: typeof data.createdBy === 'string' ? data.createdBy : '',
    createdAt: readTime(data.createdAt) ?? 0,
  };
  // A label of the old app, or one with no pick, has no emoji. So does a value that is not one emoji.
  const emoji = typeof data.emoji === 'string' ? singleEmoji(data.emoji) : null;
  if (emoji) label.emoji = emoji;
  // Most labels have no mode. An unknown value, for example from a later
  // version of the app, also gives no mode, so the label uses the default.
  if (LABEL_AGGREGATES.includes(data.aggregate as LabelAggregate)) {
    label.aggregate = data.aggregate as LabelAggregate;
  }
  return label;
}

export function profileFromDoc(id: UserId, data: DocData): UserProfile {
  return { id, name: typeof data.name === 'string' ? data.name : '' };
}

export function executionToDoc(execution: Execution, ts: ToTimestamp): DocData {
  return { at: ts(execution.at), by: execution.by };
}

// --- Validation -----------------------------------------------------------

/** Gives the trimmed name, or throws `invalid-argument`. */
export function checkName(name: string): string {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (trimmed.length === 0) {
    throw new DataError('invalid-argument', 'The name is empty.');
  }
  if (trimmed.length > NAME_MAX_LENGTH) {
    throw new DataError('invalid-argument', `The name is longer than ${NAME_MAX_LENGTH} characters.`);
  }
  return trimmed;
}

/** Gives the emoji, or throws `invalid-argument` unless the text is exactly one emoji. */
export function checkEmoji(emoji: string): string {
  const one = typeof emoji === 'string' ? singleEmoji(emoji) : null;
  if (!one) throw new DataError('invalid-argument', 'The emoji must be one emoji.');
  return one;
}

/** Gives the mode of a label level, or throws `invalid-argument`. */
export function checkAggregate(mode: LabelAggregate): LabelAggregate {
  if (!LABEL_AGGREGATES.includes(mode)) {
    throw new DataError('invalid-argument', `aggregate must be one of ${LABEL_AGGREGATES.join(', ')}.`);
  }
  return mode;
}

export function checkRepeatDays(days: number): number {
  if (typeof days !== 'number' || !Number.isFinite(days) || days < 1 || days > REPEAT_DAYS_MAX) {
    throw new DataError('invalid-argument', `repeatDays must be from 1 to ${REPEAT_DAYS_MAX}.`);
  }
  return days;
}

export function checkCurve(curve: Curve): Curve {
  if (!CURVES.includes(curve)) {
    throw new DataError('invalid-argument', `curve must be one of ${CURVES.join(', ')}.`);
  }
  return curve;
}

// --- New documents --------------------------------------------------------

export function newGaugeDoc(input: NewGauge, uid: UserId, now: number, ts: ToTimestamp): DocData {
  return {
    name: checkName(input.name),
    repeatDays: checkRepeatDays(input.repeatDays),
    curve: checkCurve(input.curve),
    labelIds: [],
    members: [uid],
    createdBy: uid,
    executions: [],
    archivedAt: null,
    mutedBy: [],
    createdAt: ts(now),
  };
}

export function gaugeChangesDoc(changes: GaugeChanges): DocData {
  const data: DocData = {};
  if (changes.name !== undefined) data.name = checkName(changes.name);
  if (changes.repeatDays !== undefined) data.repeatDays = checkRepeatDays(changes.repeatDays);
  if (changes.curve !== undefined) data.curve = checkCurve(changes.curve);
  return data;
}

export function newLabelDoc(name: string, uid: UserId, now: number, ts: ToTimestamp, emoji?: string | null): DocData {
  const data: DocData = {
    name: checkName(name),
    members: [uid],
    gaugeIds: [],
    createdBy: uid,
    createdAt: ts(now),
  };
  if (emoji) data.emoji = checkEmoji(emoji);
  return data;
}
