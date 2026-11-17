import type { Strings } from './en';
import { clockOptions, type DateLocale } from './locale';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export type RelativeUnit = 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year';

/** Below this age, a time on the day before still shows in hours, for example "2 hours ago" at 1:00. */
const HOURS_BEFORE_DAYS = 6 * HOUR;

/** The number of local calendar days from the day of `from` to the day of `to`. */
export function calendarDays(from: number, to: number): number {
  const a = new Date(from);
  const b = new Date(to);
  const startA = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const startB = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  // A day with a change to or from daylight saving time has 23 or 25 hours.
  return Math.round((startB - startA) / DAY);
}

/**
 * Picks the unit and the whole number of units for a time in the past.
 * Returns `null` for less than one minute. A time in the future counts as
 * "just now", because a clock on another device can be a little ahead.
 *
 * Days are calendar days, as a person counts them: a time three dates ago
 * is "3 days ago", also when it was later in the day than now.
 */
export function relativeParts(then: number, now: number): { value: number; unit: RelativeUnit } | null {
  const diff = now - then;
  if (diff < MINUTE) return null;
  if (diff < HOUR) return { value: Math.floor(diff / MINUTE), unit: 'minute' };
  const days = calendarDays(then, now);
  if (days <= 0 || diff < HOURS_BEFORE_DAYS) return { value: Math.max(1, Math.floor(diff / HOUR)), unit: 'hour' };
  if (days < 14) return { value: days, unit: 'day' };
  if (days < 56) return { value: Math.floor(days / 7), unit: 'week' };
  if (days < 365) return { value: Math.max(2, Math.floor(days / 30)), unit: 'month' };
  return { value: Math.floor(days / 365), unit: 'year' };
}

/** The part of `Intl.RelativeTimeFormat` that the app uses. */
export interface RelativeFormatter {
  format(value: number, unit: RelativeUnit): string;
}

/**
 * Makes a formatter with `Intl.RelativeTimeFormat` when the JavaScript engine
 * has it. Returns `null` when it does not, or when it throws.
 */
export function makeRelativeFormatter(locale: string): RelativeFormatter | null {
  try {
    if (typeof Intl === 'undefined' || typeof Intl.RelativeTimeFormat !== 'function') return null;
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
    // Some engines create the object but cannot format.
    rtf.format(-1, 'day');
    return rtf;
  } catch {
    return null;
  }
}

/**
 * Formats a time in the past, for example "3 days ago". It uses the
 * formatter when one is given, and the text in `strings` when not.
 */
export function formatRelative(
  then: number,
  now: number,
  strings: Strings,
  formatter: RelativeFormatter | null,
): string {
  const parts = relativeParts(then, now);
  if (parts === null) return strings.time.justNow;
  if (formatter) return formatter.format(-parts.value, parts.unit);
  return strings.time.agoFallback[parts.unit](parts.value);
}

/** Formats the time of the last execution for a row. */
export function formatLastDone(
  lastAt: number | null,
  now: number,
  strings: Strings,
  formatter: RelativeFormatter | null,
): string {
  if (lastAt === null) return strings.time.never;
  return strings.time.lastDone(formatRelative(lastAt, now, strings, formatter));
}

/** Pads a number to two digits. */
function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/**
 * Converts epoch milliseconds to the value of an HTML `datetime-local` input
 * in the local time zone, for example `2026-11-14T09:05`.
 */
export function toLocalInputValue(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Reads the value of an HTML `datetime-local` input as a local time. Returns
 * `null` when the text is not a valid date and time.
 */
export function fromLocalInputValue(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!match) return null;
  const [, y, mo, d, h, mi, s] = match.map(Number);
  const date = new Date(y, mo - 1, d, h, mi, Number.isNaN(s) ? 0 : s);
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
  return date.getTime();
}

/**
 * Formats a date with no time in the local time zone, for example "3 Oct"
 * in France and "Oct 3" in the United States. A date in another year than
 * `now` gets the year too.
 */
export function formatShortDate(ms: number, locale: DateLocale, now: number): string {
  const date = new Date(ms);
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  try {
    return new Intl.DateTimeFormat(locale.tag, {
      day: 'numeric',
      month: 'short',
      year: sameYear ? undefined : 'numeric',
    }).format(date);
  } catch {
    return toLocalInputValue(ms).slice(0, 10);
  }
}

/**
 * Formats a date and a time in the local time zone, for the history list.
 * The order of the parts and the clock follow the device, for example
 * "Sat 14 Nov, 18:05" in France.
 */
export function formatDateTime(ms: number, locale: DateLocale, now: number): string {
  const date = new Date(ms);
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  try {
    return new Intl.DateTimeFormat(locale.tag, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: sameYear ? undefined : 'numeric',
      ...clockOptions(locale),
    }).format(date);
  } catch {
    return toLocalInputValue(ms).replace('T', ' ');
  }
}
