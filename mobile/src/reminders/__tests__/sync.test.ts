import { makeGauge } from '../../domain/__testSupport__/makeGauge';
import { DAY_MS } from '../../domain/level';
import { en } from '../../i18n/en';
import { parseReminderSettings } from '../settings';
import {
  createReminderSync,
  desiredReminders,
  isStillDue,
  MAX_PENDING,
  reconcile,
  syncOnce,
  type SyncInput,
} from '../sync';
import { type PermissionState, REMINDER_ID_PREFIX, type ReminderScheduler, type ScheduledReminder } from '../types';

/** A scheduler in memory. It records each call. */
function fakeScheduler(permission: PermissionState = 'granted') {
  const pending = new Map<string, ScheduledReminder>();
  const calls: string[] = [];
  const scheduler: ReminderScheduler & { permission: PermissionState } = {
    supported: true,
    permission,
    getPermission: async () => scheduler.permission,
    requestPermission: async () => scheduler.permission,
    listPending: async () => {
      calls.push('list');
      return [...pending.values()].map(({ id, title, body }) => ({ id, title, body }));
    },
    schedule: async (reminder) => {
      calls.push(`schedule ${reminder.id}`);
      pending.set(reminder.id, reminder);
    },
    cancel: async (id) => {
      calls.push(`cancel ${id}`);
      pending.delete(id);
    },
  };
  return {
    scheduler,
    pending,
    calls,
  };
}

/** Local time, in the time zone of the test process. */
const local = (month: number, day: number, hour = 0, minute = 0) => new Date(2026, month, day, hour, minute).getTime();
const NOW = local(5, 10, 12); // 10 June, 12:00
const SIX_PM = { hour: 18, minute: 0 };

// A linear gauge of 10 days is red from 9 days after the last execution.
const plants = makeGauge({ id: 'plants', name: 'Water the plants', executions: [{ at: NOW - 9.5 * DAY_MS, by: 'u1' }] });
const sheets = makeGauge({ id: 'sheets', name: 'Change the sheets', executions: [{ at: NOW - 8 * DAY_MS, by: 'u1' }] });
const fresh = makeGauge({ id: 'fresh', name: 'Fresh', executions: [{ at: NOW, by: 'u1' }] });

const input = (extra: Partial<SyncInput> = {}): SyncInput => ({
  enabled: true,
  userId: 'u1',
  gauges: [plants, sheets, fresh],
  timeOfDay: SIX_PM,
  ...extra,
});

describe('desiredReminders', () => {
  it('gives one reminder for each day with a red gauge, with the plain text', () => {
    const desired = desiredReminders(input(), NOW, en);
    expect(desired[0]).toEqual({
      id: `${REMINDER_ID_PREFIX}${local(5, 10, 18)}`,
      at: local(5, 10, 18),
      title: '1 gauge is low',
      body: 'Water the plants',
      gaugeIds: ['plants'],
    });
    expect(desired[1]).toMatchObject({ title: '2 gauges are low', body: 'Water the plants and Change the sheets' });
  });

  it('never gives more than the limit, far below the 64 of iOS', () => {
    const old = makeGauge({ id: 'old', executions: [{ at: NOW - 100 * DAY_MS, by: 'u1' }] });
    const desired = desiredReminders(input({ gauges: [old] }), NOW, en);
    expect(desired).toHaveLength(MAX_PENDING);
    expect(MAX_PENDING).toBeLessThan(64);
  });

  it('gives nothing with no user or no gauges', () => {
    expect(desiredReminders(input({ userId: null }), NOW, en)).toEqual([]);
    expect(desiredReminders(input({ gauges: null }), NOW, en)).toEqual([]);
  });
});

