import {
  DEFAULT_LABEL_AGGREGATE,
  LABEL_AGGREGATES,
  aggregateLevels,
  countedRange,
  labelAggregate,
  labelLevel,
  previewPositions,
} from '../label';
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

  it('ignores archived gauges in each mode', () => {
    const gauges = [gaugeAt(70), gaugeAt(30), gaugeAt(0, NOW)];
    expect(labelLevel(gauges, NOW, 'worst')).toBeCloseTo(30, 10);
    expect(labelLevel(gauges, NOW, 'median')).toBeCloseTo(50, 10);
    expect(labelLevel(gauges, NOW, 'average')).toBeCloseTo(50, 10);
    expect(labelLevel([gaugeAt(0, NOW)], NOW, 'average')).toBeNull();
  });

  it('does not change the input of the aggregate', () => {
    const levels = [30, 10, 20];
    aggregateLevels(levels, 'median');
    expect(levels).toEqual([30, 10, 20]);
  });
});

describe('aggregateLevels', () => {
  // A label with one neglected chore: 5, then 40, 60, 80, 90, 100.
  const levels = [80, 5, 100, 60, 90, 40];

  it('uses the lower half when no mode is given', () => {
    expect(DEFAULT_LABEL_AGGREGATE).toBe('lowerHalf');
    expect(aggregateLevels(levels)).toBeCloseTo(35, 10);
  });

  it('gives the lowest level for worst', () => {
    expect(aggregateLevels(levels, 'worst')).toBe(5);
  });

  it('gives the mean of the ceil(n / 2) lowest levels for lowerHalf', () => {
    expect(aggregateLevels(levels, 'lowerHalf')).toBeCloseTo((5 + 40 + 60) / 3, 10);
    expect(aggregateLevels([10, 20, 30, 40, 50], 'lowerHalf')).toBeCloseTo(20, 10);
  });

  it('gives the middle level for median, and the mean of the two middle levels for an even count', () => {
    expect(aggregateLevels([10, 90, 20, 70, 30], 'median')).toBe(30);
    expect(aggregateLevels(levels, 'median')).toBe(70);
    expect(aggregateLevels([10, 25], 'median')).toBe(17.5);
  });

  it('gives the mean of all levels for average', () => {
    expect(aggregateLevels(levels, 'average')).toBeCloseTo(375 / 6, 10);
  });

  it('gives the only level in each mode for one gauge', () => {
    for (const mode of LABEL_AGGREGATES) expect(aggregateLevels([42], mode)).toBe(42);
  });

  it('does not round the result', () => {
    expect(aggregateLevels([10, 11, 11], 'average')).toBeCloseTo(32 / 3, 10);
  });
});

describe('countedRange', () => {
  it('gives the range of each mode', () => {
    expect(countedRange(6, 'worst')).toEqual({ start: 0, end: 1 });
    expect(countedRange(6, 'lowerHalf')).toEqual({ start: 0, end: 3 });
    expect(countedRange(7, 'lowerHalf')).toEqual({ start: 0, end: 4 });
    expect(countedRange(7, 'median')).toEqual({ start: 3, end: 4 });
    expect(countedRange(6, 'median')).toEqual({ start: 2, end: 4 });
    expect(countedRange(6, 'average')).toEqual({ start: 0, end: 6 });
  });

  it('gives an empty range for zero gauges', () => {
    for (const mode of LABEL_AGGREGATES) expect(countedRange(0, mode)).toEqual({ start: 0, end: 0 });
  });
});

describe('labelAggregate', () => {
  it('gives the mode of the label, or the default', () => {
    expect(labelAggregate({ aggregate: 'median' })).toBe('median');
    expect(labelAggregate({})).toBe('lowerHalf');
  });
});

describe('previewPositions', () => {
  it('gives all positions when they fit', () => {
    expect(previewPositions(0, 8)).toEqual([]);
    expect(previewPositions(5, 8)).toEqual([0, 1, 2, 3, 4]);
  });

  it('keeps the ends, the middle, and the edge of the lower half', () => {
    for (const count of [9, 14, 15, 40, 101]) {
      const positions = previewPositions(count, 8);
      expect(positions).toHaveLength(8);
      expect([...positions].sort((a, b) => a - b)).toEqual(positions);
      expect(new Set(positions).size).toBe(8);
      const half = Math.ceil(count / 2);
      const median = countedRange(count, 'median');
      for (const must of [0, count - 1, half - 1, half, median.start, median.end - 1]) {
        expect(positions).toContain(must);
      }
    }
  });
});
