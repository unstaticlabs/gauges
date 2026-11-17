import { en } from '../en';
import { errorMessage } from '../errors';
import { dateLocaleTag } from '../locale';
import {
  calendarDays,
  formatDateTime,
  formatLastDone,
  formatRelative,
  formatShortDate,
  fromLocalInputValue,
  makeRelativeFormatter,
  relativeParts,
  toLocalInputValue,
} from '../format';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const NOW = Date.UTC(2026, 10, 14, 12, 0);

describe('relativeParts', () => {
  it.each([
    [30 * 1000, null],
    [-5 * MIN, null],
    [MIN, { value: 1, unit: 'minute' }],
    [59 * MIN, { value: 59, unit: 'minute' }],
    [3 * HOUR + 10 * MIN, { value: 3, unit: 'hour' }],
    [DAY, { value: 1, unit: 'day' }],
    [13 * DAY, { value: 13, unit: 'day' }],
    [14 * DAY, { value: 2, unit: 'week' }],
    [55 * DAY, { value: 7, unit: 'week' }],
    [56 * DAY, { value: 2, unit: 'month' }],
    [200 * DAY, { value: 6, unit: 'month' }],
    [800 * DAY, { value: 2, unit: 'year' }],
  ])('gives the parts for %p ms ago', (ago, expected) => {
    expect(relativeParts(NOW - ago, NOW)).toEqual(expected);
  });
});

describe('relativeParts with calendar days', () => {
  const local = (day: number, hour: number) => new Date(2026, 10, day, hour, 0).getTime();

  it('counts the dates, not the 24-hour periods', () => {
    // Entered as "3 days ago at 20:00" when it is 9:00: 2.5 periods of 24 hours.
    expect(relativeParts(local(11, 20), local(14, 9))).toEqual({ value: 3, unit: 'day' });
    expect(relativeParts(local(13, 23), local(14, 8))).toEqual({ value: 1, unit: 'day' });
  });

  it('keeps hours for a short time over midnight, and on the same day', () => {
    expect(relativeParts(local(13, 23), local(14, 1))).toEqual({ value: 2, unit: 'hour' });
    expect(relativeParts(local(14, 1), local(14, 23))).toEqual({ value: 22, unit: 'hour' });
  });

  it('counts calendar days across a change of month', () => {
    expect(calendarDays(new Date(2026, 9, 31, 22).getTime(), new Date(2026, 10, 1, 7).getTime())).toBe(1);
  });
});

describe('formatShortDate', () => {
  const at = new Date(2026, 9, 3, 18, 5).getTime();

  it('gives the day and the month in the order of the region', () => {
    expect(formatShortDate(at, { tag: 'en-FR' }, at)).toBe('3 Oct');
    expect(formatShortDate(at, { tag: 'en-US' }, at)).toBe('Oct 3');
  });

  it('adds the year for a date in another year', () => {
    expect(formatShortDate(at, { tag: 'en-FR' }, new Date(2027, 0, 5).getTime())).toBe('3 Oct 2026');
  });
});

describe('errorMessage for a pause', () => {
  it('says that a pause needs a connection', () => {
    expect(errorMessage({ code: 'unavailable' }, en, { transaction: 'pause' })).toBe(en.errors.offlinePause);
    expect(errorMessage({ code: 'unavailable' }, en, { transaction: true })).toBe(en.errors.offlineTransaction);
  });
});

describe('formatDateTime', () => {
  const at = new Date(2026, 10, 14, 18, 5).getTime();

  it('puts the day before the month and uses 24 hours in France', () => {
    expect(formatDateTime(at, { tag: 'en-FR', hour12: false }, at)).toBe('Sat, 14 Nov, 18:05');
  });

  it('shows two digits for an early hour on a 24-hour clock, and 00 at midnight', () => {
    const early = new Date(2026, 10, 14, 1, 42).getTime();
    const midnight = new Date(2026, 10, 14, 0, 5).getTime();
    expect(formatDateTime(early, { tag: 'en-FR', hour12: false }, early)).toBe('Sat, 14 Nov, 01:42');
    expect(formatDateTime(midnight, { tag: 'en-FR', hour12: false }, midnight)).toBe('Sat, 14 Nov, 00:05');
  });

  it('uses 12 hours when the device says so', () => {
    expect(formatDateTime(at, { tag: 'en-FR', hour12: true }, at)).toMatch(/^Sat, 14 Nov, 6:05\s?pm$/i);
  });

  it('builds the tag from the language of the app and the region of the device', () => {
    expect(dateLocaleTag('en', 'FR')).toBe('en-FR');
    expect(dateLocaleTag('en', null)).toBe('en');
    expect(dateLocaleTag('en', 'bad region')).toBe('en');
  });
});

describe('formatRelative', () => {
  it('uses the fallback text without a formatter', () => {
    expect(formatRelative(NOW - 10 * 1000, NOW, en, null)).toBe('just now');
    expect(formatRelative(NOW - DAY, NOW, en, null)).toBe('yesterday');
    expect(formatRelative(NOW - 3 * DAY, NOW, en, null)).toBe('3 days ago');
    expect(formatRelative(NOW - 2 * HOUR, NOW, en, null)).toBe('2 hours ago');
  });

  it('uses Intl.RelativeTimeFormat when it exists', () => {
    const formatter = makeRelativeFormatter('en');
    expect(formatter).not.toBeNull();
    expect(formatRelative(NOW - 3 * DAY, NOW, en, formatter)).toBe('3 days ago');
    expect(formatRelative(NOW - DAY, NOW, en, formatter)).toBe('yesterday');
  });

  it('gives null when Intl.RelativeTimeFormat is missing', () => {
    const intl = Intl as unknown as Record<string, unknown>;
    const original = intl.RelativeTimeFormat;
    intl.RelativeTimeFormat = undefined;
    try {
      expect(makeRelativeFormatter('en')).toBeNull();
    } finally {
      intl.RelativeTimeFormat = original;
    }
  });
});

describe('formatLastDone', () => {
  it('says never for a gauge with no execution', () => {
    expect(formatLastDone(null, NOW, en, null)).toBe('Never done');
    expect(formatLastDone(NOW - 3 * DAY, NOW, en, null)).toBe('Done 3 days ago');
  });
});

describe('local input values', () => {
  it('round-trips a local time to the minute', () => {
    const ms = new Date(2026, 0, 5, 7, 3).getTime();
    expect(toLocalInputValue(ms)).toBe('2026-01-05T07:03');
    expect(fromLocalInputValue('2026-01-05T07:03')).toBe(ms);
  });

  it('refuses text that is not a date', () => {
    expect(fromLocalInputValue('')).toBeNull();
    expect(fromLocalInputValue('2026-02-30T10:00')).toBeNull();
    expect(fromLocalInputValue('yesterday')).toBeNull();
  });
});

describe('errorMessage', () => {
  it('maps the data error codes', () => {
    expect(errorMessage({ code: 'unavailable' }, en)).toBe(en.errors.offline);
    expect(errorMessage({ code: 'unavailable' }, en, { transaction: true })).toBe(en.errors.offlineTransaction);
    expect(errorMessage(new Error('x'), en)).toBe(en.errors.unknown);
  });
});
