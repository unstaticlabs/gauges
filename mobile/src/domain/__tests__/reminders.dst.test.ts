/**
 * @jest-environment ./src/domain/__testSupport__/parisEnvironment.js
 */
// The environment sets TZ=Europe/Paris on the worker process. See the
// environment file for the reason.
import { planReminders, reminderTimes } from '../reminders';
import { makeGauge } from '../__testSupport__/makeGauge';

describe('reminders across a change of daylight saving time in Paris', () => {
  it('runs in the time zone Europe/Paris', () => {
    expect(new Date(Date.UTC(2026, 0, 15)).getTimezoneOffset()).toBe(-60);
    expect(new Date(Date.UTC(2026, 6, 15)).getTimezoneOffset()).toBe(-120);
  });

  it('keeps 09:00 local time on the spring change (29 March 2026)', () => {
    const now = Date.UTC(2026, 2, 27, 11); // 27 March, 12:00 in Paris
    const times = reminderTimes(now, { hour: 9, minute: 0 }, 3);
    expect(times).toEqual([
      Date.UTC(2026, 2, 28, 8), // 09:00 CET
      Date.UTC(2026, 2, 29, 7), // 09:00 CEST
      Date.UTC(2026, 2, 30, 7),
    ]);
    expect(times[1] - times[0]).toBe(23 * 60 * 60 * 1000);
  });

  it('keeps 09:00 local time on the autumn change (25 October 2026)', () => {
    const now = Date.UTC(2026, 9, 24, 10); // 24 October, 12:00 in Paris
    const gauge = makeGauge({ executions: [] });
    const plan = planReminders({
      gauges: [gauge],
      userId: 'u1',
      now,
      timeOfDay: { hour: 9, minute: 0 },
      days: 2,
    });
    expect(plan.map((entry) => entry.at)).toEqual([
      Date.UTC(2026, 9, 25, 8), // 09:00 CET
      Date.UTC(2026, 9, 26, 8),
    ]);
    expect(plan.map((entry) => new Date(entry.at).getHours())).toEqual([9, 9]);
  });
});
