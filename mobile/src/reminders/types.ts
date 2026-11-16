/** The state of the notification permission of the app. */
export type PermissionState = 'granted' | 'denied' | 'undetermined';

/** One reminder for the system to show at a fixed time. */
export interface ScheduledReminder {
  /** The ID of the request. It starts with `REMINDER_ID_PREFIX`. */
  id: string;
  /** Epoch milliseconds. */
  at: number;
  title: string;
  body: string;
  /** The gauges that the reminder names. */
  gaugeIds: string[];
}

/** A pending request of this app, as the system gives it back. */
export interface PendingReminder {
  id: string;
  title: string;
  body: string;
}

/**
 * The small part of the notification system that the reminders use. The
 * native implementation is in `scheduler.native.ts`, and the web
 * implementation does nothing.
 */
export interface ReminderScheduler {
  /** `false` on the web: there are no reminders. */
  readonly supported: boolean;
  getPermission(): Promise<PermissionState>;
  /** Shows the system prompt if the user did not answer it yet. */
  requestPermission(): Promise<PermissionState>;
  /** The pending reminders of this app only. */
  listPending(): Promise<PendingReminder[]>;
  schedule(reminder: ScheduledReminder): Promise<void>;
  cancel(id: string): Promise<void>;
}

/** The IDs of the reminders start with this text, so that a sync never touches other notifications. */
export const REMINDER_ID_PREFIX = 'gauges.reminder.';

/** The `kind` in the data of each reminder notification. */
export const REMINDER_KIND = 'gauges.reminder';

/** Development only: what the test switch in `devTest.ts` uses. `null` on the web. */
export interface DevTools {
  requestQuietPermission(): Promise<PermissionState>;
  pending(): Promise<Record<string, string>[]>;
  presented(): Promise<Record<string, string>[]>;
}
