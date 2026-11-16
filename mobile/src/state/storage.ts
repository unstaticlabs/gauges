import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Small values that the app keeps on this device only, as JSON. A read or
 * write error does not stop the app: a read gives `null`, and a write does
 * nothing.
 */
export async function readStored<T>(key: string): Promise<T | null> {
  try {
    const text = await AsyncStorage.getItem(key);
    return text == null ? null : (JSON.parse(text) as T);
  } catch {
    return null;
  }
}

export async function writeStored(key: string, value: unknown): Promise<void> {
  try {
    if (value === null || value === undefined) await AsyncStorage.removeItem(key);
    else await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // The value is a convenience. The app works without it.
  }
}

/** The keys of the stored values. Keep them here, so that two parts do not use the same key. */
export const STORAGE_KEYS = {
  homeView: 'gauges.homeView.v1',
  /** `true` after the first swipe that marks a gauge done: the home screen stops the swipe hint. */
  swipeLearned: 'gauges.swipeLearned.v1',
  invites: (uid: string) => `gauges.invites.v1.${uid}`,
  /** `true` after a log-out on the phone: the next start shows the start screen. */
  loggedOut: 'gauges.loggedOut.v1',
  /** The reminder settings of this device (`ReminderSettings`). */
  reminders: 'gauges.reminders.v1',
  /** `true` after the app showed the notification prompt one time (see `shouldAskOnFirstGauge`). */
  reminderAsked: 'gauges.reminderAsked.v1',
  // The data layer keeps the record of a merge under `gauges.accountMerge.v1`.
} as const;
