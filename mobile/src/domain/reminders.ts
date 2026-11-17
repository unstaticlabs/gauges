import type { Gauge, GaugeId, UserId } from './types';
import { isPaused } from './pause';
import { compareRated, rateGauge } from './sort';
import { isRed } from './tone';

export interface TimeOfDay {
  /** 0 to 23, local time. */
  hour: number;
  /** 0 to 59. */
  minute: number;
}

export interface ReminderPlanInput {
  gauges: readonly Gauge[];
  userId: UserId;
  now: number;
  timeOfDay: TimeOfDay;
  /** The number of reminder times to check. The default is 14. */
  days?: number;
}

export interface PlannedReminder {
  /** The reminder time, in milliseconds since the Unix epoch. */
  at: number;
  /** The red gauges at that time, the worst first. */
  gaugeIds: GaugeId[];
  /** The names of the same gauges, in the same order. */
  gaugeNames: string[];
}

/**
 * Returns the next `days` times at `timeOfDay` in the local time zone that
 * are after `now`. The first time is today if it is still to come, else
 * tomorrow. Each time comes from local date parts, so a change to or from
 * daylight saving time does not move the hour. If the local time does not
 * exist on a day (the spring change), the `Date` object moves it forward.
 */
export function reminderTimes(now: number, timeOfDay: TimeOfDay, days: number): number[] {
  const start = new Date(now);
  const times: number[] = [];
  for (let offset = 0; times.length < days; offset += 1) {
    const at = new Date(
      start.getFullYear(),
      start.getMonth(),
      start.getDate() + offset,
      timeOfDay.hour,
      timeOfDay.minute,
      0,
      0,
    ).getTime();
    if (at > now) times.push(at);
  }
  return times;
}

/**
 * Plans the reminders for one user. For each reminder time, the plan lists
 * the active gauges that are red at that time, in the order of the home
 * list (the worst first). It assumes that nobody does
 * an execution before then. Gauges that the user muted, gauges that the
 * user is not a member of, and paused gauges do not count. The result holds only the times
 * with one or more gauges.
 */
export function planReminders({
  gauges,
  userId,
  now,
  timeOfDay,
  days = 14,
}: ReminderPlanInput): PlannedReminder[] {
  const candidates = gauges.filter(
    (gauge) =>
      gauge.archivedAt === null &&
      !isPaused(gauge) &&
      gauge.members.includes(userId) &&
      !gauge.mutedBy.includes(userId),
  );
  const plan: PlannedReminder[] = [];
  for (const at of reminderTimes(now, timeOfDay, Math.max(0, Math.floor(days)))) {
    const red = candidates
      .map((gauge) => rateGauge(gauge, at))
      .filter((entry) => isRed(entry.level))
      .sort(compareRated);
    if (red.length === 0) continue;
    plan.push({
      at,
      gaugeIds: red.map((entry) => entry.gauge.id),
      gaugeNames: red.map((entry) => entry.gauge.name),
    });
  }
  return plan;
}
