import { DAY_MS } from '../level';
import { activeGauges, archivedGauges, lowCount, sortGaugesForHome, splitByArchive } from '../sort';
import { makeGauge } from '../__testSupport__/makeGauge';

const NOW = Date.UTC(2026, 10, 14, 12);
const daysAgo = (days: number) => [{ at: NOW - days * DAY_MS, by: 'u1' }];

describe('sortGaugesForHome', () => {
  it('puts the lowest level first', () => {
    const gauges = [
      makeGauge({ id: 'full', executions: daysAgo(1) }),
      makeGauge({ id: 'low', executions: daysAgo(9) }),
      makeGauge({ id: 'mid', executions: daysAgo(5) }),
    ];
    expect(sortGaugesForHome(gauges, NOW).map((g) => g.id)).toEqual(['low', 'mid', 'full']);
  });

  it('on a tie, puts the oldest last execution first', () => {
    const gauges = [
      makeGauge({ id: 'empty-recent', executions: daysAgo(13) }),
      makeGauge({ id: 'empty-old', executions: daysAgo(40) }),
      makeGauge({ id: 'never', executions: [] }),
    ];
    expect(sortGaugesForHome(gauges, NOW).map((g) => g.id)).toEqual([
      'never',
      'empty-old',
      'empty-recent',
    ]);
  });

  it('does not change the input list', () => {
    const gauges = [makeGauge({ id: 'a', executions: daysAgo(1) }), makeGauge({ id: 'b', executions: daysAgo(9) })];
    const copy = [...gauges];
    const sorted = sortGaugesForHome(gauges, NOW);
    expect(gauges).toEqual(copy);
    expect(sorted).not.toBe(gauges);
  });
});

describe('archive helpers', () => {
  it('splits active and archived gauges and keeps the order', () => {
    const gauges = [
      makeGauge({ id: 'a' }),
      makeGauge({ id: 'b', archivedAt: NOW }),
      makeGauge({ id: 'c' }),
    ];
    expect(activeGauges(gauges).map((g) => g.id)).toEqual(['a', 'c']);
    expect(archivedGauges(gauges).map((g) => g.id)).toEqual(['b']);
    const { active, archived } = splitByArchive(gauges);
    expect(active.map((g) => g.id)).toEqual(['a', 'c']);
    expect(archived.map((g) => g.id)).toEqual(['b']);
  });
});

describe('sortGaugesForHome with paused gauges', () => {
  it('puts the paused gauges after all active gauges, by name', () => {
    const paused = { pausedAt: NOW - 1000 };
    const gauges = [
      makeGauge({ id: 'p-zinc', name: 'Zinc', executions: daysAgo(12), ...paused }),
      makeGauge({ id: 'full', name: 'Full', executions: daysAgo(1) }),
      makeGauge({ id: 'p-apple', name: 'Apple', executions: daysAgo(1), ...paused }),
      makeGauge({ id: 'low', name: 'Low', executions: daysAgo(9) }),
    ];
    expect(sortGaugesForHome(gauges, NOW).map((g) => g.id)).toEqual(['low', 'full', 'p-apple', 'p-zinc']);
  });
});

describe('lowCount', () => {
  it('counts the red active gauges, and not the archived or paused ones', () => {
    const gauges = [
      makeGauge({ id: 'red', executions: daysAgo(10) }),
      makeGauge({ id: 'never', executions: [] }),
      makeGauge({ id: 'green', executions: daysAgo(1) }),
      makeGauge({ id: 'archived', executions: daysAgo(10), archivedAt: NOW }),
      makeGauge({ id: 'paused', executions: daysAgo(10), pausedAt: NOW - 1000 }),
    ];
    expect(lowCount(gauges, NOW)).toBe(2);
  });
});
