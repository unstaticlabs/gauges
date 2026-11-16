import { type Gauge, isRed, planReminders, type PlannedReminder, rateGauge, type TimeOfDay } from '../domain';
import type { Strings } from '../i18n/en';
import { reminderContent } from '../i18n/reminders';
import { REMINDER_ID_PREFIX, type ReminderScheduler, type ScheduledReminder } from './types';

/** The sync plans this many days ahead. */
export const REMINDER_DAYS = 14;

/**
 * The most reminders that the app keeps pending. iOS keeps 64 pending
 * notifications for each app and drops the rest. The plan has one
 * reminder a day at most, so this limit is far below it.
 */
export const MAX_PENDING = REMINDER_DAYS;

/** The wait after the last change before a sync starts. */
export const SYNC_DEBOUNCE_MS = 800;

/** Everything that a sync needs, from the app state. */
export interface SyncInput {
  enabled: boolean;
  userId: string | null;
  /** `null` while the list loads or after an error: the sync then keeps the pending reminders. */
  gauges: readonly Gauge[] | null;
  timeOfDay: TimeOfDay;
}

export type SyncStatus =
  /** Reminders are off, or nobody is signed in. Nothing is pending. */
  | 'off'
  /** The user did not allow notifications. Nothing is pending. */
  | 'noPermission'
  /** The gauges are not loaded. The pending reminders did not change. */
  | 'waiting'
  | 'scheduled';

export interface SyncResult {
  status: SyncStatus;
  /** The reminders that are pending after the sync. Empty unless `status` is `scheduled`. */
  reminders: ScheduledReminder[];
}

/** Converts one planned day to the reminder that the system shows. */
export function toScheduled(planned: PlannedReminder, strings: Strings): ScheduledReminder {
  return {
    id: `${REMINDER_ID_PREFIX}${planned.at}`,
    at: planned.at,
    ...reminderContent(planned.gaugeNames, strings),
    gaugeIds: planned.gaugeIds,
  };
}

/** The reminders that must be pending for this input and time. */
export function desiredReminders(
  input: Pick<SyncInput, 'gauges' | 'userId' | 'timeOfDay'>,
  now: number,
  strings: Strings,
): ScheduledReminder[] {
  if (input.userId === null || input.gauges === null) return [];
  return planReminders({ gauges: input.gauges, userId: input.userId, now, timeOfDay: input.timeOfDay, days: REMINDER_DAYS })
    .slice(0, MAX_PENDING)
    .map((planned) => toScheduled(planned, strings));
}

/**
 * Makes the pending reminders of the app equal to `desired`. It cancels
 * each pending reminder that is not in `desired` or has another text, and
 * schedules each one that is missing. A second call with the same list
 * changes nothing, so a repeated sync is safe.
 */
export async function reconcile(
  scheduler: ReminderScheduler,
  desired: readonly ScheduledReminder[],
  now: number,
): Promise<{ scheduled: number; cancelled: number }> {
  const pending = await scheduler.listPending();
  const wanted = new Map(desired.map((reminder) => [reminder.id, reminder]));
  const kept = new Set<string>();
  let cancelled = 0;
  for (const item of pending) {
    const want = wanted.get(item.id);
    if (want && want.title === item.title && want.body === item.body) {
      kept.add(item.id);
    } else {
      await scheduler.cancel(item.id);
      cancelled += 1;
    }
  }
  let scheduled = 0;
  for (const reminder of desired) {
    if (kept.has(reminder.id) || reminder.at <= now) continue;
    await scheduler.schedule(reminder);
    scheduled += 1;
  }
  return { scheduled, cancelled };
}

/** One full sync: checks the input and the permission, then reconciles. */
export async function syncOnce(
  scheduler: ReminderScheduler,
  input: SyncInput,
  now: number,
  strings: Strings,
): Promise<SyncResult> {
  if (!input.enabled || input.userId === null) {
    await reconcile(scheduler, [], now);
    return { status: 'off', reminders: [] };
  }
  if ((await scheduler.getPermission()) !== 'granted') {
    await reconcile(scheduler, [], now);
    return { status: 'noPermission', reminders: [] };
  }
  if (input.gauges === null) return { status: 'waiting', reminders: [] };
  const desired = desiredReminders(input, now, strings);
  await reconcile(scheduler, desired, now);
  return { status: 'scheduled', reminders: desired };
}

/**
 * Tells if a reminder that shows now still has a reason: one of the gauges
 * that it names is red now, for this user. Without live data, it says yes.
 */
export function isStillDue(
  gauges: readonly Gauge[] | null,
  userId: string | null,
  gaugeIds: readonly string[],
  now: number,
): boolean {
  if (gauges === null || userId === null) return true;
  return gauges.some(
    (gauge) =>
      gaugeIds.includes(gauge.id) &&
      gauge.archivedAt === null &&
      gauge.members.includes(userId) &&
      !gauge.mutedBy.includes(userId) &&
      isRed(rateGauge(gauge, now).level),
  );
}

// One queue for each scheduler. Two syncs never run at the same time, also
// when two controllers exist for a short time (for example during a reload).
const queues = new WeakMap<ReminderScheduler, Promise<unknown>>();

function enqueue<T>(scheduler: ReminderScheduler, job: () => Promise<T>): Promise<T> {
  const previous = queues.get(scheduler) ?? Promise.resolve();
  const next = previous.then(job, job);
  queues.set(
    scheduler,
    next.catch(() => {}),
  );
  return next;
}

export interface ReminderSyncOptions {
  scheduler: ReminderScheduler;
  strings: Strings;
  now?: () => number;
  debounceMs?: number;
  onResult?: (result: SyncResult) => void;
  onError?: (error: unknown) => void;
}

export interface ReminderSync {
  /** Gives the newest input. The sync starts after the debounce time. */
  request(input: SyncInput): void;
  /** Starts a sync with the newest input now, with no debounce. */
  flush(): Promise<void>;
  /** Stops the timer. A sync that runs ends, but no new sync starts. */
  dispose(): void;
}

/**
 * Runs the syncs for the app. It waits for the input to stay the same for
 * `debounceMs`, and runs one sync at a time. A sync always uses the newest
 * input. A sync that would use the same input as the last one does not run.
 */
export function createReminderSync({
  scheduler,
  strings,
  now = Date.now,
  debounceMs = SYNC_DEBOUNCE_MS,
  onResult,
  onError,
}: ReminderSyncOptions): ReminderSync {
  let latest: SyncInput | null = null;
  let version = 0;
  let doneVersion = -1;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  const clearTimer = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  const run = (): Promise<void> => {
    clearTimer();
    return enqueue(scheduler, async () => {
      if (disposed || latest === null || doneVersion === version) return;
      const input = latest;
      const runVersion = version;
      const result = await syncOnce(scheduler, input, now(), strings);
      doneVersion = runVersion;
      if (!disposed) onResult?.(result);
    }).catch((error) => {
      if (!disposed) onError?.(error);
    });
  };

  return {
    request(input) {
      if (disposed) return;
      latest = input;
      version += 1;
      clearTimer();
      timer = setTimeout(() => void run(), debounceMs);
    },
    flush() {
      if (disposed) return Promise.resolve();
      // A flush is also for a new day or a new permission, with the same input.
      version += 1;
      return run();
    },
    dispose() {
      disposed = true;
      clearTimer();
    },
  };
}
