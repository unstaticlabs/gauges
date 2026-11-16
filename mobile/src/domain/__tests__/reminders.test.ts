import { DAY_MS } from '../level';
import { planReminders, reminderTimes } from '../reminders';
import { makeGauge } from '../__testSupport__/makeGauge';

// A linear gauge of 10 days is empty after 12 days. It is red (25 or lower)
// from 9 days after the last execution.

/** Local time, in the time zone of the test process. */
const local = (month: number, day: number, hour = 0, minute = 0) =>
  new Date(2026, month, day, hour, minute).getTime();

const NOW = local(5, 10, 12); // 10 June, 12:00
const NINE = { hour: 9, minute: 0 };

describe('reminderTimes', () => {
  it('starts tomorrow when the time today is past', () => {
    expect(reminderTimes(NOW, NINE, 2)).toEqual([local(5, 11, 9), local(5, 12, 9)]);
  });

  it('starts today when the time today is still to come', () => {
    expect(reminderTimes(NOW, { hour: 18, minute: 30 }, 1)).toEqual([local(5, 10, 18, 30)]);
  });
});

describe('planReminders', () => {
  it('returns only the days with a red gauge, the worst first', () => {
    const soon = makeGauge({ id: 'soon', name: 'Soon', executions: [{ at: local(5, 2, 9), by: 'u1' }] });
    const later = makeGauge({ id: 'later', name: 'Later', executions: [{ at: local(5, 4, 9), by: 'u1' }] });
    const fresh = makeGauge({ id: 'fresh', name: 'Fresh', executions: [{ at: local(5, 10, 9), by: 'u1' }] });

    const plan = planReminders({ gauges: [later, fresh, soon], userId: 'u1', now: NOW, timeOfDay: NINE, days: 3 });

    // 11 June: soon is 9 days old, so red. Later is 7 days old: not red.
    // 12 June: no change for later (8 days). 13 June: later is red too.
    expect(plan).toEqual([
      { at: local(5, 11, 9), gaugeIds: ['soon'], gaugeNames: ['Soon'] },
      { at: local(5, 12, 9), gaugeIds: ['soon'], gaugeNames: ['Soon'] },
      { at: local(5, 13, 9), gaugeIds: ['soon', 'later'], gaugeNames: ['Soon', 'Later'] },
    ]);
  });

  it('leaves out a day with no red gauge', () => {
    const gauge = makeGauge({ executions: [{ at: local(5, 4, 9), by: 'u1' }] });
    const plan = planReminders({ gauges: [gauge], userId: 'u1', now: NOW, timeOfDay: NINE, days: 4 });
    expect(plan.map((entry) => entry.at)).toEqual([local(5, 13, 9), local(5, 14, 9)]);
  });

  it('leaves out muted, archived, and other gauges', () => {
    const executions = [{ at: NOW - 30 * DAY_MS, by: 'u1' }];
    const gauges = [
      makeGauge({ id: 'muted', executions, mutedBy: ['u1'] }),
      makeGauge({ id: 'mutedByOther', executions, mutedBy: ['u2'], members: ['u1', 'u2'] }),
      makeGauge({ id: 'archived', executions, archivedAt: NOW - DAY_MS }),
      makeGauge({ id: 'notMine', executions, members: ['u2'] }),
    ];
    const plan = planReminders({ gauges, userId: 'u1', now: NOW, timeOfDay: NINE, days: 1 });
    expect(plan).toEqual([{ at: local(5, 11, 9), gaugeIds: ['mutedByOther'], gaugeNames: ['Gauge'] }]);
  });

  it('returns an empty plan when no gauge is red', () => {
    const gauge = makeGauge({ executions: [{ at: NOW, by: 'u1' }] });
    expect(planReminders({ gauges: [gauge], userId: 'u1', now: NOW, timeOfDay: NINE, days: 5 })).toEqual([]);
  });

  it('checks 14 days by default', () => {
    const gauge = makeGauge({ executions: [] });
    expect(planReminders({ gauges: [gauge], userId: 'u1', now: NOW, timeOfDay: NINE })).toHaveLength(14);
  });
});
