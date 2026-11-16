/**
 * The shared types of the app. The domain code and the data layer both use
 * them. All times are milliseconds since the Unix epoch.
 */

export type UserId = string;
export type GaugeId = string;
export type LabelId = string;

/**
 * The shape of the curve that empties a gauge.
 * - `linear`: the level goes down at a constant speed.
 * - `late`: the level stays high, then goes down fast near the end.
 * - `ease`: the level goes down slowly, then fast, then slowly.
 */
export type Curve = 'linear' | 'late' | 'ease';

/** One time that a person did the chore. */
export interface Execution {
  at: number;
  by: UserId;
}

export interface Gauge {
  id: GaugeId;
  name: string;
  /** The usual number of days between two executions. Minimum 1. */
  repeatDays: number;
  curve: Curve;
  /** Zero or more labels. */
  labelIds: LabelId[];
  /**
   * Each user that can read and write the gauge: the creator and the members
   * of each label on the gauge.
   */
  members: UserId[];
  createdBy: UserId;
  /** The order is not guaranteed. */
  executions: Execution[];
  /** `null` when the gauge is active. */
  archivedAt: number | null;
  /** The users that get no reminder for this gauge. */
  mutedBy: UserId[];
  createdAt: number;
}

/** A label is private when it has one member. It is shared when it has more. */
export interface Label {
  id: LabelId;
  name: string;
  /** One emoji that the user picked. Missing when the user picked none: the app then shows a default. */
  emoji?: string;
  members: UserId[];
  /** Each gauge that has this label. A new member uses it to find the gauges. */
  gaugeIds: GaugeId[];
  createdBy: UserId;
  createdAt: number;
}

export interface UserProfile {
  id: UserId;
  name: string;
}
