import type { Strings } from './en';
import { calendarDays } from './format';
import { clockOptions, type DateLocale } from './locale';

/** The notification names at most this many gauges. The rest becomes "and N more". */
export const REMINDER_NAMES_SHOWN = 2;

/** A longer gauge name is cut to this many characters, with "…". */
export const REMINDER_NAME_MAX = 32;

/**
 * Splits a text into the characters that a person sees. An emoji with a
 * skin tone or a family emoji counts as one character, so a cut never
 * breaks it. Without `Intl.Segmenter`, it splits by code point: a cut can
 * then break a joined emoji, but never half of a surrogate pair.
 */
function graphemes(text: string): string[] {
  const Segmenter = (Intl as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
  if (typeof Segmenter === 'function') {
    try {
      return Array.from(new Segmenter(undefined, { granularity: 'grapheme' }).segment(text), (s) => s.segment);
    } catch {
      // Use the code points below.
    }
  }
  return Array.from(text);
}

/** Puts a gauge name on one line and cuts it to `max` characters. */
export function shortName(name: string, max = REMINDER_NAME_MAX): string {
  const flat = name.replace(/\s+/g, ' ').trim();
  const chars = graphemes(flat);
  if (chars.length <= max) return flat;
  return `${chars.slice(0, max - 1).join('').trimEnd()}…`;
}

/** The list of names for a reminder, for example "Water the plants, Sheets, and 2 more". */
export function reminderNames(names: readonly string[], strings: Strings): string {
  const shown = names.slice(0, REMINDER_NAMES_SHOWN).map((name) => shortName(name));
  return strings.reminders.list(shown, names.length - shown.length);
}

/** The title and the body of the notification for the red gauges, the worst first. */
export function reminderContent(names: readonly string[], strings: Strings): { title: string; body: string } {
  return { title: strings.reminders.title(names.length), body: reminderNames(names, strings) };
}

/** Formats the hour and the minute of a time with the clock of the device, for example "18:00" or "6:00 PM". */
export function formatClockTime(ms: number, locale: DateLocale): string {
  try {
    return new Intl.DateTimeFormat(locale.tag, clockOptions(locale)).format(new Date(ms));
  } catch {
    const d = new Date(ms);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
}

/**
 * Says when a reminder comes: "today at 18:00", "tomorrow at 18:00",
 * "Friday at 18:00" in the next week, or a short date after that.
 */
export function formatReminderWhen(at: number, now: number, strings: Strings, locale: DateLocale): string {
  const time = formatClockTime(at, locale);
  const days = calendarDays(now, at);
  if (days <= 0) return strings.reminders.today(time);
  if (days === 1) return strings.reminders.tomorrow(time);
  const options: Intl.DateTimeFormatOptions =
    days < 7 ? { weekday: 'long' } : { weekday: 'short', day: 'numeric', month: 'short' };
  let day: string;
  try {
    day = new Intl.DateTimeFormat(locale.tag, options).format(new Date(at));
  } catch {
    day = new Date(at).toDateString();
  }
  return strings.reminders.onDay(day, time);
}
