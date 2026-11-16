import type { TimeOfDay } from '../domain';

/** The reminder settings. They stay on this device and apply to each user that signs in on it. */
export interface ReminderSettings {
  enabled: boolean;
  time: TimeOfDay;
}

/**
 * Reminders are on by default, at 18:00. The app asks for the permission
 * only when the user has a gauge (see `shouldAskOnFirstGauge`).
 */
export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = { enabled: true, time: { hour: 18, minute: 0 } };

function isWhole(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

/** Reads a stored value. A missing or broken value gives the defaults. */
export function parseReminderSettings(stored: unknown): ReminderSettings {
  if (stored === null || typeof stored !== 'object') return DEFAULT_REMINDER_SETTINGS;
  const value = stored as { enabled?: unknown; time?: { hour?: unknown; minute?: unknown } };
  const hour = value.time?.hour;
  const minute = value.time?.minute;
  return {
    enabled: typeof value.enabled === 'boolean' ? value.enabled : DEFAULT_REMINDER_SETTINGS.enabled,
    time:
      isWhole(hour, 0, 23) && isWhole(minute, 0, 59) ? { hour, minute } : DEFAULT_REMINDER_SETTINGS.time,
  };
}