describe('reconcile', () => {
  const a: ScheduledReminder = { id: `${REMINDER_ID_PREFIX}1000`, at: NOW + 1000, title: 'A', body: 'a', gaugeIds: [] };
  const b: ScheduledReminder = { id: `${REMINDER_ID_PREFIX}2000`, at: NOW + 2000, title: 'B', body: 'b', gaugeIds: [] };

  it('schedules the missing reminders and cancels the old ones', async () => {
    const { scheduler, pending } = fakeScheduler();
    pending.set('gauges.reminder.old', { ...a, id: 'gauges.reminder.old' });
    expect(await reconcile(scheduler, [a, b], NOW)).toEqual({ scheduled: 2, cancelled: 1 });
    expect([...pending.keys()].sort()).toEqual([a.id, b.id]);
  });

  it('changes nothing on a second call with the same list', async () => {
    const { scheduler, calls } = fakeScheduler();
    await reconcile(scheduler, [a, b], NOW);
    calls.length = 0;
    expect(await reconcile(scheduler, [a, b], NOW)).toEqual({ scheduled: 0, cancelled: 0 });
    expect(calls).toEqual(['list']);
  });

  it('replaces a reminder at the same time with a new text', async () => {
    const { scheduler, pending } = fakeScheduler();
    await reconcile(scheduler, [a], NOW);
    await reconcile(scheduler, [{ ...a, body: 'new' }], NOW);
    expect(pending.get(a.id)?.body).toBe('new');
  });

  it('does not schedule a time that is past', async () => {
    const { scheduler, pending } = fakeScheduler();
    await reconcile(scheduler, [{ ...a, at: NOW }], NOW);
    expect(pending.size).toBe(0);
  });
});

describe('syncOnce', () => {
  it('schedules the plan when reminders are on and allowed', async () => {
    const { scheduler, pending } = fakeScheduler();
    const result = await syncOnce(scheduler, input(), NOW, en);
    expect(result.status).toBe('scheduled');
    expect(pending.size).toBe(result.reminders.length);
    expect(pending.size).toBeGreaterThan(0);
  });

  it.each([
    ['reminders are off', input({ enabled: false }), 'off'],
    ['the user logs out', input({ userId: null }), 'off'],
  ])('cancels everything when %s', async (_, next, status) => {
    const { scheduler, pending } = fakeScheduler();
    await syncOnce(scheduler, input(), NOW, en);
    expect((await syncOnce(scheduler, next, NOW, en)).status).toBe(status);
    expect(pending.size).toBe(0);
  });

  it('cancels everything when the permission is revoked', async () => {
    const { scheduler, pending } = fakeScheduler();
    await syncOnce(scheduler, input(), NOW, en);
    scheduler.permission = 'denied';
    expect((await syncOnce(scheduler, input(), NOW, en)).status).toBe('noPermission');
    expect(pending.size).toBe(0);
  });

  it('keeps the pending reminders while the gauges load', async () => {
    const { scheduler, pending } = fakeScheduler();
    await syncOnce(scheduler, input(), NOW, en);
    const before = pending.size;
    expect((await syncOnce(scheduler, input({ gauges: null }), NOW, en)).status).toBe('waiting');
    expect(pending.size).toBe(before);
  });

  it('removes a muted gauge from the text', async () => {
    const { scheduler, pending } = fakeScheduler();
    const muted = { ...plants, mutedBy: ['u1'] };
    await syncOnce(scheduler, input({ gauges: [muted, sheets] }), NOW, en);
    expect([...pending.values()].every((r) => !r.body.includes('Water the plants'))).toBe(true);
  });
});

