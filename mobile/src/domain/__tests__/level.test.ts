import {
  DAY_MS,
  EMPTY_AFTER_FACTOR,
  curveDrop,
  curveFill,
  displayLevel,
  gaugeLevel,
  lastExecution,
  sampleCurve,
} from '../level';
import { makeGauge } from '../__testSupport__/makeGauge';
import type { Curve } from '../types';

const NOW = Date.UTC(2026, 10, 14, 12);

/** A gauge of 10 days is empty after 12 days. */
function levelAfterDays(curve: Curve, days: number): number {
  const gauge = makeGauge({ curve, repeatDays: 10, executions: [{ at: NOW - days * DAY_MS, by: 'u1' }] });
  return gaugeLevel(gauge, NOW);
}

describe('curves', () => {
  it.each<[Curve, number, number]>([
    ['linear', 0, 100],
    ['linear', 0.5, 50],
    ['linear', 1, 0],
    ['linear', 2, 0],
    ['late', 0, 100],
    ['late', 0.5, 93.75],
    ['late', 1, 0],
    ['late', 2, 0],
    ['ease', 0, 100],
    ['ease', 0.25, 84.375],
    ['ease', 0.5, 50],
    ['ease', 1, 0],
    ['ease', 2, 0],
  ])('%s at x = %d gives level %d', (curve, x, level) => {
    expect(levelAfterDays(curve, x * 12)).toBeCloseTo(level, 10);
  });

  it('clamps x below 0 and above 1', () => {
    expect(curveDrop('late', -1)).toBe(0);
    expect(curveFill('ease', 5)).toBe(0);
  });

  it('samples a curve from full to empty at equal steps', () => {
    const points = sampleCurve('linear', 5);
    expect(points).toEqual([
      { x: 0, y: 1 },
      { x: 0.25, y: 0.75 },
      { x: 0.5, y: 0.5 },
      { x: 0.75, y: 0.25 },
      { x: 1, y: 0 },
    ]);
    expect(sampleCurve('late')).toHaveLength(21);
    expect(sampleCurve('ease', 1)).toHaveLength(2);
  });
});

describe('gaugeLevel', () => {
  it('empties the gauge at 1.2 times the interval', () => {
    expect(EMPTY_AFTER_FACTOR).toBe(1.2);
    expect(levelAfterDays('linear', 10)).toBeCloseTo((100 * 2) / 12, 10);
    expect(levelAfterDays('linear', 11.9)).toBeGreaterThan(0);
    expect(levelAfterDays('linear', 12)).toBe(0);
  });

  it('gives level 0 to a gauge with no execution', () => {
    expect(gaugeLevel(makeGauge({ executions: [] }), NOW)).toBe(0);
  });

  it('uses the execution with the highest time in an unsorted list', () => {
    const executions = [
      { at: NOW - 11 * DAY_MS, by: 'u1' },
      { at: NOW - 3 * DAY_MS, by: 'u2' },
      { at: NOW - 7 * DAY_MS, by: 'u1' },
    ];
    expect(lastExecution(executions)).toEqual({ at: NOW - 3 * DAY_MS, by: 'u2' });
    expect(gaugeLevel(makeGauge({ executions }), NOW)).toBeCloseTo(75, 10);
  });

  it('does not round the level', () => {
    const level = levelAfterDays('linear', 1);
    expect(level).not.toBe(Math.round(level));
    expect(displayLevel(level)).toBe(92);
    expect(displayLevel(-3)).toBe(0);
  });

  it('treats repeatDays below 1 as 1', () => {
    const gauge = makeGauge({ repeatDays: 0, executions: [{ at: NOW - 0.6 * DAY_MS, by: 'u1' }] });
    expect(gaugeLevel(gauge, NOW)).toBeCloseTo(50, 10);
  });
});
