import type { DevTools, ReminderScheduler } from './types';

/**
 * The website has no reminders. This scheduler does nothing, so the web
 * build does not load `expo-notifications`.
 */
export const scheduler: ReminderScheduler = {
  supported: false,
  getPermission: async () => 'denied',
  requestPermission: async () => 'denied',
  listPending: async () => [],
  schedule: async () => {},
  cancel: async () => {},
};

export function configureForeground(_isStillDue: (gaugeIds: string[]) => boolean): void {}

export function onReminderTap(_onTap: () => void): () => void {
  return () => {};
}

export const devTools: DevTools | null = null;
