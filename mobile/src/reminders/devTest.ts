import { devTools } from './scheduler';
import type { ReminderSettings } from './settings';

/**
 * Development only: a switch to test the reminders on a simulator with no
 * tap. Start Metro with `EXPO_PUBLIC_REMINDER_TEST_MINUTES=2`. After the
 * sign-in, the app then:
 *
 * 1. asks for a quiet (provisional) permission, which iOS gives with no prompt,
 * 2. turns reminders on at the next whole minute that is 2 minutes or more ahead,
 * 3. logs the pending notifications after each sync, and the delivered
 *    notifications 30 seconds after the reminder time.
 *
 * The variable is ignored in a release build, because `__DEV__` is `false`.
 */
export const REMINDER_TEST_MINUTES: number = __DEV__
  ? Math.max(0, Number(process.env.EXPO_PUBLIC_REMINDER_TEST_MINUTES ?? 0) || 0)
  : 0;

const log = (...parts: unknown[]) => console.log('[reminders test]', ...parts);

/** Gives the test settings, and logs the delivered notifications after the reminder time. */
export async function startReminderTest(now: number): Promise<ReminderSettings | null> {
  if (REMINDER_TEST_MINUTES <= 0 || devTools === null) return null;
  const permission = await devTools.requestQuietPermission();
  const at = new Date(now + REMINDER_TEST_MINUTES * 60 * 1000);
  if (at.getSeconds() > 0 || at.getMilliseconds() > 0) at.setMinutes(at.getMinutes() + 1, 0, 0);
  log('permission', permission, '- reminder time', at.toString());
  setTimeout(() => {
    void devTools?.presented().then((items) => log('delivered', JSON.stringify(items)));
  }, at.getTime() - now + 30 * 1000);
  return { enabled: true, time: { hour: at.getHours(), minute: at.getMinutes() } };
}

/** Logs the pending notifications of the app. */
export function logPending(): void {
  if (REMINDER_TEST_MINUTES <= 0 || devTools === null) return;
  void devTools.pending().then((items) => log('pending', JSON.stringify(items)));
}
