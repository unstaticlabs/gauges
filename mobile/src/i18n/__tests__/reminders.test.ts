import { en } from '../en';
import { formatReminderWhen, REMINDER_NAME_MAX, reminderContent, shortName } from '../reminders';

describe('reminderContent', () => {
  it('uses the singular for one gauge', () => {
    expect(reminderContent(['Water the plants'], en)).toEqual({ title: '1 gauge is low', body: 'Water the plants' });
  });

  it('joins two names with "and"', () => {
    expect(reminderContent(['Change the sheets', 'Water the plants'], en)).toEqual({
      title: '2 gauges are low',
      body: 'Change the sheets and Water the plants',
    });
  });

  it('names two gauges and counts the rest', () => {
    expect(reminderContent(['Change the sheets', 'Water the plants', 'Trash'], en)).toEqual({
      title: '3 gauges are low',
      body: 'Change the sheets, Water the plants, and 1 more',
    });
    expect(reminderContent(['A', 'B', 'C', 'D', 'E', 'F'], en).body).toBe('A, B, and 4 more');
  });

  it('keeps a name with emoji whole', () => {
    expect(reminderContent(['🪴 Plants', '👨‍👩‍👧 Family dinner'], en).body).toBe('🪴 Plants and 👨‍👩‍👧 Family dinner');
  });

  it('cuts a long name and puts it on one line', () => {
    const body = reminderContent(['Clean the gutters of the house and the garage roof too', 'Short'], en).body;
    expect(body).toBe('Clean the gutters of the house… and Short');
  });
});

describe('shortName', () => {
  it('keeps a short name as it is, with one space between words', () => {
    expect(shortName('  Water\n the   plants ')).toBe('Water the plants');
  });

  it('cuts to the limit with "…" and never breaks an emoji', () => {
    const family = '👨‍👩‍👧';
    const name = `${'a'.repeat(REMINDER_NAME_MAX - 2)}${family}${family}${family}`;
    const cut = shortName(name);
    expect(cut.endsWith('…')).toBe(true);
    expect(cut).toBe(`${'a'.repeat(REMINDER_NAME_MAX - 2)}${family}…`);
  });
});

describe('formatReminderWhen', () => {
  const local = (day: number, hour: number) => new Date(2026, 10, day, hour, 0).getTime();
  const now = local(14, 12); // Saturday 14 November 2026, 12:00
  const time = new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' }).format(new Date(local(14, 18)));
  const EN = { tag: 'en' };

  it('says today and tomorrow', () => {
    expect(formatReminderWhen(local(14, 18), now, en, EN)).toBe(`today at ${time}`);
    expect(formatReminderWhen(local(15, 18), now, en, EN)).toBe(`tomorrow at ${time}`);
  });

  it('follows the 24-hour setting of the device', () => {
    expect(formatReminderWhen(local(14, 18), now, en, { tag: 'en-FR', hour12: false })).toBe('today at 18:00');
    expect(formatReminderWhen(local(14, 18), now, en, { tag: 'en-FR', hour12: true })).toMatch(/^today at 6:00\s?pm$/i);
  });

  it('gives the weekday in the next week, and a date after that', () => {
    expect(formatReminderWhen(local(18, 18), now, en, EN)).toBe(`Wednesday at ${time}`);
    expect(formatReminderWhen(local(24, 18), now, en, EN)).toMatch(/^Tue, (Nov 24|24 Nov) at /);
  });
});
