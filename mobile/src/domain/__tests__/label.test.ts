import { aggregateLevels, labelLevel } from '../label';
import { DAY_MS } from '../level';
import { makeGauge } from '../__testSupport__/makeGauge';

const NOW = Date.UTC(2026, 10, 14, 12);

/** Returns a linear gauge of 10 days with the given level at NOW. */
function gaugeAt(level: number, archivedAt: number | null = null) {
  const days = ((100 - level) / 100) * 12;
  return makeGauge({ archivedAt, executions: [{ at: NOW - days * DAY_MS, by: 'u1' }] });
}

describe('labelLevel', () => {
  it('returns null for zero gauges', () => {
    expect(labelLevel([], NOW)).toBeNull();
    expect(aggregateLevels([])).toBeNull();
  });

  it('returns the level of the only gauge', () => {
    expect(labelLevel([gaugeAt(40)], NOW)).toBeCloseTo(40, 10);
  });

  it('returns the lowest level of two gauges', () => {
    expect(labelLevel([gaugeAt(80), gaugeAt(20)], NOW)).toBeCloseTo(20, 10);
  });

  it('returns the mean of the two lowest of three gauges', () => {
    expect(labelLevel([gaugeAt(90), gaugeAt(10), gaugeAt(30)], NOW)).toBeCloseTo(20, 10);
  });

  it('ignores archived gauges', () => {
    expect(labelLevel([gaugeAt(60), gaugeAt(0, NOW)], NOW)).toBeCloseTo(60, 10);
    expect(labelLevel([gaugeAt(0, NOW)], NOW)).toBeNull();
  });

  it('does not change the input of the aggregate', () => {
    const levels = [30, 10, 20];
    aggregateLevels(levels);
    expect(levels).toEqual([30, 10, 20]);
  });
});