describe('createReminderSync', () => {
  beforeEach(() => jest.useFakeTimers({ now: NOW }));
  afterEach(() => jest.useRealTimers());

  it('waits for the input to stay the same, then runs one sync with the newest input', async () => {
    const { scheduler, calls, pending } = fakeScheduler();
    const results: string[] = [];
    const sync = createReminderSync({ scheduler, strings: en, debounceMs: 500, onResult: (r) => results.push(r.status) });
    sync.request(input({ enabled: false }));
    jest.advanceTimersByTime(300);
    sync.request(input());
    jest.advanceTimersByTime(300);
    expect(calls).toEqual([]);
    await jest.advanceTimersByTimeAsync(300);
    expect(results).toEqual(['scheduled']);
    expect(pending.size).toBeGreaterThan(0);
  });

  it('runs one sync at a time, and the last one uses the newest input', async () => {
    const { scheduler, pending } = fakeScheduler();
    const sync = createReminderSync({ scheduler, strings: en, debounceMs: 0 });
    let active = 0;
    let most = 0;
    const list = scheduler.listPending;
    scheduler.listPending = async () => {
      active += 1;
      most = Math.max(most, active);
      await Promise.resolve();
      const result = await list();
      active -= 1;
      return result;
    };
    sync.request(input());
    const first = sync.flush();
    sync.request(input({ enabled: false }));
    const second = sync.flush();
    await Promise.all([first, second]);
    expect(most).toBe(1);
    expect(pending.size).toBe(0);
  });

  it('skips a sync with the same input as the last one, but a flush always runs', async () => {
    const { scheduler, calls } = fakeScheduler();
    const sync = createReminderSync({ scheduler, strings: en, debounceMs: 0 });
    sync.request(input());
    await jest.advanceTimersByTimeAsync(0);
    const count = calls.length;
    await jest.advanceTimersByTimeAsync(10);
    expect(calls.length).toBe(count);
    await sync.flush();
    expect(calls.length).toBeGreaterThan(count);
  });

  it('does nothing after dispose', async () => {
    const { scheduler, calls } = fakeScheduler();
    const sync = createReminderSync({ scheduler, strings: en, debounceMs: 100 });
    sync.request(input());
    sync.dispose();
    await jest.advanceTimersByTimeAsync(200);
    await sync.flush();
    expect(calls).toEqual([]);
  });

  it('reports an error of the scheduler and keeps working', async () => {
    const { scheduler, pending } = fakeScheduler();
    const errors: unknown[] = [];
    const schedule = scheduler.schedule;
    scheduler.schedule = async () => {
      throw new Error('system');
    };
    const sync = createReminderSync({ scheduler, strings: en, onError: (e) => errors.push(e) });
    sync.request(input());
    await sync.flush();
    expect(errors).toHaveLength(1);
    scheduler.schedule = schedule;
    await sync.flush();
    expect(pending.size).toBeGreaterThan(0);
  });
});

describe('isStillDue', () => {
  it('says yes while one named gauge is red', () => {
    expect(isStillDue([plants, sheets], 'u1', ['plants', 'sheets'], NOW)).toBe(true);
  });

  it('says no when another member marked the gauges done', () => {
    const done = { ...plants, executions: [...plants.executions, { at: NOW - 1000, by: 'u2' }] };
    expect(isStillDue([done, sheets], 'u1', ['plants'], NOW)).toBe(false);
  });

  it('says no for a muted or archived gauge, and yes with no live data', () => {
    expect(isStillDue([{ ...plants, mutedBy: ['u1'] }], 'u1', ['plants'], NOW)).toBe(false);
    expect(isStillDue([{ ...plants, archivedAt: NOW }], 'u1', ['plants'], NOW)).toBe(false);
    expect(isStillDue(null, 'u1', ['plants'], NOW)).toBe(true);
  });

  it('says no when another member paused the gauge', () => {
    expect(isStillDue([{ ...plants, pausedAt: NOW - 1000 }], 'u1', ['plants'], NOW)).toBe(false);
  });
});

describe('parseReminderSettings', () => {
  it('gives on at 18:00 for a missing or broken value', () => {
    const defaults = { enabled: true, time: { hour: 18, minute: 0 } };
    expect(parseReminderSettings(null)).toEqual(defaults);
    expect(parseReminderSettings('x')).toEqual(defaults);
    expect(parseReminderSettings({ time: { hour: 7, minute: 0 } })).toEqual({ ...defaults, time: { hour: 7, minute: 0 } });
    expect(parseReminderSettings({ enabled: false, time: { hour: 24, minute: 0 } })).toEqual({ ...defaults, enabled: false });
  });

  it('reads a stored value', () => {
    expect(parseReminderSettings({ enabled: true, time: { hour: 7, minute: 30 } })).toEqual({
      enabled: true,
      time: { hour: 7, minute: 30 },
    });
  });
});
